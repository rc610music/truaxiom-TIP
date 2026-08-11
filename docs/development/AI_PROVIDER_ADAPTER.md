# AI Provider Adapter

**Status:** Contract created  
**Sprint:** SPRINT-002  
**File:** `packages/core/src/aiProviderAdapter.ts`

---

## Purpose

TIP must stay provider-agnostic.

The Intelligence Engine should not hard-code OpenAI, Anthropic, Google, local models, or any other provider directly into business logic.

Provider calls should flow through an adapter contract.

---

## Current Adapter

The current implementation includes:

- `AiGenerationRequest`
- `AiGenerationResult`
- `AiProviderAdapter`
- manual/offline provider adapter
- generation-result-to-recommendation helper
- readiness helper

---

## Why Manual Provider Exists

The manual provider lets TIP run safely without credentials, paid usage, or hidden automation.

It produces draft/offline results that are safe for local development and review workflows.

---

## Future Providers

Future adapters may include:

- OpenAI
- Anthropic
- Google
- local model runtime
- hybrid model router

Each should obey the same contract.

---

## Guardrail

AI output is never automatically treated as truth.

It becomes:

1. a result,
2. then a recommendation,
3. then optionally a task,
4. then only executes after the configured approval level.
