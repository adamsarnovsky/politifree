// The background owns one native connection. Closing it stops the helper;
// idle connections are closed so models never need a separate user switch.
(() => {
  'use strict';
  const HOST = 'app.politifree.engine', IDLE_MS = 90000;
  let port, sequence = 0, idleTimer, retryAfter = 0, phase = 'idle';
  const pending = new Map();
  function stop() {
    clearTimeout(idleTimer);
    const old = port; port = null;
    for (const job of [...pending.values()]) job.finish(Error('Analysis stopped.'));
    old?.disconnect(); phase = 'idle';
  }
  function idle() {
    clearTimeout(idleTimer);
    if (!pending.size && port) idleTimer = setTimeout(stop, IDLE_MS);
  }
  function connect() {
    if (port) return port;
    if (Date.now() < retryAfter) throw Error('Media analysis unavailable. Run the Politifree installer once.');
    let current;
    try { current = chrome.runtime.connectNative(HOST); }
    catch (error) { phase = 'unavailable'; retryAfter = Date.now() + 60000; throw error; }
    port = current;
    current.onMessage.addListener(message => {
      if (port !== current) return;
      const job = pending.get(message?.id); if (!job) return;
      if (message.ok !== true) {
        job.finish(Error(message.error || 'Media analysis unavailable.'));
        if (message.ready === false) { stop(); phase = 'unavailable'; retryAfter = Date.now() + 60000; }
        else phase = 'ready';
        return;
      }
      phase = message.ready === false ? 'idle' : 'ready';
      job.finish(null, message);
    });
    current.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message;
      if (port !== current) return;
      port = null; phase = error ? 'unavailable' : 'idle';
      if (error) retryAfter = Date.now() + 60000;
      for (const job of [...pending.values()]) job.finish(Error('Media analysis unavailable. Run or repair the Politifree installer.'));
    });
    return current;
  }
  function request(action, payload = {}, signal) {
    signal?.throwIfAborted();
    // The native host handles messages serially. Preserve time-sensitive audio
    // when it would wait behind another job, instead of timing out that job too.
    if (payload.kind === 'live-audio' && pending.size) throw Error('Media analysis is busy; audio preserved.');
    const current = connect(); clearTimeout(idleTimer);
    const id = ++sequence;
    if (action === 'analyze' || action === 'start') phase = 'loading';
    return new Promise((resolve, reject) => {
      const abort = () => finish(signal.reason || Error('Analysis cancelled.'));
      const timer = setTimeout(() => { finish(Error('Media analysis timed out.')); stop(); phase = 'unavailable'; retryAfter = Date.now() + 60000; }, action === 'health' ? 10000 : payload.kind === 'live-audio' ? 5000 : 180000);
      function finish(error, result) {
        if (!pending.has(id)) return;
        pending.delete(id); clearTimeout(timer); signal?.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(result);
        idle();
      }
      pending.set(id, {finish}); signal?.addEventListener('abort', abort, {once:true});
      try { current.postMessage({id, action, payload}); } catch (error) { finish(error); stop(); }
    });
  }
  globalThis.PolitifreeEngine = {request, stop, status: () => ({phase, pending: pending.size}),
    retry: () => { retryAfter = 0; if (phase === 'unavailable') phase = 'idle'; }};
})();
