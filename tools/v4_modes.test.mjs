import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

// Event and navigation tests use a small DOM double. They do not claim browser
// layout, WebGL interaction, or password protection against source inspection.
const text = JSON.parse(fs.readFileSync(new URL('../../knowledge/learning.json', import.meta.url), 'utf8'));
const source = fs.readFileSync(new URL('../src/learning-shell.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace('export function createLearningShell', 'function createLearningShell');

class Element {
  constructor() {
    this.children = []; this.dataset = {}; this.listeners = new Map(); this.attributes = new Map();
    this.style = { setProperty() {} }; this.hidden = false; this.innerHTML = '';
  }
  set innerHTML(value) {
    this.markup = value;
    this.input = value.includes('data-learning-password') ? { value: '', focus() {}, matches: (selector) => selector === '[data-learning-password]' } : null;
  }
  get innerHTML() { return this.markup; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getBoundingClientRect() { return { bottom: 108 }; }
  querySelector(selector) { return selector === '[data-learning-password]' ? this.input : { focus() {} }; }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  removeEventListener(name) { this.listeners.delete(name); }
  contains() { return true; }
  remove() { this.removed = true; }
}

function fixture(initial = {}) {
  const roles = [], launches = [];
  const document = { createElement: () => new Element() };
  const window = { addEventListener() {}, removeEventListener() {} };
  const create = new Function('text', 'document', 'window', 'ResizeObserver', `${source}\nreturn createLearningShell;`)(text, document, window, undefined);
  const shell = create({ mount: new Element(), getState: () => initial,
    onRoleChange: (role) => roles.push(role), onLaunch: (payload) => launches.push(payload) });
  const flush = () => new Promise(setImmediate);
  const click = async (dataset) => {
    shell.element.listeners.get('click')({ target: { closest: () => ({ dataset, disabled: false }) }, preventDefault() {} });
    await flush();
  };
  const password = async (value, keyboard = false) => {
    const input = shell.element.children[4].querySelector('[data-learning-password]');
    assert.ok(input, 'Password prompt must exist');
    input.value = value;
    if (keyboard) shell.element.listeners.get('keydown')({ key: 'Enter', target: input, preventDefault() {} });
    else await click({ act: 'teacher-submit' });
    await flush();
  };
  return { shell, roles, launches, click, password, flush, home: shell.element.children[3], auth: shell.element.children[4] };
}

test('initial chooser presents the three requested modes, without displaying any password', () => {
  const f = fixture();
  assert.equal((f.home.innerHTML.match(/data-role=/g) || []).length, 3);
  for (const label of ['教师模式', '自学模式', '实训模式']) assert.ok(f.home.innerHTML.includes(label));
  assert.equal(f.shell.getState().role, null);
  assert.equal(f.shell.teacherUnlocked(), false);
  assert.equal(f.home.innerHTML.includes('4404'), false);
  assert.equal(f.auth.hidden, true);
  f.shell.destroy();
});

test('teacher selection waits for a correct masked password and calls no teacher callback before it', async () => {
  const f = fixture();
  await f.click({ role: 'teacher' });
  assert.deepEqual(f.roles, []);
  assert.equal(f.shell.getState().role, null);
  assert.equal(f.shell.teacherUnlocked(), false);
  assert.match(f.auth.innerHTML, /type="password"/);
  assert.match(f.auth.innerHTML, /placeholder="教室门牌"/);
  assert.equal(f.home.inert, true);
  await f.password('incorrect');
  assert.deepEqual(f.roles, []);
  assert.ok(f.auth.innerHTML.includes(text.teacher_gate.error));
  assert.equal(f.shell.teacherUnlocked(), false);
  await f.password('4404');
  assert.deepEqual(f.roles, ['teacher']);
  assert.equal(f.shell.teacherUnlocked(), true);
  assert.equal(f.auth.hidden, true);
  assert.equal(f.home.inert, false);
  assert.equal(text.roles.teacher.items.filter((item) => item.track === 'plate').length, 6);
  assert.equal((f.home.innerHTML.match(/data-track=/g) || []).length, 3);
  await f.click({ track: 'plate' });
  assert.equal((f.home.innerHTML.match(/data-entry=/g) || []).length, 6);
  assert.deepEqual(f.launches, []);
  f.shell.destroy();
});

test('self-study entry_route opens the workbench gate before track home', async () => {
  const roles = [], entries = [];
  const document = { createElement: () => new Element() };
  const window = { addEventListener() {}, removeEventListener() {} };
  const create = new Function('text', 'document', 'window', 'ResizeObserver', `${source}\nreturn createLearningShell;`)(text, document, window, undefined);
  const shell = create({
    mount: new Element(),
    getState: () => ({}),
    onRoleChange: (role) => roles.push(role),
    onEntryRoute: async ({ role, route }) => {
      entries.push({ role, route });
      return true;
    },
    onLaunch: () => false,
  });
  const flush = () => new Promise(setImmediate);
  shell.element.listeners.get('click')({ target: { closest: () => ({ dataset: { role: 'student' }, disabled: false }) }, preventDefault() {} });
  await flush();
  assert.deepEqual(roles, ['student']);
  assert.deepEqual(entries, [{ role: 'student', route: 'bench' }]);
  assert.equal(shell.getState().role, 'student');
  assert.equal(shell.getState().route, 'bench');
  assert.equal(shell.getState().home, false);
  shell.showTopics();
  assert.equal(shell.getState().home, true);
  assert.equal(shell.getState().route, null);
  assert.equal((shell.element.children[3].innerHTML.match(/data-track=/g) || []).length, 3);
  shell.destroy();
});

test('Enter submits the password and Escape cancels without entering teacher mode', async () => {
  const f = fixture();
  await f.click({ role: 'teacher' });
  f.shell.element.listeners.get('keydown')({ key: 'Escape', target: {}, preventDefault() {} });
  assert.equal(f.auth.hidden, true);
  assert.deepEqual(f.roles, []);
  await f.click({ role: 'teacher' });
  await f.password('4404', true);
  assert.equal(f.shell.teacherUnlocked(), true);
  assert.deepEqual(f.roles, ['teacher']);
  f.shell.destroy();
});

test('restored teacher state, external update and showHome cannot bypass the password gate', async () => {
  const f = fixture({ role: 'teacher', route: 'preparation', teacherUnlocked: true });
  assert.equal(f.shell.getState().role, null);
  assert.equal(f.shell.getState().route, null);
  assert.equal(f.shell.teacherUnlocked(), false);
  f.shell.update({ role: 'teacher', route: 'preparation', teacherUnlocked: true });
  assert.equal(f.shell.getState().role, null);
  assert.equal(f.shell.getState().route, null);
  assert.equal(f.shell.getState().authPending, true);
  await f.click({ entry: '0' });
  assert.deepEqual(f.launches, []);
  await f.click({ act: 'teacher-cancel' });
  f.shell.showHome('teacher');
  assert.equal(f.shell.getState().authPending, true);
  assert.deepEqual(f.roles, []);
  f.shell.destroy();
});

test('teacher topic home retains authorization, but returning to mode selection revokes it', async () => {
  const f = fixture();
  await f.click({ role: 'teacher' }); await f.password('4404');
  const index = text.roles.teacher.items.findIndex((item) => item.route === 'principle');
  await f.click({ entry: String(index) });
  assert.equal(f.home.hidden, true);
  f.shell.showHome();
  assert.equal(f.shell.teacherUnlocked(), true);
  assert.equal(f.home.hidden, false);
  assert.deepEqual(f.roles, ['teacher']);
  await f.click({ act: 'home' });
  assert.deepEqual(f.roles, ['teacher', null]);
  assert.equal(f.shell.teacherUnlocked(), false);
  assert.equal(f.shell.getState().role, null);
  await f.click({ role: 'teacher' });
  assert.deepEqual(f.roles, ['teacher', null]);
  assert.equal(f.shell.getState().authPending, true);
  f.shell.destroy();
});

test('switching from teacher to self-study or training requires a password on teacher return', async () => {
  for (const role of ['student', 'exam']) {
    const f = fixture();
    await f.click({ role: 'teacher' }); await f.password('4404');
    await f.click({ role });
    assert.equal(f.shell.getState().role, role);
    assert.equal(f.shell.teacherUnlocked(), false);
    assert.deepEqual(f.roles, ['teacher', role]);
    await f.click({ role: 'teacher' });
    assert.deepEqual(f.roles, ['teacher', role]);
    assert.equal(f.shell.getState().role, role);
    assert.equal(f.shell.getState().authPending, true);
    f.shell.destroy();
  }
});

test('self-study has process-card design; training contains detection only', async () => {
  const f = fixture();
  await f.click({ role: 'student' });
  assert.deepEqual(text.roles.student.items.filter((item) => item.track === 'plate').map((item) => item.route), ['equipment', 'fullscan', 'task', 'study-plate']);
  assert.deepEqual(text.roles.student.items.filter((item) => item.track === 'weld').map((item) => item.route), ['angle-structure', 'angle-principle', 'angle-calib', 'angle-scan', 'angle-card', 'study-weld']);
  await f.click({ track: 'plate' });
  assert.equal((f.home.innerHTML.match(/data-entry=/g) || []).length, 4);
  assert.ok(f.home.innerHTML.includes('钢板检测流程'));
  assert.ok(f.home.innerHTML.includes('认识设备'));
  assert.ok(f.home.innerHTML.includes('工艺卡'));
  assert.equal(f.home.innerHTML.includes('工艺卡设计'), false);
  await f.click({ track: 'weld' });
  assert.equal((f.home.innerHTML.match(/data-entry=/g) || []).length, 6);
  await f.click({ role: 'exam' });
  assert.deepEqual(text.roles.exam.items.filter((item) => item.track === 'plate').map((item) => item.route), ['assessment']);
  assert.deepEqual(text.roles.exam.items.filter((item) => item.track === 'weld').map((item) => item.route), ['angle-exam']);
  await f.click({ entry: '0' });
  assert.deepEqual(f.launches, [{ role: 'exam', route: 'assessment' }]);
  assert.equal(JSON.stringify(text).includes('题码'), false);
  assert.equal(JSON.stringify(text).includes('案例码'), false);
  f.shell.destroy();
});

test('destroy clears teacher authorization and all delegated password handlers', async () => {
  const f = fixture();
  await f.click({ role: 'teacher' }); await f.password('4404');
  f.shell.destroy();
  assert.equal(f.shell.teacherUnlocked(), false);
  for (const event of ['click', 'submit', 'keydown']) assert.equal(f.shell.element.listeners.has(event), false);
});
