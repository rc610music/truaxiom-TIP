# TIP Runtime 001

## Objective

Establish the smallest executable TIP routing loop without making GrokBot, ChatGPT, or any other individual worker the orchestration layer.

## Runtime boundary

TIP receives a mission and a requested capability. Taxis resolves an active agent that declares the capability and holds every required permission. Governance then decides whether execution may proceed or must wait for operator approval.

```
Mission
  -> capability requirement
  -> Agent Registry
  -> Capability Resolver
  -> permission check
  -> governance gate
  -> delegation
  -> evidence / state
  -> Command Center review
```

## Rules

1. Inactive, paused, deprecated, or retired agents are never selected.
2. Capability declaration alone is insufficient; required permissions must also match.
3. High and critical risk work requires approval.
4. Agents with observe, recommend, draft, or execute_with_approval autonomy cannot silently execute.
5. No match returns an explicit unroutable result. Taxis does not invent an agent.
6. Candidate deployment capability is distinct from production promotion authority.

## Added contracts

- `capability-manifest.schema.json`
- `delegation-envelope.schema.json`

## Added runtime

- `packages/core/src/taxisRuntime.ts`

The first resolver is deliberately deterministic. Priority breaks ties, then stable agent id ordering prevents nondeterministic routing.

## Next increment

Runtime 002 should persist delegations and state transitions, emit evidence/handoff events, and bridge those records into Command Center Agent Comms. Production promotion remains a separate operator-controlled permission.
