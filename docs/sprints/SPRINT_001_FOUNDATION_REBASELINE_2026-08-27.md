# TIP Foundation Rebaseline — 2026-08-27

**Status:** Approved implementation rebaseline  
**Canonical repository:** `rc610music/truaxiom-TIP`

## Why this record exists

The repository already contains an earlier architecture-oriented Sprint 001 marked complete and a partial Sprint 002 implementation. On 2026-08-27, the active build discussion reset the execution sequence around the first durable infrastructure and data contracts. This additive record preserves the earlier approved work while defining the current implementation sprint without rewriting history.

## Verified baseline

- GitHub repository exists and is the canonical implementation source.
- Latest verified repository commit before this record: `579bf98d07adfd2787dc4094cfbf35b6c1d747f1`.
- The repository already contains a Node workspace, core packages, API code, a Mission Control shell, architecture documents, seed models, and earlier Render-preview material.
- Connected Supabase contains no project named `tip-core`.
- The connected Vercel team contains no project.
- No current production deployment is verified for the rebaselined TIP foundation.

## Sprint 001 — Foundation Rebaseline

- [x] Canonical GitHub repository confirmed.
- [x] Existing engineering repository structure confirmed.
- [x] Existing Mission Control shell confirmed as a starting point.
- [x] Adopt a provider-neutral, database-free Sprint 001 foundation.
- [x] Define the Identity contract as JSON Schema.
- [x] Define the Registry Entry contract as JSON Schema.
- [x] Define the Agent Manifest contract as JSON Schema.
- [x] Define the Workflow Definition contract as JSON Schema.
- [ ] Align Mission Control with the locked TIP Core / PIE / Registry / Agent Framework boundaries.
- [ ] Create and verify the Vercel project.
- [ ] Run schema, build, integration, and deployment validation.

## Foundation persistence decision

Sprint 001 uses local seed data, mock fixtures, and the existing in-memory repository. The canonical contracts are independent of Supabase, Neon, Vercel, an ORM, or a UI framework. Persistent PostgreSQL and authentication are deferred until Sprint 002 and must be introduced through adapters.

## Source-of-truth rule

The locked TIP Architecture Source of Truth and Agent Framework Specification remain authoritative for platform boundaries. Existing code is preserved but must be reconciled against those contracts before being treated as current production implementation.

## Immediate next action

Align Mission Control with the locked TIP Core / PIE / Registry / Agent Framework boundaries using the new contracts, then create and verify the Vercel project. Do not provision persistent data infrastructure until a Sprint 002 workflow requires durable multi-user state.
