// Campaign attachments: the files a LinkedIn message, WhatsApp message or email
// step sends with its message (a PDF guide, a one-pager, a screenshot, a short
// video). max-agent keeps them in a per-workspace library; a step references
// library files by id in `workflow_config.nodes[].data.config.attachments`.
//
// This module is the MCP half:
//   • uploadCampaignAttachment — bytes (base64 or an https URL) → library row,
//     through max-agent's signed-upload flow (upload-url → PUT → complete).
//     The MCP server never holds Storage credentials: max-agent builds the
//     object path and signs it; we only PUT bytes against that ticket.
//   • setCampaignStepAttachments — resolve library ids and write them onto one
//     step, so the model never hand-edits workflow JSON.
//
// max-agent re-validates everything (type, size, tenancy, step limits); the
// checks here only give the model a clear error before any upload.

import { apiUrl, authHeaders, fetchWithRetry, responseBodyText } from "../shared";

/** Mirrors max-agent's campaign-attachments.core.ts. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_STEP_ATTACHMENTS = 3;
export const ATTACHMENT_CAPABLE_ACTIONS = [
  "send_email",
  "send_linkedin_message",
  "send_whatsapp_message",
] as const;

const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
};

const FETCH_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;

/** A tool-level failure the handler reports to the model as an error. */
export class AttachmentToolError extends Error {}

/** The type to declare for this file: explicit, else the extension's. */
export function mimeFor(fileName: string, declared?: string | null): string {
  const clean = (declared ?? "").toLowerCase().split(";")[0].trim();
  if (clean && clean !== "application/octet-stream" && clean !== "binary/octet-stream") {
    return clean;
  }
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_MIME[ext] ?? "application/octet-stream";
}

/**
 * Is this URL one we are willing to fetch? https only, and never a host that
 * names this machine or a private network — the fetch runs on the MCP server,
 * so an internal address would turn the tool into a way to read it.
 */
export function assertFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AttachmentToolError(`"${raw}" is not a valid URL`);
  }
  if (url.protocol !== "https:") {
    throw new AttachmentToolError("file_url must be an https:// URL");
  }
  if (url.username || url.password) {
    throw new AttachmentToolError("file_url must not carry credentials");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const isIpV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isIpV6 = host.startsWith("[") || host.includes(":");
  if (
    isIpV4 ||
    isIpV6 ||
    host === "localhost" ||
    !host.includes(".") ||
    /\.(localhost|local|internal|intranet|lan|home|corp)$/.test(host)
  ) {
    throw new AttachmentToolError(
      "file_url must use a public host name (no IP addresses or internal hosts)",
    );
  }
  return url;
}

/** Read a response body, refusing to hold more than `limit` bytes. */
async function readCapped(res: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new AttachmentToolError(
      `The file is ${(declared / 1024 / 1024).toFixed(1)} MB — the limit is 15 MB`,
    );
  }
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new AttachmentToolError("The file is larger than the 15 MB limit");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Download a public file. Redirects are followed by hand so every hop is
 * re-checked against assertFetchableUrl.
 */
export async function downloadPublicFile(
  rawUrl: string,
): Promise<{ bytes: Uint8Array; contentType: string | null; finalUrl: URL }> {
  let url = assertFetchableUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new AttachmentToolError(`${url.host} redirected without a location`);
      url = assertFetchableUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) {
      throw new AttachmentToolError(`Could not download the file (HTTP ${res.status})`);
    }
    return {
      bytes: await readCapped(res, MAX_ATTACHMENT_BYTES),
      contentType: res.headers.get("content-type"),
      finalUrl: url,
    };
  }
  throw new AttachmentToolError("Too many redirects while downloading the file");
}

export function decodeBase64(content: string): Uint8Array {
  const cleaned = content.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(cleaned)) {
    throw new AttachmentToolError("content_base64 is not valid base64");
  }
  return new Uint8Array(Buffer.from(cleaned, "base64"));
}

async function jsonOrThrow(res: Response, step: string): Promise<Record<string, unknown>> {
  const text = await responseBodyText(res);
  if (!res.ok) {
    let detail = text;
    try {
      detail = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // keep the raw text
    }
    throw new AttachmentToolError(`${step} failed (${res.status}): ${detail.slice(0, 500)}`);
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

export type LibraryRow = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

/**
 * upload-url → PUT bytes to the signed URL → complete. Returns the library row.
 */
export async function uploadCampaignAttachment(
  token: string,
  file: { fileName: string; mime: string; bytes: Uint8Array },
): Promise<LibraryRow> {
  if (file.bytes.byteLength === 0) {
    throw new AttachmentToolError("The file is empty");
  }
  if (file.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentToolError("The file is larger than the 15 MB limit");
  }

  const ticketRes = await fetchWithRetry(apiUrl("/api/v1/campaigns/attachments/upload-url"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      file_name: file.fileName,
      mime: file.mime,
      size: file.bytes.byteLength,
    }),
  });
  const ticket = (await jsonOrThrow(ticketRes, "Starting the upload")).data as {
    attachment_id: string;
    file_name: string;
    mime: string;
    storage_path: string;
    signed_url: string;
  };

  // Plain fetch, not fetchWithRetry: the signed URL carries a one-time token,
  // which must never reach retry logs or the dead-letter queue.
  const put = await fetch(ticket.signed_url, {
    method: "PUT",
    headers: { "content-type": ticket.mime, "x-upsert": "false" },
    body: new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: ticket.mime }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!put.ok) {
    throw new AttachmentToolError(`Uploading the bytes failed (HTTP ${put.status})`);
  }

  const completeRes = await fetchWithRetry(apiUrl("/api/v1/campaigns/attachments/complete"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      attachment_id: ticket.attachment_id,
      file_name: ticket.file_name,
      mime: ticket.mime,
      storage_path: ticket.storage_path,
    }),
  });
  return (await jsonOrThrow(completeRes, "Recording the upload")).data as LibraryRow;
}

type WorkflowNode = {
  id: string;
  type?: string;
  data?: { actionType?: string; label?: string; config?: Record<string, unknown> };
};

/**
 * Put exactly `attachmentIds` (in order) on one step of a campaign; an empty
 * list removes the step's files. Returns what the step now sends.
 */
export async function setCampaignStepAttachments(
  token: string,
  campaignId: string,
  nodeId: string,
  attachmentIds: string[],
): Promise<{ campaign_id: string; node_id: string; attachments: unknown[] }> {
  if (attachmentIds.length > MAX_STEP_ATTACHMENTS) {
    throw new AttachmentToolError(`A step can send ${MAX_STEP_ATTACHMENTS} files at most`);
  }

  const campaignRes = await fetchWithRetry(apiUrl(`/api/v1/campaigns/${campaignId}`), {
    headers: authHeaders(token),
  });
  const body = await jsonOrThrow(campaignRes, "Loading the campaign");
  const campaign = ((body.data as Record<string, unknown> | undefined) ?? body) as {
    status?: string;
    workflow_config?: { nodes?: WorkflowNode[] } & Record<string, unknown>;
  };
  const workflow = campaign.workflow_config;
  if (!workflow?.nodes?.length) {
    throw new AttachmentToolError("This campaign has no workflow yet");
  }
  if (campaign.status && campaign.status !== "draft" && campaign.status !== "stopped") {
    throw new AttachmentToolError(
      `The campaign is ${campaign.status}; its steps can only change while it is draft or stopped`,
    );
  }

  const node = workflow.nodes.find((n) => n.id === nodeId);
  if (!node) {
    const steps = workflow.nodes
      .filter((n) => n.type === "action")
      .map((n) => `${n.id} (${n.data?.actionType})`)
      .join(", ");
    throw new AttachmentToolError(`No step "${nodeId}" in this campaign. Steps: ${steps}`);
  }
  const actionType = node.data?.actionType ?? "";
  if (!(ATTACHMENT_CAPABLE_ACTIONS as readonly string[]).includes(actionType)) {
    throw new AttachmentToolError(
      `Step "${nodeId}" is ${actionType || node.type}; only ${ATTACHMENT_CAPABLE_ACTIONS.join(", ")} steps can send files`,
    );
  }

  let refs: Array<{ id: string; name: string; mime: string; size_bytes: number }> = [];
  if (attachmentIds.length > 0) {
    const libraryRes = await fetchWithRetry(apiUrl("/api/v1/campaigns/attachments"), {
      headers: authHeaders(token),
    });
    const rows = ((await jsonOrThrow(libraryRes, "Loading the attachment library")).data ??
      []) as LibraryRow[];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const missing = attachmentIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new AttachmentToolError(
        `Not in this workspace's campaign attachment library: ${missing.join(", ")}. Upload them first with upload_campaign_attachment.`,
      );
    }
    refs = attachmentIds.map((id) => {
      const row = byId.get(id)!;
      return { id: row.id, name: row.file_name, mime: row.mime_type, size_bytes: row.size_bytes };
    });
  }

  const config = { ...(node.data?.config ?? {}) };
  if (refs.length > 0) config.attachments = refs;
  else delete config.attachments;

  const nextWorkflow = {
    ...workflow,
    nodes: workflow.nodes.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, config } } : n,
    ),
  };

  const patchRes = await fetchWithRetry(apiUrl(`/api/v1/campaigns/${campaignId}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ workflow_config: nextWorkflow }),
  });
  await jsonOrThrow(patchRes, "Saving the step");

  return { campaign_id: campaignId, node_id: nodeId, attachments: refs };
}
