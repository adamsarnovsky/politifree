(() => {
  'use strict';
  const normalize = text => String(text).normalize('NFKC').replace(/\s+/g, ' ').trim();
  function validate(pack) {
    if (!pack || pack.schema !== 1 || !Number.isSafeInteger(pack.revision) || pack.revision < 1 ||
        !Array.isArray(pack.rules) || pack.rules.length > 500 || JSON.stringify(pack).length > 250000) throw Error('Invalid filter pack');
    const ids = new Set(), matches = new Set();
    for (const rule of pack.rules) {
      if (!rule || !/^[a-z0-9-]{1,80}$/.test(rule.id) || ids.has(rule.id) ||
          !['block','allow'].includes(rule.action) || !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(rule.host) ||
          typeof rule.text !== 'string' || normalize(rule.text) !== rule.text || rule.text.length < 20 || rule.text.length > 1000 ||
          typeof rule.reason !== 'string' || rule.reason.length < 5 || rule.reason.length > 300) throw Error('Invalid filter rule');
      const key = rule.host + '\n' + rule.text;
      if (matches.has(key)) throw Error('Conflicting filter rules');
      ids.add(rule.id); matches.add(key);
    }
    return pack;
  }
  function match(pack, host, text, hasMedia) {
    if (!pack) return null;
    const value = normalize(text);
    const rule = pack.rules.find(r => r.host === host && r.text === value && (r.action !== 'allow' || !hasMedia));
    return rule ? {political:rule.action === 'block', communityAllow:rule.action === 'allow', score:1, reason:'community:' + rule.id} : null;
  }
  // Only signatures of the exact serialized payload are accepted. Remote data
  // never provides selectors, regular expressions, executable code or URLs to fetch.
  async function verify(envelope, publicKey) {
    if (!envelope || typeof envelope.payload !== 'string' || envelope.payload.length > 250000 ||
        typeof envelope.signature !== 'string' || envelope.signature.length > 200) throw Error('Invalid signed envelope');
    const key = await crypto.subtle.importKey('jwk', publicKey, {name:'ECDSA',namedCurve:'P-256'}, false, ['verify']);
    const signature = Uint8Array.from(atob(envelope.signature), c => c.charCodeAt(0));
    if (!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'}, key, signature, new TextEncoder().encode(envelope.payload))) throw Error('Filter signature rejected');
    return validate(JSON.parse(envelope.payload));
  }
  globalThis.PolitifreeCommunity = {normalize, validate, match, verify};
})();
