// Provider-agnostic CRM client types, ported from max-agent's
// src/features/crm/hubspot/crm-client.interface.ts. HubSpot is the v1
// implementation; Salesforce can implement the same shape later.
//
// Extended here (vs. max-agent) with read-only Deal / Activity / Owner /
// PipelineStage shapes needed by the Super-BJ deal/activity read tools.
// ⚠️ Server-only.

export interface CrmContact {
  id: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  /** Raw provider properties, for callers that need more than the mapped fields. */
  raw?: Record<string, unknown>;
}

export interface CrmCompany {
  id: string;
  name: string | null;
  domain?: string | null;
  raw?: Record<string, unknown>;
}

export interface UpsertContactInput {
  email: string; // dedup key — required
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  /** Extra provider properties to set (advanced). */
  properties?: Record<string, unknown>;
}

export interface UpsertCompanyInput {
  domain: string; // dedup key — required
  name?: string;
  properties?: Record<string, unknown>;
}

// ── Read-only Super-BJ shapes ───────────────────────────────────────────────

export interface CrmDeal {
  id: string;
  dealname: string | null;
  amount: number | null;
  ownerId: string | null;
  stage: string | null;
  pipeline: string | null;
  closeDate: string | null;
  lastModified: string | null;
  lastActivityDate: string | null;
  nextStep: string | null;
  associatedCompanyIds: string[];
  associatedContactIds: string[];
  raw?: Record<string, unknown>;
}

export interface ListDealsFilters {
  stageId?: string;
  ownerId?: string;
  pipelineId?: string;
  amountMin?: number;
  amountMax?: number;
  closeDateAfter?: string;
  closeDateBefore?: string;
  modifiedAfter?: string;
  limit?: number;
}

/** HubSpot engagement (call / email / meeting / note / task). */
export type CrmActivityType = "call" | "email" | "meeting" | "note" | "task";

export interface CrmActivity {
  id: string;
  type: CrmActivityType;
  timestamp: string | null;
  ownerId: string | null;
  dealId: string | null;
  contactId: string | null;
  subject: string | null;
  body: string | null;
  raw?: Record<string, unknown>;
}

export interface ListActivitiesFilters {
  dealId?: string;
  contactId?: string;
  ownerId?: string;
  types?: CrmActivityType[];
  since?: string;
  limit?: number;
}

export interface CrmOwner {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  teams?: string[];
  raw?: Record<string, unknown>;
}

export interface CrmPipelineStage {
  id: string;
  label: string | null;
  displayOrder: number | null;
  pipelineId: string | null;
  isWonStage: boolean;
  isLostStage: boolean;
  raw?: Record<string, unknown>;
}

export interface CrmClient {
  /** Free-text / filtered contact search. */
  searchContacts(query: string, limit?: number): Promise<CrmContact[]>;
  /** Look up a single contact by email (the dedup identity). */
  getContactByEmail(email: string): Promise<CrmContact | null>;
  /** Create-or-update a contact, matched by email. Never duplicates. */
  upsertContact(input: UpsertContactInput): Promise<{ id: string }>;
  /** Create-or-update a company, matched by domain. Never duplicates. */
  upsertCompany(input: UpsertCompanyInput): Promise<{ id: string }>;
}
