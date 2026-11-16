'use strict';
let current = null;
let captureEpoch = 0;
function wav(samples, rate) {
  const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
  const text = (at, value) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true));
  let data = ''; const arr = new Uint8Array(bytes);
  // Three-byte boundaries preserve exactly the same WAV/base64 bytes without
  // keeping a second full-size binary string during encoding.
  for (let i = 0; i < arr.length; i += 16383) data += btoa(String.fromCharCode(...arr.subarray(i, i + 16383)));
  return data;
}
async function stop() {
  captureEpoch++;
  const old = current; current = null;
  if (!old) return;
  old.stream.getTracks().forEach(t => t.stop());
  old.processor.disconnect(); old.source.disconnect();
  for (const node of old.playing) { try { node.stop(); } catch (_) {} }
  await old.context.close();
  await chrome.runtime.sendMessage({type: 'pf-guard-state', tabId: old.tabId, active: false}).catch(() => {});
}
async function release(session) {
    while (session === current && session.results.has(session.next)) {
      const item = session.results.get(session.next); session.results.delete(session.next++);
      if (item.response?.ok && item.response.political) {
        // Withhold this chunk only. Tab capture mixes every audible player, so
        // it cannot identify which page video owns the political speech.
        continue;
      }
      // Failed or uncertain analysis is not evidence of political speech.
      const buffer = session.context.createBuffer(1, item.samples.length, session.context.sampleRate);
      buffer.copyToChannel(item.samples, 0);
      const source = session.context.createBufferSource(); source.buffer = buffer; source.connect(session.context.destination);
      session.playing.add(source); source.onended = () => session.playing.delete(source);
      const at = Math.max(session.context.currentTime, session.until); source.start(at); session.until = at + buffer.duration;
    }
}
async function process(session, samples) {
  const previous = session.overlap || new Float32Array(0);
  session.overlap = samples.slice(-Math.round(session.context.sampleRate * 2));
  if (session !== current) return;
  const sequence = session.sequence++;
  if (session.busy >= 2) {
    session.results.set(sequence, {response: {ok: false}, samples});
    await release(session); return;
  }
  session.busy++;
  // Busy chunks still update the exact overlap above, but do not allocate an
  // analysis buffer that would never be submitted to the model.
  const analysis = new Float32Array(previous.length + samples.length);
  analysis.set(previous); analysis.set(samples, previous.length);
  try {
    const response = await chrome.runtime.sendMessage({type: 'pf-live-audio', data: wav(analysis, session.context.sampleRate)});
    if (session !== current) return;
    // Preserve chunk order. A slow result never plays after a later one.
    session.results.set(sequence, {response, samples});
    await release(session);
  } catch (_) {
    if (session === current) { session.results.set(sequence, {response: {ok: false}, samples}); await release(session); }
  } finally { session.busy--; }
}
async function start(message) {
  const stopping = stop();
  const epoch = captureEpoch;
  await stopping;
  if (epoch !== captureEpoch) throw Error('Audio capture cancelled.');
  let stream, context, session;
  try {
  stream = await navigator.mediaDevices.getUserMedia({audio: {mandatory: {chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId}}, video: false});
  if (epoch !== captureEpoch) throw Error('Audio capture cancelled.');
  context = new AudioContext();
  const source = context.createMediaStreamSource(stream), processor = context.createScriptProcessor(4096, 1, 1), silent = context.createGain();
  silent.gain.value = 0;
  session = {stream, context, source, processor, tabId: message.tabId, chunks: [], count: 0, busy: 0, results: new Map(), sequence: 0, next: 0, until: 0, playing: new Set()};
  current = session;
  processor.onaudioprocess = event => {
    if (session !== current) return;
    const input = new Float32Array(event.inputBuffer.getChannelData(0));
    session.chunks.push(input); session.count += input.length;
    event.outputBuffer.getChannelData(0).fill(0);
    if (session.count < context.sampleRate * 6) return;
    const samples = new Float32Array(session.count); let offset = 0;
    for (const chunk of session.chunks) { samples.set(chunk, offset); offset += chunk.length; }
    session.chunks = []; session.count = 0;
    process(session, samples);
  };
  source.connect(processor); processor.connect(silent); silent.connect(context.destination);
  stream.getTracks().forEach(t => t.addEventListener('ended', () => { if (current === session) stop(); }));
  await context.resume();
  if (epoch !== captureEpoch || current !== session) throw Error('Audio capture cancelled.');
  await chrome.runtime.sendMessage({type: 'pf-guard-state', tabId: message.tabId, active: true});
  if (epoch !== captureEpoch || current !== session) throw Error('Audio capture cancelled.');
  return {ok: true, message: 'Audio guard active. Play your video; sound is delayed while checked.'};
  } catch (error) {
    if (session && current === session) await stop();
    else if (!session) {
      stream?.getTracks().forEach(track => track.stop());
      await context?.close();
    }
    throw error;
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.target !== 'offscreen') return;
  if (sender.url && !sender.url.startsWith(chrome.runtime.getURL(''))) return;
  if (!['start', 'stop', 'stop-if-tab'].includes(message.type)) return;
  const action = message.type === 'start' ? start(message) : (message.type === 'stop-if-tab' && current?.tabId !== message.tabId) ? Promise.resolve({ok: true}) : stop().then(() => ({ok: true, message: 'Audio guard stopped.'}));
  action.then(respond, () => respond({ok: false, error: 'Could not capture tab audio.'}));
  return true;
});
