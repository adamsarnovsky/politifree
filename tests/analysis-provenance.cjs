'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
require('../outputs/Politifree-Chrome/classifier.js');
require('../outputs/Politifree-Chrome/decision.js');
const attr = 'data-politifree-analysis', nodes = [], pending = [], events = {};
const document = {visibilityState:'visible', addEventListener:(name, fn)=>events[name]=fn,
  querySelectorAll:()=>nodes.filter(n=>n.attrs.has(attr)),
  createElement:()=>({getContext:()=>({drawImage(){}}), toDataURL:()=> 'data:image/png;base64,YQ=='})};
const context = vm.createContext({document, setTimeout(){}, chrome:{runtime:{sendMessage:message=>new Promise(resolve=>pending.push({message, resolve}))}}});
vm.runInContext(fs.readFileSync('outputs/Politifree-Chrome/advanced.js','utf8'), context);
const engine = context.PolitifreeAdvanced.create(()=>{});
const settings = {aiEnabled:true, semanticFiltering:true, imageFiltering:true, speechFiltering:true};
const tick = ()=>new Promise(resolve=>setImmediate(resolve));
const makeNode = (media=[])=>{
  const n = {attrs:new Map(), isConnected:true, closest:()=>null, matches:()=>false,
    getBoundingClientRect:()=>({top:0,bottom:100,width:100,height:100}),
    querySelectorAll:s=>s==='video,audio'?media:[],
    setAttribute:(name,value)=>n.attrs.set(name,value), removeAttribute:name=>n.attrs.delete(name)};
  nodes.push(n); return n;
};
const result = (political=false, extra={})=>({ok:true,political,complete:true,score:.123456789,visualScore:.9,visualUncertain:false,decisionBranch:political?'visual':'none',...extra});
const caption = 'An ordinary detailed tutorial about baking fresh sourdough bread at home.';
(async()=>{
  for (const [text, score, visualScore, branch] of [
    ['Vote for Donald Trump in the presidential election.',0,0,'rules'],
    ['A sufficiently detailed ambiguous statement on matters of public interest.',.8,0,'semantic'],
    ['An ordinary scenic photograph.',.1,.9,'visual'],
    ['An ordinary scenic photograph.',.1,0,'none']
  ]) assert.equal(PolitifreeDecision.decide('image',{protocol:2,text,score,visualScore,complete:true}).decisionBranch,branch);
  engine.reset(settings);
  const n = makeNode();
  engine.check(n, caption); pending.at(-1).resolve(result()); await tick();
  let record = JSON.parse(n.attrs.get(attr));
  assert.equal(record.source,'text'); assert.equal(record.score,.123457); assert.equal(record.visualScore,.9);
  assert(n.attrs.get(attr).length <= 512); assert(!n.attrs.get(attr).includes('sourdough'));
  engine.check(n, caption+' A different topic.'); assert(!n.attrs.has(attr),'new signature clears immediately');
  const stale = pending.at(-1);
  engine.check(n, caption+' Another different topic.');
  stale.resolve(result(true)); await tick(); assert(!n.attrs.has(attr),'stale response cannot annotate recycled owner');
  pending.at(-1).resolve(result(false)); await tick(); assert(n.attrs.has(attr));
  assert.equal(engine.check(n,''),null); assert(!n.attrs.has(attr),'recycled owner losing all evidence clears metadata');
  engine.check(n,caption+' Fresh uncached content.'); assert(!n.attrs.has(attr),'new content starts without stale metadata');
  pending.at(-1).resolve(result()); await tick(); assert(n.attrs.has(attr));
  engine.reset(settings); assert(!n.attrs.has(attr),'reset clears DOM metadata');
  engine.check(n, caption); const disconnected = pending.at(-1); n.isConnected=false;
  disconnected.resolve(result(true)); await tick(); assert(!n.attrs.has(attr),'disconnected response ignored'); n.isConnected=true;
  engine.reset(settings);
  engine.check(n, caption); const disabled = pending.at(-1); engine.reset({...settings,aiEnabled:false});
  disabled.resolve(result(true)); await tick(); assert(!n.attrs.has(attr),'reset rejects old response');
  engine.reset({...settings,semanticFiltering:false});
  const video = {src:'blob:private-url-must-not-be-recorded',videoWidth:800,videoHeight:600,readyState:2,currentTime:4.5,matches:s=>s==='video'};
  const blocker = makeNode([{...video}]), videoNode = makeNode([video]);
  engine.check(blocker,''); const first = pending.at(-1);
  const state = engine.check(videoNode,''); video.currentTime=7.76543;
  first.resolve(result()); await tick();
  pending.at(-1).resolve(result(true)); await tick();
  record = JSON.parse(videoNode.attrs.get(attr));
  assert.equal(record.source,'video-frame'); assert.equal(record.queuedBucket,2); assert.equal(record.sampleTime,7.765);
  assert.equal(record.branch,'visual'); assert.equal(state.political,true);
  const trigger = videoNode.attrs.get(attr); video.currentTime=4.5; engine.check(videoNode,'');
  assert.equal(videoNode.attrs.get(attr),trigger,'same signature preserves political trigger');
  assert(!trigger.includes('private-url')); assert(trigger.length<=512);
  engine.reset(settings);
  for(let i=0;i<4;i++) {
    engine.check(makeNode(),caption+' Warmup '+i); pending.at(-1).resolve(result()); await tick();
  }
  const mixed = makeNode([video]); engine.check(mixed,caption+' Mixed evidence.');
  const textReply = pending.at(-2), frameReply = pending.at(-1);
  assert.equal(textReply.message.kind,'text'); assert.equal(frameReply.message.kind,'image');
  frameReply.resolve(result(true)); await tick(); const mixedTrigger = mixed.attrs.get(attr);
  textReply.resolve(result(false)); await tick();
  assert.equal(mixed.attrs.get(attr),mixedTrigger,'late benign caption cannot overwrite political frame trigger');
  engine.reset(settings);
  const bounded = makeNode(); engine.check(bounded,caption+' Bounded values.');
  pending.at(-1).resolve(result(false,{score:-1,visualScore:1e30,decisionBranch:'private-content'.repeat(1000)})); await tick();
  record=JSON.parse(bounded.attrs.get(attr));
  assert.equal(record.score,0); assert.equal(record.visualScore,1); assert.equal(record.branch,'unknown'); assert(bounded.attrs.get(attr).length<=512);
  const content = fs.readFileSync('outputs/Politifree-Chrome/content.js','utf8');
  const filter = content.match(/attributeFilter:\s*\[([^\]]+)\]/)[1];
  assert(!filter.includes(attr),'provenance writes are outside DOM observer attribute filter');
  console.log('PASS decision branches, bounded metadata, signature/reset clears, stale/disconnected responses, real sample time, trigger preservation, and observer exclusion');
})().catch(error=>{console.error(error);process.exitCode=1});
