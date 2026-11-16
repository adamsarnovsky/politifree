(() => {
  'use strict';
  const defaults = { communityPack: null, enabled: true, strictness: 'precise', aiEnabled: true, semanticFiltering: true, imageFiltering: true, visualFiltering: true, speechFiltering: true, holdUnverified: false, blockedDomains: ['democrats.org', 'gop.com', 'rnc.org', 'dnc.org', 'actblue.com', 'winred.com', 'politico.com', 'thehill.com', 'thegatewaypundit.com', 'novaramedia.com', 'thegrayzone.com', 'occupydemocrats.com', 'antiwar.com', 'thecanary.co', 'consortiumnews.com'], allowedDomains: [] };
  const unitSelector = '.reel-video-in-sequence-new,.reel-video-in-sequence,.html5-video-player,[aria-label*="video player" i],rum-video-thumbnail,rum-video-thumbnail-sidebar,ytd-reel-video-renderer,[data-testid=feedItem],[data-testid^=feedItem-by-],[data-e2e=video-detail],[data-test-id=pin],[data-testid=UserCell],[data-testid=UserDescription],[data-testid=post-card],.s-post-summary,.postContainer,article,[role=article],li,[role=listitem],tr.athing,[data-testid=tweet],[data-pagelet*=FeedUnit],.feed-shared-update-v2,.post,.card,shreddit-post,shreddit-comment,ytd-rich-item-renderer,ytd-playlist-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,ytd-backstage-post-thread-renderer,ytd-comment-thread-renderer,ytd-comment-view-model,yt-lockup-view-model,ytm-shorts-lockup-view-model,yt-shorts-lockup-view-model,ytd-reel-item-renderer,[data-e2e*=recommend-list-item],[data-e2e*=video-feed-item],[data-testid$="-card"],[class*="DivItemContainerV2"]';
  const redditUnitSelector = 'shreddit-post,shreddit-ad-post,community-highlight-card';
  const candidateSelector = unitSelector + ',' + redditUnitSelector + ',.dd-widget-question-container[data-category],a[href],a[href*="/p/"],a[href*="/post/"],.ytp-caption-segment,.caption-window,p,blockquote,h1,h2,h3,img,video,audio,iframe[title],iframe[src*="youtube.com/embed/"],iframe[src*="youtube-nocookie.com/embed/"],iframe[src*="player.vimeo.com/"],[data-ad-preview=message],[data-ad-rendering-role="story_message"],[aria-label^="Actions for this post"]';
  const commentSelector = 'shreddit-comment,ytd-comment-thread-renderer,ytd-comment-view-model,[aria-label^="Comment by"]';
  const ignoredSelector = '#politifree-site-block,.politifree-placeholder,script,style,noscript,button,input,textarea,[contenteditable]:not([contenteditable=false]),[role=textbox],[id^="follow-category-breadcrumb"]';
  const host = location.hostname.toLowerCase().replace(/^www\./, '');
  function rumbleVideoPath(link) {
    try {
      const target = new URL(link.href || link.getAttribute('href') || '', location.href);
      const path = target.pathname.replace(/^\/shorts(?=\/v[0-9a-z])/i, '');
      return target.hostname.toLowerCase().replace(/^www\./, '') === 'rumble.com' && /^\/v[0-9a-z]/i.test(path) ? path : '';
    } catch { return ''; }
  }
  function rumbleItemPath(link) {
    try {
      const target = new URL(link.href || link.getAttribute('href') || '', location.href);
      return target.hostname.toLowerCase().replace(/^www\./, '') === 'rumble.com' && /^\/(?:c\/|v[0-9a-z])/i.test(target.pathname) ? target.pathname : '';
    } catch { return ''; }
  }
  const matchesDomain = domains => Array.isArray(domains) && domains.some(value => {
    const domain = String(value).trim().toLowerCase().replace(/^www\./, '');
    return domain && (host === domain || host.endsWith('.' + domain));
  });
  const politicsFocusedDomain = () => {
    // AB Charities shares ActBlue infrastructure but serves nonprofit tools.
    // An explicit secure.actblue.com block still takes precedence.
    if (host === 'secure.actblue.com' && /^\/abcharities(?:\/|$)/i.test(location.pathname) &&
        !(Array.isArray(settings.blockedDomains) && settings.blockedDomains.some(value => String(value).trim().toLowerCase() === 'secure.actblue.com'))) return false;
    return matchesDomain(settings.blockedDomains);
  };
  let settings = { ...defaults }, processed = new WeakMap(), guardAudio = false;
  const hidden = new Set(), altHidden = new WeakSet(), mediaSaved = new Map(), iframeSources = new Map();
  const backgroundImages = new WeakMap();
  let restored = new WeakMap();
  const collapsed = new Set(), compacted = new Set();
  const protectedLayout = 'html,body,main,nav,header,footer,aside,form,[role=main],[role=feed],[role=navigation],#politifree-site-block';

  function restoreLayout() {
    for (const node of collapsed) node.removeAttribute('data-politifree-collapsed');
    collapsed.clear();
    for (const node of compacted) node.removeAttribute('data-politifree-compact-grid');
    compacted.clear();
  }
  function hasVisibleContent(node) {
    if (node.nodeType === Node.TEXT_NODE) return !!node.textContent.trim();
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches('script,style,noscript,template,[data-politifree-hidden],[data-politifree-collapsed]')) return false;
    if (node.matches('img,video,audio,iframe,button,input,canvas,svg,[aria-label]')) return true;
    return [...node.childNodes].some(hasVisibleContent);
  }
  function tidyLayout() {
    restoreLayout();
    if (!settings.enabled || sitePanel || matchesDomain(settings.allowedDomains)) return;
    // Collapse empty shells, never move or delete framework-owned cards.
    for (const item of hidden) {
      if (item.hasAttribute('data-politifree-pending')) continue;
      for (let parent = item.parentElement, depth = 0; parent && depth < 6; parent = parent.parentElement, depth++) {
        if (parent.matches(protectedLayout) || parent.closest('[contenteditable]:not([contenteditable=false])')) break;
        const occupied = [...parent.childNodes].some(child => {
          if (child.nodeType === Node.TEXT_NODE) return !!child.textContent.trim();
          if (child.nodeType !== Node.ELEMENT_NODE || child.matches('script,style,noscript,template')) return false;
          return !child.matches('[data-politifree-hidden]:not([data-politifree-pending]),[data-politifree-collapsed]');
        });
        if (occupied) break;
        parent.setAttribute('data-politifree-collapsed', ''); collapsed.add(parent);
      }
    }
    // CNN lead packages keep empty ad/kicker shells after all stories disappear.
    // Preserve any remaining text, media or interactive content.
    for (const section of document.querySelectorAll('.container_lead-package')) {
      const cards = section.querySelector('.container_lead-package__cards-wrapper');
      if (!cards?.matches('[data-politifree-collapsed],[data-politifree-hidden]')) continue;
      const remaining = [...section.children].filter(child => !child.matches('[data-politifree-hidden],[data-politifree-collapsed]'));
      if (remaining.every(child => !hasVisibleContent(child))) {
        section.setAttribute('data-politifree-collapsed', ''); collapsed.add(section);
      }
    }
    // BBC story grids explicitly assign columns. Auto placement closes holes
    // only in grids whose direct children are all story-grid items.
    for (const grid of document.querySelectorAll('[class*="Grid-styles__GridStyled"]')) {
      const items = [...grid.children];
      if (items.length > 1 && items.every(item => item.matches('[class*="GridItem-styles__GridItemStyled"]')) && items.some(item => item.matches('[data-politifree-hidden],[data-politifree-collapsed]'))) {
        grid.setAttribute('data-politifree-compact-grid', ''); compacted.add(grid);
      }
    }
    // Native shelves carry headings/arrows outside their cards. Remove the shelf
    // only when every card was filtered; retain partially populated shelves.
    for (const shelf of document.querySelectorAll('ytd-shelf-renderer,ytd-rich-shelf-renderer,ytd-reel-shelf-renderer,grid-shelf-view-model')) {
      const cards = [...shelf.querySelectorAll('ytd-grid-video-renderer,ytd-playlist-renderer,ytd-video-renderer,ytd-rich-item-renderer,ytd-reel-item-renderer,yt-lockup-view-model,ytm-shorts-lockup-view-model,yt-shorts-lockup-view-model')];
      if (cards.length && cards.every(card => card.closest('[data-politifree-hidden]'))) {
        shelf.setAttribute('data-politifree-collapsed', ''); collapsed.add(shelf);
      }
    }
    // Reddit highlights have a separate heading and carousel controls. Collapse
    // the complete shelf only when every individual card has been filtered.
    for (const shelf of document.querySelectorAll('community-highlight-carousel')) {
      const cards = [...shelf.querySelectorAll('community-highlight-card')];
      if (cards.length && cards.every(card => card.closest('[data-politifree-hidden]'))) {
        shelf.setAttribute('data-politifree-collapsed', ''); collapsed.add(shelf);
      }
    }
    // Feed dividers are siblings of the post shells, not children of the posts.
    for (const divider of document.querySelectorAll('shreddit-feed > hr')) {
      const previous = divider.previousElementSibling;
      if (previous?.matches('[data-politifree-hidden],[data-politifree-collapsed]')) {
        divider.setAttribute('data-politifree-collapsed', ''); collapsed.add(divider);
      }
    }
  }
  const watchedMedia = new WeakSet(), watchedTracks = new WeakSet(), knownOwners = new WeakSet();
  const advanced = globalThis.PolitifreeAdvanced?.create(node => { processed.delete(node); queue(node); });
  const roots = new Set();
  let scheduled = false, sitePanel = null, continued = false, inertBody = null, priorInert = false;

  function mediaIn(node) {
    return [...(node.matches?.('video,audio') ? [node] : []), ...node.querySelectorAll('video,audio')];
  }
  function suppressMedia(media) {
    if (!mediaSaved.has(media)) mediaSaved.set(media, media.muted);
    try { media.muted = true; media.pause(); } catch (_) { /* Unloaded streams may reject controls. */ }
  }
  function restoreMedia() {
    for (const [media, muted] of mediaSaved) {
      if (!sitePanel && !media.closest('[data-politifree-hidden]')) {
        try { media.muted = muted; } catch (_) {}
        mediaSaved.delete(media);
      }
    }
    for (const [frame, source] of iframeSources) {
      if (!sitePanel && !frame.closest('[data-politifree-hidden]')) {
        frame.setAttribute('src', source); iframeSources.delete(frame);
      }
    }
  }
  function suppressFrames(node) {
    for (const frame of node.matches?.('iframe') ? [node] : node.querySelectorAll('iframe')) {
      const source = frame.getAttribute('src');
      if (source && source !== 'about:blank') { iframeSources.set(frame, source); frame.setAttribute('src', 'about:blank'); }
    }
  }
  function syncSiteBlock() {
    if (!sitePanel) return;
    if (document.body && inertBody !== document.body) {
      inertBody = document.body;
      priorInert = inertBody.hasAttribute('inert');
      inertBody.setAttribute('inert', '');
    }
    mediaIn(document).forEach(suppressMedia);
    suppressFrames(document);
  }
  function clearSiteBlock() {
    sitePanel?.remove(); sitePanel = null;
    if (inertBody && !priorInert) inertBody.removeAttribute('inert');
    inertBody = null; restoreMedia();
  }
  function installSiteBlock() {
    if (sitePanel || !document.documentElement) return;
    sitePanel = document.createElement('div');
    sitePanel.id = 'politifree-site-block';
    sitePanel.innerHTML = '<section><strong>Politifree</strong><p>This site is on your list of politics-focused websites.</p><button type="button">Continue to this site</button></section>';
    if (chrome.runtime?.getURL) {
      const logo = document.createElement('img');
      logo.src = chrome.runtime.getURL('logo.png'); logo.alt = 'Politifree';
      logo.className = 'politifree-brand-logo';
      sitePanel.querySelector('strong').replaceWith(logo);
    }
    sitePanel.querySelector('button').addEventListener('click', () => {
      continued = true; clearSiteBlock(); queue(document);
    });
    document.documentElement.append(sitePanel); syncSiteBlock();
  }
  function safeUnit(node) {
    if (/^(?:policy|privacy|legal)\./.test(host) && /\b(?:privacy|terms|notice|cookies|legal)\b/i.test(location.pathname)) return false;
    if (!node || node.matches('html,body,main,[role=main],form') || node.closest(ignoredSelector)) return false;
    if (host === 'facebook.com') {
      if (node.querySelector('main,[role=main],[role=banner]')) return false;
      if (node.querySelectorAll('[aria-label*="video player" i]').length > 1 &&
          !node.querySelector('[aria-label^="Actions for this post"]')) return false;
    }
    if (host === 'bsky.app' && node.matches('[data-testid^="feedItem-by-"]')) return true;
    const storyTileLink = node.matches('a[href]') ? node : node.matches('li') && node.querySelectorAll('a[href]').length === 1 ? node.querySelector('a[href]') : null;
    const menuStory = !!(storyTileLink?.querySelector('img') && (storyTileLink.innerText || '').trim().length >= 30);
    const navigation = node.closest('nav');
    if (navigation) {
      // A mega-menu can contain real news cards. Keep ordinary navigation
      // controls and grouped menus intact; inspect only independent story tiles.
      if (!menuStory) return false;
    }
    if (host === 'youtube.com' && node.matches('.reel-video-in-sequence-new,.reel-video-in-sequence') && node.querySelectorAll('ytd-reel-video-renderer').length === 1) return true;
    const inPost = !!node.closest('article,[role=article],[role=feed],shreddit-post,[data-testid=tweet]');
    // Some news sites wrap an entire headline rail in one <article>. Classify
    // each linked story separately so one political item cannot erase its
    // unrelated neighbors. Social post wrappers intentionally stay intact.
    if (node.matches('article,[role=article]') && !/^(?:(?:facebook|x|twitter|reddit|instagram|tiktok|linkedin)\.com|threads\.net|bsky\.app)$/.test(host)) {
      const storyLinks = [...node.querySelectorAll('a[href]')].filter(link => (link.innerText || '').trim().length >= 30);
      if (new Set(storyLinks.map(link => link.href)).size >= 2) return false;
    }
    if (node.matches('a,img') && node.closest('[aria-hidden="true"]')) return false;
    if (!inPost && node.matches('li[data-sonner-toast]') && node.querySelector('[class*="cookie" i]')) return false;
    if (!inPost && node.matches('p,li') && /\bcookies?\b/i.test(node.textContent || '') && /(?:privacy|confidentiality|политик|конфиденциальност)/i.test(node.textContent || '')) return false;
    if (!inPost && node.matches('p,li') && /\bopt[- ]out (?:form|election)\b/i.test(node.textContent || '') && /\b(?:email|third parties|advertising|sharing)\b/i.test(node.textContent || '')) return false;
    if (!inPost && node.closest('[class*="cookie-banner" i],[class*="cookie-consent" i],[id*="cookie-banner" i],[class*="CybotCookiebotDialog" i],.usa-banner,[class*="feedback" i],[data-testid="footer-dropdowns"],[data-mod-id*="languages"]')) return false;
    if (!inPost && node.closest('[class~="menu"]') && !menuStory) return false;
    if (!inPost && host.endsWith('gov.uk') && node.closest('[class*="gem-c-cards"],[class*="gem-c-heading"]')) return false;
    if (!inPost && node.matches('li') && node.querySelector('a[data-ga4-link*="navigation"]')) return false;
    if (!inPost && node.matches('li') && node.querySelectorAll('a[href]').length > 2) return false;
    // Utility controls and grouped navigation links are not feed content.
    // Treating them as posts can hide support buttons or a whole menu because
    // one link contains a political word.
    if (node.matches('a[href][class*="button"],a[href][role="button"],li[role="group"]') && !inPost) return false;
    // Facebook's standalone Reels player exposes its own accessible label but
    // is not an article/feed unit and has no "Actions for this post" menu.
    if (host === 'facebook.com' && node.matches('[aria-label*="video player" i]')) return true;
    // Pinterest pin tiles often wrap their text and image outside an article.
    if (node.matches('[data-test-id="pin"]')) return true;
    // X suggested-account cells are independent feed units, not whole rails.
    if (node.matches('[data-testid="UserCell"]')) return true;
    if (node.matches('[data-testid="UserDescription"]')) return true;
    if (node.matches(redditUnitSelector)) return true;
    if (node.matches('[data-testid="post-card"],.s-post-summary,.postContainer')) return true;
    // A news index article or feed wrapper is not an individual story.
    if (node.querySelectorAll('shreddit-post,[data-testid=tweet],.feed-shared-update-v2,[data-pagelet*=FeedUnit],[aria-label^="Actions for this post"]').length > 1) return false;
    if (node.matches('ytm-shorts-lockup-view-model,yt-shorts-lockup-view-model,ytd-reel-item-renderer,ytd-reel-video-renderer,[data-testid=feedItem],[data-testid^=feedItem-by-],[data-e2e=video-detail],shreddit-post,shreddit-comment,[data-testid=tweet],ytd-rich-item-renderer,ytd-playlist-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,yt-lockup-view-model,.feed-shared-update-v2')) return true;
    if (node.querySelectorAll('h1,h2,h3').length > 6 || node.querySelectorAll('article').length > 1) return false;
    const headlines = [...node.querySelectorAll('h1,h2,h3')].filter(h => h.closest('a[href]'));
    if (new Set(headlines.map(h => h.closest('a[href]').getAttribute('href'))).size > 1) return false;
    return true;
  }
  const {boundary} = PolitifreeAdapters.create({host, safeUnit, ignoredSelector, knownOwners, rumbleVideoPath, redditUnitSelector, commentSelector, unitSelector});
  function extractText(node, includeDescendantImageAlt = true) {
    const parts = [node.getAttribute('post-title'), node.getAttribute('title'), node.getAttribute('alt'), node.getAttribute('aria-label')].filter(Boolean);
    // Some feed frameworks keep the full post/caption in attributes while
    // rendering only a shortened preview. Read descriptive fields that belong
    // to this item, without sweeping arbitrary data attributes or comments.
    const descriptive = '[data-caption],[data-transcript],[data-description],[data-full-text],[data-e2e-caption],[aria-description]';
    const metadata = [...(node.matches(descriptive) ? [node] : []), ...node.querySelectorAll(descriptive)].slice(0, 30);
    let metadataLength = 0;
    for (const element of metadata) {
      if (metadataLength >= 3000) break;
      if (element.closest(ignoredSelector) || element.closest(commentSelector)) continue;
      for (const name of ['data-caption','data-transcript','data-description','data-full-text','data-e2e-caption','aria-description']) {
        const value = element.getAttribute(name);
        if (value && metadataLength < 3000) {
          const bounded = value.slice(0, 3000 - metadataLength);
          parts.push(bounded); metadataLength += bounded.length;
        }
      }
    }
    // Respect accessible descriptions attached to custom video/post widgets;
    // only follow explicit ID references and keep the lookup within the page.
    const described = [...(node.matches('video,audio,[aria-describedby]') ? [node] : []), ...node.querySelectorAll('video,audio,[aria-describedby]')];
    let descriptionLength = 0;
    for (const element of described.slice(0, 30)) {
      for (const id of (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).slice(0, 4)) {
        if (descriptionLength >= 3000) break;
        const label = document.getElementById(id);
        if (label && node.contains(label) && !label.closest(ignoredSelector) && !label.closest(commentSelector)) {
          const bounded = label.textContent.slice(0, 3000 - descriptionLength);
          parts.push(bounded); descriptionLength += bounded.length;
        }
      }
    }
    if (host === 'youtube.com') {
      for (const label of [...node.querySelectorAll('a[aria-label],a[title],h3[title]')].slice(0, 20)) {
        if (!label.closest(ignoredSelector)) parts.push(label.getAttribute('aria-label') || label.getAttribute('title'));
      }
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(item) {
        if (item.nodeType === Node.ELEMENT_NODE) {
          // A political author can also post ordinary personal content. Keep
          // profile names and timestamps out of the post's subject text.
          if (host === 'bsky.app' && node.matches('[data-testid^="feedItem-by-"]') && item.matches('a[href^="/profile/"]') && !item.closest('[data-testid="postText"]')) return NodeFilter.FILTER_REJECT;
          if (item.matches(ignoredSelector) || (item !== node && item.matches('nav,' + commentSelector))) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let item, length = parts.join(' ').length;
    while ((item = walker.nextNode()) && length < 7000) {
      const value = item.textContent.trim();
      if (value) { parts.push(value); length += value.length; }
    }
    if (includeDescendantImageAlt) for (const img of node.querySelectorAll('img[alt]')) if (!img.closest(commentSelector)) parts.push(img.alt);
    for (const media of mediaIn(node)) {
      parts.push(media.getAttribute('aria-label') || '', media.getAttribute('title') || '');
      // Dedicated players often keep the title outside the <video> element.
      if (node === media || node.matches('.html5-video-player')) {
        const player = media.closest('ytd-watch-flexy');
        if (player && media.closest('#movie_player')) parts.push(player.querySelector('#title h1,h1')?.textContent || '', player.querySelector('#description')?.textContent || '');
        else {
          const wrapper = media.parentElement;
          // A shared feed/page wrapper is not this video's caption. Require a
          // single-media container and reject labels owned by another card.
          if (wrapper && safeUnit(wrapper) && mediaIn(wrapper).length === 1) {
            const caption = [...wrapper.querySelectorAll('figcaption,h1,h2,h3,[class*=caption],[class*=subtitle]')]
              .find(label => { const owner = label.closest(unitSelector); return !owner || owner.contains(media); });
            parts.push(wrapper.getAttribute('aria-label') || '', caption?.textContent || '');
          }
        }
      }
      let captionLength = parts.join(' ').length;
      for (const track of Array.from(media.textTracks || [])) {
        if (captionLength >= 10000) break;
        for (const cue of Array.from(track.cues || track.activeCues || [])) {
          if (captionLength >= 10000) break;
          const text = String(cue.text || '').trim();
          if (!text) continue;
          const bounded = text.slice(0, 10000 - captionLength);
          parts.push(bounded); captionLength += bounded.length;
        }
      }
    }
    return [...new Set(parts)].join(' ').replace(/\s+/g, ' ').trim().slice(0, 10000);
  }
  function classification(node, text) {
    const community = globalThis.PolitifreeCommunity?.match(settings.communityPack,host,text,!!node.querySelector('img,video,audio,iframe') || node.matches('img,video,audio,iframe'));
    if (community) return community;
    if (node.matches('.dd-widget-question-container[data-category="Politics" i]'))
      return {political: true, score: 0.995, reason: 'ask-widget-politics-category'};
    // An unrelated post is not political merely because it links to a political
    // section or appears in a community with a political name.
    // X exposes suggestion cards with this stable test id on both x.com and
    // twitter.com; checking the card marker also keeps local DOM tests realistic.
    const isXRecommendation = node.matches('[data-testid="UserCell"]');
    const isXProfileBio = node.matches('[data-testid="UserDescription"]');
    const rumbleRecommendationLinks = host === 'rumble.com' ? [...(node.matches('a[href]') ? [node] : []), ...node.querySelectorAll('a[href]')].map(rumbleVideoPath).filter(Boolean) : [];
    const isRumbleRecommendation = rumbleRecommendationLinks.length > 0 && new Set(rumbleRecommendationLinks).size === 1;
    const isFacebookGroupRecommendation = node.querySelector('a[href*="/groups/"]') &&
      [...node.querySelectorAll('button,[role="button"]')].some(button => /join group/i.test(`${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`)) &&
      [...node.querySelectorAll('button,[role="button"]')].some(button => /remove suggested group/i.test(`${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`));
    const isRedditPromotion = node.matches('shreddit-ad-post,shreddit-post[post-type="promoted"],shreddit-post[promoted]');
    // Political prediction-market ads need an explicit high-confidence signal;
    // generic betting ads remain untouched.
    const isRedditElectionPromotion = isRedditPromotion &&
      /\b(?:presidential|midterm|primary|general|senate|congressional|gubernatorial)\s+(?:elections?|races?|odds|betting)\b|\b(?:election|candidate|campaign)\b.{0,40}\b(?:betting|odds|prediction market)\b/i.test(text);
    if (isRedditElectionPromotion) return {political: true, score: 0.995, reason: 'political-election-promotion'};
    const youtubeVideo = host === 'youtube.com' && node.matches('ytd-reel-item-renderer,ytd-reel-video-renderer,ytd-playlist-renderer,ytd-video-renderer,ytd-rich-item-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,yt-lockup-view-model,ytm-shorts-lockup-view-model,yt-shorts-lockup-view-model,.reel-video-in-sequence-new,.reel-video-in-sequence');
    const titleNode = youtubeVideo && node.querySelector('a[href*="/shorts/"][aria-label],a#video-title,h3,h2');
    const videoTitle = titleNode && (titleNode.getAttribute('title') || titleNode.getAttribute('aria-label') || titleNode.textContent);
    return globalThis.PolitifreeClassifier.classify(text, settings.strictness,
      youtubeVideo ? {platform: 'youtube', videoTitle} :
      isXRecommendation ? {platform: 'x', recommendation: true} :
      isXProfileBio ? {platform: 'x', profileBio: true} :
      isRumbleRecommendation ? {platform: 'rumble', recommendation: true} :
      isFacebookGroupRecommendation ? {platform: 'facebook', recommendation: true} : {});
  }
  function watchMedia(node) {
    for (const media of mediaIn(node)) {
      if (!watchedMedia.has(media)) {
        watchedMedia.add(media);
        media.addEventListener('play', () => {
          if (settings.enabled && !matchesDomain(settings.allowedDomains)) {
            const owner = boundary(media) || media;
            inspect(owner); // Check metadata synchronously before autoplay can continue.
            if (sitePanel || media.closest('[data-politifree-hidden]')) suppressMedia(media);
          }
        });
        media.textTracks?.addEventListener('addtrack', () => { watchMedia(node); queue(node); });
        media.addEventListener('loadedmetadata', () => { watchMedia(node); queue(node); });
        media.addEventListener('loadeddata', () => queue(node));
      }
      for (const track of Array.from(media.textTracks || [])) {
        if (watchedTracks.has(track)) continue;
        watchedTracks.add(track);
        track.addEventListener('cuechange', () => queue(node));
      }
    }
  }
  // A filtered Hacker News story has a separate metadata row and spacer.
  const relatedRows = new Map();
  function show(node) {
    node.removeAttribute('data-politifree-pending');
    for (const row of relatedRows.get(node) || []) row.removeAttribute('data-politifree-hidden');
    relatedRows.delete(node);
    if (!hidden.has(node)) return;
    node.removeAttribute('data-politifree-hidden');
    hidden.delete(node);
    restoreMedia();
  }
  function fingerprint(node) {
    const resources = [...(node.matches('img,video,audio,iframe,[style*="background-image"]') ? [node] : []), ...node.querySelectorAll('img,video,audio,source,iframe,[style*="background-image"]')].map(el => [el.currentSrc || '', el.getAttribute('src') || '', el.getAttribute('srcset') || '', el.getAttribute('poster') || '', el.style?.backgroundImage || '', el.naturalWidth || 0, el.naturalHeight || 0]);
    return JSON.stringify(resources) + '|' + ['id','subreddit-name','subreddit-prefixed-name','post-type','promoted','post-title'].map(name => node.getAttribute(name)).join('|') + '|' + extractText(node);
  }
  function hide(node, pending = false) {
    if (!node.isConnected || node.parentElement?.closest('[data-politifree-hidden]')) return;
    mediaIn(node).forEach(suppressMedia);
    // CSS cannot silence a cross-origin embedded player. Unload its document.
    suppressFrames(node);
    node.toggleAttribute('data-politifree-pending', pending);
    if (hidden.has(node)) return;
    // Keep the application's nodes connected; removing React-managed posts breaks feeds.
    for (const child of [...hidden.keys()]) if (node.contains(child)) show(child);
    hidden.add(node);
    node.setAttribute('data-politifree-hidden', '');
    if (node.matches('tr.athing')) {
      const rows = []; let row = node.nextElementSibling;
      while (row && rows.length < 2 && !row.matches('tr.athing') && (row.querySelector('.subtext') || row.matches('tr.spacer'))) { rows.push(row); row.setAttribute('data-politifree-hidden', ''); row = row.nextElementSibling; }
      relatedRows.set(node, rows);
    }
    mediaIn(node).forEach(suppressMedia);
  }
  function inspect(node) {
    if (!settings.enabled || sitePanel || matchesDomain(settings.allowedDomains)) return;
    if (!node.isConnected || !safeUnit(node)) { node.setAttribute('data-politifree-container', ''); if (hidden.has(node)) show(node); return; }
    node.removeAttribute('data-politifree-container');
    watchMedia(node);
    const visibleText = extractText(node, false);
    const text = visibleText.length >= 40 ? visibleText : extractText(node);
    const key = fingerprint(node);
    if (restored.get(node) === key) { show(node); node.setAttribute('data-politifree-reviewed', ''); return; }
    if (processed.get(node) === key) return;
    processed.set(node, key);
    const result = classification(node, text);
    node.setAttribute('data-politifree-reason',result.reason || 'local-classifier');
    if(result.communityAllow) { show(node); node.setAttribute('data-politifree-reviewed',''); return; }
    if (!result.political && text.length >= 40) for (const img of node.querySelectorAll('img[alt]')) {
      if (globalThis.PolitifreeClassifier.classify(img.alt, settings.strictness).political) {
        hide(img); altHidden.add(img);
      } else if (altHidden.has(img)) { show(img); altHidden.delete(img); }
    }
    const ai = !result.political ? advanced?.check(node, text) : null;
    if (ai?.political) node.setAttribute('data-politifree-reason','local-' + (ai.politicalKind || 'media') + '-analysis');
    node.toggleAttribute('data-politifree-analysis-pending', !!ai?.pending);
    // Missing evidence, pending work and unsupported media remain visible.
    node.toggleAttribute('data-politifree-unverified', !result.political && !ai?.political && !!ai?.unverified);
    if (!result.political && !ai?.political && ai?.unverified) node.setAttribute('data-politifree-unverified-reasons', (ai.reasons || []).join(',') || 'analysis-incomplete');
    else node.removeAttribute('data-politifree-unverified-reasons');
    if (result.political) hide(node);
    else if (ai?.political && ai.politicalKind === 'image' && text.length >= 40) {
      const matched = [...node.querySelectorAll('img')].find(img => (img.currentSrc || img.src) === ai.politicalUrl);
      // Feed media belongs to its post/video. Hiding only the thumbnail leaves
      // the political title, link and playable video available in the feed.
      if (matched && (host === 'youtube.com' || host === 'facebook.com')) hide(node);
      else if (matched) { show(node); hide(matched); }
      else hide(node);
    } else if (ai?.political) hide(node);
    else show(node);
    node.setAttribute('data-politifree-reviewed', '');
  }
  function scan(root) {
    if (!root.isConnected && root !== document) return;
    if (!settings.enabled || matchesDomain(settings.allowedDomains) || !globalThis.PolitifreeClassifier) return;
    if (sitePanel) { watchMedia(document); syncSiteBlock(); return; }
    const seeds = [...root.querySelectorAll(candidateSelector)];
    if (root.matches?.(candidateSelector) || knownOwners.has(root)) seeds.unshift(root);
    const candidates = new Set();
    for (const seed of seeds) {
      const owner = boundary(seed);
      if (owner) candidates.add(owner);
      else seed.setAttribute('data-politifree-container', '');
    }
    const pending = [...candidates];
    function batch() {
      const end = performance.now() + 12;
      while (pending.length && performance.now() < end) inspect(pending.shift());
      if (pending.length) setTimeout(batch, 0);
      else tidyLayout();
    }
    batch();
  }
  function queue(root = document) {
    // Newly inserted social cards get a bounded local pass immediately. This
    // does not hold ordinary or unknown content while the companion is busy.
    if (settings.enabled && !sitePanel && !matchesDomain(settings.allowedDomains) &&
        (host === 'youtube.com' || host === 'facebook.com') && root !== document && root.isConnected) {
      const immediateSelector = unitSelector + ',[data-ad-preview=message],[data-ad-rendering-role="story_message"]';
      const seeds = [...(root.matches?.(immediateSelector) ? [root] : []), ...root.querySelectorAll(immediateSelector)];
      const seen = new Set();
      const deadline = performance.now() + 6;
      for (const seed of seeds.slice(0, 80)) {
        if (performance.now() > deadline) break;
        const owner = boundary(seed);
        if (!owner || seen.has(owner) || !safeUnit(owner)) continue;
        seen.add(owner);
        if (classification(owner, extractText(owner, false)).political) hide(owner);
      }
    }
    if (root === document || roots.size > 80) { roots.clear(); roots.add(document); }
    else if (!roots.has(document)) roots.add(root);
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      const pending = [...roots]; roots.clear();
      for (const node of hidden) if (!node.isConnected) show(node);
      restoreMedia();
      for (const root of pending) if (!pending.some(other => other !== root && other.contains?.(root))) scan(root);
    }, 20);
  }
  function syncGate() {
    if (!document.documentElement) return;
    if (!document.documentElement.hasAttribute('data-politifree-ready')) document.documentElement.setAttribute('data-politifree-ready', '');
    // Chrome invalidates old content-script contexts after extension reload.
    // Keep page mutations from throwing until the page itself is refreshed.
    let version;
    try { version = chrome.runtime?.getManifest?.().version; } catch (_) { return; }
    if (version && document.documentElement.getAttribute('data-politifree-version') !== version) document.documentElement.setAttribute('data-politifree-version', version);
    const gated = false; // Ordinary content stays visible during analysis.
    if (document.documentElement.hasAttribute('data-politifree-gate') !== gated) document.documentElement.toggleAttribute('data-politifree-gate', gated);
  }
  let revealMode = false;
  function applySettings(next) {
    try { if(next.communityPack) globalThis.PolitifreeCommunity?.validate(next.communityPack); } catch (_) { next={...next,communityPack:null}; }
    settings = { ...defaults, ...next, strictness: 'precise', holdUnverified: false }; processed = new WeakMap();
    syncGate();
    const gating = settings.enabled && !matchesDomain(settings.allowedDomains);
    if (gating) for (const node of document.querySelectorAll('[data-politifree-reviewed]')) node.removeAttribute('data-politifree-reviewed');
    advanced?.reset({...settings, guardAudio});
    restoreLayout();
    const allow = matchesDomain(settings.allowedDomains);
    if (!settings.enabled || allow) {
      for (const node of document.querySelectorAll('[data-politifree-analysis-pending],[data-politifree-unverified]')) {
        node.removeAttribute('data-politifree-analysis-pending'); node.removeAttribute('data-politifree-unverified'); node.removeAttribute('data-politifree-unverified-reasons');
      }
    }
    if (!settings.enabled || allow) for (const node of [...hidden.keys()]) show(node);
    if (settings.enabled && !allow && politicsFocusedDomain() && !continued) installSiteBlock();
    else clearSiteBlock();
    queue(document);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.keys(changes).some(key => Object.hasOwn(defaults,key))) return;
    const next = { ...settings };
    for (const key of Object.keys(defaults)) if (changes[key]) next[key] = changes[key].newValue;
    if (changes.blockedDomains) continued = false;
    applySettings(next);
  });
  chrome.runtime?.onMessage?.addListener((message, sender, respond) => {
    if (message?.type === 'pf-report-items') {
      if(sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
      const removed=message.kind==='false-removal';
      const nodes=removed ? [...hidden] : [...document.querySelectorAll('[data-politifree-reviewed]')].filter(n=>!n.closest('[data-politifree-hidden]') && n.getBoundingClientRect().bottom>=0 && n.getBoundingClientRect().top<innerHeight*2);
      respond({items:nodes.filter(n=>n.isConnected).slice(0,50).map(n=>({text:extractText(n,false).slice(0,1000),reason:n.getAttribute('data-politifree-reason')||'media-or-local-classifier'}))});return;
    }
    if (message?.type === 'pf-page-status') {
      respond?.({revealed:revealMode, guardAudio, enabled:settings.enabled, paused:matchesDomain(settings.allowedDomains), hidden: [...hidden].filter(n => n.isConnected && !n.hasAttribute('data-politifree-pending') && !n.hasAttribute('data-politifree-unverified')).length,
        held: document.querySelectorAll('[data-politifree-unverified]').length,
        pending: document.querySelectorAll('[data-politifree-analysis-pending]').length}); return;
    }
    if (message?.type === 'pf-restore-page') {
      revealMode = true;
      for (const node of [...hidden]) { show(node); restored.set(node, fingerprint(node)); node.setAttribute('data-politifree-reviewed', ''); }
      restoreLayout(); respond?.({ok: true}); return;
    }
    if (message?.type === 'pf-refilter-page') {
      revealMode = false;
      restored = new WeakMap(); processed = new WeakMap(); queue(document); respond?.({ok: true}); return;
    }
    if (message?.type === 'pf-guard-state') {
      guardAudio = !!message.active; processed = new WeakMap();
      advanced?.reset({...settings, guardAudio}); queue(document); return;
    }
    // Mixed tab audio cannot establish which video should be removed.
  });
  function observe() {
    document.addEventListener('load', event => { if (event.target.matches?.('img')) { const owner = boundary(event.target) || event.target; processed.delete(owner); owner.removeAttribute('data-politifree-reviewed'); queue(owner); } }, true);
    if (!document.documentElement) return;
    syncGate();
    document.addEventListener('play', event => {
      const media = event.target;
      if (!media.matches?.('video,audio') || !settings.enabled || matchesDomain(settings.allowedDomains)) return;
      const owner = boundary(media) || media; inspect(owner);
      if (sitePanel || media.closest('[data-politifree-hidden]')) suppressMedia(media);
    }, true);
    if (settings.enabled && !matchesDomain(settings.allowedDomains) && politicsFocusedDomain() && !continued) installSiteBlock();
    new MutationObserver(records => {
      syncGate();
      const changedOwners = new Set(), changedRoots = new Set();
      for (const record of records) {
        const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (!element || element.closest('#politifree-site-block,.politifree-placeholder')) continue;
        if (record.attributeName === 'style') {
          const value = element.style.backgroundImage || '';
          if ((backgroundImages.get(element) || '') === value) continue;
          backgroundImages.set(element, value);
        }
        const owner = boundary(element.closest(candidateSelector) || element);
        if (owner) { changedOwners.add(owner); changedRoots.add(owner); }
        if (record.removedNodes.length && !owner) changedRoots.add(element);
        for (const added of record.addedNodes) if (added.nodeType === Node.ELEMENT_NODE && !added.matches('#politifree-site-block,.politifree-placeholder')) changedRoots.add(added);
      }
      // Invalidate every changed owner, including recycled cards and caption,
      // alt/src, track and background changes. Collapse only overlapping scans,
      // after collecting the whole delivery, so each owner gets its immediate
      // social-card check once rather than once per text/attribute record.
      for (const owner of changedOwners) { processed.delete(owner); owner.removeAttribute('data-politifree-reviewed'); }
      for (const root of changedRoots) {
        let covered = false;
        for (let parent = root.parentNode; parent; parent = parent.parentNode) if (changedRoots.has(parent)) { covered = true; break; }
        if (!covered) queue(root);
      }
      if (sitePanel) syncSiteBlock();
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href','srcset','title','alt','aria-label','aria-description','aria-describedby','data-caption','data-transcript','data-description','data-full-text','data-e2e-caption','post-title','subreddit-name','subreddit-prefixed-name','post-type','promoted','id','src','poster','aria-hidden','style','data-politifree-ready','data-politifree-gate'] });
    document.addEventListener('DOMContentLoaded', () => { if (settings.enabled && !matchesDomain(settings.allowedDomains) && politicsFocusedDomain() && !continued) installSiteBlock(); syncSiteBlock(); queue(document); }, { once: true });
    queue(document);
  }
  chrome.storage.local.get({ ...defaults, siteListRevision: 0 }, stored => {
    const originalStarter = ['democrats.org','gop.com','rnc.org','dnc.org','actblue.com','winred.com'];
    const originalDefault = ['democrats.org','gop.com','rnc.org','dnc.org','actblue.com','winred.com','politico.com','thehill.com'];
    if (!stored.siteListRevision && Array.isArray(stored.blockedDomains) && stored.blockedDomains.length === 6 && originalStarter.every(domain => stored.blockedDomains.includes(domain))) {
      stored.blockedDomains = [...defaults.blockedDomains];
      chrome.storage.local.set({blockedDomains: stored.blockedDomains, siteListRevision: 2});
    } else if ((!stored.siteListRevision || stored.siteListRevision === 1) && Array.isArray(stored.blockedDomains) && stored.blockedDomains.length === originalDefault.length && originalDefault.every(domain => stored.blockedDomains.includes(domain))) {
      stored.blockedDomains = [...defaults.blockedDomains];
      chrome.storage.local.set({blockedDomains: stored.blockedDomains, siteListRevision: 2});
    }
    applySettings(stored);
    if (document.documentElement) observe(); else document.addEventListener('DOMContentLoaded', observe, { once: true });
  });
})();



