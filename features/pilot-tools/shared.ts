import { z } from "zod";
import {
  getDigitalCrewBaseUrl,
  resolveBearerToken,
} from "@/shared/http/digitalcrew-client";
import { getVerifiedHermesCallerHeader } from "@/shared/auth/request-context";
import { VERIFIED_HERMES_CALLER_HEADER } from "@/shared/auth/hermes-caller";
import { responseBodyText, sanitizeUpstreamError } from "@/shared/http/response";
import { fetchWithRetry } from "./http";

export { resolveBearerToken, fetchWithRetry, responseBodyText };

export function apiUrl(path: string): string {
  return `${getDigitalCrewBaseUrl()}${path}`;
}

export function authHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  // Forward the verified Hermes caller identity (if this request carries one) so
  // max-agent can run its tenant cross-check + capability allowlist. The bearer
  // above stays the authoritative identity; this header is only ever used
  // downstream to reject (tenant mismatch) or gate (capability), never to elevate.
  const caller = getVerifiedHermesCallerHeader();
  if (caller) {
    headers[VERIFIED_HERMES_CALLER_HEADER] = caller;
  }
  return headers;
}

export function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      if (Array.isArray(v)) {
        for (const item of v) q.append(k, String(item));
      } else {
        q.set(k, String(v));
      }
    }
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export type McpServer = {
  registerTool: (
    name: string,
    config: Record<string, unknown>,
    handler: (input: any) => Promise<{
      content: Array<{ type: "text"; text: string }>;
      // Optional MCP error flag; mcp-handler forwards it to the client. Tools
      // that distinguish failures from results (e.g. CRM write-gate) set this.
      isError?: boolean;
    }>,
  ) => void;
};

export async function callApi(
  tokenOverride: string | undefined,
  fn: (token: string) => Promise<Response>,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const token = resolveBearerToken(tokenOverride);
    const res = await fn(token);
    const text = await responseBodyText(res);
    if (!res.ok) {
      const detail = text ? sanitizeUpstreamError(text) : res.statusText;
      return {
        content: [{ type: "text", text: `API error (${res.status}): ${detail}` }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text }] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}

export function strip(input: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const out = { ...input };
  for (const k of keys) delete out[k];
  return out;
}

/** Typed key removal — prefer over `strip(...) as any` in tool handlers. */
export function omitKey<T extends object, K extends keyof T>(o: T, ...keys: K[]): Omit<T, K> {
  const out = { ...o } as Record<string, unknown>;
  for (const k of keys) delete out[k as string];
  return out as Omit<T, K>;
}

/** MCP tool annotation hints (forwarded by mcp-handler to clients). */
export const toolHints = {
  readOnly: { annotations: { readOnlyHint: true } },
  destructive: { annotations: { destructiveHint: true } },
  idempotent: { annotations: { idempotentHint: true } },
} as const;

export const withToken = { bearer_token: z.string().optional() };

// ── Grouped tool registration ──────────────────────────────────────────────
//
// Domain-grouped tool registration. Instead of exposing one MCP tool per
// action (e.g. linkedin_find_profile, linkedin_send_invitation, ...), this
// exposes ONE tool per domain (e.g. `linkedin`) whose inputSchema is a
// Zod discriminated union over its actions. The LLM still sees each action's
// original required + typed args — no specificity loss — but the catalog
// shrinks from ~90 flat tools to ~13 domain groups.
//
// Why server-side: smaller catalog = ~80% fewer schema tokens shipped to
// every model in the wider ecosystem, not just our own max-agent client.

/** A single action inside a grouped tool. */
export type GroupedActionDef = {
  /** Short action name (e.g. "find_profile"). Becomes the `action` literal. */
  action: string;
  /** Human-readable title. */
  title: string;
  /** Description shown to the model. */
  description: string;
  /** Zod shape (Record<string, ZodType>) for this action's args. */
  inputShape: Record<string, z.ZodTypeAny>;
  /** Handler — receives the parsed input (still includes bearer_token). */
  handler: (
    input: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: "text"; text: string }> }>;
};

/**
 * Register a single grouped tool whose inputSchema is a discriminated union
 * over all `actions`. Each branch carries its own typed args, so the model
 * sees identical per-action specificity to the flat catalog.
 *
 * The resulting tool's description lists every action so the model can
 * pick the right one before generating args.
 */
export function registerGroupedTool(
  server: McpServer,
  groupName: string,
  blurb: string,
  actions: GroupedActionDef[],
): void {
  if (actions.length === 0) return;

  // Build per-action z.object with an `action` literal discriminator.
  // Each branch is z.object({ action: z.literal(name), ...args }) — the
  // shape Zod's discriminatedUnion requires.
  const branches = actions.map((a) =>
    z.object({
      action: z
        .literal(a.action)
        .describe(`${a.title}: ${a.description.split("\n")[0].slice(0, 140)}`),
      ...a.inputShape,
    }),
  );

  // Discriminated union over `action` — renders as JSON Schema oneOf, which
  // is what the model uses to pick the right per-action arg shape.
  // Zod's discriminatedUnion requires a tuple typed against the literal
  // discriminator field. Our branches array is correctly shaped at runtime
  // (we guarded actions.length above) but TS can't see the literal on each
  // branch through the .map(). Use a parameterized cast to the exact tuple
  // type the API expects.
  type ActionBranch = (typeof branches)[number];
  const unionSchema = z.discriminatedUnion(
    "action",
    branches as unknown as readonly [ActionBranch, ...ActionBranch[]],
  );

  const actionsList = actions
    .map((a) => `  • ${a.action} — ${a.description.split("\n")[0]}`)
    .join("\n");

  server.registerTool(
    groupName,
    {
      title: `${groupName.charAt(0).toUpperCase()}${groupName.slice(1)} (grouped)`,
      description: `${blurb}\n\nActions (set "action": "<one of>"):\n${actionsList}`,
      // mcp-handler accepts a Zod schema as inputSchema; the discriminated
      // union flattens to oneOf in JSON Schema for the client.
      inputSchema: unionSchema,
    } as Record<string, unknown>,
    async (input: Record<string, unknown>) => {
      const action = String((input as { action?: unknown }).action ?? "");
      const handler = actions.find((a) => a.action === action)?.handler;
      if (!handler) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Unknown action "${action}" for group "${groupName}". Valid: ${actions
                .map((a) => a.action)
                .join(", ")}`,
            },
          ],
          isError: true,
        };
      }
      // Strip the discriminator before forwarding to the handler.
      const { action: _drop, ...args } = input;
      void _drop;
      return handler(args);
    },
  );
}
