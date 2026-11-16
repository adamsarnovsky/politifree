'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function harness(){
 const ports=[],timers=new Map();let nextTimer=0;
 const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn)},emit(m){this.listeners.forEach(fn=>fn(m))}});
 const chrome={runtime:{connectNative(){const p={onMessage:event(),onDisconnect:event(),sent:[],postMessage(m){this.sent.push(m)},disconnect(){this.closed=true;this.onDisconnect.emit()}};ports.push(p);return p}}};
 const ctx=vm.createContext({chrome,Date,setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(fs.readFileSync('outputs/Politifree-Chrome/engine.js','utf8'),ctx);
 return {api:ctx.PolitifreeEngine,ports,timers,chrome,reply:(port,id,result={})=>port.onMessage.emit({id,ok:true,ready:true,...result})};
}
(async()=>{
 let h=harness();const jobs=[h.api.request('analyze',{kind:'media'}),h.api.request('analyze',{kind:'text'}),h.api.request('health'),h.api.request('start'),h.api.request('health')];
 const p=h.ports[0];assert.equal(p.sent.length,2);assert.equal(h.timers.size,2);assert.equal(h.api.status().pending,5);
 h.reply(p,1);assert.equal(p.sent.length,3);assert.equal(p.sent[2].action,'health');assert.equal([...h.timers.values()].filter(t=>t.ms===10000).length,1);
 h.reply(p,2);assert.equal(p.sent.length,4);assert.equal(p.sent[3].action,'start');
 h.reply(p,3);assert.equal(p.sent.length,5);h.reply(p,4);h.reply(p,5);await Promise.all(jobs);assert.equal(h.api.status().pending,0);assert.equal(h.timers.size,1);h.api.stop();
 console.log('PASS all request kinds share two physical native slots; queued timers start only on post; admitted controls progress FIFO');
 h=harness();const a=h.api.request('analyze',{kind:'image'}),b=h.api.request('analyze',{kind:'media'}),controller=new AbortController();
 const queued=h.api.request('health',{},controller.signal),rejected=assert.rejects(queued,/queued cancelled/);controller.abort(Error('queued cancelled'));await rejected;
 assert.equal(h.ports[0].sent.length,2);assert.equal(h.api.status().pending,2);assert.equal(h.api.status().phase,'loading');assert(!h.ports[0].closed);
 h.reply(h.ports[0],1);h.reply(h.ports[0],2);await Promise.all([a,b]);h.api.stop();
 console.log('PASS queued abort releases retained control without touching active work or phase');
 h=harness();const abort=new AbortController(),active=h.api.request('analyze',{kind:'media'},abort.signal),second=h.api.request('health'),extra=h.api.request('start');
 const stopped=Promise.all([active,second,extra].map(job=>assert.rejects(job,/active cancelled/)));abort.abort(Error('active cancelled'));await stopped;
 assert.equal(h.ports[0].sent.length,2);assert(h.ports[0].closed);assert.equal(h.api.status().pending,0);assert.equal(h.timers.size,0);
 const fresh=h.api.request('health');h.reply(h.ports[0],1,{score:.9});assert.equal(h.api.status().pending,1);h.reply(h.ports[1],4);await fresh;h.api.stop();
 console.log('PASS active abort disconnects physical work, rejects queued/active requests and ignores stale replies after reconnect');
 h=harness();const pending=[h.api.request('analyze',{kind:'image'}),h.api.request('health'),h.api.request('start')];const failures=Promise.all(pending.map(job=>assert.rejects(job)));h.api.stop();await failures;assert.equal(h.api.status().pending,0);assert.equal(h.timers.size,0);assert.equal(h.ports[0].sent.length,2);
 h=harness();const disconnected=[h.api.request('analyze',{kind:'media'}),h.api.request('health'),h.api.request('start')];const disconnectedFailures=Promise.all(disconnected.map(job=>assert.rejects(job)));h.chrome.runtime.lastError={message:'native disconnected'};h.ports[0].onDisconnect.emit();await disconnectedFailures;assert.equal(h.api.status().pending,0);assert.equal(h.api.status().phase,'unavailable');assert.equal(h.timers.size,0);
 console.log('PASS stop and unexpected disconnect reject both posted and queued work');
 h=harness();const timed=[h.api.request('analyze',{kind:'media'}),h.api.request('health'),h.api.request('start')];const timeouts=Promise.all(timed.map(job=>assert.rejects(job)));[...h.timers.values()].find(t=>t.ms===180000).fn();await timeouts;assert.equal(h.ports[0].sent.length,2);assert(h.ports[0].closed);assert.equal(h.api.status().phase,'unavailable');assert.equal(h.timers.size,0);
 h=harness();const image=h.api.request('analyze',{kind:'image'});assert.throws(()=>h.api.request('analyze',{kind:'live-audio'}),/audio preserved/);assert.equal(h.ports[0].sent.length,1);h.reply(h.ports[0],1);await image;const audio=h.api.request('analyze',{kind:'live-audio'});assert([...h.timers.values()].some(t=>t.ms===5000));h.reply(h.ports[0],2);await audio;h.api.stop();
 console.log('PASS timeout never posts waiting work; time-sensitive audio keeps busy refusal and original analysis deadline');
})().catch(e=>{console.error(e);process.exitCode=1});
