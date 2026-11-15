import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcile } from './fixtures/upstream-pie-contract.ts';
import { MissionRuntime } from '../packages/core/src/missionRuntime.ts';
import { createInMemoryMissionRepository } from '../packages/core/src/missionRepository.ts';
import { proposePieRecovery } from '../packages/core/src/pieRuntimeBridge.ts';

const dot = { actor: 'DOT', role: 'operator' };
const worker = { actor: 'FIXTURE', role: 'agent' };
const capability = 'non_prod_health_remediation';
const manifest = {
  schemaVersion: 'truaxiom-app-manifest-v1', projectId: 'PRJ-TIP', productId: 'PROD-TIP', name: 'Fixture', description: 'Disposable test target',
  source: { provider: 'github', repository: 'rc610music/truaxiom-TIP', ref: 'main', path: '', manifestPath: null },
  deployments: [{ id: 'fixture', surface: 'candidate', url: 'https://fixture.example.com', healthPath: '/health', buildPath: '/build' }],
  domains: [], capabilities: [], dependencies: [], tip: { registry: true, integrationPoints: [] },
};
const at = min => new Date(Date.parse('2026-11-15T12:00:00Z') + min * 60000).toISOString();
function observation(previous, min) {
  const evidence = [
    ['health', 'health.fixture.ok', '/health', false],
    ['health', 'health.fixture.identity', '/health', 'PRJ-TIP'],
    ['deployment', 'deployment.fixture.sha', '/build', 'a'.repeat(40)],
  ].map(([kind,key,path,value]) => ({kind,key,source:'https://fixture.example.com'+path,status:'verified',observedAt:at(min),value}));
  return reconcile(manifest, evidence, previous, at(min), 'PRJ-TIP/development/fixture');
}
function setup() {
  const repository = createInMemoryMissionRepository();
  const catalog = { agents: [{
    agent_id: 'FIXTURE', name:'Fixture', version:'1.0', owner:'ORG-TRUAXIOM',role:'research',description:'Test only',objectives:['Test'],scope:['PRJ-TIP'],exclusions:[],lifecycle_state:'active',capabilities:[capability],tools:[],data_sources:[],memory_policy:{allowed_scopes:['run'],retention:'mission'},permissions:{read:[],write:[],actions:['fixture-recover']},approval_policy:{default_tier:'execute',approval_required_for:[]},triggers:[],workflows:[],output_contracts:['recovery-report'],escalation_policy:'operator',observability_policy:['events'],dependency_versions:{},tags:['test-only'],
  }], capabilities:[{capability_id:capability,name:'Fixture recovery',version:'1.0',description:'Test only',inputs:[],outputs:['recovery-report'],required_permissions:['actions:fixture-recover'],risk_tier:'low',tags:[]}] };
  const runtime = new MissionRuntime(repository,catalog,() => at(31));
  const intel = [0,10,20,30].reduce(observation,null);
  const binding = { projectId:'PRJ-TIP',environment:'development',deploymentId:'fixture',endpoint:'https://fixture.example.com/health',capabilityId:capability,permission:'actions:fixture-recover',active:true,actionClass:'A3',reversible:true };
  const input = { runtime, row:{manifest,intelligence:intel}, binding, now:at(30) };
  return { runtime,repository,input,catalog };
}

test('upstream PIE persistence gate creates one approval-gated runtime proposal', async () => {
  const {input,runtime,repository}=setup();
  input.row.intelligence=observation(null,0);
  assert.equal(await proposePieRecovery({...input,now:at(0)}),null);
  input.row.intelligence=observation(input.row.intelligence,10);
  assert.equal(await proposePieRecovery({...input,now:at(10)}),null);
  input.row.intelligence=observation(input.row.intelligence,20);
  assert.equal(await proposePieRecovery({...input,now:at(20)}),null);
  input.row.intelligence=observation(input.row.intelligence,30);
  const r=await proposePieRecovery(input);
  assert.equal(r.delegation.status,'NEEDS_APPROVAL');
  assert.equal(r.mission.capability_id,capability);
  assert.deepEqual(r.mission.required_permissions,['actions:fixture-recover']);
  assert.equal((await proposePieRecovery(input)).mission.mission_id,r.mission.mission_id);
  assert.equal((await repository.list()).length,1);
  await assert.rejects(runtime.command(r.mission.mission_id,{type:'claim',attempt_id:'attempt',ttl_seconds:30,command_id:'claim',expected_revision:r.revision},worker));
});

test('denied proposal cannot execute and duplicate proposal cannot reopen it',async()=>{
  const {input,runtime}=setup(); const r=await proposePieRecovery(input);
  const rejected=await runtime.command(r.mission.mission_id,{type:'reject',note:'Denied',command_id:'reject',expected_revision:r.revision},dot);
  assert.equal(rejected.delegation.status,'CANCELLED');
  assert.equal((await proposePieRecovery(input)).delegation.status,'CANCELLED');
  await assert.rejects(runtime.command(r.mission.mission_id,{type:'claim',attempt_id:'attempt',ttl_seconds:30,command_id:'claim',expected_revision:rejected.revision},worker));
});

test('technical operator approval cannot substitute for explicit Dot approval',async()=>{
  const {input,runtime}=setup();const r=await proposePieRecovery(input);
  await assert.rejects(runtime.command(r.mission.mission_id,{type:'approve',note:'Technical review',command_id:'approve',expected_revision:r.revision},{actor:'REVIEWER',role:'operator'}),/Dot approval/);
  const approved=await runtime.command(r.mission.mission_id,{type:'approve',note:'Approve fixture recovery',command_id:'approve-dot',expected_revision:r.revision},dot);
  assert.equal(approved.delegation.status,'ASSIGNED');
});

for(const [name,mutate] of [
  ['production',i=>{i.binding.environment='production';}],
  ['target mismatch',i=>{i.binding.endpoint='https://other.example.com/health';}],
  ['capability mismatch',i=>{i.binding.capabilityId='repository.inspect';}],
  ['inactive binding',i=>{i.binding.active=false;}],
  ['stale observation',i=>{i.now=at(60);}],
  ['registration drift',i=>{i.row.manifest=structuredClone(manifest);i.row.manifest.deployments[0].url='https://other.example.com';}],
]) test(`${name} blocks proposal before runtime persistence`,async()=>{
  const {input,repository}=setup();mutate(input);
  await assert.rejects(proposePieRecovery(input));assert.equal((await repository.list()).length,0);
});

test('direct remediation mission cannot bypass Dot gate with low risk and no permissions',async()=>{
  const {runtime}=setup();
  const r=await runtime.create({schema_version:'1.0',mission_id:'DIRECT',project_id:'PRJ-TIP',title:'Direct',capability_id:capability,required_permissions:[],risk_tier:'low',constraints:[],evidence_required:[]},dot);
  assert.equal(r.delegation.status,'NEEDS_APPROVAL');
});

test('proposal and rejection survive database restart without creating another mission',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const {mkdtemp,readFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {createPostgresMissionRepository}=await import('../packages/core/src/missionRepository.ts');
  const dir=await mkdtemp(join(tmpdir(),'pie-bridge-'));
  let db=new PGlite(dir);
  try {
    await db.exec(await readFile(new URL('../database/012_tip_runtime_002.sql',import.meta.url),'utf8'));
    const {input,catalog}=setup();
    const makeRuntime=()=>new MissionRuntime(createPostgresMissionRepository(async(sql,params)=>(await db.query(sql,params)).rows),catalog,()=>at(31));
    let runtime=makeRuntime();input.runtime=runtime;
    const r=await proposePieRecovery(input);
    await db.close();db=new PGlite(dir);runtime=makeRuntime();input.runtime=runtime;
    const restored=await proposePieRecovery(input);
    assert.equal(restored.mission.mission_id,r.mission.mission_id);
    assert.equal(restored.delegation.status,'NEEDS_APPROVAL');
    await runtime.command(r.mission.mission_id,{type:'reject',note:'Denied',command_id:'reject',expected_revision:restored.revision},dot);
    await db.close();db=new PGlite(dir);input.runtime=makeRuntime();
    assert.equal((await proposePieRecovery(input)).delegation.status,'CANCELLED');
    assert.equal((await input.runtime.repository.list()).length,1);
  } finally {await db.close();await rm(dir,{recursive:true,force:true});}
});
