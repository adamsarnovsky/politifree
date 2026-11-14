'use strict';
// Private key path is supplied locally, never stored in the repository or CI.
const fs=require('fs'),crypto=require('crypto');
require('../outputs/Politifree-Chrome/community.js');
const [source,keyPath,target]=process.argv.slice(2);
if(!source||!keyPath||!target)throw Error('Usage: node scripts/sign-filters.cjs filters/rules.json /private/key.pem filters/current.json');
const pack=PolitifreeCommunity.validate(JSON.parse(fs.readFileSync(source,'utf8')));
const payload=JSON.stringify(pack);
const signature=crypto.sign('sha256',Buffer.from(payload),{key:fs.readFileSync(keyPath),dsaEncoding:'ieee-p1363'}).toString('base64');
fs.writeFileSync(target,JSON.stringify({payload,signature},null,2)+'\n');
console.log('Signed filter revision',pack.revision);
