import { z } from "zod";
import {
  getDigitalCrewBaseUrl,
  resolveBearerToken,
} from "@/shared/http/digitalcrew-client";
import { fetchWithRetry } from "./http";

export { resolveBearerToken, fetchWithRetry };

export async function responseBodyText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export function apiUrl(path: string): string {
  return `${getDigitalCrewBaseUrl()}${path}`;
}

export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
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
    handler: (input: any) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
  ) => void;
};

export async function callApi(
  tokenOverride: string | undefined,
  fn: (token: string) => Promise<Response>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const token = resolveBearerToken(tokenOverride);
    const res = await fn(token);
    const text = await responseBodyText(res);
    if (!res.ok) {
      return { content: [{ type: "text", text: `API error (${res.status}): ${text || res.statusText}` }] };
    }
    return { content: [{ type: "text", text }] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text", text: `Error: ${msg}` }] };
  }
}

export function strip(input: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const out = { ...input };
  for (const k of keys) delete out[k];
  return out;
}

export const withToken = { bearer_token: z.string().optional() };
