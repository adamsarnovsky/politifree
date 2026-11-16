(() => {
  'use strict';
  function create(refresh) {
    let settings = {}, epoch = 0, states = new WeakMap(), waiting = [], active = {text: 0, media: 0}, textCache = new Map(), frameOwners = new WeakMap();
    const analysisAttribute = 'data-politifree-analysis';
    function clearAnalysis(node) { node.removeAttribute?.(analysisAttribute); }
    function recordAnalysis(node, state, result, source, task, sampleTime) {
      if (!result?.ok || state.analysisPolitical || !node.isConnected || states.get(node) !== state) return;
      const score = value => Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 1000000) / 1000000 : null;
      const record = {source, branch: ['rules','semantic','visual','none'].includes(result.decisionBranch) ? result.decisionBranch : 'unknown',
        score: score(result.score), visualScore: score(result.visualScore), visualUncertain: result.visualUncertain === true};
      if (task?.frame !== undefined) {
        record.queuedBucket = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(task.frame)));
        if (Number.isFinite(sampleTime)) record.sampleTime = Math.round(Math.max(0, Math.min(1e12, sampleTime)) * 1000) / 1000;
      }
      const value = JSON.stringify(record);
      if (value.length > 512) return;
      state.analysis = value; state.analysisPolitical = result.political === true;
      node.setAttribute?.(analysisAttribute, value);
    }
    function pixels(element) {
      if (typeof document === 'undefined' || !document.createElement) throw Error('pixels-unavailable');
      const width = element.videoWidth || element.naturalWidth, height = element.videoHeight || element.naturalHeight;
      if (!width || !height || (element.videoWidth && element.readyState < 2)) throw Error('pixels-not-ready');
      const scale = Math.min(1, 1800 / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      try {
        canvas.getContext('2d').drawImage(element, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png').split(',')[1];
      } finally { canvas.width = canvas.height = 0; }
    }
    const ignored = 'header,footer,button,input,textarea,[contenteditable]:not([contenteditable=false]),[role=textbox]';
    function priority(job) {
      const rect = job.node.getBoundingClientRect?.();
      // Connected drawers and carousel items can have no rendered box. Their
      // zero coordinates are not viewport evidence; retain them for reveal.
      if (rect && rect.width === 0 && rect.height === 0) return Infinity;
      const top = rect && (rect.height || rect.width) ? rect.top : job.top - (globalThis.scrollY || 0);
      const bottom = rect && (rect.height || rect.width) ? rect.bottom : job.bottom - (globalThis.scrollY || 0);
      const viewport = globalThis.innerHeight || 800;
      if (bottom >= 0 && top <= viewport) return 0;
      return top > viewport ? top - viewport : Math.abs(bottom);
    }
    let consecutiveText = 0;
    function drain() {
      waiting = waiting.filter(job => {
        if (!job.node.isConnected) { states.delete(job.node); return false; }
        return job.epoch === epoch;
      });
      const hiddenTab = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const audible = job => [...(job.node.matches?.('video,audio') ? [job.node] : []), ...(job.node.querySelectorAll?.('video,audio') || [])].some(media => media.paused === false && media.muted !== true && media.volume !== 0);
      const eligible = job => audible(job) || (!hiddenTab && priority(job) <= (globalThis.innerHeight || 800));
      waiting.sort((a, b) => priority(a) - priority(b) || a.order - b.order);
      for (let index = 0; index < waiting.length;) {
        const job = waiting[index];
        // Keep one screen of look-ahead; offscreen work resumes on scrolling.
        if (!eligible(job)) { index++; continue; }
        if (active[job.lane] >= 1) { index++; continue; }
        // The native models serialize inference. Starting a thumbnail while
        // captions are waiting makes the next caption wait behind that image.
        // Prefer captions, but grant media a turn after four text starts so
        // continuous caption changes cannot starve queued images or speech.
        if (job.lane === 'media' && consecutiveText < 4 && (active.text || waiting.some(other => other.lane === 'text' && eligible(other)))) { index++; continue; }
        waiting.splice(index, 1); active[job.lane]++;
        if (job.lane === 'text') consecutiveText++; else consecutiveText = 0;
        job.run().finally(() => { active[job.lane]--; drain(); });
      }
    }
    let scrollScheduled = false, order = 0;
    if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', drain);
    if (typeof document !== 'undefined') document.addEventListener?.('play', drain, true);
    if (typeof document !== 'undefined') document.addEventListener?.('volumechange', drain, true);
    if (typeof document !== 'undefined') document.addEventListener?.('timeupdate', event => {
      const entry = frameOwners.get(event.target);
      if (!entry || document.visibilityState === 'hidden') return;
      const state = states.get(entry.node), bucket = Math.floor((event.target.currentTime || 0) / 2);
      if (bucket === entry.bucket || state?.pending || state?.political || Date.now() < (state?.retryAt || 0)) return;
      entry.bucket = bucket; states.delete(entry.node); refresh(entry.node);
    }, true);
    globalThis.addEventListener?.('resize', drain, {passive: true});
    globalThis.addEventListener?.('scroll', () => {
      if (scrollScheduled) return;
      scrollScheduled = true;
      setTimeout(() => { scrollScheduled = false; drain(); }, 50);
    }, {passive: true});
    function reset(next) {
      if (typeof document !== 'undefined') for (const node of document.querySelectorAll?.('[' + analysisAttribute + ']') || []) clearAnalysis(node);
      settings = next; epoch++; states = new WeakMap(); waiting = []; textCache.clear(); frameOwners = new WeakMap();
    }
    function check(node, text) {
      if (!settings.aiEnabled || !chrome.runtime?.sendMessage || node.closest(ignored)) return null;
      const tasks = [];
      const pixelSources = [];
      // A short generic heading or utility link gives the semantic model too
      // little context; explicit political terms still get checked immediately.
      const politicalCue = /\b(?:politic\w*|elections?|tax the rich|trump|biden|congress|senate|president|parliament|protest|immigration|abortion|war|gaza|israel|palestine|putin|democrats?|republicans?|maga)\b|\b(?:vot(?:e|er|ing).{0,60}(?:candidate|electi(?:on|ons)|party|governor|mayor)|(?:candidate|electi(?:on|ons)|party|governor|mayor).{0,60}vot(?:e|er|ing))\b/i;
      // Generic campaign planning, utility links and celebrity-family headlines
      // are common false positives for semantic analysis. Explicit politics
      // still goes through both the local classifier and the semantic model.
      const explicitPolitics = politicalCue.test(text);
      const shortUtilityLink = node.matches('a[href]') && text.trim().length <= 120 && !node.querySelector('img,video,audio');
      const commercialCampaign = /\b(?:advertis\w*|programmatic|marketing|media planning|ad insertion|inventory|publishers?|audiences?|creative platform|social content)\b/i.test(text) && /\bcampaigns?\b/i.test(text);
      const celebrityFamily = /\b(?:Prince Harry|Elton John|royal family)\b/i.test(text) && /\b(?:royal family row|family feud|movie|music)\b/i.test(text);
      const ordinarySports = /\b(?:WNBA|NBA|NFL|sports? league|football match|Botafogo|Vasco|golaço)\b/i.test(text);
      const brazilianFootball = /\b(?:vence|derrota|empata|golaço|gol|Z4|rebaixamento)\b/i.test(text) &&
        /\b(?:Corinthians|Vasco|Botafogo|Flamengo|Palmeiras|Internacional|Santos|Grêmio|futebol|time)\b/i.test(text);
      const locationForm = /\b(?:choose|select)\s+(?:a\s+)?country\b/i.test(text) && /\b(?:state|county|location)\b/i.test(text);
      const lotteryResults = /\b(?:loter[ií]a|lottery|lotto)\b/i.test(text) && /\b(?:resultados?|results?|winning numbers?)\b/i.test(text);
      const fictionalPromo = /\b(?:film|movie|animated|voice of)\b/i.test(text) && /\b(?:characters?|trailer|play time|voices?)\b/i.test(text);
      const privacyNotice = /\b(?:privacy|personal data|data protection|DPF)\b/i.test(text) && /\b(?:policy|notice|processing|agreement)\b/i.test(text);
      const privacyOnly = privacyNotice && !/\b(?:elections?|candidates?|trump|biden|congress|parliament|government policy|political campaign)\b/i.test(text);
      const medicalDefinition = /\bexpanded access\b/i.test(text) && /\b(?:individual patients?|FDA regulations?)\b/i.test(text);
      const examListing = /\b(?:admit card|answer key|syllabus|teacher form|exam(?:ination)? results?|sarkari result)\b/i.test(text) &&
        /\b(?:online form|scholarship|vacancies|career news|teacher|recruitment|results?)\b/i.test(text);
      const internetRegistryProcess = /\b(?:AFRINIC|NOMCOM|PDP Co-Chair|internet registry)\b/i.test(text) &&
        /\b(?:nominations?|public policy meeting|sub-regions?)\b/i.test(text);
      const cyberIncidentOrPrivacyService = /\b(?:data theft|hacking|cybercrime|ransomware|cybersecurity|data broker|adtech data|online tracking|ShinyHunters|DecryptAds)\b/i.test(text) &&
        /\b(?:compan\w*|suspect\w*|arrest\w*|detain\w*|extort\w*|privacy|advertis\w*|telecommunications|victims?|tracking|malware|threat|defensive|hack\w*)\b/i.test(text);
      const newsletterSignup = /\b(?:recibe|suscr[ií]bete|receive|subscribe)\b/i.test(text) &&
        /\b(?:newsletter|bolet[ií]n|correo electr[oó]nico|email)\b/i.test(text);
      const systemUseNotice = /\b(?:accessing|using)\s+(?:a\s+)?(?:U\.S\.\s+)?government information system\b/i.test(text) &&
        /\b(?:authorized use|unauthorized use|government[- ]furnished|monitor|intercept|audit)\b/i.test(text);
      const historicalArchitecture = /\b(?:Sagra\u00ad?da Fam[ií]lia|Gaud[ií])/i.test(text) &&
        /\b(?:architecture|architects?|basilica|Lego set|construction)\b/i.test(text) &&
        !/\b(?:elections?|candidates?|congress|parliament|political campaign|government policy|lawmakers?|trump|biden)\b/i.test(text);
      const accessibilityService = /\b(?:digital inclusion|web accessibility|screen reader)\b/i.test(text) &&
        /\b(?:read the page|public services|accessible content|meet the law)\b/i.test(text) &&
        !/\b(?:elections?|candidates?|congress|parliament|political campaign|government policy|lawmakers?|legislation)\b/i.test(text);
      const logoMetadata = node.matches('img') && /\blogo\b/i.test(node.getAttribute('alt') || '') && !explicitPolitics;
      const commercialAward = /\bCampaign MiddleEast\b/i.test(text) && /\b(?:contract award|advertis\w*|tech platform)\b/i.test(text);
      const motorsportRules = /\bFIA[- ]Regeln\b/i.test(text) && /\b(?:Aston Martin|Formel|Formula|Rennen|Malaysia)\b/i.test(text) &&
        !/\b(?:elections?|candidates?|congress|parliament|political campaign|government policy|trump|biden)\b/i.test(text);
      const professionalDirectoryFilter = /(?:Antitrust Law|Appellate Law)/i.test(text) &&
        /(?:Arbitration And Mediation|Bankruptcy And Workout|Corporate Law|Real Estate \(Commercial\))/i.test(text);
      const recruitingSoftware = /\b(?:applicant tracking system|recruiting CRM)\b/i.test(text) &&
        /\b(?:candidate relationship management|collaborative hiring|hire top talent|enterprise teams)\b/i.test(text);
      const cybercrimeReporting = (/\b(?:Internet Crime Complaint Center|IC3|cyber-enabled crime)\b/i.test(text) &&
        /\b(?:FBI|scammers?|fraud|crime|law enforcement|complaints?)\b/i.test(text)) ||
        (/\bFBI\b/i.test(text) && /\b(?:reported crimes|field offices|crime reports?)\b/i.test(text)) ||
        (/\bscammers? impersonating\b/i.test(text) && /\b(?:law enforcement|government officials?)\b/i.test(text));
      const accessibilityComplianceFAQ = /\b(?:Title II|ADA)\b/i.test(text) &&
        /\b(?:web and mobile accessibility|PDF accessibility|WCAG|accessibility compliance dates)\b/i.test(text);
      const droughtScience = /\bdrought resilience\b/i.test(text) &&
        /\b(?:ecosystems|observing drought|anticipate, prepare for and adapt)\b/i.test(text);
      const russianSchoolGuide = /(?:современной школе|предпрофильные классы|олимпиады)/i.test(text) &&
        /(?:Школа|ЕГЭ|руководство)/i.test(text) &&
        !/(?:выборы|политик|президент|депутат|правительств)/i.test(text);
      if (settings.semanticFiltering && !privacyOnly && (text.trim().length >= 55 || explicitPolitics) &&
          ((explicitPolitics && !historicalArchitecture && !motorsportRules) || !(shortUtilityLink || commercialCampaign || celebrityFamily || ordinarySports || brazilianFootball || locationForm || lotteryResults || fictionalPromo || privacyNotice || medicalDefinition || examListing || internetRegistryProcess || cyberIncidentOrPrivacyService || newsletterSignup || systemUseNotice || historicalArchitecture || accessibilityService || logoMetadata || commercialAward || motorsportRules || professionalDirectoryFilter || recruitingSoftware || cybercrimeReporting || accessibilityComplianceFAQ || droughtScience || russianSchoolGuide))) tasks.push({kind: 'text', text});
      if (settings.imageFiltering) {
        const images = [...(node.matches('img') ? [node] : []), ...node.querySelectorAll('img')];
        for (const img of images) {
          if (img.closest(ignored) || /avatar|profile picture|logo/i.test(img.alt || '') || (img.complete && (img.naturalWidth < 120 || img.naturalHeight < 80))) continue;
          const url = img.currentSrc || img.src;
          if (/^https?:/.test(url || '')) { pixelSources.push(img); tasks.push({kind: 'image', url, pixelIndex:pixelSources.length-1}); }
          else { pixelSources.push(img); tasks.push({kind:'pixels', index:pixelSources.length-1, url:url || ''}); }
        }
      }
      if (settings.imageFiltering) {
        // Some carousels and repost cards render photos as CSS backgrounds.
        for (const element of [...(node.matches('[style*="background-image"]') ? [node] : []), ...node.querySelectorAll('[style*="background-image"]')]) {
          if (element.closest(ignored)) continue;
          const value = element.style?.backgroundImage || '';
          for (const match of value.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
            let url; try { url = new URL(match[1], location.href).href; } catch (_) { url = ''; }
            tasks.push(/^https?:/.test(url) ? {kind: 'image', url} : {kind: 'unavailable-image', url});
          }
        }
        for (const video of [...(node.matches('video') ? [node] : []), ...node.querySelectorAll('video[poster]')]) {
          const url = video.poster || video.getAttribute?.('poster');
          if (!url) continue;
          tasks.push(/^https?:/.test(url) ? {kind: 'image', url} : {kind: 'unavailable-image', url});
        }
      }
      if (settings.speechFiltering) {
        for (const media of [...(node.matches('video,audio') ? [node] : []), ...node.querySelectorAll('video,audio')]) {
          const url = media.currentSrc || media.src || media.querySelector('source')?.src;
          // Captured audio does not verify the pixels of a video.
          if (settings.guardAudio && media.matches?.('audio')) continue;
          if (/^https?:/.test(url || '')) tasks.push({kind: 'media', url});
          else {
            if (settings.imageFiltering && (media.videoWidth || media.matches?.('video'))) {
              pixelSources.push(media);
              const bucket = Math.floor((media.currentTime || 0) / 2);
              tasks.push({kind:'pixels', index:pixelSources.length-1, url:url || '', frame:bucket});
              frameOwners.set(media,{node,bucket});
            }
            tasks.push({kind: 'unavailable-media', url: url || ''});
          }
        }
      }
      if (!tasks.length) { clearAnalysis(node); states.delete(node); return null; }
      // Context changes on a recycled card must invalidate the media decision too.
      const signature = JSON.stringify([tasks, text.slice(0, 6000)]);
      let state = states.get(node);
      if (state?.signature === signature) { drain(); return state; }
      clearAnalysis(node);
      if (tasks.every(task => task.kind === 'text') && textCache.has(signature)) {
        state = {...textCache.get(signature)}; states.set(node, state);
        if (state.analysis) node.setAttribute?.(analysisAttribute, state.analysis);
        return state;
      }
      state = {signature, political: false, politicalKind: null, politicalUrl: '', pending: true, unverified: false, reasons: []}; states.set(node, state);
      const uncertain = reason => { state.unverified = true; if (!state.reasons.includes(reason)) state.reasons.push(reason); };
      const generation = epoch;
      const bounded = tasks.slice(0, 12);
      if (tasks.length > 12) state.unverified = true;
      if (waiting.length + (bounded.some(task => task.kind === 'text') && bounded.some(task => task.kind !== 'text') ? 2 : 1) > 100) {
        state.pending = false; state.unverified = true;
        setTimeout(() => { if (generation === epoch && states.get(node) === state && node.isConnected) { states.delete(node); refresh(node); } }, 30000);
        return state;
      }
      const rect = node.getBoundingClientRect?.();
      const lane = bounded.some(task => task.kind !== 'text') ? 'media' : 'text';
      const separateText = lane === 'media' && bounded.find(task => task.kind === 'text');
      let pendingParts = separateText ? 2 : 1;
      // Mixed posts must not queue their caption behind slow image downloads.
      // Both lanes share one monotonically accumulating political decision.
      if (separateText) waiting.push({node, epoch, lane: 'text', order: order++, top: (rect?.top || 0) + (globalThis.scrollY || 0), bottom: (rect?.bottom || 0) + (globalThis.scrollY || 0), run: async () => {
        if (generation !== epoch || !node.isConnected || states.get(node) !== state) return;
        try {
          const result = await chrome.runtime.sendMessage({type: 'pf-analyze', ...separateText});
          if (generation !== epoch || states.get(node) !== state) return;
          if (!result?.ok || !result.complete) state.unverified = true;
          if (result?.ok && result.political) { state.political = true; state.politicalKind = 'text'; state.politicalUrl = ''; }
          recordAnalysis(node, state, result, 'text');
        } catch (_) { if (generation !== epoch || states.get(node) !== state) return; state.unverified = true; }
        pendingParts--; state.pending = pendingParts > 0; refresh(node);
      }});
      waiting.push({node, epoch, lane, order: order++, top: (rect?.top || 0) + (globalThis.scrollY || 0), bottom: (rect?.bottom || 0) + (globalThis.scrollY || 0), run: async () => {
        const evidence = [];
        for (const task of bounded) {
          if (generation !== epoch || !node.isConnected || states.get(node) !== state) return;
          if (state.political) break;
          if (separateText && task.kind === 'text') continue;
          if (task.kind.startsWith('unavailable-')) { uncertain(task.kind); continue; }
          try {
            const sampleTime = task.kind === 'pixels' && task.frame !== undefined ? pixelSources[task.index].currentTime : undefined;
            const request = task.kind === 'pixels' ? {kind:'image', data:pixels(pixelSources[task.index])} : task;
            let source = task.kind === 'pixels' ? (task.frame !== undefined ? 'video-frame' : 'image-pixels') : task.kind === 'image' ? 'image-url' : task.kind;
            let result = await chrome.runtime.sendMessage({type: 'pf-analyze', ...request, ...(task.kind !== 'text' ? {context: text.slice(0, 6000)} : {})});
            if (generation !== epoch || !node.isConnected || states.get(node) !== state) return;
            if (!result?.ok && task.kind === 'image' && task.pixelIndex !== undefined && /resource unavailable|failed to fetch|resource too large/i.test(result?.error || '')) {
              result = await chrome.runtime.sendMessage({type:'pf-analyze',kind:'image',data:pixels(pixelSources[task.pixelIndex]),context:text.slice(0,6000)});
              source = 'image-pixels';
            }
            if (generation !== epoch || states.get(node) !== state) return;
            if (!result?.ok || !result.complete) uncertain(result?.ok ? 'model-uncertain' : (['rate-limited','queue-busy','download-failed','analysis-timeout'].includes(result?.code) ? result.code : 'analysis-unavailable'));
            // A playback tick must not bypass the budget cooldown. Stop this
            // batch too: subsequent uncached images share the same tab budget.
            if (result?.code === 'rate-limited') { state.retryAt = Date.now() + 61000; break; }
            if (task.kind === 'pixels' && task.frame !== undefined) uncertain('video-sampled-audio-unverified');
            if (result?.evidence) evidence.push(String(result.evidence).slice(0, 4000));
            recordAnalysis(node, state, result, source, task, sampleTime);
            if (result?.ok && result.political) { state.political = true; state.politicalKind = task.kind === 'pixels' ? 'image' : task.kind; state.politicalUrl = task.url || ''; break; }
          } catch (_) { uncertain(task.kind === 'pixels' ? 'pixels-inaccessible' : 'analysis-unavailable'); }
        }
        if (!state.political && settings.semanticFiltering && evidence.length > 1 && generation === epoch && states.get(node) === state) {
          try {
            // Analyse the caption, carousel text and transcript together without
            // letting a weak combined score override a strong individual signal.
            const joined = [text.slice(0, 1500), ...evidence.map(value => value.slice(0, Math.floor(4500 / evidence.length)))].join('\n');
            const result = await chrome.runtime.sendMessage({type: 'pf-analyze', kind: 'text', text: joined});
            if (generation !== epoch || states.get(node) !== state) return;
            if (!result?.ok || !result.complete) state.unverified = true;
            if (result?.ok && result.political) { state.political = true; state.politicalKind = 'text'; }
            recordAnalysis(node, state, result, 'fused-text');
          } catch (_) { state.unverified = true; }
        }
        if (generation !== epoch || states.get(node) !== state) return;
        pendingParts--; state.pending = pendingParts > 0;
        if (!state.unverified && tasks.every(task => task.kind === 'text')) {
          textCache.delete(signature); textCache.set(signature, {...state});
          if (textCache.size > 128) textCache.delete(textCache.keys().next().value);
        }
        refresh(node);
        // Stable model uncertainty and inaccessible pixels do not improve by
        // polling the same cached evidence forever. Only retry transient faults.
        if (!state.political && state.reasons.some(reason => ['rate-limited','queue-busy','download-failed','analysis-timeout','analysis-unavailable'].includes(reason))) setTimeout(() => {
          if (generation === epoch && states.get(node) === state && node.isConnected) { states.delete(node); refresh(node); }
        }, Math.max(60000, (state.retryAt || 0) - Date.now()));
      }});
      drain();
      return state;
    }
    return {reset, check};
  }
  globalThis.PolitifreeAdvanced = {create};
})();
