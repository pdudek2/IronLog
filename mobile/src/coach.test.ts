import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CoachController, type CoachDependencies } from './coachController'
import { CoachApiError, coachPost, coachRequestBody, consumeCoachReply, type CoachRequest } from './coachService'
const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((a,b)=>{resolve=a;reject=b}); return { promise, resolve, reject } }
async function setup(overrides: Partial<CoachDependencies> = {}) {
 const replies: { request: CoachRequest; result: ReturnType<typeof deferred<string>> }[] = []
 const controller = new CoachController({ loadKey: async()=> 'test-key-with-twenty-characters', saveKey: async()=>{}, validateKey: async()=>{}, reply: request=>{const result=deferred<string>();replies.push({request,result});return result.promise}, ...overrides }, ()=>{})
 controller.setActive(true); await controller.load(); await tick()
 return { controller, replies }
}
test('retry keeps one question; partial failed output never enters history', async()=>{
 const {controller:c,replies:r}=await setup();assert.equal(c.send('question'),true);assert.equal(c.send('duplicate'),false)
 r[0].request.onChunk('partial');r[0].result.reject(new Error('lost'));await tick()
 assert.equal(c.state.partial,'');c.retry();assert.equal(c.state.messages.length,1);assert.equal(r[1].request.messages.length,1)
 r[1].result.resolve('complete');await tick();assert.deepEqual(c.state.messages.map(m=>m.content),['question','complete'])
})
test('blur, reset, key changes and disposal reject all late callbacks', async()=>{
 for(const action of ['blur','reset','key','dispose'] as const) {
  const {controller:c,replies:r}=await setup();c.send('first');const pending=r[0]
  if(action==='blur')c.setActive(false);if(action==='reset')c.reset();if(action==='key')await c.saveKey('');if(action==='dispose')c.dispose()
  assert.equal(pending.request.signal.aborted,true);pending.request.onChunk('late');pending.result.resolve('late done');await tick()
  assert.equal(c.state.partial,'');assert.equal(c.state.messages.some(m=>m.role==='assistant'),false)
  if(action==='blur'){assert.equal(c.state.generation,'interrupted');c.setActive(true);await tick();c.retry();assert.equal(r.length,2)}
 }
})
test('removed key cannot be restored by late validation; another owner starts empty', async()=>{
 const validation=deferred<void>();const {controller:c}=await setup({validateKey:()=>validation.promise})
 await c.saveKey('');validation.resolve();await tick();assert.equal(c.state.key,'');assert.equal(c.state.validation,'none')
 const {controller:other}=await setup({loadKey:async()=>null});assert.equal(other.state.key,'')
})
test('storage failure retains previous key; invalid key differs from network failure', async()=>{
 const {controller:c}=await setup({saveKey:async()=>{throw new Error('disk')}})
 const old=c.state.key;assert.equal(await c.saveKey('replacement-key-at-least-twenty'),false);assert.equal(c.state.key,old);assert.match(c.state.keyError!,/Could not save/)
 const invalid=await setup({validateKey:async()=>{throw new CoachApiError('Rejected','invalid-key')}});assert.equal(invalid.controller.canSend,false)
 const network=await setup({validateKey:async()=>{throw new Error('Connection unavailable')}});assert.equal(network.controller.state.validation,'unverified');assert.equal(network.controller.canSend,true)
})
test('delayed load and write cannot publish into disposed account', async()=>{
 const load=deferred<string|null>();let publications=0
 const c=new CoachController({loadKey:()=>load.promise,saveKey:async()=>{},validateKey:async()=>{},reply:async()=>''},()=>publications++)
 const pending=c.load();c.dispose();const before=publications;load.resolve('old-account-key');await pending;assert.equal(publications,before);assert.equal(c.state.key,'')
 const write=deferred<void>();const ready=await setup({saveKey:()=>write.promise});const saving=ready.controller.saveKey('new-key-with-twenty-characters');ready.controller.dispose();write.resolve();assert.equal(await saving,false);assert.equal(ready.controller.state.key,'')
})
test('request bounds and cancellation before token resolution', async()=>{
 const messages=Array.from({length:20},(_,id)=>({id,role:'user' as const,content:'ą'.repeat(5000)}))
 const body=coachRequestBody('key',messages);assert.equal(JSON.parse(body).messages.length,12);assert.equal(JSON.parse(body).messages[0].content.length,4000);assert.ok(new TextEncoder().encode(body).length<=128*1024)
 const token=deferred<string>();const abort=new AbortController();const pending=coachPost('http://fixture','ai-chat','{}',abort.signal,()=>token.promise,async()=>assert.fail('request sent after cancel'))
 abort.abort();token.resolve('token');await assert.rejects(pending,/cancelled/)
 for(const [status,code,pattern] of [[401,'invalid-key',/rejected/],[429,'rate-limited',/credit/],[401,undefined,/sign-in/]] as const) {
  await assert.rejects(coachPost('http://fixture','ai-models','{}',new AbortController().signal,async()=>'token',async()=>new Response(JSON.stringify({code}),{status})),pattern)
 }
})
test('native reply shares strict fragmented UTF-8, metadata and completion protocol',async()=>{
 const text='Zażółć';const bytes=new TextEncoder().encode(JSON.stringify({type:'chunk',text})+'\n{"type":"done"}\n');const chunks:string[]=[]
 const request:CoachRequest={key:'key',messages:[],signal:new AbortController().signal,onContext:c=>assert.deepEqual(c,{status:'limited',unavailableSources:['readiness']}),onChunk:t=>chunks.push(t)}
 const stream=new ReadableStream<Uint8Array>({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close()}})
 assert.equal(await consumeCoachReply(new Response(stream,{headers:{'Content-Type':'application/x-ndjson','X-IronLog-AI-Context':'limited;unavailable=readiness'}}),request),text);assert.deepEqual(chunks,[text])
 const headers={'Content-Type':'application/x-ndjson','X-IronLog-AI-Context':'full'};const plain={...request,onContext:()=>{}}
 for(const content of ['{"type":"chunk","text":"partial"}\n','bad\n','{"type":"chunk","text":"partial"}\n{"type":"error","message":"failure"}\n'])await assert.rejects(consumeCoachReply(new Response(content,{headers}),plain))
 await assert.rejects(consumeCoachReply(new Response('',{headers:{...headers,'X-IronLog-AI-Context':'broken'}}),plain),/context/)
})

test('Markdown preserves literal markup and supported headings/lists/code/emphasis', async()=>{
 const {markdownBlocks,markdownInline}=await import('./coachMarkdown')
 const blocks=markdownBlocks('## Heading\n\n1. First\n  continuation\n2. Second\n\n<script>literal</script>')
 assert.deepEqual(blocks.map(b=>[b.kind,b.text,b.marker]),[['heading','Heading',undefined],['item','First\ncontinuation','1.'],['item','Second','2.'],['paragraph','<script>literal</script>',undefined]])
 assert.deepEqual(markdownInline('**bold** *italic* `code`').filter(p=>p.kind!=='text').map(p=>p.kind),['bold','italic','code'])
 assert.deepEqual(markdownInline('*unfinished'),[{kind:'text',text:'*unfinished'}])
})

test('foreground transition publishes so disabled Retry becomes usable again',async()=>{
 const states:boolean[]=[]
 const c=new CoachController({loadKey:async()=>'test-key-with-twenty-characters',saveKey:async()=>{},validateKey:async()=>{},reply:async()=>''},()=>states.push(c.canSend))
 c.setActive(true);await c.load();await tick();c.setActive(false);assert.equal(states.at(-1),false)
 c.setActive(true);assert.equal(states.at(-1),true)
})

test('generation also releases transport on early response rejection',async()=>{
 const {controller:c,replies:r}=await setup();c.send('question');r[0].result.reject(new Error('Invalid context header'));await tick()
 assert.equal(r[0].request.signal.aborted,true);assert.equal(c.state.generation,'failed')
})
