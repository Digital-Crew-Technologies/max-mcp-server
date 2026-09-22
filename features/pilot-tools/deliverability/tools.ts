import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// start_warmup, resume_warmup and create_mailpool_order spend real money
// (accounts:purchase), carry no idempotency key upstream, and a Mailpool order
// is a non-reversible supplier purchase. Workspace "Max MCP" keys are minted
// with every scope, so the scope alone does not keep a model from buying
// mailboxes on its own initiative. They are therefore opt-in per deployment.
export function purchaseToolsEnabled(): boolean {
  return process.env.ENABLE_PURCHASE_TOOLS === "true";
}

export function registerDeliverabilityTools(server: McpServer): void {
  const purchases = purchaseToolsEnabled();

  // ── Deliverability ────────────────────────────────────────────────────────
  server.registerTool("list_inbox_placements", {
    title: "List inbox placement checks",
    description: "List inbox placement (spam) checks run on the workspace's done-for-you mailboxes, newest first: status, score, inbox/spam/promotions counts. `results` inlines the full result of the N latest completed checks.",
    inputSchema: S.listInboxPlacementsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listInboxPlacements(t, strip(input, "bearer_token"))));

  server.registerTool("get_inbox_placement", {
    title: "Get inbox placement check",
    description: "Get one inbox placement check: {check, result} with placement per provider and per seed inbox once completed (result null until then).",
    inputSchema: S.getInboxPlacementSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getInboxPlacement(t, input.id)));

  server.registerTool("get_warmup_deliverability", {
    title: "Get warm-up deliverability",
    description: "Warm-up health of every done-for-you mailbox, read live from Mailpool: status, health score, inbox rate, landed-inbox/spam totals and a daily series.",
    inputSchema: S.getWarmupDeliverabilitySchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getWarmupDeliverability(t)));

  // ── Warm-up ───────────────────────────────────────────────────────────────
  server.registerTool("list_warmups", {
    title: "List warm-ups",
    description: "List the workspace's email warm-ups, the mailboxes eligible for warm-up (with a reason when not), and current pricing: {data, eligible, pricing}.",
    inputSchema: S.listWarmupsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listWarmups(t)));

  server.registerTool("get_warmup_pricing", {
    title: "Get warm-up pricing",
    description: "Warm-up price per mailbox (daily credits/USD, monthly USD) and whether purchasing is enabled.",
    inputSchema: S.getWarmupPricingSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getWarmupPricing(t)));

  if (purchases) {
    server.registerTool("start_warmup", {
      title: "Start warm-up (charges credits)",
      description: "CHARGES THE WORKSPACE: buys email warm-up for each mailbox, billed the first day now and then daily until cancel_warmup. Confirm the mailboxes and price (get_warmup_pricing) with the user first. Returns {started, failed, tokens_charged}; 402 when credits are short, 422 when none started.",
      inputSchema: S.startWarmupSchema,
    }, async (input) => callApi(input.bearer_token, (t) =>
      repo.startWarmup(t, strip(input, "bearer_token"))));
  }

  server.registerTool("update_warmup", {
    title: "Update warm-up settings",
    description: "Change a warm-up's daily target and ramp-up days. Returns the updated warm-up.",
    inputSchema: S.updateWarmupSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateWarmup(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("cancel_warmup", {
    title: "Cancel warm-up",
    description: "Stop a warm-up at the end of its paid period (no refund; ends immediately if unpaid). resume_warmup undoes a pending cancellation.",
    inputSchema: S.cancelWarmupSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.cancelWarmup(t, input.id)));

  if (purchases) {
    server.registerTool("resume_warmup", {
      title: "Resume warm-up (may charge credits)",
      description: "MAY CHARGE THE WORKSPACE: undoes a pending cancellation (free), or pays a past-due warm-up's next day now and re-enables it. Confirm with the user first. 402 when credits are short.",
      inputSchema: S.resumeWarmupSchema,
    }, async (input) => callApi(input.bearer_token, (t) => repo.resumeWarmup(t, input.id)));
  }

  server.registerTool("sync_warmup", {
    title: "Sync one warm-up",
    description: "Refresh one warm-up's status and stats from Mailpool and return it.",
    inputSchema: S.syncWarmupSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.syncWarmup(t, input.id)));

  server.registerTool("sync_all_warmups", {
    title: "Sync all warm-ups",
    description: "Refresh every live warm-up from Mailpool. Returns {data, unmanaged (warm-ups Mailpool runs that Max doesn't track), errors}.",
    inputSchema: S.syncAllWarmupsSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.syncAllWarmups(t)));

  // ── Mailpool (done-for-you domains + mailboxes) ───────────────────────────
  server.registerTool("list_mailpool_domains", {
    title: "List Mailpool domains",
    description: "List domains this workspace already bought through done-for-you setup, with Mailpool status, so new mailboxes can reuse them.",
    inputSchema: S.listMailpoolDomainsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listMailpoolDomains(t)));

  server.registerTool("search_mailpool_domains", {
    title: "Search Mailpool domains",
    description: "Check availability and annual price of a domain name across TLDs, plus suggestions and mailbox pricing. Read-only; buys nothing.",
    inputSchema: S.searchMailpoolDomainsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.searchMailpoolDomains(t, strip(input, "bearer_token"))));

  server.registerTool("get_mailpool_pricing", {
    title: "Get Mailpool mailbox pricing",
    description: "Monthly price per done-for-you mailbox (USD and credits) for Google and Microsoft, and whether purchasing is enabled.",
    inputSchema: S.getMailpoolPricingSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getMailpoolPricing(t)));

  server.registerTool("list_mailpool_orders", {
    title: "List Mailpool orders",
    description: "List the workspace's done-for-you email setup orders: domains, mailboxes, provisioning status and billing.",
    inputSchema: S.listMailpoolOrdersSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listMailpoolOrders(t)));

  if (purchases) {
    server.registerTool("create_mailpool_order", {
      title: "Buy domains + mailboxes (charges credits)",
      description: "CHARGES THE WORKSPACE: buys domains and pre-configured sending mailboxes from Mailpool (real supplier purchase; not reversible). Confirm domains, mailboxes and price with the user first (search_mailpool_domains, get_mailpool_pricing). Never retry blindly: on an error or timeout check list_mailpool_orders first. Returns {order_id, status, tokens_charged, warning}.",
      inputSchema: S.createMailpoolOrderSchema,
    }, async (input) => callApi(input.bearer_token, (t) =>
      repo.createMailpoolOrder(t, strip(input, "bearer_token"))));
  }

  server.registerTool("sync_mailpool_order", {
    title: "Sync Mailpool order",
    description: "Refresh an order's domain/mailbox provisioning and DNS status from Mailpool, auto-connecting newly active mailboxes. Returns the order.",
    inputSchema: S.syncMailpoolOrderSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.syncMailpoolOrder(t, input.id)));
}
