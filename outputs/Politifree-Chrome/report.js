'use strict';
const $=s=>document.querySelector(s), tabId=Number(new URL(location.href).searchParams.get('tab'));
let candidates=[], reason='user-report', filterRevision=0;
function report(){
  const url=$('#url').value.trim();
  if(url){const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Use a public HTTP(S) URL without credentials.');}
  return {schema:1,type:$('#kind').value,extensionVersion:chrome.runtime.getManifest().version,filterRevision,reason,url,text:$('#text').value,notes:$('#notes').value};
}
function preview(){try{$('#preview').textContent=JSON.stringify(report(),null,2);}catch(e){$('#preview').textContent=e.message;}}
for(const id of ['kind','url','text','notes'])$('#'+id).addEventListener('input',()=>{$('#consent').checked=false;preview();});
$('#load').onclick=async()=>{try{
  const result=await chrome.tabs.sendMessage(tabId,{type:'pf-report-items',kind:$('#kind').value},{frameId:0});
  candidates=result.items||[];$('#items').replaceChildren(new Option('Choose an item (up to 50)',''));
  candidates.forEach((item,i)=>$('#items').add(new Option(item.text.slice(0,140)||'[Media without readable text]',String(i))));
  $('#report-status').textContent=candidates.length?'Select an item, then review and redact its text.':'No matching items found. You can enter a report manually.';
}catch(e){$('#report-status').textContent='Refresh the source page, or enter a report manually.';}};
$('#items').onchange=()=>{const item=candidates[$('#items').value];if(!item)return;$('#text').value=item.text;reason=item.reason;$('#consent').checked=false;preview();};
async function submit(download){try{
  if(!$('#consent').checked)throw Error('Review the preview and check the consent box first.');
  const value=report();if(!value.text&&!value.url&&!value.notes)throw Error('Add a URL, text, or explanation.');
  const body=JSON.stringify(value,null,2);
  if(download){const url=URL.createObjectURL(new Blob([body],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='politifree-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  else {const url=PolitifreeCommunityConfig.repository+'/issues/new?title='+encodeURIComponent('[Filtering report] '+value.type)+'&body='+encodeURIComponent('Please review this filtering report.\n\n```json\n'+body+'\n```');if(url.length>7000)throw Error('This report is too long for a GitHub draft link. Save the JSON and paste it into a GitHub issue.');await chrome.tabs.create({url});}
  $('#report-status').textContent=download?'Report saved locally.':'GitHub draft opened. Nothing is posted until you submit it there.';
}catch(e){$('#report-status').textContent=e.message;}}
$('#download').onclick=()=>submit(true);$('#submit').onclick=()=>submit(false);
async function status(){const s=await chrome.storage.local.get({communityPack:null,communityUpdatesEnabled:true});filterRevision=s.communityPack?.revision||0;$('#updates').checked=s.communityUpdatesEnabled;$('#revision').textContent='Installed filter revision: '+(filterRevision||'none');preview();}
$('#updates').onchange=()=>chrome.storage.local.set({communityUpdatesEnabled:$('#updates').checked});
for(const [id,type] of [['update','pf-community-update'],['rollback','pf-community-rollback']])$('#'+id).onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type});$('#update-status').textContent=r.status||r.error;await status();}catch(e){$('#update-status').textContent=e.message;}};
preview();status();
