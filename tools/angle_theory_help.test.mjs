// Weld-track theory topics (structure / principle / beam): one-click demos and step guides with live checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (f) => JSON.parse(readFileSync(join(app, '..', 'knowledge', f), 'utf8'));
const src = (f) => readFileSync(join(app, 'src', 'angle', f), 'utf8');

const ST = json('angle_structure.json');
const PR = json('angle_principle.json');
const BM = json('angle_beam.json');
const GROUPS = [
  { module: 'angle-structure', common: ST.help, items: ST.guide, topics: ['display', 'explode'], file: 'app.js' },
  { module: 'angle-principle', common: PR.help.common, items: PR.help, topics: ['refraction', 'wedge_echo', 'damping'], file: 'app.js' },
  { module: 'angle-beam', common: BM.help.common, items: BM.help, topics: ['skip', 'block', 'exercise'], file: 'beam.js' },
];

test('every theory topic has guide labels and 3-6 concrete steps', () => {
  for (const g of GROUPS) {
    for (const k of ['demo', 'stop_demo', 'guide', 'guide_close', 'guide_page', 'guide_device', 'guide_why', 'guide_pending', 'guide_ok', 'guide_next_tip', 'guide_go']) {
      assert.ok(g.common[k], `${g.module} ${k}`);
    }
    for (const t of g.topics) {
      const items = g.items[t];
      assert.ok(Array.isArray(items) && items.length >= 3 && items.length <= 6, `${t} items`);
      assert.equal(new Set(items.map((it) => it.id)).size, items.length, `${t} unique ids`);
      for (const it of items) {
        assert.ok(typeof it.do === 'string' && it.do.length > 1, `${t}.${it.id} do`);
        assert.ok(typeof it.page === 'string' && it.page.length > 1, `${t}.${it.id} page`);
      }
    }
  }
});

test('every guide step has a live check in the topic code', () => {
  for (const g of GROUPS) {
    const code = src(g.file);
    const modOk = code.includes(`module: '${g.module}'`)
      || (g.module === 'angle-beam' && /module: mod/.test(code));
    assert.ok(modOk, `${g.module} learning module`);
    for (const t of g.topics) for (const it of g.items[t]) assert.match(code, new RegExp(`\\b${it.id}: `), `${t}.${it.id}`);
  }
});

test('structure part principle is reached by jump, not a nav tab', () => {
  assert.match(src('app.js'), /'angle-structure': \['display', 'explode'\]/);
  assert.match(src('app.js'), /function flashLearned/);
  assert.match(src('app.js'), /function leavePart/);
  assert.match(src('app.js'), /partPrincipleDone/);
  assert.ok(ST.guide.explode.some((it) => it.id === 'principle'));
  assert.ok(ST.help.learned);
  assert.ok(ST.guide.parts, 'parts detail page keeps its own guide');
});

test('caption stays until next click; side and cards resizable; next-page only on demand', () => {
  const help = src('calibhelp.js');
  assert.doesNotMatch(help, /capIndex = firstOpen/);
  assert.match(help, /ag-cap-status/);
  assert.match(help, /labNextTopic/);
  assert.match(help, /onTopicDone/);
  assert.match(src('app.js'), /function bindSideSplit/);
  assert.match(src('app.js'), /function bindSideCards/);
  assert.match(src('app.js'), /function showNextCoach/);
  assert.match(src('angle.css'), /--ag-side-w/);
  assert.match(src('angle.css'), /\.ag-page > \.ag-split/);
  assert.match(src('angle.css'), /\.ag-card-split/);
  assert.match(src('angle.css'), /\.ag-cap-do/);
  assert.match(src('angle.css'), /\.ag-cap-status\.ok/);
  assert.match(src('angle.css'), /\.ag-next-coach/);
  assert.ok(ST.help.guide_next_tips.display.includes('{name}'));
  assert.ok(ST.help.guide_next_topic);
});

test('exercise judgements go to the learning record; demos drive the topics through the shared help', () => {
  const beam = src('beam.js');
  assert.match(beam, /import \{ learnScore \} from '\.\.\/learnlog\.js'/);
  assert.match(beam, /learnScore\(document\.body\.dataset\.learningRoute \|\| 'angle-principle', 'exercise'/);
  assert.equal((beam.match(/teach\(main, side, ctl, ctx, '(skip|block|exercise)'/g) || []).length, 3);
  assert.match(beam, /side\.prepend\(dock\)/);
  const app = src('app.js');
  assert.match(app, /createCalibHelp\(\{[\s\S]*?module: 'angle-structure'/);
  assert.match(app, /createCalibHelp\(\{[\s\S]*?module: 'angle-principle'/);
  assert.match(app, /BEAM_TOPIC_IDS = \['skip', 'block', 'exercise'\]/);
  for (const f of ['animateExplode(1', 'animateExplode(0', 'v.orbit(', 'v.zoom(', 'v.moveTo(']) assert.ok(app.includes(f), f);
  assert.match(src('viewer.js'), /onOrbit\(fn\)/);
  assert.match(src('diagrams.js'), /mark\(on\)/);
});

test('theory topic sources keep visible text in JSON (no CJK literals)', () => {
  for (const f of ['app.js', 'beam.js', 'principle.js', 'diagrams.js', 'viewer.js']) {
    const bad = src(f).split(/\r?\n/).map((l, i) => [l, i + 1]).filter(([l]) => /[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u.test(l));
    assert.deepEqual(bad.map(([, n]) => `${f}:${n}`), []);
  }
});
