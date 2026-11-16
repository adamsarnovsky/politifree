'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const tick=()=>new Promise(r=>setImmediate(r));
const event=()=>({addListener(){}});
let maxDigestInput=0;
const c=vm.createContext({console,URL,AbortController,AbortSignal,Uint8Array,TextEncoder,setTimeout,clearTimeout,
 crypto:{subtle:{digest:(algorithm,bytes)=>{maxDigestInput=Math.max(maxDigestInput,bytes.length);return webcrypto.subtle.digest(algorithm,bytes)}}},
 btoa:s=>Buffer.from(s,'binary').toString('base64'),importScripts(){},
 chrome:{storage:{local:{get:async d=>({...d,simplicityVersion:1})},onChanged:event()},runtime:{getManifest:()=>({version:'fixture'}),onMessage:event()},tabs:{onRemoved:event(),onUpdated:event()}}});
vm.runInContext(fs.readFileSync('outputs/Politifree-Chrome/background.js','utf8'),c);
const api=vm.runInContext('({payloadIdentity,base64,analyze,companion,cancelAnalysis,stats:()=>({bytes:activeMediaBytes,active:activeMediaPipelines,queued:mediaPipelines.length,budget:MEDIA_PAYLOAD_BUDGET})})',c);
(async()=>{
 const signal=new AbortController().signal;
 // Full UTF-8 metadata is exact; repeated chunk boundaries cannot alias.
 const data='ABCD'.repeat(200000),payload={kind:'image',context:'election 🗳️',visual:true,data};
 const identity=await api.payloadIdentity(payload,signal);
 assert.equal(identity,await api.payloadIdentity({...payload},signal));
 for(const changed of [{context:'gardening 🪴'},{visual:false},{kind:'media'},{data:data+'A'},{data:'X'+data.slice(1)},{data:data.slice(0,262144)+'X'+data.slice(262145)}]) assert.notEqual(identity,await api.payloadIdentity({...payload,...changed},signal));
 assert(maxDigestInput<=256*1024,'hash never encodes the full base64 payload');
 c.chrome.runtime.getManifest=()=>({version:'new-model-package'});assert.notEqual(identity,await api.payloadIdentity(payload,signal));c.chrome.runtime.getManifest=()=>({version:'fixture'});
 const hashAbort=new AbortController();hashAbort.abort(Error('cancel hash'));await assert.rejects(api.payloadIdentity(payload,hashAbort.signal),/cancel hash/);
 assert.notEqual(await api.payloadIdentity({kind:'text',text:'a\u0000b'},signal),await api.payloadIdentity({kind:'text',text:'ab'},signal));
 for(const length of [0,1,2,3,16382,16383,16384,32768,100000]) { const bytes=Uint8Array.from({length},(_,i)=>i%256);assert.equal(api.base64(bytes),Buffer.from(bytes).toString('base64')); }
 console.log('PASS bounded digest input, exact context/options/kind/chunk identity and base64 bytes');
 c.requests=[];vm.runInContext('analyzePayload = message => new Promise(resolve => requests.push({message,resolve}))',c);
 const media=[0,1,2].map(i=>api.analyze({kind:'media',url:'https://example.com/'+i},{},signal));
 assert.equal(c.requests.length,1,'two maximum videos exceed encoded byte budget');assert(api.stats().bytes<=api.stats().budget);
 const text=api.analyze({kind:'text',text:'caption'},{},signal),audio=api.analyze({kind:'live-audio',data:'AAAA'},{},signal);
 assert.equal(c.requests.length,3,'text and live audio bypass media reservations');
 c.requests[1].resolve({});c.requests[2].resolve({});await Promise.all([text,audio]);
 for(let i=0;i<3;i++){c.requests.find(r=>r.message.url==='https://example.com/'+i).resolve({});await tick();assert(api.stats().bytes<=api.stats().budget);}
 await Promise.all(media);assert.equal(api.stats().bytes,0);
 const image=[0,1].map(i=>api.analyze({kind:'image',url:'https://example.com/image'+i},{},signal));assert.equal(api.stats().active,2);
 c.requests.slice(-2).forEach(r=>r.resolve({}));await Promise.all(image);await tick();
 const controller=new AbortController(),active=api.analyze({kind:'media',url:'https://example.com/block'},{},signal);
 const cancelled=api.analyze({kind:'media',url:'https://example.com/cancel'},{},controller.signal);controller.abort(Error('cancelled'));await assert.rejects(cancelled,/cancelled/);assert.equal(api.stats().queued,0);
 c.requests.at(-1).resolve({});await active;await tick();assert.equal(api.stats().bytes,0);
 const active2=api.analyze({kind:'media',url:'https://example.com/block2'},{},signal),pending=api.analyze({kind:'media',url:'https://example.com/wait'},{},signal);
 const rejection=assert.rejects(pending,/cancelled/);api.cancelAnalysis();await rejection;assert.equal(api.stats().queued,0);c.requests.at(-1).resolve({});await active2;await tick();
 console.log('PASS byte reservations defer large media; text/audio progress, two images, queued abort and global cancellation release retention');
 c.inferred=[];vm.runInContext('requestCompanion = (path,payload) => new Promise(resolve => inferred.push({payload,resolve}))',c);
 const jobs=[];for(let i=0;i<2;i++) jobs.push(api.companion('/analyze',{kind:'text',text:String(i)},{},signal));
 jobs.push(api.companion('/analyze',{kind:'media',data:'AAAA'},{},signal));
 for(let i=2;i<10;i++) jobs.push(api.companion('/analyze',{kind:'text',text:String(i)},{},signal));
 c.inferred[0].resolve({});await tick();c.inferred[1].resolve({});await tick();c.inferred[2].resolve({});await tick();
 assert(c.inferred.some(r=>r.payload.kind==='media'),'queued media starts despite remaining captions');
 for(let i=0;i<11;i++){c.inferred.forEach(r=>r.resolve({}));await tick();}await Promise.all(jobs);
 console.log('PASS continuous captions cannot starve inference media');
 const audioContext=()=>vm.createContext({ArrayBuffer,DataView,Uint8Array,Float32Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),chrome:{runtime:{onMessage:event()}}});
 const audioCurrent=audioContext(),audioBaseline=audioContext();
 vm.runInContext(fs.readFileSync('outputs/Politifree-Chrome/offscreen.js','utf8'),audioCurrent);
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'fixtures/politifree-wav-v071.js'),'utf8'),audioBaseline);
 const encodeNow=vm.runInContext('wav',audioCurrent),encodeBefore=vm.runInContext('wav',audioBaseline);
 for(const length of [0,1,2,8192,16383,26000]) {const samples=Float32Array.from({length},(_,i)=>Math.sin(i)*1.1);assert.equal(encodeNow(samples,48000),encodeBefore(samples,48000));}
 console.log('PASS exact WAV/base64 equivalence across encoding chunk boundaries');
 // Media in the page scheduler also receives a turn under a caption backlog.
 let pageRequests=[];
 const page=vm.createContext({innerHeight:800,scrollY:0,setTimeout(){},chrome:{runtime:{sendMessage:m=>new Promise(resolve=>pageRequests.push({m,resolve}))}}});
 vm.runInContext(fs.readFileSync('outputs/Politifree-Chrome/advanced.js','utf8'),page);
 const advanced=page.PolitifreeAdvanced.create(()=>{});advanced.reset({aiEnabled:true,semanticFiltering:true,imageFiltering:true,speechFiltering:false});
 const card=(name,image)=>({isConnected:true,closest:()=>null,matches:()=>false,getBoundingClientRect:()=>({top:10,bottom:210,width:300,height:200}),querySelectorAll:s=>s==='img'&&image?[{closest:()=>null,complete:true,naturalWidth:300,naturalHeight:200,src:'https://example.com/'+name}]:[]});
 advanced.check(card('blocker',true),'');advanced.check(card('waiting-media',true),'');
 for(let i=0;i<8;i++) advanced.check(card('caption'+i,false),'A long ordinary bread baking tutorial explains flour and yeast recipe number '+i);
 pageRequests[0].resolve({ok:true,complete:true,political:false});await tick();
 for(let i=0;i<4;i++) {const r=pageRequests.find(r=>r.m.kind==='text'&&!r.resolved);r.resolved=true;r.resolve({ok:true,complete:true,political:false});await tick();}
 assert(pageRequests.some(r=>r.m.url==='https://example.com/waiting-media'),'page media gets a turn after four captions');
 console.log('PASS page scheduler grants media a turn under continuous caption backlog');
 // Exercise the production observer callback against overlapping record roots.
 const source=fs.readFileSync('outputs/Politifree-Chrome/content.js','utf8'),start=source.indexOf('new MutationObserver(records => {')+'new MutationObserver('.length,end=source.indexOf(').observe(document.documentElement',start);
 let queued=[],invalidated=[];
 const root={parentNode:null},owner={parentNode:root,removeAttribute(){invalidated.push(this)}};
 const element={nodeType:1,parentNode:owner,closest:()=>element,matches:()=>false,style:{backgroundImage:''}};
 const added={nodeType:1,parentNode:element,matches:()=>false};
 const ctx=vm.createContext({Node:{ELEMENT_NODE:1},syncGate(){},sitePanel:null,syncSiteBlock(){},candidateSelector:'card',backgroundImages:new WeakMap(),boundary:()=>owner,processed:{delete:n=>invalidated.push(n)},queue:n=>queued.push(n)});
 // closest ignores our UI only for the exclusion query.
 element.closest=selector=>selector.includes('politifree-site-block')?null:element;
 const observer=vm.runInContext('('+source.slice(start,end)+')',ctx);
 const record=attributeName=>({target:element,attributeName,removedNodes:[],addedNodes:[added]});
 observer(['src','alt','data-caption','title',undefined].map(record));assert.equal(queued.length,1);assert.equal(queued[0],owner);assert.equal(invalidated.length,2);
 queued=[];invalidated=[];observer([{target:{nodeType:3,parentElement:element},removedNodes:[],addedNodes:[]}]);assert.equal(queued[0],owner,'recycled text invalidates owner');
 assert(source.includes("'data-transcript'")&&source.includes("'srcset'")&&source.includes('characterData: true'));
 console.log('PASS overlapping mutation records scan owner once; recycled text and caption/alt/src triggers retained');
})().catch(e=>{console.error(e);process.exitCode=1});
