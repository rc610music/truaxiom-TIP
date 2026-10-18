import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MissionRuntime } from '../packages/core/src/missionRuntime.ts';
import { createInMemoryMissionRepository } from '../packages/core/src/missionRepository.ts';
import { loadRuntimeCatalog } from '../apps/api/src/missionRuntimeApi.ts';

test('mission packet exposes deterministic routing and separate execution, verification and approval', async () => {
  const catalog = await loadRuntimeCatalog('repository-inspection');
  const eligible = catalog.agents[0];
  catalog.agents.push({ ...structuredClone(eligible), agent_id: 'ZZ-FALLBACK' });
  catalog.agents.push({ ...structuredClone(eligible), agent_id: 'AA-PAUSED', lifecycle_state: 'paused' });
  const repository = createInMemoryMissionRepository();
  const runtime = new MissionRuntime(repository, catalog);
  const mission = { schema_version: '1.0', mission_id: 'MISSION-INSPECTION', project_id: 'PRJ-TIP', title: 'Inspect routing', capability_id: 'repository.inspect', required_permissions: [], risk_tier: 'low', constraints: [], evidence_required: [] };
  const record = await runtime.create(mission, { actor: 'CHATGPT_WORK', role: 'operator' });
  const packet = runtime.packet(record);
  assert.deepEqual(packet.operations.required_capabilities, ['repository.inspect']);
  assert.equal(packet.operations.routing.selected_agent, eligible.agent_id);
  assert.deepEqual(packet.operations.routing.fallback_candidates, ['ZZ-FALLBACK']);
  assert.equal(packet.operations.routing.candidates.find(a => a.agent_id === 'AA-PAUSED').eligible, false);
  assert.equal(packet.operations.verification_status, 'UNVERIFIED');
  assert.equal(packet.operations.approval_status, 'NOT_REQUIRED');
  assert.match(packet.operations.routing.selection_reason, /deterministic/i);
  const restarted = new MissionRuntime(repository, catalog);
  assert.deepEqual(restarted.packet(await restarted.get(mission.mission_id)), packet);
  const legacy = structuredClone(record); delete legacy.routingDecision;
  assert.equal(restarted.packet(legacy).operations.routing, null);
});
