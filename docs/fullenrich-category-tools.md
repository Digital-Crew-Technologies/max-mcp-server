# FullEnrich category tools

Max MCP exposes eight individual FullEnrich tools and a job polling tool in
every `GROUPED_TOOLS` mode. Other domains continue using their existing grouping.
The MCP server only forwards the authenticated caller to the Max backend;
`FULLENRICH_API_KEY` belongs in Max's server environment, never in tool arguments
or this MCP server's environment. These tools do not route through Claire.

The previous `claire_enrich_person` tool is removed from the MCP catalog and
replaced by these eight category tools. Claire's other market/research tools
remain available. Max's generic legacy Claire HTTP API remains an independent
path; this MCP server does not expose it as a person enrichment tool.

| Individual MCP tool | Max backend endpoint | Returned category |
| --- | --- | --- |
| `fullenrich_emails` | `POST /api/v1/fullenrich/emails` | Work/personal emails, verification status, best email |
| `fullenrich_phones` | `POST /api/v1/fullenrich/phones` | Numbers, region, line type/status, optional ownership/connect signals |
| `fullenrich_identity` | `POST /api/v1/fullenrich/identity` | Name, headline, description |
| `fullenrich_linkedin` | `POST /api/v1/fullenrich/linkedin` | Profile URL/ID/handle/connections |
| `fullenrich_career` | `POST /api/v1/fullenrich/career` | Employers, roles, seniority/functions, descriptions/dates |
| `fullenrich_education_skills` | `POST /api/v1/fullenrich/education-skills` | Education, skills, languages/proficiency |
| `fullenrich_location` | `POST /api/v1/fullenrich/location` | City, region, country/code |
| `fullenrich_company` | `POST /api/v1/fullenrich/company` | Company profile, size, industry, LinkedIn, headquarters/offices |
| `fullenrich_get_job` | `GET /api/v1/fullenrich/jobs/:job_id` | Status and requested category result |

## Inputs and authentication

Person lookups accept `email`, an HTTPS LinkedIn `/in/` `linkedin_url`, or
`person_name` plus `company_domain`/`company_linkedin_url`. The company tool also
accepts a standalone company domain or HTTPS LinkedIn `/company/` URL. Domain
inputs are hostnames without schemes, ports or paths. Unsupported/extra inputs
are rejected before any network request; callers cannot choose a workspace or
pass provider credentials. Max resolves and authorizes the authenticated workspace.
Regional LinkedIn hosts and dotted profile handles are accepted, and tracking
queries/fragments are stripped before forwarding. URL inputs are limited to
500 characters; domain inputs are normalized to lowercase, matching Max.

The existing MCP `Authorization: Bearer` request context or optional
`bearer_token` tool argument supplies the caller token. Only the bearer header
is sent to Max; `bearer_token` is removed from request bodies.

An optional `request_id` UUID identifies an identical category request. Preserve
it when recovering a submission whose response was lost. Do not reuse it with
different identifiers or another category. Each category tool is a paid
operation and may incur another lookup charge; these are category-specific
projections of FullEnrich data, not eight independent vendor APIs. Data coverage
varies, and missing fields remain empty rather than being guessed.

## Async jobs and spend

Submission returns HTTP 202 for a pending job or 200 for a completed job. MCP
returns the backend envelope unchanged: `{data: {job_id, status, phase,
categories, matched, result, provider_credits, credits_charged, error_message}}`.
The envelope may also contain `person_result` for an existing saved-person job;
MCP passes this optional compatibility result through unchanged.
Store `job_id` and call `fullenrich_get_job` until the job completes or fails.
Polling can advance an already requested identity-to-contact lookup, but never
creates a separate enrichment request. Do not call a paid category tool to poll.
Results are stored in the job, not automatically written to saved prospects.

All paid POSTs disable automatic HTTP/network retries, including 429/503/504.
Errors are returned with the MCP error flag. GET polling retains the existing
safe retry policy. The server does not read or expose a FullEnrich API key.

Deploy the Max backend endpoints before publishing this MCP tool catalog.
Account-level coverage and actual paid provider behavior require authenticated
production verification; unit tests mock Max HTTP responses and spend nothing.

## Enrich a saved person with Claire

`enrich_prospect_with_claire` keeps the People button's label while calling
Max-owned FullEnrich jobs through `POST /api/v1/prospects/:id/claire-enrich`.
Pass the saved person's `id` and optional `categories`, for example
`["emails","phones"]`. Supported categories are the eight listed above.
Selections must be nonempty, unique and supported, and are validated before
HTTP. Only the category selection goes into the body; workspace IDs and
provider credentials are never forwarded. The caller
needs People write and full People field access. Max derives the workspace
from that caller's authentication.

Only selected data is saved to CRM fields, alternates and the CRM provider-data
envelope. Existing valid values and unchecked categories are preserved.
Omitting categories keeps automatic gap selection, including a free skip for
complete records. Explicit selection can request an already populated category.
Identity discovery can still be needed for a contact lookup.

The response is passed through unchanged. While `data.pending` is true, use
`data.enrichmentId` as `job_id` for `fullenrich_get_job`, checking every 30
seconds until completed or failed. Saved-person job reads include `person_result`
with findings and saved fields. Do not repeat the paid start tool to poll.
The same category set resumes an active saved-person job; a different set
returns 409 without submitting another lookup. Paid POSTs remain non-retrying.

Deploy the Max selection backend (max-agent PR #1095) before this MCP adapter.
The adapter uses caller authentication only; the FullEnrich key stays in Max.
