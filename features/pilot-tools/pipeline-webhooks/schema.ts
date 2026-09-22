import { z } from "zod";
import { withToken } from "../shared";

// Mirrors max-agent's src/features/pipeline/schemas/pipeline-webhook.schema.ts,
// pipeline-webhook-route.schema.ts and webhook-constants.ts.
//
// No top-level .refine(): the group adapter needs a plain z.object to read
// `.shape`. max-agent itself rejects an empty PATCH body ("No fields to update").
//
// Fields shared by several tools (webhook_id, to_stage_id, is_enabled, dry_run,
// auth_mode, filter) use ONE definition so their description stays correct when
// the tools are flattened into a grouped tool (first definition wins there).

// ── Enums ──────────────────────────────────────────────────────────────────

const AUTH_MODES = ["none", "hmac", "token"] as const;
const DELIVERY_STATUSES = [
  "accepted",
  "duplicate",
  "unmatched",
  "rejected",
  "skipped",
  "failed",
] as const;
const MAPPABLE_FIELDS = [
  "email",
  "first_name",
  "last_name",
  "full_name",
  "phone_number",
  "title",
  "headline",
  "seniority",
  "linkedin_url",
  "twitter_url",
  "github_url",
  "facebook_url",
  "photo_url",
  "raw_address",
  "street_address",
  "city",
  "state",
  "postal_code",
  "country",
  "notes",
] as const;
const FILTER_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "matches_regex",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_truthy",
  "is_empty",
] as const;

// ── Shared fields ──────────────────────────────────────────────────────────

const webhookId = z.string().uuid().describe("Pipeline webhook endpoint UUID.");
const routeId = z.string().uuid().describe("Routing branch UUID.");
const toStageId = z
  .string()
  .uuid()
  .describe("Destination pipeline stage (column) UUID; must be a live column of this workspace.");
const isEnabled = z.boolean().describe("false pauses it (endpoint skips deliveries / branch is ignored).");
const dryRun = z
  .boolean()
  .describe("true = simulate only, create/move nobody. Default true for test, false for replay.");
const authMode = z
  .enum(AUTH_MODES)
  .describe("none = secret URL only; hmac = sender signs the body; token = sender sends a shared header token.");
const headerName = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9-]+$/)
  .describe("HTTP header name (letters, digits, hyphens; stored lower-case).");
const payloadPath = z
  .string()
  .min(1)
  .max(200)
  .describe("Dot/bracket path into the received JSON, e.g. data.contact.email or items[0].email.");

const conditionValue = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string().max(200), z.number(), z.boolean()])).max(50),
]);

const filter = z
  .object({
    match: z.enum(["all", "any"]).optional().describe("all (default) = every condition must hold; any = one is enough."),
    conditions: z
      .array(
        z.object({
          path: payloadPath,
          operator: z.enum(FILTER_OPERATORS),
          value: conditionValue
            .optional()
            .describe("Omit for is_truthy/is_empty; required otherwise. Array for in/not_in, number for gt/gte/lt/lte."),
        }),
      )
      .max(12)
      .describe("Empty array = catch-all."),
  })
  .describe("Which payloads this branch claims.");

const endpointSettings = {
  auth_mode: authMode.optional(),
  signature_header: headerName.optional().describe("hmac: header carrying the signature (default x-signature)."),
  signature_encoding: z.enum(["hex", "base64"]).optional().describe("hmac: digest encoding (default hex)."),
  token_header: headerName.optional().describe("token: header carrying the token (default x-webhook-token)."),
  field_mapping: z
    .record(z.enum(MAPPABLE_FIELDS), payloadPath)
    .optional()
    .describe("Prospect field -> payload path. Unmapped fields are inferred from the payload."),
  routing_mode: z
    .enum(["first_match", "all_matches"])
    .optional()
    .describe("first_match: first matching branch wins; all_matches: every matching branch takes the lead."),
  dedupe_by: z
    .enum(["email", "linkedin_url", "either", "none"])
    .optional()
    .describe("Identity used to detect an existing prospect (none = always create)."),
  dedupe_action: z
    .enum(["update", "skip", "route_only"])
    .optional()
    .describe("For an existing prospect: update details and re-route, skip, or re-route only."),
  rate_limit_per_minute: z.number().int().min(1).max(6000).optional(),
};

// ── Webhook endpoints ──────────────────────────────────────────────────────

export const listPipelineWebhooksSchema = z.object({ ...withToken });

export const getPipelineWebhookSchema = z.object({
  ...withToken,
  webhook_id: webhookId,
});

export const createPipelineWebhookSchema = z.object({
  ...withToken,
  name: z.string().min(1).max(80).describe("Endpoint name, unique in the workspace."),
  description: z.string().max(300).optional(),
  signature_prefix: z.string().max(40).optional().describe("hmac: prefix stripped before comparing, e.g. sha256=."),
  ...endpointSettings,
  to_stage_id: toStageId.optional(),
});

export const updatePipelineWebhookSchema = z.object({
  ...withToken,
  webhook_id: webhookId,
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).nullable().optional(),
  signature_prefix: z.string().max(40).nullable().optional(),
  ...endpointSettings,
  is_enabled: isEnabled.optional(),
});

export const deletePipelineWebhookSchema = z.object({
  ...withToken,
  webhook_id: webhookId,
});

export const rotatePipelineWebhookSchema = z.object({
  ...withToken,
  webhook_id: webhookId,
  target: z
    .enum(["secret", "url"])
    .optional()
    .describe("secret (default) = new HMAC secret/token; url = new endpoint URL."),
  auth_mode: z
    .enum(["hmac", "token"])
    .optional()
    .describe("target=secret only: mode to issue material for (default: current mode)."),
});

export const testPipelineWebhookSchema = z.object({
  ...withToken,
  webhook_id: webhookId,
  payload: z.record(z.unknown()).describe("Sample JSON object, as the sender would post it."),
  dry_run: dryRun.optional(),
});

export const listPipelineWebhookDeliveriesSchema = z.object({
  ...withToken,
  webhook_id: webhookId,
  page: z.number().int().min(1).optional().describe("Page number (default 1)."),
  pageSize: z.number().int().min(1).max(100).optional().describe("Rows per page (default 25, max 100)."),
  status: z.enum(DELIVERY_STATUSES).optional().describe("Filter by delivery status."),
});

export const replayPipelineWebhookDeliverySchema = z.object({
  ...withToken,
  webhook_id: webhookId,
  delivery_id: z.string().uuid().describe("Delivery UUID from pipeline_webhook_list_deliveries."),
  dry_run: dryRun.optional(),
});

// ── Routing branches ───────────────────────────────────────────────────────

export const listPipelineWebhookRoutesSchema = z.object({
  ...withToken,
  webhook_id: webhookId.optional().describe("Only this endpoint's branches; omit for the whole workspace."),
});

export const createPipelineWebhookRouteSchema = z.object({
  ...withToken,
  webhook_id: webhookId,
  to_stage_id: toStageId,
  label: z.string().max(60).optional().describe("Branch label."),
  filter: filter.optional().describe("Omit for a catch-all branch."),
  position: z.number().int().min(0).optional().describe("Evaluation order (0 = first)."),
});

export const reorderPipelineWebhookRoutesSchema = z.object({
  ...withToken,
  webhook_id: webhookId,
  ordered_ids: z
    .array(z.string().uuid())
    .describe("ALL of the endpoint's branch UUIDs in the new evaluation order."),
});

export const updatePipelineWebhookRouteSchema = z.object({
  ...withToken,
  route_id: routeId,
  to_stage_id: toStageId.optional(),
  label: z.string().max(60).nullable().optional(),
  filter: filter.optional(),
  position: z.number().int().min(0).optional(),
  is_enabled: isEnabled.optional(),
});

export const deletePipelineWebhookRouteSchema = z.object({
  ...withToken,
  route_id: routeId,
});
