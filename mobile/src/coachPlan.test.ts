import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consumePlanResponse, defaultPlanBrief, generatedPlanDraft, parseGeneratedPlan, PLAN_RESPONSE_LIMIT, planRequestBody, shouldSaveImportedDraft, type PlanResult } from './coachPlan'
import { draftHasWork, PlanEditorJournal, type PlanDraftSlots } from './planEditorJournal'
import { newPlanDraft, normalizePlanDraft } from './planEditor'
import { CoachController, type CoachDependencies } from './coachController'
import { CoachApiError } from './coachService'

const example = () => ({ plan: { name: 'Strength plan', summary: 'Two sessions.', days: [{ name: 'Day 1', exercises: [
  { exerciseId: 'same', exerciseSource: 'global', name: 'Pull', sets: 2, targetReps: 8, targetWeight: 22.375 },
  { exerciseId: 'same', exerciseSource: 'user', name: 'Custom pull', sets: 3, targetReps: 10, targetWeight: 0 },
] }] } })
const tick = () => new Promise(resolve => setImmediate(resolve))
const ids = () => { let id = 0; return () => `row-${++id}` }
const result = (): PlanResult => ({ plan: parseGeneratedPlan(example()), context: { status: 'full', unavailableSources: [] } })
function deferred<T>() { let resolve!: (v:T) => void; const promise = new Promise<T>(r => { resolve=r }); return { promise, resolve } }
function slots() { const data = new Map<string,string>(); return { data, read: async (key:string, slot:0|1) => data.get(`${key}:${slot}`) ?? null, write: async (key:string, slot:0|1, value:string) => { data.set(`${key}:${slot}`,value) } } }
async function controller(plan: NonNullable<CoachDependencies['plan']>, timeout = 90_000) {
  const c = new CoachController({ loadKey: async ()=>'fixture-key-with-20-characters', saveKey:async()=>{}, validateKey:async()=>{}, reply:async()=>'', plan },()=>{},timeout)
  c.setActive(true); await c.load(); await tick(); return c
}
const brief = () => ({ ...defaultPlanBrief(), goal: 'Strength' })

test('plan boundary rejects coercion, duplicate source identity, bounds, malformed and truncated JSON', async()=>{
  assert.equal(parseGeneratedPlan(example()).days[0].exercises.length,2)
  for(const patch of [{sets:'2'}, {sets:0}, {sets:21}, {targetReps:1.5}, {targetWeight:-1}, {targetWeight:Infinity}, {exerciseSource:'shared'}, {exerciseId:'a/b'}, {name:''}]) {
    const value=example();Object.assign(value.plan.days[0].exercises[0],patch);assert.throws(()=>parseGeneratedPlan(value),/invalid plan/)
  }
  const duplicate=example();duplicate.plan.days[0].exercises.push(duplicate.plan.days[0].exercises[0]);assert.throws(()=>parseGeneratedPlan(duplicate))
  for(const plan of [{...example().plan,days:[]},{...example().plan,days:Array(15).fill(example().plan.days[0])},{...example().plan,summary:'x'.repeat(4001)}]) assert.throws(()=>parseGeneratedPlan({plan}))
  for(const text of ['{','{}','{"plan":null}']) await assert.rejects(consumePlanResponse(new Response(text,{headers:{'content-type':'application/json','X-IronLog-AI-Context':'full'}}),new AbortController().signal))
  await assert.rejects(consumePlanResponse(new Response(' '.repeat(PLAN_RESPONSE_LIMIT+1),{headers:{'content-type':'application/json','X-IronLog-AI-Context':'full'}}),new AbortController().signal))
  assert.throws(()=>planRequestBody('key',defaultPlanBrief()),/goal/)
  assert.equal(JSON.parse(planRequestBody('key',brief())).mode,'plan')
})
test('stream abort cancels body; valid bounded body preserves metadata',async()=>{
  const signal=new AbortController();let cancelled=false
  const body=new ReadableStream({cancel(){cancelled=true}})
  const reading=consumePlanResponse(new Response(body,{headers:{'content-type':'application/json','X-IronLog-AI-Context':'full'}}),signal.signal)
  signal.abort();await assert.rejects(reading);assert.equal(cancelled,true)
  const parsed=await consumePlanResponse(new Response(JSON.stringify(example()),{headers:{'content-type':'application/json','X-IronLog-AI-Context':'full'}}),new AbortController().signal)
  assert.deepEqual(parsed.plan,example().plan)
})
test('import is new and dirty with stable rows, source identities, exact kg through lbs, frozen operation',()=>{
  const draft=generatedPlanDraft(result().plan,'lbs',ids(),true)
  assert.equal(draft.targetId,null);assert.equal(draft.baseline,null);assert.equal(draft.resolvedId,null);assert.equal(draft.dirty,true)
  assert.equal(new Set([draft.draftId,...draft.days.flatMap(d=>[d.rowId,...d.exercises.map(e=>e.rowId)])]).size,4)
  assert.deepEqual(draft.pending,normalizePlanDraft(JSON.parse(JSON.stringify(draft)),draft.pending!.operationId))
  assert.equal(draft.pending!.days[0].exercises[0].targetWeight,22.375)
  assert.deepEqual(draft.pending!.days[0].exercises.map(e=>e.exerciseSource),['global','user'])
  assert.equal(shouldSaveImportedDraft(draft,draft.draftId),true)
  assert.equal(shouldSaveImportedDraft(draft,'other'),false)
  assert.equal(shouldSaveImportedDraft({...draft,resolvedId:'saved'},draft.draftId),false)
  assert.equal(shouldSaveImportedDraft({...draft,pending:null},draft.draftId),false)
})
test('atomic import installs one owner, replaces an untouched draft, blocks dirty/pending drafts and preserves foreign account',async()=>{
  const store=slots(),journal=new PlanEditorJournal(store),draft=generatedPlanDraft(result().plan,'kg',ids(),true)
  const two={...draft,draftId:'other'}
  assert.deepEqual(await Promise.all([journal.installIfEmpty('u',draft,'owner'),journal.installIfEmpty('u',two,'other')]),[true,false])
  assert.deepEqual(await journal.load('u',null),draft)
  assert.equal(await journal.saveIfOwned('u',{...draft,revision:1},'other',{draftId:draft.draftId,revision:0}),false)
  assert.equal(await journal.installIfEmpty('foreign',two,'other'),true)
  for(const existing of [{...draft,pending:null},draft]) {
    const j=new PlanEditorJournal(slots());await j.installIfEmpty('u',existing,'old');assert.equal(await j.installIfEmpty('u',two,'new'),false);assert.deepEqual(await j.load('u',null),existing)
    assert.equal(draftHasWork(existing),true)
  }
  // New plan left without typing: the import takes its place and the old editor can no longer write.
  const untouched=newPlanDraft('blank','kg',null,()=>'row'),j=new PlanEditorJournal(slots())
  await j.open('u',null,'editor');assert.equal(await j.saveIfOwned('u',untouched,'editor',null),true);assert.equal(draftHasWork(untouched),false)
  assert.equal(await j.installIfEmpty('u',two,'import'),true);assert.deepEqual(await j.load('u',null),two)
  assert.equal(await j.saveIfOwned('u',{...untouched,revision:1,dirty:true},'editor',{draftId:'blank',revision:0}),false)
})
test('corrupt or failed storage and stale queued import do not replace drafts',async()=>{
  const store=slots(),journal=new PlanEditorJournal(store),draft=generatedPlanDraft(result().plan,'kg',ids(),true)
  store.data.set(`${journal.key('u',null)}:0`,'broken');await assert.rejects(journal.installIfEmpty('u',draft,'new'),/damaged/)
  const failing:PlanDraftSlots={read:async()=>null,write:async()=>{throw new Error('disk')}}
  await assert.rejects(new PlanEditorJournal(failing).installIfEmpty('u',draft,'new'),/disk/)
  const j=new PlanEditorJournal(slots());assert.equal(await j.installIfEmpty('u',draft,'new',()=>false),false);assert.equal(await j.load('u',null),null)
})
test('generation freezes brief, locks chat/duplicate generation, and preserves prior preview on failure',async()=>{
  const delayed=deferred<PlanResult>();let calls=0;let sent: string[]=[]
  const c=await controller(async request=>{calls++;sent=request.brief.equipment;if(calls===1)return delayed.promise;throw new CoachApiError('Safe failure')})
  const input=brief(),running=c.generatePlan(input);input.equipment.push('machine');await c.generatePlan(input)
  assert.equal(calls,1);assert.equal(c.send('question'),false);assert.equal(sent.includes('machine'),false)
  delayed.resolve(result());await running;const previous=c.state.plan
  await c.generatePlan(brief());assert.equal(c.state.plan,previous);assert.equal(c.state.planError,'Safe failure');c.dispose()
})
test('blur/resume, tab cancel, key change and disposal reject late plans and import guards',async()=>{
  for(const action of ['blur','cancel','key','dispose']) {
    const delayed=deferred<PlanResult>();let signal:AbortSignal|undefined
    const c=await controller(request=>{signal=request.signal;return delayed.promise})
    const guard=c.captureCurrent(),running=c.generatePlan(brief())
    if(action==='blur'){c.setActive(false);c.setActive(true)}
    if(action==='cancel')c.cancel()
    if(action==='key')await c.saveKey('another-fixture-key-of-20-characters')
    if(action==='dispose')c.dispose()
    assert.equal(guard(),false);assert.equal(signal?.aborted,true);delayed.resolve(result());await running;assert.equal(c.state.plan,null);c.dispose()
  }
})
test('timeout covers never-resolving token/transport/body dependencies and does not auto retry',async()=>{
  let calls=0;let signal:AbortSignal|undefined
  const c=await controller(request=>{calls++;signal=request.signal;return new Promise(()=>{})},5)
  await c.generatePlan(brief());assert.equal(c.state.planGeneration,'failed');assert.match(c.state.planError!,/timed out/);assert.equal(signal?.aborted,true);assert.equal(calls,1);c.dispose()
})

test('plan transport maps auth, credits, rate and server failures without showing provider text',async()=>{
  const {coachPost}=await import('./coachService')
  for(const [status,code,pattern] of [[401,undefined,/sign-in expired/],[429,undefined,/limit/],[500,undefined,/could not complete/],[403,'invalid-key',/rejected/]] as const) {
    await assert.rejects(coachPost('http://fixture','ai-chat',planRequestBody('fixture',brief()),new AbortController().signal,async()=> 'demo-token',async()=>new Response(JSON.stringify({code,error:'secret-provider-text'}),{status})),error=>error instanceof CoachApiError&&pattern.test(error.message)&&!error.message.includes('secret'))
  }
})
test('late token after plan cancellation cannot send a paid request',async()=>{
  const {coachPost}=await import('./coachService'),token=deferred<string>();let calls=0
  const c=await controller(async request=>consumePlanResponse(await coachPost('http://fixture','ai-chat',planRequestBody(request.key,request.brief),request.signal,()=>token.promise,async()=>{calls++;return new Response('') }),request.signal))
  const run=c.generatePlan(brief());c.setActive(false);token.resolve('demo-token');await run;await tick();assert.equal(calls,0);assert.equal(c.state.plan,null);c.dispose()
})

test('import does not mistake a corrupt second slot for an empty draft',async()=>{
  const store=slots(),journal=new PlanEditorJournal(store),draft=generatedPlanDraft(result().plan,'kg',ids(),false)
  await journal.open('u',null,'editor')
  store.data.set(`${journal.key('u',null)}:0`,'corrupt newer slot')
  const before=new Map(store.data)
  await assert.rejects(journal.installIfEmpty('u',draft,'import'),/recovery/)
  assert.deepEqual(store.data,before)
})
