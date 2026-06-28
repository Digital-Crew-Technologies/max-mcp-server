# ADR-005: Redis-backed /chat rate limit

## Status

Accepted

## Context

`shared/http/chat-rate-limit.ts` previously stored counters in an in-process
`Map`. On Vercel serverless each cold invocation got a fresh counter, so the
documented per-minute and daily caps did not enforce a cluster-wide limit.

## Decision

Mirror the `dead-letter.ts` and `breaker-store.ts` pattern: Redis-backed when
`REDIS_URL` is set, in-memory fallback otherwise. Counters use `INCR` + an
expiring window key (`max-mcp:chat:rl:<principal>:<minute>` and
`...:daily:<principal>:<date>`). Redis failures degrade gracefully to the
in-memory path; the route handler never blocks on Redis.

## Consequences

- On Vercel, cluster-wide enforcement of `CHAT_RATE_LIMIT_PER_MINUTE` and
  `CHAT_DAILY_REQUEST_CAP` when `REDIS_URL` is set.
- Single-instance VPS and local dev keep working unchanged (in-memory).
- The public API is now async; the route handler `await`s.
