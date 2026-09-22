import { z } from "zod";
import { withToken } from "../shared";

// Mirrors max-agent src/features/automations/schemas/automation.schema.ts and
// automation-definition.schema.ts. The definition is modelled with the API's
// own field names; the trigger's discriminated union is flattened into one
// object with optional per-type fields (max-agent strips the ones that do not
// apply and validates the rest). Drafts save leniently — per-action config is
// only strictly checked at activation and manual runs.

const uuid = (what: string) => z.string().uuid().describe(what);

const FILTER_OPERATORS = [
  "equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with",
  "matches_regex", "in", "not_in", "gt", "gte", "lt", "lte", "is_truthy", "is_empty",
] as const;

const ACTION_TYPES = [
  "create_task", "notify", "update_field", "move_stage", "enroll_campaign",
  "remove_from_campaign", "create_deal", "assign_owner", "add_to_list",
  "send_webhook", "request_signature", "move_deal_stage",
] as const;

const scalar = z.union([z.string().max(500), z.number(), z.boolean()]);

const filterSchema = z.object({
  match: z.enum(["all", "any"]).optional().describe("all = AND (default), any = OR."),
  conditions: z
    .array(
      z.object({
        path: z
          .string()
          .min(1)
          .max(200)
          .describe("Path into the run envelope, e.g. record.status, changes.status.to, payload.plan."),
        operator: z.enum(FILTER_OPERATORS),
        value: z
          .union([scalar, z.array(z.union([z.string().max(200), z.number(), z.boolean()])).max(50)])
          .optional()
          .describe("Omit for is_truthy/is_empty; an array for in/not_in."),
      }),
    )
    .max(12)
    .describe("Empty = always matches."),
});

const triggerSchema = z
  .object({
    type: z.enum(["record_event", "schedule", "manual", "webhook"]),
    entity: z
      .enum(["prospect", "deal", "task", "document"])
      .optional()
      .describe("record_event: record kind. manual: 'prospect' makes Run require a person."),
    event: z.enum(["created", "updated", "deleted"]).optional().describe("record_event only."),
    field: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("record_event 'updated': fire only when this column changed (e.g. status)."),
    to_value: scalar.optional().describe("With field: only when it changed to this value."),
    filter: filterSchema.optional().describe("record_event: extra conditions over the event."),
    schedule: z
      .object({
        kind: z.enum(["every", "daily", "weekly"]),
        amount: z.number().int().min(1).optional(),
        unit: z.enum(["minutes", "hours", "days"]).optional(),
        at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
        timezone: z.string().min(1).max(64).optional(),
        day: z.number().int().min(0).max(6).optional(),
      })
      .optional()
      .describe(
        "schedule only: {kind:'every', amount, unit} (>= 15 min) | {kind:'daily', at:'HH:MM', timezone} | {kind:'weekly', day:0-6 (0=Sun), at, timezone}.",
      ),
    match_prospect_email_path: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("webhook only: JSON path to an email; the matching person becomes the run's record."),
  })
  .describe("What starts a run.");

const stepSchema = z.object({
  id: z.string().trim().min(1).max(64).describe("Stable step id you choose (e.g. 's1')."),
  name: z.string().trim().max(120).optional().describe("Optional label."),
  kind: z.enum(["action", "filter", "delay"]),
  action: z.enum(ACTION_TYPES).optional().describe("kind=action: what to do."),
  config: z
    .record(z.unknown())
    .optional()
    .describe(
      "kind=action config: create_task {title, description?, priority?, assignee_id?, due_in_days?}; notify {message}; " +
        "update_field {entity?, field_key, value, only_if_empty?}; move_stage|move_deal_stage {stage_id}; " +
        "enroll_campaign|remove_from_campaign {campaign_id}; create_deal {pipeline_id?, stage_id?}; " +
        "assign_owner {assignee_ids[], mode?: add|replace}; add_to_list {list_id}; " +
        "send_webhook {url (https), method?, headers?, include_record?}; request_signature {document_id | '{{record.id}}'}. " +
        "Text supports {{record.*}} / {{event.*}} / {{payload.*}}.",
    ),
  filter: filterSchema.optional().describe("kind=filter: stop the run (successfully) unless it matches."),
  duration_seconds: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("kind=delay: wait 60..7776000 seconds (90 days)."),
});

const definitionSchema = z
  .object({
    trigger: triggerSchema,
    steps: z.array(stepSchema).max(20).describe("Up to 20 steps, run in order."),
  })
  .describe("Workflow document {trigger, steps}.");

export const tokenOnlySchema = z.object({ ...withToken });

export const automationIdSchema = z.object({
  ...withToken,
  automation_id: uuid("Automation workflow UUID."),
});

export const createAutomationSchema = z.object({
  ...withToken,
  name: z.string().trim().min(1).max(120).describe("Unique name (max 120)."),
  description: z.string().trim().max(500).optional().describe("Description (max 500)."),
  definition: definitionSchema
    .optional()
    .describe("Starting draft; an empty manual-trigger draft when omitted."),
});

export const updateAutomationSchema = z.object({
  ...withToken,
  automation_id: uuid("Automation workflow UUID."),
  name: z.string().trim().min(1).max(120).optional().describe("New name."),
  description: z.string().trim().max(500).nullable().optional().describe("New description; null clears."),
});

export const saveDraftSchema = z.object({
  ...withToken,
  automation_id: uuid("Automation workflow UUID."),
  definition: definitionSchema,
});

export const runAutomationSchema = z.object({
  ...withToken,
  automation_id: uuid("Automation workflow UUID."),
  prospect_id: z
    .string()
    .uuid()
    .optional()
    .describe("Person to run for (manual triggers with entity 'prospect')."),
});

export const listRunsSchema = z.object({
  ...withToken,
  automation_id: uuid("Automation workflow UUID."),
  page: z.number().int().min(1).optional().describe("1-based page (25 runs per page)."),
});

export const runIdSchema = z.object({
  ...withToken,
  run_id: uuid("Automation run UUID."),
});
