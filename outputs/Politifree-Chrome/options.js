const defaults = { blockedDomains: ['democrats.org','gop.com','rnc.org','dnc.org','actblue.com','winred.com','politico.com','thehill.com','thegatewaypundit.com','novaramedia.com','thegrayzone.com','occupydemocrats.com','antiwar.com','thecanary.co','consortiumnews.com'], allowedDomains:[] };
const normalizeDomains = (value) => value.split(/[\n,]/).map((part) => {
  const input = part.trim();
  if (!input) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch (_) { return ""; }
}).filter(Boolean).filter((domain, index, domains) => domains.indexOf(domain) === index);
chrome.storage.local.get(defaults).then(settings=>{
  document.querySelector('#blocked').value=settings.blockedDomains.join('\n');
  document.querySelector('#allowed').value=settings.allowedDomains.join('\n');
});
document.querySelector('#save').addEventListener('click',async()=>{
  const status=document.querySelector('#status');
  try {
    await chrome.storage.local.set({blockedDomains:normalizeDomains(document.querySelector('#blocked').value),allowedDomains:normalizeDomains(document.querySelector('#allowed').value)});
    status.textContent='Saved';
  } catch (_) { status.textContent='Could not save. Reload Politifree and try again.'; }
});
async function check(retry=false) {
  const status=document.querySelector('#engine-status'); status.textContent='Checking…';
  try {
    const result=await chrome.runtime.sendMessage({type:'pf-engine-status',retry});
    status.textContent=result?.phase==='off'?'Politifree is switched off.':result?.phase==='unavailable'||!result?.ok?'Media analysis unavailable. Run the Politifree installer once.':result?.phase==='loading'?'Preparing media analysis…':'Connected. Media analysis starts automatically.';
  } catch (_) { status.textContent='Reload Politifree and try again.'; }
}
document.querySelector('#retry-engine').addEventListener('click',()=>check(true));
check();
