// CRM record shapes returned by max-agent's scoped CRM read routes
// (POST /api/v1/crm/list-deals, …/get-deal, …/list-activities, GET
// …/list-owners, …/list-pipeline-stages). They mirror max-agent's
// src/features/crm/hubspot/crm-client.interface.ts.
// ⚠️ Server-only.

export interface CrmDeal {
  id: string;
  name: string | null;
  amount: number | null;
  ownerId: string | null;
  /** HubSpot dealstage id. */
  stage: string | null;
  pipeline: string | null;
  closeDate: string | null;
  lastModified: string | null;
  lastActivityDate: string | null;
  nextStep: string | null;
  /** get-deal only; list-deals does not load associations. */
  associatedCompanyIds?: string[];
  associatedContactIds?: string[];
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
  /** The deal/contact filter the activity matched, else null. */
  dealId: string | null;
  contactId: string | null;
  subject: string | null;
  body: string | null;
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
  teams: string[];
}

export interface CrmPipelineStage {
  id: string;
  label: string | null;
  displayOrder: number | null;
  pipelineId: string;
  pipelineLabel: string | null;
  probability: number | null;
  isWonStage: boolean;
  isLostStage: boolean;
}
