(() => {
  'use strict';
  async function check(status) {
    status.textContent = 'Checking local companion…';
    try {
      const result = await chrome.runtime.sendMessage({type: 'pf-health'});
      if (!result?.ok) { status.textContent = (result?.error || 'Companion offline.') + ' Run the Politifree installer, then connect the pairing token in settings.'; return false; }
      if (result.protocol !== 2) { status.textContent = `Companion ${result.version || ''} is outdated. Install the current Politifree Companion and restart it.`; return false; }
      if (result.serviceAvailable && !result.ready) { status.textContent = 'Companion AI is stopped. Click Start to load local models; Stop unloads them and frees memory.'; return false; }
      const missing = Object.entries(result.components || {}).filter(([,ready]) => !ready).map(([name]) => name);
      status.textContent = result.ready && !missing.length
        ? 'Local AI ready: text, OCR, visual scenes and speech. Video frames checked every 2 seconds.'
        : 'Models unavailable: ' + (missing.join(', ') || 'unknown') + '. Restart the companion after setup.';
      return !!result.ready;
    } catch (_) { status.textContent = 'Companion service is offline. Run the Politifree installer, then connect the pairing token in settings.'; return false; }
  }
  globalThis.PolitifreeHealth = {check};
})();
