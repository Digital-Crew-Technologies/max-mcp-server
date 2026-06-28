# ADR-004: Shared circuit breaker via Redis

## Status

Accepted

## Context

The circuit breaker and concurrency semaphore were per-process. Scaling past one instance fragmented breaker state.

## Decision

Extract `BreakerStore` with `InMemoryBreakerStore` (default) and `RedisBreakerStore` when `REDIS_URL` is set. Half-open probing uses Redis `SET NX` for single-prober election. Redis failures fall back to in-memory (same pattern as dead-letter queue).

## Consequences

- Multi-instance deployments share breaker state when Redis is configured.
- Bulkhead (8-slot concurrency) remains per-instance unless moved later.
