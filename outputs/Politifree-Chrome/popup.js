 'use strict';
const $ = selector => document.querySelector(selector);
let tab, revealed = false, guarding = false;
let refreshTimer;
let actionPending = false;
const disabledState = new Map([['#enabled',false],['#options',false]]);
function setDisabled(selector, value) {
  disabledState.set(selector, value);
  $(selector).disabled = actionPending || value;
}
const matches = (host, domain) => host === domain || host.endsWith('.'+domain);
async function message(value) {
  const result = await chrome.runtime.sendMessage(value);
  if (!result?.ok) throw Error(result?.error || 'Reload Politifree and try again.');
  return result;
}
async function refresh() {
  clearTimeout(refreshTimer);
  const settings = await chrome.storage.local.get({enabled:true,allowedDomains:[]});
  $('#enabled').checked = settings.enabled; $('#enabled-label').textContent = settings.enabled ? 'On' : 'Off';
  [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  const supported = /^https?:/.test(tab?.url || '');
  let paused = false;
  if (supported) {
    const host = new URL(tab.url).hostname.replace(/^www\./,'');
    const domain = settings.allowedDomains.find(d => matches(host,d)); paused = !!domain;
    $('#pause-site').textContent = paused ? `Resume on ${domain}` : 'Pause on this website';
  }
  setDisabled('#pause-site', !supported || !settings.enabled);
  setDisabled('#show-removed', true);
  setDisabled('#audio-toggle', !supported || !settings.enabled || paused);
  if (!supported) $('#page-status').textContent = 'Open a regular website to use page controls.';
  else {
    try {
      const page = await chrome.tabs.sendMessage(tab.id,{type:'pf-page-status'},{frameId:0});
      if (!page || !Number.isFinite(page.hidden)) throw Error('No status');
      revealed = !!page.revealed; guarding = !!page.guardAudio;
      $('#show-removed').textContent = revealed ? 'Hide removed items again' : 'Show removed items';
      setDisabled('#show-removed', !settings.enabled || paused || (!page.hidden && !revealed));
      $('#page-status').textContent = paused ? 'This website is paused.' : `${page.hidden} items removed${page.pending ? ' · checking more' : ''}`;
      $('#audio-toggle').textContent = guarding ? 'Stop audio screening' : 'Start audio screening';
    } catch (_) { $('#page-status').textContent = 'Refresh this page to connect Politifree.'; }
  }
  if (!settings.enabled) { $('#engine-status').textContent = 'Filtering is off.'; return; }
  const engine = await message({type:'pf-engine-status'});
  // Filtering finishes after storage changes and can continue as a feed grows.
  // Keep the count and undo control current while the popup remains open.
  if (supported || engine.phase === 'loading') refreshTimer = setTimeout(() => {
    if (!actionPending) refresh().catch(() => {});
  }, 1500);
  $('#engine-status').textContent = engine.phase === 'loading' ? 'Preparing media analysis…' : engine.phase === 'unavailable' ? 'Text filtering active · media analysis unavailable. Run the Politifree installer.' : 'Filtering active · media checked automatically';
}
async function action(button, fn) {
  if (actionPending) return;
  actionPending = true; clearTimeout(refreshTimer);
  for (const selector of disabledState.keys()) $(selector).disabled = true;
  try { await fn(); await refresh(); }
  catch (error) { $('#engine-status').textContent = error.message; }
  finally {
    actionPending = false;
    for (const [selector, disabled] of disabledState) $(selector).disabled = disabled;
  }
}
$('#enabled').addEventListener('change', event => action(event.target, async()=>{
  try { await message({type:'pf-set-enabled', enabled:event.target.checked}); }
  catch(error) { event.target.checked = !event.target.checked; throw error; }
}));
$('#pause-site').addEventListener('click', event => action(event.target, async()=>{
  const {allowedDomains} = await chrome.storage.local.get({allowedDomains:[]});
  const host = new URL(tab.url).hostname.replace(/^www\./,'');
  const paused = allowedDomains.some(d=>matches(host,d));
  await chrome.storage.local.set({allowedDomains:paused ? allowedDomains.filter(d=>!matches(host,d)) : [...allowedDomains,host]});
}));
$('#show-removed').addEventListener('click', event => action(event.target, async()=>{
  await chrome.tabs.sendMessage(tab.id,{type:revealed?'pf-refilter-page':'pf-restore-page'});
}));
$('#options').addEventListener('click',()=>chrome.runtime.openOptionsPage());
$('#audio-toggle').addEventListener('click', event => action(event.target,async()=>{
  if (!guarding && !await chrome.permissions.request({permissions:['tabCapture','activeTab']})) {
    $('#audio-status').textContent = 'Audio screening was not enabled.'; return;
  }
  const result = await message({type:guarding?'pf-audio-stop':'pf-audio-start'});
  $('#audio-status').textContent = result.message || 'Audio screening updated.';
}));
refresh().catch(error=>$('#engine-status').textContent=error.message);

$('#report').addEventListener('click',async()=>{await chrome.tabs.create({url:chrome.runtime.getURL('report.html')+'?tab='+tab?.id});});
