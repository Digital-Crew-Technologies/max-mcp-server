import { AsyncLocalStorage } from "async_hooks";

const mcpRequestStore = new AsyncLocalStorage<Request>();

/**
 * Run MCP HTTP handler with Request context available to tools.
 */
export function runWithMcpRequest<T>(request: Request, fn: () => T): T {
  return mcpRequestStore.run(request, fn);
}

/**
 * Reads Bearer token from incoming MCP connection Authorization header.
 */
export function getAuthorizationBearerFromMcpRequest(): string | undefined {
  const req = mcpRequestStore.getStore();
  const header = req?.headers.get("Authorization")?.trim();
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return undefined;
  }

  const token = header.slice(7).trim();
  return token || undefined;
}
