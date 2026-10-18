# Runtime 002 / Taxis integration continuation — 2026-10-18

This extends PR #8 rather than rebuilding Runtime 002. It combines PR #9's verified stored-packet delivery receipts with PR #10's pending-handoff failure guard and Command Center URI limit. Both branches are preserved in merge ancestry. The sole bridge conflict retained both protections.

Taxis still routes the canonical capability through active-agent, explicit project/capability scope, exclusions, required outputs and namespaced permissions. Equal eligibility resolves by agent ID. A persisted routingDecision now records candidate eligibility/rejection reasons, the selected agent, concise reason and fallbacks. Candidate capabilities are DECLARED; manifest claims are never presented as verified execution capability. Handoff acceptance recalculates routing and governance. Historical records without routing metadata remain readable and say routing is unavailable.

HandoffPacket v1 gains an optional operations projection, with title, required capabilities/permissions, routing snapshot, latest state event, permission status, content integrity and next action. No new mission states or duplicate tables. A runtime operator permission decision is labeled OPERATOR_APPROVED, never Dot approval. Content hashes are HASH_VERIFIED, not semantic or independent verification. Independent verification is NOT_RECORDED. Completion, review and Dot authority remain separate.

Command Center consumes existing task/evidence/message ledger packets through its authenticated operations read model. It reconstructs stored chunks and checks integrity; a ledger write or commit marker alone is insufficient. Its default view is compact, details expandable. Existing durable outbox scheduling and host-pinned transport remain unchanged. No new communication bus, GrokBot call or production activation.

Canonical lifecycle names remain UNROUTABLE / NEEDS_APPROVAL / ASSIGNED / RUNNING / BLOCKED / REVIEW / COMPLETED / FAILED / CANCELLED, with permission requests, handoffs and verification represented separately. Created/planning/resolution are represented by creation/routing metadata, not duplicate states. Approved/verified are not inferred from COMPLETED.

The capability requirement is currently supplied explicitly by the mission contract. Free-text capability extraction, verified capability catalog attestations, multi-capability planning and semantic independent verification remain future work. Runtime/worker manifests are repository-owned and may not be elevated by HTTP callers.

Known release boundaries: TIP main remains the production API line and does not include Runtime 002. Existing runtime database migrations 012–014 live on isolated dev branch br-small-pond-ar3y2w0l. Configured candidate delivery needs an existing authorized host credential and explicit project/environment mapping. No credential is invented or copied out of OAuth storage. The Command Center integrity gate must pass before activating this prepared runtime continuation. Production promotion requires Dot.

Next engine milestone: authenticated candidate delivery of one bounded repository mission, recipient acknowledgment, controlled blocker/recovery, durable artifact, explicit review and independent PIE re-observation. Capture restart/retry and correlation evidence; do not equate controlled tests with deployed acceptance.
