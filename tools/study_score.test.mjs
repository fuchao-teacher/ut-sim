import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stepScore, moduleScore, trackScore } from '../src/studyscore.js';

const SR = JSON.parse(fs.readFileSync(new URL('../../knowledge/study_report.json', import.meta.url), 'utf8'));
const LJ = JSON.parse(fs.readFileSync(new URL('../../knowledge/learning.json', import.meta.url), 'utf8'));
test('step: done once entered with every checkpoint ticked and, for a self-test step, a test taken', () => {
  assert.equal(stepScore(undefined).status, 'todo');
  assert.equal(stepScore({ visits: 1, total: 4, done: ['a', 'b'] }).status, 'doing');
  const full = stepScore({ visits: 2, total: 4, done: ['a', 'b', 'c', 'd'] });
  assert.equal(full.status, 'done');
  assert.equal(full.done, 4);
  assert.equal(stepScore({ visits: 1, total: 0, done: [] }).status, 'done');
  assert.equal(stepScore({ visits: 0, total: 2, done: ['a', 'b'] }).status, 'todo');
  assert.equal(stepScore({ visits: 1, total: 2, done: ['a', 'b'] }, true).status, 'doing');
  assert.equal(stepScore({ visits: 1, total: 2, done: ['a', 'b'], tests: [{ score: 4, max: 10 }] }, true).status, 'done');
});

test('module and track count finished steps; a step with `from` reads the earlier module record', () => {
  const mod = { id: 'm', steps: [{ id: 'a' }, { id: 'b' }] };
  const m = moduleScore(mod, { steps: { a: { visits: 1, seconds: 30, total: 2, done: ['x', 'y'] } } });
  assert.equal(m.finished, 1);
  assert.equal(m.count, 2);
  assert.equal(m.status, 'doing');
  assert.equal(m.seconds, 30);
  const track = { id: 't', modules: [mod, { id: 'n', steps: [{ id: 'c', from: 'old' }, { id: 'd' }] }] };
  const t = trackScore(track, { modules: { m: { steps: { a: { visits: 1 }, b: { visits: 1 } } }, old: { steps: { c: { visits: 1 } } } } });
  assert.equal(t.modules[0].status, 'done');
  assert.equal(t.modules[1].status, 'doing');
  assert.equal(t.finished, 3);
  assert.equal(t.count, 4);
  assert.equal(t.status, 'doing');
});

test('plate catalog: card items merge checkpoints and every step has a title', () => {
  const plate = SR.tracks.find((t) => t.id === 'plate');
  assert.deepEqual(plate.modules.map((m) => m.id), ['equipment', 'fullscan', 'task']);
  const eq = plate.modules[0].steps;
  assert.deepEqual(eq.filter((s) => !s.sub).map((s) => s.id), ['devices', 'bench', 'wave']);
  assert.deepEqual(eq.filter((s) => s.sub).map((s) => s.id), ['probe']);
  assert.equal(eq[0].items.length, 7);
  for (const k of ['start', 'auto', 'manual', 'back', 'probe', 'tune']) assert.ok(SR.card[k], k);
  for (const m of plate.modules) for (const s of m.steps) {
    assert.ok(s.title, `${m.id}/${s.id}`);
    for (const it of s.items || []) {
      assert.ok(it.id && it.do && it.page && Array.isArray(it.of) && it.of.length, `${m.id}/${s.id}/${it.id}`);
      assert.equal(new Set(s.items.map((x) => x.id)).size, s.items.length, `${m.id}/${s.id}`);
    }
  }
  for (const k of ['prev', 'next', 'next_module', 'demo', 'stop']) assert.ok(SR.card[k], k);
  assert.ok(SR.actions.go);
});

test('catalog: every module is a student route of its track, steps unique, report entry per track', () => {
  const items = LJ.roles.student.items;
  for (const tr of SR.tracks) {
    for (const m of tr.modules) {
      const it = items.find((x) => x.route === m.id);
      assert.ok(it, m.id);
      assert.equal(it.track || 'plate', tr.id, m.id);
      assert.equal(new Set(m.steps.map((s) => s.id)).size, m.steps.length, m.id);
    }
    assert.ok(items.some((x) => x.route === `study-${tr.id}` && x.track === tr.id && x.group === 'review'), tr.id);
  }
  assert.ok(LJ.groups.some((g) => g.id === 'review'));
  assert.equal(SR.orid.items.map((x) => x.id).join(''), 'orid');
});
