# TIP Foundation Contracts

This package contains the provider-neutral, machine-readable contracts for TIP Core.

The contracts intentionally do not depend on Supabase, Neon, Vercel, an ORM, or a UI framework. Persistence adapters and user interfaces must conform to these contracts rather than redefining them.

## Contracts

- `identity.schema.json` — structured identity and capability manifest for anything registered with TIP.
- `registry-entry.schema.json` — canonical inventory record and addressable relationships.
- `agent-manifest.schema.json` — governed role-specific worker definition.
- `workflow-definition.schema.json` — versioned orchestration plan with approvals, retries, handoffs, and validation.

Run `npm run check:foundation` from the repository root to validate the package.
