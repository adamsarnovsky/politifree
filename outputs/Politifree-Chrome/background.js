'use strict';
importScripts('classifier.js', 'decision.js', 'engine.js', 'community.js', 'community-config.js', 'community-background.js');
// One user switch. Preserve site choices and the user's global enabled state.
const settingsReady = chrome.storage.local.get({simplicityVersion:0}).then(current => {
  if (current.simplicityVersion < 1) return chrome.storage.local.set({simplicityVersion:1,
    aiEnabled:true, semanticFiltering:true, imageFiltering:true, visualFiltering:true,
    speechFiltering:true, strictness:'precise', holdUnverified:false});
}).catch(() => {});
const AI_DEFAULTS = {enabled:true, aiEnabled:true, semanticFiltering:true, imageFiltering:true,
  visualFiltering:true, speechFiltering:true, holdUnverified:false, strictness:'precise', allowedDomains:[]};
const cache = new Map(), analyses = new Map(), downloads = new Map();
let analysisLifetime = new AbortController();
function cancelAnalysis() {
  analysisLifetime.abort(Error('Local analysis was stopped or its settings changed.'));
  analysisLifetime = new AbortController();
  for (const job of inferenceQueue.splice(0)) job.reject(Error('Local analysis was cancelled.'));
  cache.clear(); analyses.clear(); downloads.clear();
}
let creatingOffscreen;
function allowed(url, domains) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return domains.some(d => host === d || host.endsWith('.' + d));
}
function publicResource(value) {
  const url = new URL(value);
  const h = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || h === 'localhost' || !h.includes('.') || h.endsWith('.local') || h.endsWith('.localhost') || h.includes(':') || /^(?:127|10|0|169\.254|192\.168)\./.test(h) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(h)) throw Error('Unsupported resource');
  return url.href;
}
function base64(bytes) {
  let value = '';
  for (let i = 0; i < bytes.length; i += 16384) value += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(value);
}
async function resource(url, limit, signal) {
  signal.throwIfAborted();
  const key = publicResource(url) + "|" + limit;
  if (downloads.has(key)) return downloads.get(key);
  const pending = boundedDownload(url, limit, signal);
  if (downloads.size >= 32) return pending;
  downloads.set(key, pending);
  try { return await pending; } finally { if (downloads.get(key) === pending) downloads.delete(key); }
}
const downloadQueue = []; let activeDownloads = 0;
function drainDownloads() {
  while (activeDownloads < 2 && downloadQueue.length) {
    const job = downloadQueue.shift();
    if (job.signal.aborted) { job.reject(job.signal.reason); continue; }
    activeDownloads++;
    download(job.url, job.limit, job.signal).then(job.resolve, job.reject).finally(() => { activeDownloads--; drainDownloads(); });
  }
}
function boundedDownload(url, limit, signal) {
  if (downloadQueue.length >= 32) return Promise.reject(Error('Media queue busy; retry later.'));
  return new Promise((resolve, reject) => { downloadQueue.push({url, limit, signal, resolve, reject}); drainDownloads(); });
}
async function download(url, limit, signal) {
  const response = await fetch(publicResource(url), {credentials: 'omit', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)])});
  if (!response.ok || Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel().catch(() => {});
    throw Error('Resource unavailable');
  }
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) throw Error('Resource too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return base64(bytes);
}
const inferenceQueue = []; let runningInference = 0;
function dispatchInference() {
  inferenceQueue.sort((a,b) => a.rank - b.rank);
  while (runningInference < 2 && inferenceQueue.length) {
    const job = inferenceQueue.shift();
    if (job.signal.aborted) { job.reject(job.signal.reason); continue; }
    runningInference++;
    requestCompanion('/analyze', job.payload, job.settings, job.signal).then(job.resolve, job.reject).finally(() => { runningInference--; dispatchInference(); });
  }
}
async function companion(path, payload, settings, signal) {
  if (path !== '/analyze') return requestCompanion(path, payload, settings);
  signal.throwIfAborted();
  if (inferenceQueue.length >= 64) throw Error('Analysis queue full; retry later.');
  return new Promise((resolve,reject) => {
    const rank = payload.kind === 'live-audio' ? 0 : payload.kind === 'text' ? 1 : payload.kind === 'image' ? 2 : 3;
    inferenceQueue.push({payload, settings, signal, rank, resolve, reject}); dispatchInference();
  });
}
async function requestCompanion(path, payload, settings, lifetime) {
  return PolitifreeEngine.request(path === '/analyze' ? 'analyze' : path === '/health' ? 'health' : payload.action, payload || {}, lifetime);
}
const mediaPipelines = []; let activeMediaPipelines = 0;
function drainMediaPipelines() {
  while (activeMediaPipelines < 2 && mediaPipelines.length) {
    const job = mediaPipelines.shift();
    if (job.signal.aborted) { job.reject(job.signal.reason); continue; }
    activeMediaPipelines++;
    analyzePayload(job.message, job.settings, job.signal, job.sender).then(job.resolve, job.reject).finally(() => { activeMediaPipelines--; drainMediaPipelines(); });
  }
}
async function analyze(message, settings, signal, sender) {
  if (message.kind === 'text' || message.kind === 'live-audio') return analyzePayload(message, settings, signal, sender);
  signal.throwIfAborted();
  if (mediaPipelines.length >= 32) throw Error('Media analysis busy; retry later.');
  // Acquire the budget before downloading. Otherwise fast downloads can leave
  // dozens of large encoded videos waiting in the inference queue.
  return new Promise((resolve, reject) => { mediaPipelines.push({message, settings, signal, sender, resolve, reject}); drainMediaPipelines(); });
}
async function analyzePayload(message, settings, signal, sender) {
  signal.throwIfAborted();
  let payload = {kind: message.kind};
  if (message.kind !== 'text' && message.kind !== 'live-audio') {
    payload.context = String(message.context || '').slice(0, 6000);
    payload.visual = settings.visualFiltering !== false;
  }
  if (message.kind === 'text') payload.text = String(message.text || '').slice(0, 6000);
  else if (message.data) {
    if (!/^[a-zA-Z0-9+/=]+$/.test(message.data) || message.data.length > 45000000) throw Error('Invalid data');
    payload.data = message.data;
  } else payload.data = await resource(message.url, message.kind === 'image' ? 10 * 1024 * 1024 : 32 * 1024 * 1024, signal);
  signal.throwIfAborted();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  signal.throwIfAborted();
  const key = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  let result;
  if (cache.has(key)) {
    result = cache.get(key); cache.delete(key); cache.set(key, result);
  } else {
    let pending = analyses.get(key);
    if (!pending) {
      pending = (async () => {
        // Charge only new inference. Cached and shared in-flight work must not
        // exhaust a feed's budget and strand genuinely new images.
        if (sender) consume(sender, message.kind);
        const value = await companion('/analyze', payload, settings, signal);
        signal.throwIfAborted();
        if (payload.kind !== 'text' && value.protocol !== 2) throw Error('Update Politifree using the latest installer.');
        if (!Number.isFinite(value.score) || typeof value.complete !== 'boolean') throw Error('Invalid analysis result');
        {
          // An uncertain result remains uncertain; reusing its evidence does
          // not claim the media is safe or complete.
          cache.set(key, value);
          if (cache.size > 128) cache.delete(cache.keys().next().value);
        }
        return value;
      })();
      analyses.set(key, pending);
    }
    try { result = await pending; } finally { if (analyses.get(key) === pending) analyses.delete(key); }
  }
  signal.throwIfAborted();
  return PolitifreeDecision.decide(message.kind, result);
}
async function offscreen() {
  const contexts = await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT']});
  if (contexts.length) return;
  if (!creatingOffscreen) creatingOffscreen = chrome.offscreen.createDocument({url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Process user-selected tab media streams locally, withholding unchecked audio.'}).finally(() => creatingOffscreen = null);
  await creatingOffscreen;
}
const budgets = new Map();
function consume(sender, kind) {
  const key = sender.tab?.id + ':' + sender.frameId;
  let budget = budgets.get(key);
  if (!budget || Date.now() - budget.start > 60000) { budget = {start: Date.now(), text: 0, image: 0, media: 0}; budgets.set(key, budget); }
  const bucket = kind === 'text' ? 'text' : kind === 'image' ? 'image' : 'media';
  if (++budget[bucket] > (bucket === 'text' ? 120 : bucket === 'image' ? 40 : 8)) throw Error('Analysis budget reached; retry later.');
  if (budgets.size > 200) budgets.delete(budgets.keys().next().value);
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type?.startsWith('pf-community-')) return;
  if (!message || message.target === 'offscreen' || typeof message.type !== 'string' || !message.type.startsWith('pf-')) return;
  (async () => {
    await settingsReady;
    const signal = analysisLifetime.signal;
    const settings = await chrome.storage.local.get(AI_DEFAULTS);
    const trusted = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
    if (message.type === 'pf-guard-state' && trusted && sender.url === chrome.runtime.getURL('offscreen.html')) {
      if (!Number.isInteger(message.tabId)) throw Error('Invalid tab');
      await chrome.tabs.sendMessage(message.tabId, {type: 'pf-guard-state', active: !!message.active}).catch(() => {}); return {ok: true};
    }
    if (message.type === 'pf-health' && trusted) return {ok: true, ...await companion('/health', null, settings)};
    if (message.type === 'pf-engine-status' && trusted) {
      if (!settings.enabled) return {ok:true, phase:'off'};
      if (message.retry) PolitifreeEngine.retry();
      const state = PolitifreeEngine.status();
      if (state.phase === 'idle') {
        try { await companion('/health', null, settings); } catch (_) {}
      }
      return {ok:true, ...PolitifreeEngine.status()};
    }
    if (message.type === 'pf-set-enabled' && trusted) {
      if (typeof message.enabled !== 'boolean') throw Error('Invalid state.');
      cancelAnalysis(); stopAudio(); PolitifreeEngine.stop();
      if (message.enabled) PolitifreeEngine.retry();
      await chrome.storage.local.set({enabled:message.enabled});
      return {ok:true};
    }
    if (message.type === 'pf-audio-stop' && trusted) { await offscreen(); return chrome.runtime.sendMessage({target: 'offscreen', type: 'stop'}); }
    if (!settings.enabled || !settings.aiEnabled) throw Error('Local AI filtering is disabled.');
    signal.throwIfAborted();
    if (message.type === 'pf-audio-start' && trusted && sender.url === chrome.runtime.getURL('popup.html')) {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab || !/^https?:/.test(tab.url || '') || allowed(tab.url, settings.allowedDomains)) throw Error('This tab cannot be guarded.');
      const health = await companion('/control', {action:'start'}, settings);
      if (health.protocol !== 2) throw Error('Update Politifree using the latest installer.');
      if (!health.ready) throw Error('Media analysis unavailable.');
      signal.throwIfAborted();
      await offscreen();
      const streamId = await chrome.tabCapture.getMediaStreamId({targetTabId: tab.id});
      signal.throwIfAborted();
      return chrome.runtime.sendMessage({target: 'offscreen', type: 'start', streamId, tabId: tab.id});
    }
    if (message.type === 'pf-live-audio' && trusted && sender.url === chrome.runtime.getURL('offscreen.html')) {
      return analyze({kind: 'live-audio', data: message.data}, settings, signal);
    }
    if (message.type === 'pf-live-political' && trusted && sender.url === chrome.runtime.getURL('offscreen.html')) {
      if (!Number.isInteger(message.tabId)) throw Error('Invalid tab');
      await chrome.tabs.sendMessage(message.tabId, {type: 'pf-live-political'}).catch(() => {}); return {ok: true};
    }
    if (message.type !== 'pf-analyze' || sender.id !== chrome.runtime.id || !sender.tab || !/^https?:/.test(sender.url || '') || allowed(sender.url, settings.allowedDomains)) throw Error('Unsupported analysis request.');
    if (!['text', 'image', 'media'].includes(message.kind) || (message.kind === 'text' && !settings.semanticFiltering) || (message.kind === 'image' && !settings.imageFiltering) || (message.kind === 'media' && !settings.speechFiltering)) throw Error('Feature is disabled.');
    return analyze(message, settings, signal, sender);
  })().then(respond, error => respond({ok: false, error: error.message,
    code: /budget reached/i.test(error.message) ? 'rate-limited' : /queue|busy/i.test(error.message) ? 'queue-busy' : /resource|fetch/i.test(error.message) ? 'download-failed' : /timed out/i.test(error.message) ? 'analysis-timeout' : 'analysis-unavailable'}));
  return true;
});
function stopAudio() { chrome.runtime.sendMessage({target: 'offscreen', type: 'stop'}).catch(() => {}); }
chrome.tabs.onRemoved.addListener(id => { budgets.clear(); chrome.runtime.sendMessage({target: 'offscreen', type: 'stop-if-tab', tabId: id}).catch(() => {}); });
chrome.tabs.onUpdated.addListener((id, change) => { if (change.url) chrome.runtime.sendMessage({target: 'offscreen', type: 'stop-if-tab', tabId: id}).catch(() => {}); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const keys = Object.keys(changes);
  if (keys.some(k => Object.hasOwn(AI_DEFAULTS, k))) cancelAnalysis();
  if (keys.some(k => ['enabled', 'allowedDomains', 'aiEnabled'].includes(k))) PolitifreeEngine.stop();
  if (keys.some(k => ['enabled', 'aiEnabled', 'allowedDomains'].includes(k))) stopAudio();
});
