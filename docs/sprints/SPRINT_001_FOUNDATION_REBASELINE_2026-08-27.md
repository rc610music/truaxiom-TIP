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
- [ ] Create one Supabase project named `tip-core`.
- [ ] Connect the repository to the approved Supabase project.
- [ ] Reconcile and implement the Identity model.
- [ ] Reconcile and implement the Registry model.
- [ ] Reconcile and implement the Agent model.
- [ ] Reconcile and implement the Workflow model.
- [ ] Align Mission Control with the locked TIP Core / PIE / Registry / Agent Framework boundaries.
- [ ] Create and verify the Vercel project.
- [ ] Run schema, build, integration, and deployment validation.

## `tip-core` responsibility

The single Supabase project is intended to host authentication, PostgreSQL data, Registry records, scoped memory, knowledge metadata, workflow state, and later vector storage when semantic search is introduced.

## Source-of-truth rule

The locked TIP Architecture Source of Truth and Agent Framework Specification remain authoritative for platform boundaries. Existing code is preserved but must be reconciled against those contracts before being treated as current production implementation.

## Immediate next action

Provision `tip-core` under the connected Supabase organization, then inventory the existing type and persistence layers before applying the first schema migration. Do not create or connect a Vercel production deployment until the data model and environment-variable contract are verified.
