import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Pipeline webhook triggers: inbound lead-capture endpoints that turn posted
// JSON into prospects and route them onto pipeline columns through ordered,
// filterable branches ("routes"). Proxies max-agent /api/v1/pipeline/webhooks/*
// and /api/v1/pipeline/webhook-routes/* (scopes prospects:read / prospects:write).
//
// Outbound webhook subscriptions (/api/v1/webhooks/outbound/*) are NOT exposed:
// max-agent refuses workspace API keys on every one of those handlers
// (requireWorkspaceAdmin without allowApiKey). See repository.ts.
//
// Secrets: create, update (auth_mode change) and rotate return the endpoint's
// HMAC secret / header token exactly once. Nothing here logs responses; the
// descriptions tell the model to hand the value to the user to store.

const SECRET_ONCE =
  "The secret is shown ONLY in this response and cannot be read again: give it to the user to store in the sender; never log or repeat it.";

export function registerPipelineWebhookTools(server: McpServer): void {
  // ── Webhook endpoints ────────────────────────────────────────────────────

  server.registerTool(
    "pipeline_webhook_list",
    {
      title: "List pipeline webhook endpoints",
      description:
        "List the workspace's inbound lead-capture webhook endpoints, each with endpoint_url, auth settings, health counters and its routing branches. Returns {data: Webhook[]}. Never includes secrets.",
      inputSchema: S.listPipelineWebhooksSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.listPipelineWebhooks(t)),
  );

  server.registerTool(
    "pipeline_webhook_get",
    {
      title: "Get a pipeline webhook endpoint",
      description:
        "Get one inbound webhook endpoint by webhook_id, with its routing branches. Returns {data: Webhook & {routes}}.",
      inputSchema: S.getPipelineWebhookSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getPipelineWebhook(t, input.webhook_id),
      ),
  );

  server.registerTool(
    "pipeline_webhook_create",
    {
      title: "Create a pipeline webhook endpoint",
      description:
        "Create an inbound webhook endpoint that turns posted JSON into prospects. Pass to_stage_id to seed a catch-all branch into that column (otherwise add branches with pipeline_webhook_route_create). Returns {data} with endpoint_url, plus `secret` for auth_mode hmac/token. " +
        SECRET_ONCE,
      inputSchema: S.createPipelineWebhookSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.createPipelineWebhook(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "pipeline_webhook_update",
    {
      title: "Update a pipeline webhook endpoint",
      description:
        "Partially update an endpoint (name, auth, field_mapping, routing/dedupe mode, rate limit, is_enabled). Changing auth_mode to hmac/token issues new material (the old stops working) returned as `secret`. " +
        SECRET_ONCE,
      inputSchema: S.updatePipelineWebhookSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.updatePipelineWebhook(
          t,
          input.webhook_id,
          strip(input, "bearer_token", "webhook_id"),
        ),
      ),
  );

  server.registerTool(
    "pipeline_webhook_delete",
    {
      title: "Delete a pipeline webhook endpoint",
      description:
        "Permanently delete an endpoint with its branches and delivery log; its URL stops accepting posts. Returns {data: {id}}.",
      inputSchema: S.deletePipelineWebhookSchema,
      ...toolHints.destructive,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.deletePipelineWebhook(t, input.webhook_id),
      ),
  );

  server.registerTool(
    "pipeline_webhook_rotate",
    {
      title: "Rotate pipeline webhook credentials",
      description:
        "Replace an endpoint's credentials; the old ones stop working immediately. target=secret (default) issues a new HMAC secret/token (optionally switching auth_mode to hmac|token) returned as `secret`. " +
        SECRET_ONCE +
        " target=url issues a new endpoint_url; every sender breaks until updated.",
      inputSchema: S.rotatePipelineWebhookSchema,
      ...toolHints.destructive,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.rotatePipelineWebhook(
          t,
          input.webhook_id,
          strip(input, "bearer_token", "webhook_id"),
        ),
      ),
  );

  server.registerTool(
    "pipeline_webhook_test",
    {
      title: "Test a payload against a pipeline webhook",
      description:
        "Run a sample JSON payload through an endpoint's current mapping and branch filters. dry_run defaults to true (creates nobody); dry_run=false really creates/updates the prospect and fires the destination column's automations. Returns {data: {status, mapped, matched, prospect_id, suggested_mapping, sample_signature}}.",
      inputSchema: S.testPipelineWebhookSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.testPipelineWebhook(
          t,
          input.webhook_id,
          strip(input, "bearer_token", "webhook_id"),
        ),
      ),
  );

  server.registerTool(
    "pipeline_webhook_list_deliveries",
    {
      title: "List pipeline webhook deliveries",
      description:
        "Read an endpoint's delivery log, newest first: received payload, status, matched branches, prospect_id, error. Filter by status (e.g. unmatched); paginate with page/pageSize. Returns {data: Delivery[], count}.",
      inputSchema: S.listPipelineWebhookDeliveriesSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.listPipelineWebhookDeliveries(
          t,
          input.webhook_id,
          strip(input, "bearer_token", "webhook_id"),
        ),
      ),
  );

  server.registerTool(
    "pipeline_webhook_replay_delivery",
    {
      title: "Replay a pipeline webhook delivery",
      description:
        "Re-run a logged delivery's payload through the endpoint's CURRENT mapping and branches (e.g. to recover leads after fixing a filter). dry_run defaults to FALSE: it really creates/moves prospects and fires column automations. Returns {data: {delivery_id, replay_of, status, prospect_id, matched}}.",
      inputSchema: S.replayPipelineWebhookDeliverySchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.replayPipelineWebhookDelivery(
          t,
          input.webhook_id,
          input.delivery_id,
          strip(input, "bearer_token", "webhook_id", "delivery_id"),
        ),
      ),
  );

  // ── Routing branches ─────────────────────────────────────────────────────

  server.registerTool(
    "pipeline_webhook_route_list",
    {
      title: "List pipeline webhook routes",
      description:
        "List routing branches (payload filter -> destination column) in evaluation order, for one webhook_id or the whole workspace. Returns {data: Route[]}.",
      inputSchema: S.listPipelineWebhookRoutesSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.listPipelineWebhookRoutes(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "pipeline_webhook_route_create",
    {
      title: "Create a pipeline webhook route",
      description:
        "Add a branch sending payloads that match filter (omit = catch-all) from webhook_id into column to_stage_id. Returns {data: Route}; 409 if the endpoint already routes into that column.",
      inputSchema: S.createPipelineWebhookRouteSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.createPipelineWebhookRoute(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "pipeline_webhook_route_reorder",
    {
      title: "Reorder pipeline webhook routes",
      description:
        "Set the evaluation order of one endpoint's branches (under first_match, order decides where a lead lands). Returns {data: Route[]} in the new order.",
      inputSchema: S.reorderPipelineWebhookRoutesSchema,
      ...toolHints.idempotent,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.reorderPipelineWebhookRoutes(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "pipeline_webhook_route_update",
    {
      title: "Update a pipeline webhook route",
      description:
        "Partially update a branch: to_stage_id, label, filter (replaced whole), position, is_enabled. Returns {data: Route}.",
      inputSchema: S.updatePipelineWebhookRouteSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.updatePipelineWebhookRoute(
          t,
          input.route_id,
          strip(input, "bearer_token", "route_id"),
        ),
      ),
  );

  server.registerTool(
    "pipeline_webhook_route_delete",
    {
      title: "Delete a pipeline webhook route",
      description:
        "Permanently delete a routing branch; payloads it matched fall through to the remaining branches. Returns {data: {id}}.",
      inputSchema: S.deletePipelineWebhookRouteSchema,
      ...toolHints.destructive,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.deletePipelineWebhookRoute(t, input.route_id),
      ),
  );
}
