import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { MissionRuntime } from '../packages/core/src/missionRuntime.ts';
import { createInMemoryMissionRepository, createPostgresMissionRepository } from '../packages/core/src/missionRepository.ts';
import { createMemoryRuntimeArtifacts } from '../packages/core/src/runtimeArtifactRepository.ts';
import { dispatchRuntimeWake, createWakeLedgerRecorder, runtimeWakeSummary, wakeTaskId } from '../packages/core/src/runtimeWakeDispatcher.ts';
import { readWakeBindings, publicWakeAddress, createHttpsWakeSender } from '../packages/core/src/runtimeWakeTransport.ts';
import { loadRuntimeCatalog, createMissionRuntimeApi } from '../apps/api/src/missionRuntimeApi.ts';
import { createRuntimeWorkerApi } from '../apps/api/src/runtimeWorkerApi.ts';
import { RuntimeError } from '../packages/core/src/runtimeContracts.ts';
const operator = { actor: 'OPERATOR-TEST', role: 'operator' };
const worker = { actor: 'AGENT-REPOSITORY-INSPECTOR', role: 'agent' };
const mapping = { schema_version:'1.0', tip_project_id:'PRJ-TIP', command_center_project_id:'PRJ-COMMAND-CENTER', environment:'preview' };
async function setup(repository = createInMemoryMissionRepository()) {
  let clock = Date.parse('2026-10-25T03:00:00Z');
  const now = () => new Date(clock).toISOString();
  const catalog = await loadRuntimeCatalog('repository-inspection');
  const artifacts = createMemoryRuntimeArtifacts();
  const runtime = new MissionRuntime(repository, catalog, now, artifacts);
  const id = 'MISSION-WAKE-TEST';
  await runtime.create({ schema_version:'1.0', mission_id:id, project_id:'PRJ-TIP', title:'Controlled wake test', capability_id:'repository.inspect', required_permissions:[], risk_tier:'low', constraints:[], evidence_required:[], inputs:{repository:'rc610music/truaxiom-TIP',ref:'a'.repeat(40)} }, operator);
  const recorded = [], sent = [];
  const transport = { recipient:'TIP', record: async e => { recorded.push(structuredClone(e)); }, wake: async e => { sent.push(structuredClone(e)); } };
  const dispatch = t => dispatchRuntimeWake(runtime,id,{recipient:'TIP',...(t ?? transport)},mapping,now);
  const cmd = async (type, fields={}, principal=worker) => {
    const r = await runtime.get(id);
    return runtime.command(id,{ type, command_id:`C:${r.revision}`, expected_revision:r.revision, ...fields },principal);
  };
  return { runtime, repository, artifacts, catalog, id, now, tick:s=>{clock+=s*1000}, recorded, sent, transport, dispatch, cmd };
}
test('record → send → authenticated acknowledgment → execution remain distinct and deduplicate', async () => {
  const s = await setup();
  assert.equal((await s.dispatch()).status,'SENT');
  let r = await s.runtime.get(s.id);
  assert.equal(r.delegation.status,'ASSIGNED');
  assert.equal(r.wake.acknowledged_at,null);
  assert.equal((await s.dispatch()).status,'WAITING');
  assert.equal(s.sent.length,1);
  await assert.rejects(s.cmd('claim',{attempt_id:'attempt',ttl_seconds:120}), /acknowledgment required/);
  await assert.rejects(s.cmd('acknowledge_wake',{wake_id:r.wake.wake_id},operator),/Only current assigned recipient/);
  r = await s.cmd('acknowledge_wake',{wake_id:r.wake.wake_id});
  assert.equal(r.delegation.status,'ASSIGNED');
  assert.equal(r.wake.acknowledged_by,worker.actor);
  r = await s.cmd('claim',{attempt_id:'attempt',ttl_seconds:120});
  assert.equal(r.delegation.status,'RUNNING');
  assert.equal((await s.dispatch()).status,'INELIGIBLE');
});
test('concurrent schedulers send exactly one wake and cannot overwrite a fast recipient acknowledgment', async () => {
  const s = await setup();
  const outcomes = await Promise.all([s.dispatch(),s.dispatch()]);
  assert.equal(s.sent.length,1);
  assert.ok(outcomes.some(o=>o.status==='FENCED'));
  const fast = await setup();
  assert.equal((await fast.dispatch({ record:fast.transport.record, wake:async e=>{ await fast.cmd('acknowledge_wake',{wake_id:e.wake_id}); }})).status,'FENCED');
  assert.equal((await fast.runtime.get(fast.id)).wake.status,'ACKNOWLEDGED');
});
test('acknowledgment timeout retries the identical envelope then dead-letters without disappearing', async () => {
  const s=await setup();
  for(let i=0;i<3;i++){assert.equal((await s.dispatch()).status,'SENT');s.tick(60);}
  assert.deepEqual(s.sent[0],s.sent[1]);assert.deepEqual(s.sent[1],s.sent[2]);
  assert.equal((await s.dispatch()).status,'DEAD_LETTER');
  assert.equal((await s.dispatch()).status,'DEAD_LETTER');
  const r=await s.runtime.get(s.id);assert.equal(r.wake.attempts,3);assert.equal(r.delegation.status,'ASSIGNED');
  assert.ok(runtimeWakeSummary(r).blockers.includes('ACK_TIMEOUT_OR_ATTEMPT_LIMIT'));
});
test('network failure backs off; authorization refusal pauses; ledger failure never sends',async()=>{
  const s=await setup();let calls=0;
  const unavailable={record:s.transport.record,wake:async()=>{calls++;throw new Error('unavailable')}};
  assert.equal((await s.dispatch(unavailable)).status,'RETRY_PENDING');
  assert.equal((await s.dispatch(unavailable)).status,'WAITING');s.tick(5);
  assert.equal((await s.dispatch(unavailable)).status,'RETRY_PENDING');s.tick(9);
  assert.equal((await s.dispatch(unavailable)).status,'WAITING');s.tick(1);
  assert.equal((await s.dispatch(unavailable)).status,'DEAD_LETTER');assert.equal(calls,3);
  const auth=await setup();assert.equal((await auth.dispatch({record:async()=>{throw new RuntimeError(403,'refused')},wake:auth.transport.wake})).status,'DEAD_LETTER');assert.equal(auth.sent.length,0);
});
test('acknowledged but never started becomes a material blocker, without another wake',async()=>{
  const s=await setup();await s.dispatch();await s.cmd('acknowledge_wake',{wake_id:s.sent[0].wake_id});s.tick(121);
  assert.equal((await s.dispatch()).status,'DEAD_LETTER');assert.equal((await s.runtime.get(s.id)).wake.error_code,'START_TIMEOUT');assert.equal(s.sent.length,1);
});
test('explicit operator retry preserves the failed attempt and creates a new bounded generation',async()=>{
  const s=await setup();for(let i=0;i<3;i++){await s.dispatch();s.tick(60)}await s.dispatch();
  const old=(await s.runtime.get(s.id)).wake.wake_id;
  await assert.rejects(s.cmd('retry_wake',{note:'Not authorized'}));
  await s.cmd('retry_wake',{note:'Endpoint repaired; bounded retry'},operator);
  await s.dispatch();const r=await s.runtime.get(s.id);
  assert.notEqual(r.wake.wake_id,old);assert.equal(r.wake.attempts,1);assert.equal(r.wake_history[0].status,'DEAD_LETTER');
});
test('stale dispatch is not replayed after a long host outage',async()=>{
  const s=await setup();await s.dispatch();s.tick(601);
  assert.equal((await s.dispatch()).status,'DEAD_LETTER');assert.equal((await s.runtime.get(s.id)).wake.error_code,'STALE_ASSIGNMENT');assert.equal(s.sent.length,1);
});
test('revocation and cancellation fence delivery after recording; terminal mission is never awakened',async()=>{
  const s=await setup();const transport={record:async()=>{s.catalog.agents[0].lifecycle_state='paused'},wake:s.transport.wake};
  assert.equal((await s.dispatch(transport)).status,'FENCED');assert.equal(s.sent.length,0);
  const cancelled=await setup();await cancelled.cmd('transition',{state:'CANCELLED',reason:'Controlled cancellation'},operator);
  assert.equal((await cancelled.dispatch()).status,'INELIGIBLE');
});
test('operator projection is authenticated, concise, and worker responses redact wake fences',async()=>{
  const s=await setup();await s.dispatch();
  const api=createMissionRuntimeApi(s.runtime,{required:true,secret:'operator-test',actor:operator.actor});
  assert.equal((await api({method:'GET',path:'/v1/runtime/orchestration'})).status,401);
  const response=await api({method:'GET',path:'/v1/runtime/orchestration',headers:{authorization:'Bearer operator-test'}});
  assert.equal(response.body.missions[0].wake_status,'SENT');assert.equal(JSON.stringify(response).includes('lease_token'),false);
  const token='worker-test';const workerApi=createRuntimeWorkerApi(s.runtime,s.artifacts,[{agent_id:worker.actor,key_sha256:createHash('sha256').update(token).digest('hex')}]);
  const result=await workerApi({method:'GET',path:`/v1/runtime/worker/missions/${s.id}`,headers:{authorization:`Bearer ${token}`}});
  assert.equal(result.body.wake.lease_token,null);
});
test('HTTPS bindings cannot register capabilities, inject secrets/URLs, or address private networks',()=>{
  const valid={agent_id:worker.actor,comms_recipient:'TIP',url:'https://runtime.example.com/wake',token_env:'TIP_WAKE_TOKEN_INSPECTOR'};
  assert.equal(readWakeBindings(JSON.stringify([valid])).length,1);
  for(const url of ['http://runtime.example.com/wake','https://127.0.0.1/wake','https://runtime.example.com/wake?secret=x','https://user:password@runtime.example.com/wake','https://runtime.example.com:444/wake'])assert.throws(()=>readWakeBindings(JSON.stringify([{...valid,url}])));
  assert.throws(()=>readWakeBindings(JSON.stringify([{...valid,capabilities:['everything']}])));
  assert.throws(()=>readWakeBindings(JSON.stringify([valid,valid])));
  assert.throws(()=>createHttpsWakeSender(valid,{}),/credential unavailable/);
  for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','::1','198.18.0.1'])assert.equal(publicWakeAddress(address),false);
  assert.equal(publicWakeAddress('8.8.8.8'),true);
});
test('unbound agent creates a durable blocker and never records a fabricated recipient or sends',async()=>{
  const s=await setup();assert.equal((await s.dispatch({...s.transport,recipient:''})).status,'DEAD_LETTER');
  const r=await s.runtime.get(s.id);assert.equal(r.wake.error_code,'AGENT_ENDPOINT_UNBOUND');assert.equal(r.wake.attempts,0);
  assert.equal(s.recorded.length,0);assert.equal(s.sent.length,0);
});
test('existing ledger recorder creates task/packet and addressed message; replay recovers a lost response',async()=>{
  const s=await setup();const view={project:{id:mapping.command_center_project_id,checkpoint_version:1},tasks:[],evidence:[],messages:[]};let lose=true;
  const cc={project:async()=>structuredClone(view),write:async(path,body)=>{
    view.project.checkpoint_version++;
    if(path==='/tasks')view.tasks.push({id:body.id});
    if(path==='/messages')view.messages.push(structuredClone(body));
    if(path==='/evidence')view.evidence.push(structuredClone(body));
    if(body.body?.startsWith('TIP_WAKE ') && lose){lose=false;throw new Error('lost committed response')}
    return {};
  }};
  const record=createWakeLedgerRecorder(cc,[mapping]);
  assert.equal((await s.dispatch({record,wake:s.transport.wake})).status,'RETRY_PENDING');assert.equal(s.sent.length,0);s.tick(5);
  assert.equal((await s.dispatch({record,wake:s.transport.wake})).status,'SENT');
  assert.equal(view.tasks[0].id,wakeTaskId(await s.runtime.get(s.id),mapping));
  assert.equal(view.messages.filter(m=>m.body.startsWith('TIP_WAKE ')).length,1);
  assert.equal(s.sent.length,1);
});
test('PostgreSQL-backed wake survives reopen and resumes after an abandoned dispatcher lease',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tip-wake-'));let db;
  try{
    db=new PGlite(dir);await db.exec(await readFile(new URL('../database/012_tip_runtime_002.sql',import.meta.url),'utf8'));
    const query=async(sql,p=[]) => (await db.query(sql,p)).rows;
    const s=await setup(createPostgresMissionRepository(query));
    // Abandon after durable claim, before the external send; restart has no process-local queue.
    const pending=s.dispatch({record:async()=>new Promise(()=>{}),wake:s.transport.wake});
    for(let i=0;i<100;i++){if((await s.runtime.get(s.id)).wake)break;await new Promise(resolve=>setTimeout(resolve,2));}
    const claimed=await s.runtime.get(s.id);assert.equal(claimed.wake.status,'DISPATCHING');
    await db.close();db=new PGlite(dir);s.tick(31);
    assert.equal((await s.dispatch()).status,'SENT');assert.equal((await s.runtime.get(s.id)).wake.attempts,2);
    assert.equal(s.sent.length,1);
    void pending;
  }finally{await db?.close();await rm(dir,{recursive:true,force:true});}
});
