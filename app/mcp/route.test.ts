import { describe, expect, it } from "vitest";

// mcp-handler parses the body inside a promise it never awaits, so a malformed
// JSON body used to leave the request open (an unhandled rejection, no
// response) until the platform killed it. The route answers it with a JSON-RPC
// parse error instead.

process.env.DIGITALCREW_API_BASE_URL = "https://max-agent.example.com";
const { POST } = await import("./route");

const post = (body: string) =>
  new Request("https://mcp.example/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body,
  });

const within = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);

describe("POST /mcp", () => {
  it.each(["{not json", ""])("answers a malformed body (%j) with a JSON-RPC parse error", async (body) => {
    const res = await within(Promise.resolve(POST(post(body))), 2000);
    expect(res).not.toBe("timeout");
    const response = res as Response;
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32700, message: "Parse error: the request body is not valid JSON" },
      id: null,
    });
  });

  it("still serves a valid initialize", async () => {
    const res = await POST(
      post(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
        }),
      ),
    );
    expect(res.status).toBe(200);
  });
});
