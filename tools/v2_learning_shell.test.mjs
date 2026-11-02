import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

// Grouped entry API regression checks, updated for V4 modes. Browser layout and
// password-event behavior are not emulated here; v4_modes.test.mjs checks events.
// verified separately; this DOM double does not emulate a browser renderer.
const text = JSON.parse(fs.readFileSync(new URL('../../knowledge/learning.json', import.meta.url), 'utf8'));
const source = fs.readFileSync(new URL('../src/learning-shell.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace('export function createLearningShell', 'function createLearningShell');
const entryIndex = (role, route) => text.roles[role].items.findIndex((item) => item.route === route);

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.attributes = new Map();
    this.cssProperties = new Map();
    this.style = { setProperty: (key, value) => this.cssProperties.set(key, value) };
    this.hidden = false;
    this.innerHTML = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getBoundingClientRect() { return { bottom: 108 }; }
  querySelector(selector) {
    if (selector === '[data-learning-password]') return this.passwordInput ||= { value: '', focus() {} };
    return { focus() {} };
  }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  removeEventListener(name) { this.listeners.delete(name); }
  contains() { return true; }
  remove() { this.removed = true; }
}

function fixture(initial = {}) {
  const roles = [];
  const launches = [];
  const document = { createElement: () => new Element() };
  const listeners = new Map();
  const window = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  };
  const create = new Function('text', 'document', 'window', 'ResizeObserver', `${source}\nreturn createLearningShell;`)(text, document, window, undefined);
  const mount = new Element();
  let accept = true;
  const shell = create({
    mount,
    getState: () => initial,
    onRoleChange: (role) => roles.push(role),
    onLaunch: (payload) => { launches.push(payload); return accept; },
  });
  const click = async (dataset) => {
    const handler = shell.element.listeners.get('click');
    handler({ target: { closest: () => ({ dataset, disabled: false }) } });
    await new Promise(setImmediate);
  };
  return {
    shell, mount, roles, launches, click, listeners,
    home: shell.element.children[3],
    async unlockTeacher() {
      await click({ role: 'teacher' });
      shell.element.children[4].querySelector('[data-learning-password]').value = '4404';
      await click({ act: 'teacher-submit' });
    },
    setAccept: (value) => { accept = value; },
  };
}

test('initial home offers exactly the three role entries', () => {
  const f = fixture();
  assert.equal(f.home.hidden, false);
  assert.equal((f.home.innerHTML.match(/data-role=/g) || []).length, 3);
  assert.equal(f.shell.element.cssProperties.get('--ut-learning-home-top'), '108px');
  f.shell.destroy();
});

test('choosing a role shows topics and calls the role callback without launching', async () => {
  const f = fixture();
  await f.unlockTeacher();
  assert.deepEqual(f.roles, ['teacher']);
  assert.deepEqual(f.launches, []);
  assert.equal(text.roles.teacher.items.filter((item) => item.track === 'plate').length, 6);
  assert.deepEqual([...f.home.innerHTML.matchAll(/data-track="([^"]+)"/g)].map((m) => m[1]), ['plate', 'weld']);
  assert.equal((f.home.innerHTML.match(/data-entry=/g) || []).length, 0);
  for (const track of ['plate', 'weld']) {
    await f.click({ track });
    assert.equal((f.home.innerHTML.match(/data-entry=/g) || []).length, text.roles.teacher.items.filter((item) => item.track === track).length);
    assert.match(f.home.innerHTML, /data-act="tracks"/);
    await f.click({ act: 'tracks' });
  }
  assert.equal(f.home.hidden, false);
  f.shell.destroy();
});

test('track cards carry the probe render and the module names of their track', async () => {
  const f = fixture({ role: 'student' });
  for (const track of text.tracks) {
    const shot = text.renders[track.art];
    assert.equal(shot.src, `data:image/jpeg;base64,${fs.readFileSync(new URL(`../../assets/ut-${track.art}.jpg`, import.meta.url)).toString('base64')}`);
    assert.ok(shot.alt);
    assert.ok(f.home.innerHTML.includes(`data-render="${track.art}"`));
    for (const item of text.roles.student.items.filter((it) => it.track === track.id)) assert.ok(f.home.innerHTML.includes(item.title));
  }
  assert.deepEqual(f.launches, []);
  f.shell.destroy();
});

test('a launched topic narrows the quick navigation to its track and returns to that track home', async () => {
  const f = fixture({ role: 'student' });
  await f.click({ entry: String(entryIndex('student', 'angle-scan')) });
  const nav = f.shell.element.children[1].innerHTML;
  assert.equal((nav.match(/data-entry=/g) || []).length, text.roles.student.items.filter((item) => item.track === 'weld').length);
  assert.match(nav, /data-act="track-home"/);
  await f.click({ act: 'track-home' });
  assert.equal(f.home.hidden, false);
  assert.match(f.home.innerHTML, /data-learning-track="weld"/);
  assert.equal(f.shell.getState().track, 'weld');
  await f.click({ role: 'student' });
  assert.equal(f.shell.getState().track, null);
  f.shell.destroy();
});

test('teacher theme sends the selected route and closes the home', async () => {
  const f = fixture();
  await f.unlockTeacher();
  await f.click({ entry: String(entryIndex('teacher', 'principle')) });
  assert.deepEqual(f.launches, [{ role: 'teacher', route: 'principle' }]);
  assert.equal(f.home.hidden, true);
  assert.equal(f.shell.element.children[1].hidden, false);
  f.shell.destroy();
});

test('student task launches guided mode', async () => {
  const f = fixture();
  f.shell.update({ role: 'student', route: null });
  await f.click({ entry: String(entryIndex('student', 'task')) });
  assert.deepEqual(f.launches, [{ role: 'student', route: 'task', taskMode: 'guided' }]);
  assert.equal(f.home.hidden, true);
  f.shell.destroy();
});

test('process card is a single self-study entry with guided mode', async () => {
  const f = fixture();
  f.shell.update({ role: 'student', route: null });
  assert.equal(entryIndex('student', 'design'), -1);
  await f.click({ entry: String(entryIndex('student', 'task')) });
  assert.deepEqual(f.launches, [{ role: 'student', route: 'task', taskMode: 'guided' }]);
  assert.equal(f.home.hidden, true);
  f.shell.destroy();
});

test('showHome preserves the current role and does not launch or notify again', async () => {
  const f = fixture({ role: 'student' });
  await f.click({ entry: String(entryIndex('student', 'fullscan')) });
  const count = f.launches.length;
  f.shell.showHome();
  assert.equal(f.home.hidden, false);
  assert.equal(f.shell.element.dataset.role, 'student');
  assert.equal(f.launches.length, count);
  assert.deepEqual(f.roles, []);
  assert.ok(f.shell.element.children[0].innerHTML.includes(text.roles.student.items[entryIndex('student', 'fullscan')].title));
  f.shell.destroy();
});

test('a refused launch leaves the entry open and releases its busy state', async () => {
  const f = fixture({ role: 'exam' });
  f.setAccept(false);
  await f.click({ entry: '0' });
  assert.equal(f.home.hidden, false);
  assert.equal(f.shell.element.attributes.get('aria-busy'), 'false');
  assert.deepEqual(f.launches, [{ role: 'exam', route: 'assessment' }]);
  f.shell.destroy();
});

test('destroy removes its DOM and resize/click listeners', () => {
  const f = fixture();
  assert.equal(f.listeners.has('resize'), true);
  f.shell.destroy();
  assert.equal(f.shell.element.removed, true);
  assert.equal(f.shell.element.listeners.has('click'), false);
  assert.equal(f.listeners.has('resize'), false);
  f.shell.update({ role: 'teacher', route: 'principle' });
  assert.equal(f.shell.element.removed, true);
});

test('teacher home has the three meaningful groups and all cards show an action and result', async () => {
  const f = fixture();
  await f.unlockTeacher();
  for (const track of ['plate', 'weld']) {
    await f.click({ track });
    assert.deepEqual([...f.home.innerHTML.matchAll(/data-learning-group="([^"]+)"/g)].map((m) => m[1]), ['theory', 'practice', 'preparation']);
    assert.deepEqual([...f.home.innerHTML.matchAll(/data-learning-track="([^"]+)"/g)].map((m) => m[1]), [track]);
    const items = text.roles.teacher.items.filter((item) => item.track === track);
    assert.equal((f.home.innerHTML.match(/class="ut-learning-card-label"/g) || []).length, items.length * 3);
    assert.ok(f.home.innerHTML.includes(text.roles.teacher.intro));
    for (const item of items) {
      assert.ok(f.home.innerHTML.includes(item.action));
      assert.ok(f.home.innerHTML.includes(item.outcome));
    }
  }
  f.shell.destroy();
});

test('student home exposes theory and practice without a teacher preparation group', async () => {
  const f = fixture({ role: 'student' });
  let entries = 0;
  for (const track of ['plate', 'weld']) {
    await f.click({ track });
    assert.deepEqual([...f.home.innerHTML.matchAll(/data-learning-group="([^"]+)"/g)].map((m) => m[1]), ['theory', 'practice', 'review']);
    entries += (f.home.innerHTML.match(/data-entry=/g) || []).length;
  }
  assert.equal(text.roles.student.items.filter((item) => item.track === 'plate').length, 4);
  assert.equal(entries, text.roles.student.items.length);
  assert.ok(f.home.innerHTML.includes(text.roles.student.note));
  assert.equal(text.roles.student.items.some((item) => item.route === 'preparation'), false);
  f.shell.destroy();
});

test('both teaching and student entries directly launch structure, principle, and parameter verification', async () => {
  assert.equal(entryIndex('student', 'principle'), -1);
  assert.equal(entryIndex('student', 'inspection'), -1);
  for (const [role, route] of [['teacher', 'equipment'], ['teacher', 'principle'], ['teacher', 'inspection'], ['student', 'equipment']]) {
    const f = fixture({ role });
    if (role === 'teacher') await f.unlockTeacher();
    const index = entryIndex(role, route);
    assert.ok(index >= 0);
    await f.click({ entry: String(index) });
    assert.deepEqual(f.launches, [{ role, route }]);
    assert.equal(f.home.hidden, true);
    f.shell.destroy();
  }
});

test('teacher preparation sends the route without changing the launch payload shape', async () => {
  const f = fixture();
  await f.unlockTeacher();
  await f.click({ entry: String(entryIndex('teacher', 'preparation')) });
  assert.deepEqual(f.launches, [{ role: 'teacher', route: 'preparation' }]);
  assert.ok(f.shell.element.children[0].innerHTML.includes(text.roles.teacher.items[entryIndex('teacher', 'preparation')].title));
  f.shell.destroy();
});

test('assembly and calibration are included in the full workflow instead of separate entry cards', () => {
  for (const role of ['teacher', 'student']) {
    assert.equal(entryIndex(role, 'assembly'), -1);
    assert.equal(entryIndex(role, 'calibration'), -1);
    const card = text.roles[role].items[entryIndex(role, 'fullscan')];
    const bench = role === 'student' ? text.roles.student.items[entryIndex('student', 'equipment')] : card;
    assert.ok(bench.action.includes('连接'));
    assert.ok(`${card.description}${card.action}`.includes('校准'));
  }
  const f = fixture({ role: 'exam' });
  assert.deepEqual([...f.home.innerHTML.matchAll(/data-learning-group="([^"]+)"/g)].map((m) => m[1]), ['training', 'training']);
  assert.ok(f.home.innerHTML.includes(text.roles.exam.intro));
  assert.equal(!!text.roles.student.note && f.home.innerHTML.includes(text.roles.student.note), false);
  assert.equal((f.home.innerHTML.match(/data-entry=/g) || []).length, text.roles.exam.items.length);
  f.shell.destroy();
});

test('all grouped topic buttons retain their flat item indexes across home and quick navigation', async () => {
  const f = fixture();
  await f.unlockTeacher();
  const indexes = [];
  for (const track of ['plate', 'weld']) {
    await f.click({ track });
    indexes.push(...[...f.home.innerHTML.matchAll(/data-entry="(\d+)"/g)].map((m) => Number(m[1])));
  }
  assert.deepEqual(indexes, text.roles.teacher.items.map((_, index) => index));
  f.shell.update({ role: 'teacher', route: 'preparation' });
  assert.equal(f.home.hidden, true);
  assert.equal((f.shell.element.children[1].innerHTML.match(/aria-current="page"/g) || []).length, 1);
  f.shell.showHome();
  assert.equal(f.home.hidden, false);
  assert.ok(f.home.innerHTML.includes(text.groups.find((group) => group.id === 'preparation').title));
  assert.equal(f.launches.length, 0);
  f.shell.destroy();
});
