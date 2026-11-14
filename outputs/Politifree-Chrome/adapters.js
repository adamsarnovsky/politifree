// Platform boundaries. Classification and removal stay in the shared pipeline.
(() => {
'use strict';
function create({host, safeUnit, ignoredSelector, knownOwners, rumbleVideoPath, redditUnitSelector, commentSelector, unitSelector}) {
  function facebookUnit(seed) {
    for (let p = seed.parentElement, depth = 0; p && depth < 14; p = p.parentElement, depth++) {
      if (p.matches('body,main,[role=feed]')) break;
      const count = p.querySelectorAll('[aria-label^="Actions for this post"]').length;
      if (count > 1) break;
      if (count === 1 && (p.querySelector('[data-ad-preview=message],[data-ad-rendering-role="story_message"]') || p.querySelector('[aria-label="Leave a comment"],[aria-label="Like"]'))) return p;
    }
    return seed.matches('[data-ad-preview=message],[data-ad-rendering-role="story_message"]') ? seed : null;
  }
  function facebookGroupRecommendationUnit(seed) {
    if (!seed.matches('a[href*="/groups/"]')) return null;
    for (let parent = seed.parentElement, depth = 0; parent && depth < 9; parent = parent.parentElement, depth++) {
      const groupLinks = [...parent.querySelectorAll('a[href*="/groups/"]')];
      const groupIds = new Set(groupLinks.map(link => link.getAttribute('href')));
      if (groupIds.size > 1) break; // Stop before a carousel or whole suggestions rail.
      const controls = [...parent.querySelectorAll('button,[role="button"]')].map(button => `${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`).join(' ');
      if (groupLinks.length && groupIds.size === 1 && /join group/i.test(controls) && /remove suggested group/i.test(controls) && safeUnit(parent)) return parent;
    }
    return null;
  }
  function rumbleRecommendationUnit(seed) {
    if (host !== 'rumble.com' || !seed.matches('a[href]') || !rumbleVideoPath(seed)) return null;
    for (let parent = seed.parentElement, depth = 0; parent && depth < 9; parent = parent.parentElement, depth++) {
      if (parent.matches('main,body,nav,[role=navigation]')) break;
      const videos = [...(parent.matches('a[href]') ? [parent] : []), ...parent.querySelectorAll('a[href]')].map(rumbleVideoPath).filter(Boolean);
      const videoPaths = new Set(videos);
      // Rumble cards commonly include a video URL plus separate channel links.
      // Count distinct video destinations only, so the publisher link does not
      // prevent selecting the individual card or cause an entire shelf to hide.
      if (videoPaths.size > 1) break;
      // Rumble renders feed tiles as custom thumbnail elements. Selecting that
      // wrapper removes the image, title, and channel together; stopping at the
      // inner title div leaves a political video's artwork visible.
      if (videoPaths.size === 1 && parent.matches('rum-video-thumbnail,rum-video-thumbnail-sidebar') && safeUnit(parent)) return parent;
    }
    return null;
  }
  function slashdotStoryUnit(seed) {
    if (host !== 'slashdot.org' || !seed.matches('a[href]') || !/\/(?:story\/|article\.pl\?sid=)/i.test(seed.href)) return null;
    for (let parent = seed.parentElement, depth = 0; parent && depth < 10; parent = parent.parentElement, depth++) {
      if (parent.matches('main,body,nav,[role=navigation]')) break;
      // Slashdot's feed uses one numbered firehose-* wrapper per story.
      // Do not climb into the shared firehose list or hide unrelated stories.
      if ([...parent.classList].some(name => /^firehose-\d+$/.test(name))) return safeUnit(parent) ? parent : null;
    }
    return null;
  }
  function boundary(seed) {
    // Keep a Short's thumbnail, accessible title, caption and player together.
    // Stop at the individual item rather than its mixed-content shelf.
    if (host === 'youtube.com') {
      const playlist = seed.closest?.('ytd-playlist-renderer');
      if (playlist && safeUnit(playlist)) return playlist;
      const sequence = seed.closest?.('.reel-video-in-sequence-new,.reel-video-in-sequence');
      if (sequence && sequence.querySelectorAll('ytd-reel-video-renderer').length === 1 && safeUnit(sequence)) {
        knownOwners.add(sequence); return sequence;
      }
      const short = seed.closest?.('ytd-reel-video-renderer,ytd-reel-item-renderer,ytm-shorts-lockup-view-model,yt-shorts-lockup-view-model');
      if (short && safeUnit(short)) return short;
    }
    if (host === 'facebook.com' && !seed.closest(commentSelector)) {
      const post = seed.closest('article,[role=article],[data-pagelet*="FeedUnit"]');
      if (post && safeUnit(post)) return post;
      const message = seed.closest('[data-ad-preview=message],[data-ad-rendering-role="story_message"]');
      if (message) {
        const post = facebookUnit(message);
        if (post) { knownOwners.add(post); return post; }
      }
    }
    const blueskyPost = host === 'bsky.app' && seed.closest?.('[data-testid^="feedItem-by-"]');
    if (blueskyPost && safeUnit(blueskyPost)) return blueskyPost;
    // Gannett's Ask widget exposes one question per card and a category on the
    // card. Keep neighboring questions independent.
    const askQuestion = seed.closest?.('.dd-widget-question-container[data-category]');
    if (askQuestion && safeUnit(askQuestion)) return askQuestion;
    // Ads and pinned highlights are different custom elements from organic
    // posts. Keep their metadata and media together in one independent unit.
    const redditUnit = seed.closest(redditUnitSelector);
    if (redditUnit && !seed.closest(commentSelector) && !seed.closest(ignoredSelector) && safeUnit(redditUnit)) return redditUnit;
    const facebookGroup = facebookGroupRecommendationUnit(seed);
    if (facebookGroup) { knownOwners.add(facebookGroup); return facebookGroup; }
    const rumbleItem = rumbleRecommendationUnit(seed);
    if (rumbleItem) { knownOwners.add(rumbleItem); return rumbleItem; }
    const slashdotStory = slashdotStoryUnit(seed);
    if (slashdotStory) { knownOwners.add(slashdotStory); return slashdotStory; }
    const xUserCell = seed.closest?.('[data-testid="UserCell"]');
    if (xUserCell && safeUnit(xUserCell)) return xUserCell;
    const xUserDescription = seed.closest?.('[data-testid="UserDescription"]');
    if (xUserDescription && safeUnit(xUserDescription)) return xUserDescription;
    // A direct Facebook Reel has no feed post menu or article marker. Join its
    // single player, caption and author at the smallest shared container.
    if (host === 'facebook.com' && /^\/reel\//.test(globalThis.location?.pathname || '') && seed.matches('video,h2,h3,h4,[data-ad-rendering-role="story_message"]')) {
      for (let parent = seed, depth = 0; parent && depth < 24; parent = parent.parentElement, depth++) {
        if (parent.matches('main,[role=main],body,html')) break;
        const videos = parent.querySelectorAll('video').length;
        if (videos > 1) break;
        if (videos === 1 && parent.querySelector('h2,h3,h4') && parent.innerText?.trim().length < 5000 && safeUnit(parent)) {
          knownOwners.add(parent); return parent;
        }
      }
    }
    if (host === 'facebook.com' && seed.matches('[aria-label*="video player" i]') && safeUnit(seed)) return seed;
    if (host === 'facebook.com' && seed.matches('video,audio')) {
      const player = seed.closest('[aria-label*="video player" i]');
      if (player && safeUnit(player)) return player;
    }
    // Instagram uses several links for one post (timestamp, likes and reel).
    // Count distinct post IDs so a mixed feed is never treated as one post.
    if (seed.matches('a[href*="/p/"],a[href*="/reel/"]')) {
      for (let parent = seed.parentElement, depth = 0; parent && depth < 12; parent = parent.parentElement, depth++) {
        if (parent.matches('main,body,nav')) break;
        const ids = new Set([...parent.querySelectorAll('a[href*="/p/"],a[href*="/reel/"]')].map(link => link.getAttribute('href').match(/\/(?:p|reel)\/([^/]+)/)?.[1]).filter(Boolean));
        if (ids.size > 1) break;
        if (ids.size === 1 && parent.querySelector('button[aria-label="Like"],[role=button][aria-label="Like"]') && safeUnit(parent)) { knownOwners.add(parent); return parent; }
      }
    }
    // Threads and Bluesky expose stable post permalinks instead of article tags.
    if (seed.matches('a[href*="/post/"]')) {
      for (let parent = seed.parentElement, depth = 0; parent && depth < 12; parent = parent.parentElement, depth++) {
        if (parent.matches('main,body,nav')) break;
        const links = parent.querySelectorAll('a[href*="/post/"]');
        if (new Set([...links].map(link => link.href)).size > 1) break;
        const reaction = [...parent.querySelectorAll('button,[role=button],[role=checkbox]')].some(button => /^Like(?:\b|\d)/i.test(button.getAttribute('aria-label') || button.textContent.trim()));
        if (links.length >= 1 && reaction && safeUnit(parent)) { knownOwners.add(parent); return parent; }
      }
    }
    if (seed.matches('[data-ad-preview=message],[data-ad-rendering-role="story_message"],[aria-label^="Actions for this post"]')) return facebookUnit(seed);
    if (seed.closest(ignoredSelector)) return null;
    if (seed.matches('a[href]') && seed.closest('header,footer') && !seed.closest('article,[role=article]')) return null;
    for (let parent = seed; parent && !parent.matches('body,html'); parent = parent.parentElement) {
      if (knownOwners.has(parent) && safeUnit(parent)) return parent;
    }
    if (host === 'facebook.com' && seed.matches('video,audio')) {
      for (let parent = seed.parentElement, depth = 0; parent && depth < 14; parent = parent.parentElement, depth++) {
        const actions = parent.querySelectorAll('[aria-label^="Actions for this post"]');
        if (actions.length > 1) break;
        if (actions.length === 1) { const post = facebookUnit(actions[0]); if (post?.contains(seed)) return post; }
      }
    }
    // Comments must be classified independently from an ordinary parent post.
    const comment = seed.closest(commentSelector);
    if (comment && safeUnit(comment)) return comment;
    const units = [];
    for (let p = seed; p && !p.matches('main,body,html'); p = p.parentElement) {
      if (p.matches(unitSelector) && safeUnit(p)) units.push(p);
      if (p.matches('shreddit-post,[data-testid=tweet],.feed-shared-update-v2,[data-pagelet*=FeedUnit],ytd-reel-video-renderer,[data-testid=feedItem],[data-e2e=video-detail],ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer')) break;
    }
    if (units.length) return units[units.length - 1];
    if (seed.matches('h1,h2,h3')) {
      const link = seed.closest('a[href]');
      if (link && safeUnit(link)) return link;
    }
    return safeUnit(seed) ? seed : null;
  }

return {boundary};
}
globalThis.PolitifreeAdapters = {create};
})();
