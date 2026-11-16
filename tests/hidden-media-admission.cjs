'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const tick = () => new Promise(resolve => setImmediate(resolve));
const source = fs.readFileSync('outputs/Politifree-Chrome/advanced.js', 'utf8');

function fixture() {
  const sent = [], events = {}, timers = [];
  const context = vm.createContext({innerHeight:800, scrollY:0,
    setTimeout: callback => timers.push(callback),
    addEventListener: (name, callback) => { events[name] = callback; },
    document: {visibilityState:'visible', addEventListener: (name, callback) => { events[name] = callback; }},
    chrome: {runtime: {sendMessage: async message => {
      sent.push(message); return {ok:true, complete:true, political:false};
    }}}
  });
  vm.runInContext(source, context);
  const advanced = context.PolitifreeAdvanced.create(() => {});
  advanced.reset({aiEnabled:true, semanticFiltering:false, imageFiltering:true, speechFiltering:false});
  function card(name, rect, audible = false) {
    const image = {closest:() => null, complete:true, naturalWidth:300, naturalHeight:200, src:'https://example.com/' + name};
    return {isConnected:true, rect, closest:() => null, matches:() => false,
      getBoundingClientRect() { return this.rect; },
      querySelectorAll: selector => selector === 'img' ? [image] : selector === 'video,audio' && audible ? [{paused:false, muted:false, volume:1}] : []};
  }
  return {advanced, sent, events, timers, card};
}

(async () => {
  const zero = {top:0, bottom:0, width:0, height:0};
  const visible = {top:100, bottom:300, width:300, height:200};
  const f = fixture();
  // Connected hidden notification trays must not spend image inference quota.
  const hidden = f.card('hidden-notification', zero);
  f.advanced.check(hidden, ''); await tick();
  assert.equal(f.sent.length, 0);
  // A render/owner refresh with identical evidence must reconsider admission.
  hidden.rect = visible; f.advanced.check(hidden, ''); await tick();
  assert.equal(f.sent.length, 1);
  f.advanced.check(hidden, ''); await tick();
  assert.equal(f.sent.length, 1, 'completed evidence is not resubmitted');

  const audio = fixture();
  audio.advanced.check(audio.card('audible-hidden', zero, true), ''); await tick();
  assert.equal(audio.sent.length, 1, 'audible playing media bypasses rendered-box gate');

  const legacy = fixture();
  legacy.advanced.check(legacy.card('rect-without-dimensions', {top:100, bottom:300}), ''); await tick();
  assert.equal(legacy.sent.length, 1, 'unavailable dimensions preserve coordinate fallback');

  const scroll = fixture();
  const far = scroll.card('below-fold', {top:2400, bottom:2600, width:300, height:200});
  scroll.advanced.check(far, ''); await tick(); assert.equal(scroll.sent.length, 0);
  far.rect = visible; scroll.events.scroll(); scroll.timers.shift()(); await tick();
  assert.equal(scroll.sent.length, 1, 'legitimate offscreen media resumes on scroll');

  const reveal = fixture();
  const child = reveal.card('temporarily-hidden-child', zero);
  reveal.advanced.check(child, ''); await tick(); assert.equal(reveal.sent.length, 0);
  child.rect = visible; reveal.events.visibilitychange(); await tick();
  assert.equal(reveal.sent.length, 1, 'a revealed child remains queued and can resume');
  console.log('PASS hidden rendered boxes defer inference; unchanged-state reveal, audible bypass, scroll and reveal resume');
})().catch(error => { console.error(error); process.exitCode = 1; });
