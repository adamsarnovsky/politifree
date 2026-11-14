(() => {
  'use strict';
  let inflight;
  async function update() {
    if (inflight) return inflight;
    inflight = (async () => {
      const config = PolitifreeCommunityConfig;
      if (!config.updateURL || !config.publicKey) return {ok:true, status:'Shared updates are not configured yet.'};
      const response = await fetch(config.updateURL, {credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw Error('Filter server unavailable');
      const reader = response.body.getReader(); let size=0, chunks=[];
      try {
        for (;;) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>300000) throw Error('Filter download too large'); chunks.push(value); }
      } finally { await reader.cancel().catch(()=>{}); }
      const bytes = new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const pack = await PolitifreeCommunity.verify(JSON.parse(new TextDecoder().decode(bytes)),config.publicKey);
      const stored = await chrome.storage.local.get({communityHighWater:0, communityPack:null});
      if (pack.revision <= stored.communityHighWater) return {ok:true,status:'No newer reviewed filters.'};
      await chrome.storage.local.set({communityPrevious:stored.communityPack,communityPack:pack,communityHighWater:pack.revision,communityLastUpdate:Date.now()});
      return {ok:true,status:'Reviewed filters updated to revision ' + pack.revision};
    })();
    try { return await inflight; } finally { inflight=null; }
  }
  chrome.runtime.onMessage.addListener((message,sender,respond) => {
    if (!['pf-community-update','pf-community-rollback'].includes(message?.type)) return;
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) {respond({ok:false,error:'Extension page required'});return;}
    (async()=>{
      if(message.type==='pf-community-update') return update();
      const {communityPrevious}=await chrome.storage.local.get({communityPrevious:null});
      if(!communityPrevious) throw Error('No previous filter revision available');
      PolitifreeCommunity.validate(communityPrevious);
      await chrome.storage.local.set({communityPack:communityPrevious,communityPrevious:null,communityUpdatesEnabled:false});
      return {ok:true,status:'Previous filters restored; automatic updates paused.'};
    })().then(respond,error=>respond({ok:false,error:error.message})); return true;
  });
  if (chrome.alarms) {
    chrome.alarms.create('politifree-community',{periodInMinutes:360});
    chrome.alarms.onAlarm.addListener(async alarm=>{
      if(alarm.name!=='politifree-community')return;
      const s=await chrome.storage.local.get({communityUpdatesEnabled:true});
      if(s.communityUpdatesEnabled) update().catch(()=>{});
    });
  }
})();
