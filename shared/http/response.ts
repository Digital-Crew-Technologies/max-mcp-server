export async function responseBodyText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/** Trim and redact upstream error bodies before handing them to the model. */
export function sanitizeUpstreamError(body: string, max = 500): string {
  return body.slice(0, max).replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}
