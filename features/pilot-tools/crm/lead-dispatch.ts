// Lead Dispatch tools (the assistant Task B2): score → assign → export CSV.
// Reuses B1's HubSpotClient + token-resolver (via tools.ts withClient) and the
// the assistant workspace-profile reader.
// ⚠️ Server-only.

import { resolveBearerToken, type McpServer } from "../shared";
import * as S from "./schema";
import { HubSpotClient } from "./hubspot-client";
import { getHubSpotAccessToken } from "./token-resolver";
import {
  getAgentSettingsConfig,
  type AssignmentRule,
  type IcpRules,
} from "./agent-settings";
import type { CrmOwner } from "./hubspot-client.types";

type McpEnvelope = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(payload: unknown): McpEnvelope {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

function err(text: string): McpEnvelope {
  return { isError: true, content: [{ type: "text", text }] };
}

function mapError(e: unknown): McpEnvelope {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "HUBSPOT_NOT_CONNECTED") {
    return err(
      "HubSpot is not connected for this workspace. Connect HubSpot in workspace settings, then retry.",
    );
  }
  const cls = e instanceof Error ? e.name : "Error";
  return err(`${cls}: ${msg}`);
}

type Prospect = {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  company?: string;
  companyDomain?: string;
  country?: string;
  industry?: string;
  employeeCount?: number;
  score?: number;
  // Optional owner id for CSV export (set by assign step or caller).
  ownerId?: string;
  owner_id?: string;
};

function prospectKey(p: Prospect): string {
  return p.id ?? p.email ?? "";
}

// ── Scoring ──────────────────────────────────────────────────────────────────

const SCORE_COUNTRY = 25;
const SCORE_INDUSTRY = 25;
const SCORE_EMPLOYEES = 20;
const SCORE_TITLE = 30;

function icpIsEmpty(rules: IcpRules | undefined): boolean {
  if (!rules) return true;
  const hasCountries = Array.isArray(rules.countries) && rules.countries.length > 0;
  const hasIndustries = Array.isArray(rules.industries) && rules.industries.length > 0;
  const hasEmployees = rules.employee_min != null || rules.employee_max != null;
  const hasTitles = Array.isArray(rules.title_keywords) && rules.title_keywords.length > 0;
  return !(hasCountries || hasIndustries || hasEmployees || hasTitles);
}

function eq(a: string | undefined, b: string): boolean {
  return (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
}

function scoreProspect(
  p: Prospect,
  rules: IcpRules,
): { score: number; matched: string[]; missed: string[] } {
  const matched: string[] = [];
  const missed: string[] = [];
  let score = 0;

  // Country: 25 if it matches OR if no country list is configured.
  const countries = rules.countries ?? [];
  if (countries.length === 0) {
    score += SCORE_COUNTRY;
    matched.push("country (no list)");
  } else if (countries.some((c) => eq(p.country, c))) {
    score += SCORE_COUNTRY;
    matched.push("country");
  } else {
    missed.push("country");
  }

  // Industry: 25.
  const industries = rules.industries ?? [];
  if (industries.length > 0 && industries.some((i) => eq(p.industry, i))) {
    score += SCORE_INDUSTRY;
    matched.push("industry");
  } else {
    missed.push("industry");
  }

  // Employee count in range: 20.
  const hasRange = rules.employee_min != null || rules.employee_max != null;
  if (hasRange && p.employeeCount != null) {
    const aboveMin = rules.employee_min == null || p.employeeCount >= rules.employee_min;
    const belowMax = rules.employee_max == null || p.employeeCount <= rules.employee_max;
    if (aboveMin && belowMax) {
      score += SCORE_EMPLOYEES;
      matched.push("employeeCount");
    } else {
      missed.push("employeeCount");
    }
  } else {
    missed.push("employeeCount");
  }

  // Any title keyword (case-insensitive substring): 30.
  const keywords = rules.title_keywords ?? [];
  const title = (p.jobTitle ?? "").toLowerCase();
  if (keywords.length > 0 && keywords.some((k) => title.includes(k.toLowerCase()))) {
    score += SCORE_TITLE;
    matched.push("titleKeyword");
  } else {
    missed.push("titleKeyword");
  }

  return { score, matched, missed };
}

// ── Assignment ────────────────────────────────────────────────────────────────

function ruleMatches(rule: AssignmentRule, p: Prospect): boolean {
  const cond = rule.if;
  if (!cond) return true; // catch-all
  if (cond.country && cond.country.length > 0) {
    if (!cond.country.some((c) => eq(p.country, c))) return false;
  }
  if (cond.industry && cond.industry.length > 0) {
    if (!cond.industry.some((i) => eq(p.industry, i))) return false;
  }
  // `product` is informational — not matched against any prospect field.
  return true;
}

function priorityForScore(score: number | undefined): "high" | "med" | "low" {
  if (score == null) return "med";
  if (score >= 75) return "high";
  if (score >= 50) return "med";
  return "low";
}

// ── Concurrency limiter (no new dep) ───────────────────────────────────────────

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers: Promise<void>[] = [];
  const n = Math.max(1, Math.min(limit, items.length));
  for (let w = 0; w < n; w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = next++;
          if (i >= items.length) break;
          results[i] = await fn(items[i], i);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}

// ── CSV ────────────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// ── Tool registration ────────────────────────────────────────────────────────

export function registerCrmLeadDispatchTools(server: McpServer): void {
  server.registerTool(
    "crm_score_prospects",
    {
      title: "Score prospects against ICP",
      description:
        "Score prospects 0–100 against the workspace ICP rules (agent_settings.icp_rules): country 25, industry 25, employee-in-range 20, any title keyword 30. With no rules configured, every prospect scores 50 (reason no_icp_rules_configured). Returns { scored: [{ id|email, score, matched[], missed[] }] }.",
      inputSchema: S.crmScoreProspectsSchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }
      let rules: IcpRules | undefined;
      try {
        rules = (await getAgentSettingsConfig(bearer)).icp_rules;
      } catch (e) {
        return mapError(e);
      }
      const prospects = (input.prospects ?? []) as Prospect[];
      if (icpIsEmpty(rules)) {
        return ok({
          scored: prospects.map((p) => ({
            key: prospectKey(p),
            id: p.id,
            email: p.email,
            score: 50,
            matched: [],
            missed: [],
            reason: "no_icp_rules_configured",
          })),
        });
      }
      const effectiveRules = rules as IcpRules;
      return ok({
        scored: prospects.map((p) => {
          const { score, matched, missed } = scoreProspect(p, effectiveRules);
          return { key: prospectKey(p), id: p.id, email: p.email, score, matched, missed };
        }),
      });
    },
  );

  server.registerTool(
    "crm_assign_prospects",
    {
      title: "Assign prospects to owners",
      description:
        "Assign prospects to HubSpot owners using agent_settings.assignment_rules (or assignment_rules_override). First matching rule wins; no match → owner_id null, reason 'no rule matched', priority 'low'. Priority otherwise derives from prospect.score (>=75 high, 50–74 med, <50 low) else 'med'. Returns { assignments: [{ id|email, owner_id, owner_name, owner_email, reasoning, priority }] }.",
      inputSchema: S.crmAssignProspectsSchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }

      const override = input.assignment_rules_override as AssignmentRule[] | undefined;
      let rules: AssignmentRule[];
      try {
        rules = override ?? (await getAgentSettingsConfig(bearer)).assignment_rules ?? [];
      } catch (e) {
        return mapError(e);
      }

      // Resolve owners so we can attach name/email to assignments.
      let owners: CrmOwner[];
      try {
        const token = await getHubSpotAccessToken(bearer);
        owners = await new HubSpotClient(token).listOwners();
      } catch (e) {
        return mapError(e);
      }
      const ownerById = new Map(owners.map((o) => [o.id, o]));

      const prospects = (input.prospects ?? []) as Prospect[];
      const assignments = prospects.map((p) => {
        const idx = rules.findIndex((r) => ruleMatches(r, p));
        if (idx === -1) {
          return {
            key: prospectKey(p),
            id: p.id,
            email: p.email,
            owner_id: null,
            owner_name: null,
            owner_email: null,
            reasoning: "no rule matched",
            priority: "low" as const,
          };
        }
        const rule = rules[idx];
        const owner = ownerById.get(rule.assign_to_owner_id);
        const ownerName = owner
          ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || null
          : null;
        return {
          key: prospectKey(p),
          id: p.id,
          email: p.email,
          owner_id: rule.assign_to_owner_id,
          owner_name: ownerName,
          owner_email: owner?.email ?? null,
          reasoning: `matched rule #${idx}${rule.if ? "" : " (catch-all)"}`,
          priority: priorityForScore(p.score),
        };
      });

      return ok({ assignments });
    },
  );

  server.registerTool(
    "crm_export_import_csv",
    {
      title: "Export prospects as HubSpot-import CSV",
      description:
        "Build a HubSpot-import CSV (base64-encoded) from prospects. When dedup_against_hubspot (default true), drops prospects whose email already exists in HubSpot (concurrency <=5). Columns: Email, First Name, Last Name, Job Title, Company, Company Domain, Country, Industry, Number of Employees [, HubSpot Owner ID when include_assignment]. Returns { csv_base64, row_count, deduped_count, deduped:[{ email, existing_id }] }.",
      inputSchema: S.crmExportImportCsvSchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }

      const prospects = (input.prospects ?? []) as Prospect[];
      const dedup = input.dedup_against_hubspot !== false; // default true
      const includeAssignment = input.include_assignment !== false; // default true

      const deduped: Array<{ email: string; existing_id: string }> = [];
      let kept = prospects;

      if (dedup) {
        let client: HubSpotClient;
        try {
          const token = await getHubSpotAccessToken(bearer);
          client = new HubSpotClient(token);
        } catch (e) {
          return mapError(e);
        }
        try {
          const flags = await mapLimit(prospects, 5, async (p) => {
            if (!p.email) return { drop: false as const };
            const existing = await client.getContactByEmail(p.email);
            if (existing) {
              return { drop: true as const, email: p.email, existing_id: existing.id };
            }
            return { drop: false as const };
          });
          kept = prospects.filter((_, i) => {
            const f = flags[i];
            if (f.drop) {
              deduped.push({ email: f.email, existing_id: f.existing_id });
              return false;
            }
            return true;
          });
        } catch (e) {
          return mapError(e);
        }
      }

      const header = [
        "Email",
        "First Name",
        "Last Name",
        "Job Title",
        "Company",
        "Company Domain",
        "Country",
        "Industry",
        "Number of Employees",
      ];
      if (includeAssignment) header.push("HubSpot Owner ID");

      const rows: string[][] = [header];
      for (const p of kept) {
        const row = [
          p.email ?? "",
          p.firstName ?? "",
          p.lastName ?? "",
          p.jobTitle ?? "",
          p.company ?? "",
          p.companyDomain ?? "",
          p.country ?? "",
          p.industry ?? "",
          p.employeeCount != null ? String(p.employeeCount) : "",
        ];
        if (includeAssignment) row.push(p.ownerId ?? p.owner_id ?? "");
        rows.push(row);
      }

      const csv = buildCsv(rows);
      const csv_base64 = Buffer.from(csv, "utf8").toString("base64");

      return ok({
        csv_base64,
        row_count: kept.length,
        deduped_count: deduped.length,
        deduped,
      });
    },
  );
}
