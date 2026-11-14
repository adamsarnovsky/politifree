'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),{webcrypto,generateKeyPairSync,sign}=require('crypto');
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,atob});
vm.runInContext(fs.readFileSync('outputs/Politifree-Chrome/community.js','utf8'),ctx);
const api=ctx.PolitifreeCommunity;
const pack={schema:1,revision:2,rules:[{id:'test-block',action:'block',host:'example.com',text:'The candidate calls for a new government policy.',reason:'Political policy advocacy'},{id:'test-allow',action:'allow',host:'example.com',text:'Trump cards in bridge explained for beginners',reason:'Ordinary card-game guide'}]};
api.validate(pack);assert(api.match(pack,'example.com',pack.rules[0].text,true).political);assert.equal(api.match(pack,'other.com',pack.rules[0].text,true),null);
assert.equal(api.match(pack,'example.com','An ordinary skateboarding lesson',false),null);
assert(api.match(pack,'example.com',pack.rules[1].text,false).communityAllow);assert.equal(api.match(pack,'example.com',pack.rules[1].text,true),null,'allow must not exempt unknown media');
assert.throws(()=>api.validate({...pack,rules:[...pack.rules,pack.rules[0]]}));
assert.throws(()=>api.validate({...pack,rules:[{...pack.rules[0],host:'*'}]}));
assert.throws(()=>api.validate({...pack,rules:[{...pack.rules[0],text:'too short'}]}));
(async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const payload=JSON.stringify(pack);
 const envelope={payload,signature:sign('sha256',Buffer.from(payload),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')};
 assert.equal((await api.verify(envelope,publicKey.export({format:'jwk'}))).revision,2);
 await assert.rejects(api.verify({...envelope,payload:payload+' '},publicKey.export({format:'jwk'})));
 const release=api.validate(JSON.parse(fs.readFileSync('filters/rules.json','utf8'))),cases=JSON.parse(fs.readFileSync('filters/cases.json','utf8'));
 for(const rule of release.rules){assert(cases.some(c=>c.rule===rule.id&&c.expected===rule.action),'Each rule needs a positive case');assert(cases.some(c=>c.rule===rule.id&&c.expected===null),'Each rule needs a non-matching control');}
 for(const c of cases){const result=api.match(release,c.host,c.text,!!c.hasMedia);assert.equal(result?(result.communityAllow?'allow':'block'):null,c.expected);}
 vm.runInContext(fs.readFileSync('outputs/Politifree-Chrome/community-config.js','utf8'),ctx);
 if(ctx.PolitifreeCommunityConfig.publicKey){const current=await api.verify(JSON.parse(fs.readFileSync('filters/current.json','utf8')),ctx.PolitifreeCommunityConfig.publicKey);assert.equal(JSON.stringify(current),JSON.stringify(release),'Signed release must match reviewed source');}
 console.log('PASS community schema, exact scope, media protection, signature tampering, and release cases');
})().catch(e=>{console.error(e);process.exitCode=1});
