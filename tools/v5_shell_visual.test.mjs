import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

// These tests inspect generated markup, offline resources and CSS contracts.
// They do not execute a browser or claim visual layout / WebGL validation.
const require = createRequire(import.meta.url);
const postcss = require('postcss');
const content = JSON.parse(fs.readFileSync(new URL('../../knowledge/learning.json', import.meta.url), 'utf8'));
const rawSource = fs.readFileSync(new URL('../src/learning-shell.js', import.meta.url), 'utf8');
const source = rawSource.replace(/^import[^\n]*\n/gm, '').replace('export function createLearningShell', 'function createLearningShell');
const css = fs.readFileSync(new URL('../src/learning-shell.css', import.meta.url), 'utf8');

class Element {
  constructor() {
    this.children = []; this.dataset = {}; this.listeners = new Map();
    this.style = { setProperty() {} }; this.attributes = new Map(); this.innerHTML = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getBoundingClientRect() { return { bottom: 108 }; }
  querySelector() { return { focus() {}, value: '' }; }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  removeEventListener(name) { this.listeners.delete(name); }
  contains() { return true; }
  remove() {}
}
function fixture(initial = {}) {
  const document = { createElement: () => new Element() };
  const window = { addEventListener() {}, removeEventListener() {} };
  const create = new Function('text', 'document', 'window', 'ResizeObserver', `${source}\nreturn createLearningShell;`)(content, document, window, undefined);
  const launches = [];
  const shell = create({ mount: new Element(), getState: () => initial, onLaunch: (payload) => launches.push(payload) });
  return { shell, home: shell.element.children[3], launches,
    async click(dataset) {
      shell.element.listeners.get('click')({ target: { closest: () => ({ dataset, disabled: false }) }, preventDefault() {} });
      await new Promise(setImmediate);
    },
  };
}

test('all illustration payloads preserve their actual offline SVG sources, without executable or external content', () => {
  assert.equal(Object.keys(content.artworks).length, 13);
  for (const [name, asset] of Object.entries(content.artworks)) {
    assert.match(asset.src, /^data:image\/svg\+xml;base64,/);
    const decoded = Buffer.from(asset.src.split(',')[1], 'base64').toString('utf8');
    const actual = fs.readFileSync(new URL(`../../assets/ut-${name}.svg`, import.meta.url), 'utf8');
    assert.equal(decoded, actual, name);
    assert.ok(decoded.length > 2000, 'Use complete technical illustrations, not tiny icons');
    assert.match(decoded, /viewBox="0 0 680 400"/);
    assert.match(decoded, /<title>[^<]+<\/title>/);
    assert.doesNotMatch(decoded, /<script|<foreignObject|\bon\w+\s*=|(?:xlink:)?href\s*=/i);
    assert.ok(asset.alt && asset.caption);
  }
});

test('the three mode entries render three different embedded inspection illustrations with explicit accessible titles', () => {
  const f = fixture();
  assert.equal((f.home.innerHTML.match(/<img /g) || []).length, 3);
  assert.equal((f.home.innerHTML.match(/data-role=/g) || []).length, 3);
  assert.equal((f.home.innerHTML.match(/class="ut-learning-role-image"/g) || []).length, 3);
  assert.equal(new Set(Object.values(content.roles).map((role) => role.art)).size, 3);
  for (const role of ['teacher', 'student', 'exam']) {
    assert.ok(f.home.innerHTML.includes(`data-artwork="${content.roles[role].art}"`));
    assert.ok(f.home.innerHTML.includes(content.roles[role].label));
  }
  assert.equal(f.home.innerHTML.includes('4404'), false);
  assert.match(f.home.innerHTML, /aria-labelledby="learning-home-title-\d+-teacher"/);
  assert.doesNotMatch(f.home.innerHTML, /(?:src|href)="(?:https?:|file:|\/\/)/i);
  f.shell.destroy();
});

test('every existing topic has a matching subject illustration and rendering retains the correct training routes', async () => {
  for (const role of Object.values(content.roles)) {
    for (const item of role.items) assert.ok(content.artworks[item.art], `${item.route} needs a full illustration`);
  }
  const f = fixture({ role: 'student' });
  assert.equal((f.home.innerHTML.match(/class="ut-learning-track-image"/g) || []).length, content.tracks.length);
  let images = 0;
  for (const track of content.tracks) {
    await f.click({ track: track.id });
    images += (f.home.innerHTML.match(/class="ut-learning-card-image"/g) || []).length;
  }
  assert.equal(images, content.roles.student.items.length);
  await f.click({ role: 'exam' });
  assert.equal((f.home.innerHTML.match(/class="ut-learning-card-image"/g) || []).length, content.roles.exam.items.length);
  const examIndex = (route) => String(content.roles.exam.items.findIndex((it) => it.route === route));
  await f.click({ entry: examIndex('assessment') });
  assert.deepEqual(f.launches[0], { role: 'exam', route: 'assessment' });
  f.shell.showHome();
  await f.click({ entry: examIndex('angle-exam') });
  assert.deepEqual(f.launches[1], { role: 'exam', route: 'angle-exam' });
  f.shell.destroy();
});

test('CSS parses and keeps large illustrations, small-screen flow, keyboard focus and reduced-motion support', () => {
  const parsed = postcss.parse(css);
  const declarations = [];
  parsed.walkDecls((declaration) => declarations.push(declaration));
  assert.ok(declarations.length > 200);
  assert.match(css, /\.ut-learning-card-image[^}]*aspect-ratio:\s*680\s*\/\s*400/s);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
  assert.doesNotMatch(css, /@import|url\s*\(\s*['"]?(?:https?:|\/\/)/i);
  assert.doesNotMatch(rawSource + css, /\p{Script=Han}/u, 'Teaching copy stays in the knowledge JSON');
});
