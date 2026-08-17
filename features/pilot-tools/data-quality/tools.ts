// Data-quality MCP tools — agents detect, humans merge.
//
// Calls max-agent's /api/v1/data-quality routes with the workspace bearer:
// exact-key duplicate detection (provider ids → LinkedIn URL → email for
// prospects; domain for organizations), on-demand rescans, and dismissing
// false positives.
//
// ── THERE IS NO merge TOOL, AND THERE MUST NOT BE ───────────────────────────
// Not in this file, not in repository.ts, not anywhere. POST
// /api/v1/data-quality/merge is JWT-only upstream — max-agent rejects API
// keys with 401 — because a merge rewrites both records, repoints every
// reference (campaigns, conversations, deals, activities, …) and tombstones
// the loser. That is irreversible enough that a signed-in human clicks it in
// the UI after looking at both records. An agent's job ends at surfacing the
// pair (and dismissing obvious false positives); routing around the gate
// would make it theater. tools.test.ts asserts this and should fail loudly.

import {
  callApi,
  registerGroupedTool,
  type GroupedActionDef,
  type McpServer,
} from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

/**
 * A grouped action plus the capability that governs it.
 *
 * See features/pilot-tools/meetings/tools.ts for the full note on how the
 * capability-403 layer actually works: these names are the MCP-side mirror of
 * the route-declared capability — documentation plus the Hermes envelope
 * string, never enforcement.
 */
interface DataQualityAction extends GroupedActionDef {
  capability: string;
}

/** Read the duplicate queue. */
const CAP_DATA_QUALITY_READ = "data_quality.read";
/** Trigger a rescan / dismiss a false positive. Never merge. */
const CAP_DATA_QUALITY_TRIAGE = "data_quality.triage";

const DATA_QUALITY_ACTIONS: DataQualityAction[] = [
  {
    action: "list_duplicates",
    capability: CAP_DATA_QUALITY_READ,
    title: "List duplicate pairs",
    description:
      "List the workspace's PENDING duplicate pairs for one entity type (default prospect). Each pair carries the match_key that linked them (provider id, LinkedIn URL, email — or domain for organizations) plus a summary of both records so you can judge the pair without extra reads. Returns {data: DuplicateCandidate[], counts: {prospect, organization}} — counts are the pending totals per entity type. Merging is human-only in the web app; surface pairs, don't try to merge them.",
    inputShape: S.listDuplicatesSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listDuplicates(t, input.entity_type as string | undefined),
      ),
  },
  {
    action: "scan",
    capability: CAP_DATA_QUALITY_TRIAGE,
    title: "Scan for duplicates",
    description:
      "Rescan the whole workspace for duplicates on demand (both prospects and organizations; exact keys only — provider ids, normalized LinkedIn URL, normalized email, organization domain). Idempotent: known pairs are refreshed, not duplicated, and pairs already dismissed or merged stay that way. Returns {data: scan counts}. Run it after a big import, then read list_duplicates.",
    inputShape: S.scanDuplicatesSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.scanDuplicates(t),
      ),
  },
  {
    action: "dismiss",
    capability: CAP_DATA_QUALITY_TRIAGE,
    title: "Dismiss a duplicate pair",
    description:
      "Mark one pair as NOT a duplicate (two genuinely different records that share a key). A dismissed pair stays dismissed across rescans, so only dismiss when you are confident — e.g. the summaries show different people behind a shared generic email. Returns {success: true}. 404 if the pair is not in your workspace.",
    inputShape: S.dismissDuplicateSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.dismissDuplicate(t, input.id as string),
      ),
  },
];

/** Tool/action → the capability that governs it, for the capability-403 layer. */
export const DATA_QUALITY_CAPABILITIES: Readonly<Record<string, string>> =
  Object.fromEntries(
    DATA_QUALITY_ACTIONS.map((a) => [`data_quality.${a.action}`, a.capability]),
  );

export function registerDataQualityTools(server: McpServer): void {
  registerGroupedTool(
    server,
    "data_quality",
    "Duplicate detection on Max's prospects and organizations — list pending pairs, rescan on demand, dismiss false positives. Merging is deliberately human-only (JWT-gated upstream). The workspace comes from your bearer token.",
    DATA_QUALITY_ACTIONS,
  );
}
