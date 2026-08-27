# ADR-0004 — Database-Free Foundation

**Status:** Accepted  
**Date:** 2026-08-27

## Decision

Sprint 001 will use provider-neutral JSON Schema contracts, local seed data, mock fixtures, and the existing in-memory repository. No hosted database or authentication provider is required to complete the foundation sprint.

Persistent PostgreSQL and authentication are deferred until Sprint 002. Neon through the Vercel Marketplace is the preferred persistence candidate when the platform requires durable multi-user state. Auth.js is the preferred provider-neutral authentication candidate. Both remain subject to validation when that sprint begins.

## Consequences

- Supabase is removed from the Sprint 001 critical path.
- Existing Supabase and PostgreSQL experiments remain preserved as non-canonical implementation research.
- Identity, Registry, Agent, and Workflow contracts must not depend on a storage vendor.
- Mission Control may continue using static seed data while the contracts stabilize.
- A future persistence adapter must implement the contracts without changing their business meaning.
