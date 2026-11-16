'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Minimal DOM for adapter-only tests; no browser, network, or saved account DOM.
// The sanitized fixture preserves the observed 24-level video/card ancestry and
// the menu joining at level 15, with no caption or article/FeedUnit marker.
class Element {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase(); this.attrs = attrs; this.children = children;
    this.classList = (attrs.class || '').split(/\s+/).filter(Boolean);
    for (const child of children) child.parentElement = this;
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  matches(selector) {
    return selector.split(',').some(part => {
      part = part.trim();
      const negative = part.match(/:not\(([^)]+)\)/);
      if (negative) {
        if (this.matches(negative[1])) return false;
        part = part.replace(negative[0], '');
      }
      const tag = part.match(/^[\w-]+/);
      if (tag) {
        if (tag[0].toUpperCase() !== this.tagName) return false;
        part = part.slice(tag[0].length);
      }
      while (part) {
        const name = part.match(/^([.#])([\w-]+)/);
        if (name) {
          if (name[1] === '.' ? !this.classList.includes(name[2]) : this.getAttribute('id') !== name[2]) return false;
          part = part.slice(name[0].length); continue;
        }
        const attr = part.match(/^\[([\w-]+)(?:(\^=|\*=|\$=|~=|=)(?:"([^"]*)"|([^\] ]+))( i)?)?\]/);
        if (!attr) throw new Error('Unsupported test selector: ' + part);
        const [, key, op, quoted, bare, insensitive] = attr;
        let value = this.getAttribute(key), wanted = quoted ?? bare;
        if (value === null) return false;
        if (op) {
          if (insensitive) { value = value.toLowerCase(); wanted = wanted.toLowerCase(); }
          const matches = op === '=' ? value === wanted : op === '^=' ? value.startsWith(wanted) : op === '$=' ? value.endsWith(wanted) : op === '~=' ? value.split(/\s+/).includes(wanted) : value.includes(wanted);
          if (!matches) return false;
        }
        part = part.slice(attr[0].length);
      }
      return true;
    });
  }
  closest(selector) { for (let p = this; p; p = p.parentElement) if (p.matches(selector)) return p; return null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(other) { for (let p = other; p; p = p.parentElement) if (p === this) return true; return false; }
}
const el = (tag, attrs, children) => new Element(tag, attrs, children);
const source = fs.readFileSync('outputs/Politifree-Chrome/adapters.js', 'utf8').replace(/\r\n/g, '\n');
const content = fs.readFileSync('outputs/Politifree-Chrome/content.js', 'utf8').replace(/\r\n/g, '\n');
const safeUnitSource = content.match(/  function safeUnit\(node\) \{[\s\S]*?\n  \}/)[0];
const ignoredSelector = vm.runInNewContext(content.match(/  const ignoredSelector = (.*);/)[1]);
function adapter(host = 'facebook.com', safe = () => true, code = source) {
  const context = vm.createContext({host, ignoredSelector, redditUnitSelector:'shreddit-post,shreddit-ad-post,community-highlight-card', location:{pathname:'/'}});
  vm.runInContext(safeUnitSource, context);
  vm.runInContext(code, context);
  return context.PolitifreeAdapters.create({host, safeUnit: node => context.safeUnit(node) && safe(node),
    ignoredSelector:'nav', knownOwners:new WeakSet(), rumbleVideoPath:() => null,
    redditUnitSelector:'shreddit-post', commentSelector:'[aria-label^="Comment by"]', unitSelector:'article'});
}
function card(position, player = false) {
  const video = el('video'); let node = video;
  let author;
  for (let depth = 1; depth <= 24; depth++) {
    const children = [node];
    if (depth === 15) children.push(el('button', {'aria-label':'Actions for this post'}));
    if (depth === 19) { author = el('a', {href:'/example-creator'}); children.push(author); }
    node = el('div', depth === 24 ? {'aria-posinset':position} : player && depth === 10 ? {'aria-label':'Video player'} : {}, children);
  }
  return {post:node, video, author};
}
const political = card('21'), ordinary = card('22');
const feed = el('main', {}, [el('div', {role:'feed'}, [political.post, ordinary.post])]);
const before = source.replace(/  function facebookPositionedMediaUnit\(seed\) \{[\s\S]*?\n  \}\n/, '')
  .replace(/      const positionedMedia = facebookPositionedMediaUnit\(seed\);\n      if \(positionedMedia\) \{ knownOwners.add\(positionedMedia\); return positionedMedia; \}\n/, '');
assert.equal(adapter('facebook.com', () => true, before).boundary(political.video), political.video, 'reproduces original video-only boundary');
const fixed = adapter();
const owner = fixed.boundary(political.video);
assert.equal(owner, political.post);
assert(owner.contains(political.author), 'full card includes its creator and artwork space');
assert(!owner.contains(ordinary.video), 'adjacent ordinary video stays outside removal');
assert(!owner.contains(feed), 'shared feed is never the owner');
assert.equal(fixed.boundary(ordinary.video), ordinary.post, 'ordinary video keeps its own independent owner');
const labeled = card('23', true);
assert.equal(adapter().boundary(labeled.video), labeled.post, 'post wins over inner video player');
const genericVideo = el('video'), player = el('div', {'aria-label':'Video player'}, [genericVideo]);
assert.equal(adapter().boundary(genericVideo), player, 'generic player fallback remains');
for (const position of ['0', '-1', '', 'not-a-position']) {
  const f = card(position);
  assert.equal(adapter().boundary(f.video), f.video, 'invalid position cannot expand removal');
}
const rejected = card('24');
assert.equal(adapter('facebook.com', node => node !== rejected.post).boundary(rejected.video), rejected.video, 'safeUnit remains authoritative');
const shared = el('div', {'aria-posinset':'25'}, [card('26').post, card('27').post, el('video')]);
assert.equal(adapter().boundary(shared.children[2]), shared.children[2], 'positioned shared wrapper cannot hide sibling posts');
const commentVideo = el('video');
const comment = el('div', {'aria-label':'Comment by Example'}, [commentVideo]);
el('div', {'aria-posinset':'28'}, [comment, el('button', {'aria-label':'Actions for this post'})]);
assert.equal(adapter().boundary(commentVideo), comment, 'comment remains independent');
const duplicate = card('29'); duplicate.post.children.push(el('button', {'aria-label':'Actions for this post'}));
assert.equal(adapter().boundary(duplicate.video), duplicate.video, 'ambiguous post menus cannot expand removal');
assert.equal(adapter('example.com').boundary(political.video), political.video, 'Facebook rule remains host-specific');
if (process.argv.includes('--captured-tree')) {
  const restore = node => el(node.tag, node.attrs, node.children.map(restore));
  const tree = restore(JSON.parse(fs.readFileSync(0, 'utf8')));
  const post = tree.querySelector('[aria-posinset="21"]');
  const video = post.querySelector('video');
  assert.equal(adapter('facebook.com', () => true, before).boundary(video), video, 'saved DOM reproduces video-only owner');
  assert.equal(adapter().boundary(video), post, 'saved DOM passes production safeUnit and selects full card');
  console.log('PASS captured DOM with production safeUnit: original VIDEO owner; fixed positioned post owner');
}
console.log('PASS Facebook deep captionless video: original failure reproduced, complete independent post selected; adjacent video, generic player, comments and unsafe/ambiguous wrappers protected');
