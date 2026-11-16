// The background owns one native connection. Closing it stops the helper;
// idle connections are closed so models never need a separate user switch.
(() => {
  'use strict';
  const HOST = 'app.politifree.engine', IDLE_MS = 90000, MAX_POSTED = 2;
  let port, sequence = 0, idleTimer, retryAfter = 0, phase = 'idle';
  const pending = new Map(), waiting = [];
  function stop(error = Error('Analysis stopped.')) {
    clearTimeout(idleTimer);
    const old = port; port = null;
    for (const job of [...pending.values(), ...waiting]) job.finish(error);
    old?.disconnect(); phase = 'idle';
  }
  function idle() {
    clearTimeout(idleTimer);
    if (!pending.size && !waiting.length && port) idleTimer = setTimeout(stop, IDLE_MS);
  }
  function drain() {
    // Bound all physical native messages, including health and start controls.
    // With at most one active and one queued body, the host's reader can always
    // return to the next header and observe Chrome disconnecting during work.
    while (port && pending.size < MAX_POSTED && waiting.length) waiting.shift().start();
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
        if (message.ready === false) {
          job.finish(Error(message.error || 'Media analysis unavailable.'), undefined, false);
          stop(); phase = 'unavailable'; retryAfter = Date.now() + 60000;
        } else {
          phase = 'ready'; job.finish(Error(message.error || 'Media analysis unavailable.'));
        }
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
      for (const job of [...pending.values(), ...waiting]) job.finish(Error('Media analysis unavailable. Run or repair the Politifree installer.'));
    });
    return current;
  }
  function request(action, payload = {}, signal) {
    signal?.throwIfAborted();
    // Preserve time-sensitive audio when it would wait behind another job.
    if (payload.kind === 'live-audio' && (pending.size || waiting.length)) throw Error('Media analysis is busy; audio preserved.');
    const current = connect(); clearTimeout(idleTimer);
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      let timer, done = false;
      const job = {posted: false, finish, start};
      const abort = () => {
        const error = signal.reason || Error('Analysis cancelled.');
        // A posted request still consumes a physical slot until its reply.
        // Disconnect it rather than admitting extra work behind cancelled CPU.
        if (job.posted) stop(error); else finish(error);
      };
      function finish(error, result, resume = true) {
        if (done) return;
        done = true; pending.delete(id);
        const index = waiting.indexOf(job); if (index >= 0) waiting.splice(index, 1);
        clearTimeout(timer); signal?.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(result);
        if (resume) drain();
        idle();
      }
      function start() {
        if (done) return;
        if (signal?.aborted) { finish(signal.reason || Error('Analysis cancelled.')); return; }
        job.posted = true; pending.set(id, job);
        if (action === 'analyze' || action === 'start') phase = 'loading';
        // Waiting controls do not time out before they are actually submitted.
        timer = setTimeout(() => {
          finish(Error('Media analysis timed out.'), undefined, false);
          stop(); phase = 'unavailable'; retryAfter = Date.now() + 60000;
        }, action === 'health' ? 10000 : payload.kind === 'live-audio' ? 5000 : 180000);
        try { current.postMessage({id, action, payload}); }
        catch (error) { finish(error, undefined, false); stop(); }
      }
      signal?.addEventListener('abort', abort, {once:true});
      waiting.push(job); drain();
    });
  }
  globalThis.PolitifreeEngine = {request, stop, status: () => ({phase, pending: pending.size + waiting.length}),
    retry: () => { retryAfter = 0; if (phase === 'unavailable') phase = 'idle'; }};
})();
