# ADR-006: LinkedIn people-search quota on the user's own account

## Status

Accepted

## Context

`linkedin_search_people` lets the agent search LinkedIn people through the
user's connected Unipile account. LinkedIn throttles and restricts accounts
that search too aggressively (Unipile's guidance is ~100 actions/day per
account), so unmetered agent-driven searching puts the user's own LinkedIn
account at risk. Every connected LinkedIn account already gets an
`account_rate_limits` row for `search_linkedin_profiles` at creation
(defaults 50/day, 200/week, editable in the account rate-limit settings),
but nothing enforced it.

## Decision

Enforce the quota **upstream in max-agent**, not in this proxy — the MCP
layer can be bypassed by anyone holding a bearer token, and max-agent is
where the connected account and its rate-limit row are resolved.

- The `search-people` action checks the account's `search_linkedin_profiles`
  row before calling Unipile and counts the search after success. Limits are
  honored exactly as stored (default 50/day; user-adjustable). Rolling
  resets: counters restart once the last search is ≥24h (daily) / ≥7d
  (weekly) old, the same convention as campaign actions.
- **Cursor pages count**: every Unipile search call is a real LinkedIn
  search. `search-parameters` (typeahead ID resolution) and `search-quota`
  do not count.
- The increment is a compare-and-set on the previous counters (one re-read
  retry) and never writes `available_at` or lock columns — interactive
  searches are human-triggered, so the campaign pacing machinery
  (acquire-RPC lock, lognormal delay) is deliberately not used, and writing
  `available_at` would stall campaign acquisition of the shared row.
- Exhaustion returns `429` with
  `{code: "SEARCH_QUOTA_EXCEEDED", cap, used_today, remaining, weekly_cap,
  used_this_week, weekly_remaining, resets_at}`; this proxy surfaces the
  body verbatim to the model. `linkedin_get_search_quota` exposes the same
  numbers for proactive checks.
- **API tier auto-selection**: search uses the account's detected
  subscription (`config.linkedin_inmail_api`, written at connect time) —
  Sales Navigator automatically when present, classic otherwise. Recruiter
  accounts default to classic because Unipile's Recruiter search results
  hide names and profile URLs (only `recruiter_candidate_id`), which
  defeats prospecting; an explicit `api=recruiter` is honored for
  candidate-search use cases. Requesting a premium api the account lacks is
  a fast 400 (the detection is only written at connect, so it can be stale
  after an upgrade — the error points at the account's manual LinkedIn API
  override). All tiers share the same quota row.
- `save-list` persists search results as a completed prospect list
  (`search_source: "linkedin"`), reusing workspace prospects matched by
  `linkedin_url` instead of duplicating them.

## Consequences

- Check-then-increment can overshoot by ~concurrency−1 near the cap; with
  one human plus one agent session per account that is at most a search or
  two, far inside LinkedIn's safety margin, and the CAS keeps stored
  counters accurate. If concurrency grows, replace with a
  `consume_search_quota` RPC.
- Interactive searches share the `search_linkedin_profiles` budget with any
  future campaign use of the same action type — intended (one real-world
  budget per account), but heavy interactive use could starve campaign
  acquisition.
- Failed Unipile calls never burn quota; a failed count after a successful
  call is logged and the results are still returned (the LinkedIn action
  already happened).
- `find_profile`'s internal search call is not metered (pre-existing
  behavior, one bounded call per lookup).
