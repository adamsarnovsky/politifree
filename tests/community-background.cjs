'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{webcrypto,generateKeyPairSync,sign}=require('crypto');
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
let handlers=[],alarms=[],stored={},body='',fetches=0;
const config={updateURL:'https://example.com/filters.json',publicKey:publicKey.export({format:'jwk'})};
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,atob,AbortSignal,PolitifreeCommunityConfig:config,
 fetch:async(url,options)=>{fetches++;assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');let sent=false;return {ok:true,body:{getReader:()=>({read:async()=>sent?{done:true}:(sent=true,{done:false,value:new TextEncoder().encode(body)}),cancel:async()=>{}})}};},
 chrome:{runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>handlers.push(fn)}},alarms:{create(){},onAlarm:{addListener:fn=>alarms.push(fn)}},storage:{local:{get:async defaults=>({...defaults,...stored}),set:async values=>Object.assign(stored,values)}}}});
vm.runInContext(fs.readFileSync('outputs/Politifree-Chrome/community.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('outputs/Politifree-Chrome/community-background.js','utf8'),ctx);
const sender={id:'test',url:'chrome-extension://test/report.html',tab:{id:1}};
const request=(type,s=sender)=>new Promise(resolve=>handlers[0]({type},s,resolve));
function pack(revision){const payload=JSON.stringify({schema:1,revision,rules:[]});body=JSON.stringify({payload,signature:sign('sha256',Buffer.from(payload),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')});}
(async()=>{
 pack(1);assert((await request('pf-community-update')).ok);assert.equal(stored.communityPack.revision,1);
 pack(2);await request('pf-community-update');assert.equal(stored.communityPack.revision,2);
 body=body.replace('"signature":"','"signature":"x');assert.equal((await request('pf-community-update')).ok,false);assert.equal(stored.communityPack.revision,2);
 assert((await request('pf-community-rollback')).ok);assert.equal(stored.communityPack.revision,1);assert.equal(stored.communityUpdatesEnabled,false);assert.equal(stored.communityHighWater,2);
 pack(2);await request('pf-community-update');assert.equal(stored.communityPack.revision,1,'replay must not undo rollback');
 const before=fetches;await alarms[0]({name:'politifree-community'});assert.equal(fetches,before,'opt-out blocks periodic requests');
 assert.equal((await request('pf-community-update',{id:'test',url:'https://evil.example',tab:{id:1}})).ok,false);assert.equal(fetches,before);
 body='x'.repeat(300001);assert.equal((await request('pf-community-update')).ok,false);assert.equal(stored.communityPack.revision,1);
 pack(3);assert((await request('pf-community-update')).ok);assert.equal(stored.communityPack.revision,3);
 console.log('PASS signed update, rollback, anti-replay, sender isolation, opt-out, tamper and size failures preserve working filters');
})().catch(e=>{console.error(e);process.exitCode=1});
