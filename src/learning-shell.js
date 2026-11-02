import text from '../../knowledge/learning.json';
import './learning-shell.css';

let instanceId = 0;
const ROLES = ['teacher', 'student', 'exam'];
const TEACHER_PASSWORD = '4404';
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

// Mount in a dedicated row below the app header. The overlay starts below this row.
// onRoleChange(role) selects an entry without launching a topic; null means the
// mode-selection screen was opened and the previous role must be cleared.
// onLaunch({ role, route, taskMode? }) may return false to keep the entry open.
// onEntryRoute({ role, route }) runs after role select when roles.*.entry_route is set;
// return false to keep the normal topic / track home instead.
// onReturnBench() opens the self-study equipment workbench.
// update({ role, route }) syncs external navigation; teacher entry always requires
// this shell's password gate, including restored state and external updates.
// showHome(role?) opens the entry while preserving the running topic's state.
// showTopics() opens the role's topic / track home without clearing the role.
// Group metadata only affects the home layout; launch indexes refer to flat items.
export function createLearningShell({ mount, onLaunch, onRoleChange, onEntryRoute, onReturnBench, getState, esc = escapeHTML } = {}) {
  if (!mount?.appendChild) throw new TypeError('A learning-shell mount element is required');
  const initial = getState?.() || {};
  const state = {
    role: ROLES.includes(initial.role) && initial.role !== 'teacher' ? initial.role : null,
    route: ROLES.includes(initial.role) && initial.role !== 'teacher' ? initial.route || null : null,
    home: !ROLES.includes(initial.role) || initial.role === 'teacher' || !initial.route,
    busy: false,
    error: false,
    authPending: false,
    authError: '',
    track: null,
    lockTrack: false,
  };
  let unlocked = false;
  const titleId = `learning-home-title-${++instanceId}`;
  const root = document.createElement('section');
  root.className = 'ut-learning-shell';
  root.setAttribute('aria-label', text.title);
  const bar = document.createElement('div');
  bar.className = 'ut-learning-bar';
  const topics = document.createElement('nav');
  topics.className = 'ut-learning-topics';
  topics.setAttribute('aria-label', text.topics_label);
  const home = document.createElement('section');
  home.className = 'ut-learning-home';
  home.setAttribute('aria-labelledby', titleId);
  const status = document.createElement('p');
  status.className = 'ut-learning-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const auth = document.createElement('section');
  auth.className = 'ut-learning-auth-overlay';
  auth.setAttribute('aria-label', text.teacher_gate.title);
  root.append(bar, topics, status, home, auth);
  mount.appendChild(root);

  const entries = () => text.roles[state.role]?.items || [];
  const groupedEntries = (items = entries().map((item, index) => ({ item, index }))) => {
    const groups = (text.groups || []).map((group) => ({ ...group, items: items.filter(({ item }) => item.group === group.id) }));
    const known = new Set(groups.map((group) => group.id));
    const other = items.filter(({ item }) => !known.has(item.group));
    if (other.length) groups.push({ id: 'other', title: text.topics, items: other });
    return groups.filter((group) => group.items.length);
  };
  // Tracks (plate / weld) split the role home when more than one of them has entries.
  const trackedEntries = () => {
    const items = entries().map((item, index) => ({ item, index }));
    const tracks = (text.tracks || []).map((track) => ({ ...track, items: items.filter(({ item }) => (item.track || text.tracks[0].id) === track.id) }))
      .filter((track) => track.items.length);
    return tracks.length > 1 ? tracks : null;
  };
  // Roles with track_nav open on a probe choice; the chosen track then lists only its own modules.
  const trackNav = () => (text.roles[state.role]?.track_nav ? trackedEntries() : null);
  const trackOf = (route) => {
    const item = entries().find((entry) => entry.route === route);
    return item ? item.track || text.tracks[0].id : null;
  };
  const disabled = () => state.busy ? ' disabled' : '';
  const activeRoute = () => entries().find((item) => item.route === state.route);
  const entryRouteOf = (role = state.role) => text.roles[role]?.entry_route || null;
  const entryTitleOf = (role = state.role) => text.roles[role]?.entry_title || text.bench_gate?.title || text.topics;
  const onEntry = () => !!state.role && !!state.route && state.route === entryRouteOf();
  state.track = trackOf(state.route);
  let disposed = false;
  let resizeObserver = null;

  function placeOverlay() {
    if (disposed) return;
    root.style.setProperty('--ut-learning-home-top', `${Math.max(0, Math.ceil(root.getBoundingClientRect().bottom))}px`);
  }

  function topicCard({ item, index, n = index }) {
    // Keep a single functional blurb; drop action/outcome micro-copy for a cleaner card.
    return `<button type="button" class="ut-learning-card" data-entry="${index}" aria-labelledby="${titleId}-entry-${index}"${disabled()}>`
      + artwork(item.art, 'ut-learning-card-image')
      + `<span class="ut-learning-card-body"><span class="ut-learning-card-top"><span class="ut-learning-number">${String(n + 1).padStart(2, '0')}</span>${item.optional ? `<span class="ut-learning-option">${esc(text.optional)}</span>` : ''}</span>`
      + `<strong id="${titleId}-entry-${index}">${esc(item.title)}</strong>`
      + (item.description ? `<span class="ut-learning-description">${esc(item.description)}</span>` : '')
      + `<span class="ut-learning-card-action">${esc(text.start)} <span aria-hidden="true">→</span></span></span></button>`;
  }

  function artwork(key, className) {
    const art = text.artworks?.[key];
    if (!art?.src?.startsWith('data:image/svg+xml;base64,')) return '';
    return `<span class="${className}" data-artwork="${esc(key)}"><img src="${esc(art.src)}" alt="${esc(art.alt || '')}" width="680" height="400" decoding="async" draggable="false"><span class="ut-learning-image-caption" aria-hidden="true">${esc(art.caption || '')}</span></span>`;
  }

  function photo(key, className) {
    const shot = text.renders?.[key];
    if (!shot?.src?.startsWith('data:image/jpeg;base64,')) return '';
    return `<span class="${className}" data-render="${esc(key)}"><img src="${esc(shot.src)}" alt="${esc(shot.alt || '')}" width="1020" height="600" decoding="async" draggable="false"></span>`;
  }

  function roleCard(role, index) {
    const entry = text.roles[role];
    return `<button type="button" class="ut-learning-card ut-learning-role-card" data-role="${role}" aria-labelledby="${titleId}-${role}"${disabled()}>`
      + `<span class="ut-learning-role-top"><span>${String(index + 1).padStart(2, '0')}</span></span>`
      + artwork(entry.art, 'ut-learning-role-image')
      + `<span class="ut-learning-card-body"><strong id="${titleId}-${role}">${esc(entry.label)}</strong>`
      + `<span class="ut-learning-card-action">${esc(entry.enter || '进入')} <span aria-hidden="true">→</span></span></span></button>`;
  }

  function trackCard(track, index) {
    return `<button type="button" class="ut-learning-card ut-learning-track-card" data-track="${esc(track.id)}" aria-labelledby="${titleId}-tc-${esc(track.id)}"${disabled()}>`
      + photo(track.art, 'ut-learning-track-image')
      + `<span class="ut-learning-card-body"><span class="ut-learning-card-top"><span class="ut-learning-number">${String(index + 1).padStart(2, '0')}</span></span>`
      + `<span class="ut-learning-track-heading"><strong id="${titleId}-tc-${esc(track.id)}">${esc(track.label || track.title)}</strong>${track.scope ? `<span class="ut-learning-role-tag">${esc(track.scope)}</span>` : ''}</span>`
      + `<span class="ut-learning-card-action">${esc(text.track_enter || text.start)} <span aria-hidden="true">→</span></span></span></button>`;
  }

  function render() {
    if (disposed) return;
    root.dataset.role = state.role || 'home';
    root.dataset.home = String(state.home);
    root.dataset.teacherUnlocked = String(unlocked);
    root.setAttribute('aria-busy', String(state.busy));
    const showBenchBtn = typeof onReturnBench === 'function' && state.route && state.route !== 'bench'
      && (state.role === 'student' || state.role === 'exam');
    // Only while a probe track is active (topic list or open module); hide on workbench / mode home.
    const showTracksBtn = state.role === 'student' && !!trackNav() && !!state.track && !state.lockTrack;
    bar.innerHTML = `<button type="button" class="ut-learning-home-button" data-act="home" title="${esc(text.back)}"${disabled()}>${esc(text.home)}</button>`
      + `<nav class="ut-learning-roles" aria-label="${esc(text.roles_label)}">${ROLES.map((role) => `<button type="button" data-role="${role}" aria-pressed="${state.role === role}"${disabled()}>${esc(text.roles[role].label)}</button>`).join('')}</nav>`
      + (showTracksBtn ? `<button type="button" class="ut-learning-tracks-button" data-act="tracks"${disabled()}>${esc(text.to_tracks || text.track_back)}</button>` : '')
      + (showBenchBtn ? `<button type="button" class="ut-learning-bench-button" data-act="bench"${disabled()}>${esc(text.to_bench)}</button>` : '')
      + `<span class="ut-learning-current">${esc(onEntry() ? entryTitleOf() : (activeRoute()?.title || text.topics))}</span>`;
    // Hide topic chips during the entry gate (e.g. workbench kit recognition).
    topics.hidden = !state.role || state.home || onEntry();
    // flat_home: keep every module in one equal grid (e.g. 实训三项目并排).
    const tracked = text.roles[state.role]?.flat_home ? null : trackedEntries();
    const nav = trackNav();
    // Prefer explicit track; else infer from the open route so plate/weld topics never mix.
    const activeTrack = state.track || trackOf(state.route);
    const navTrack = nav?.find((track) => track.id === activeTrack) || null;
    const topicItems = navTrack ? navTrack.items : entries().map((item, index) => ({ item, index }));
    topics.innerHTML = (navTrack ? `<button type="button" class="ut-learning-topics-track" data-act="track-home"${disabled()}>${esc(navTrack.label || navTrack.title)}</button><span class="ut-learning-topics-sep" aria-hidden="true"></span>` : '')
      + topicItems.map(({ item, index }, i) => (tracked && !navTrack && i && (item.track || '') !== (topicItems[i - 1].item.track || '') ? '<span class="ut-learning-topics-sep" aria-hidden="true"></span>' : '')
      + `<button type="button" data-entry="${index}"${item.route === state.route ? ' aria-current="page"' : ''}${disabled()}>${esc(item.title)}${item.optional ? `<span class="ut-learning-option">${esc(text.optional)}</span>` : ''}</button>`).join('');
    status.hidden = !state.busy && !state.error;
    status.textContent = state.busy ? text.busy : state.error ? text.error : '';
    home.hidden = !state.home;
    const selected = text.roles[state.role];
    const intro = selected ? selected.intro : text.intro;
    const back = '';
    const groupHtml = (groups, prefix = '') => groups
      .filter((group) => !state.lockTrack || group.id === 'theory' || group.id === 'practice')
      .map((group) => `<section class="ut-learning-group" data-learning-group="${esc(group.id)}" aria-labelledby="${titleId}-${prefix}${esc(group.id)}">`
      + `<div class="ut-learning-group-heading"><h3 id="${titleId}-${prefix}${esc(group.id)}">${esc(group.title)}</h3>${group.hint ? `<p>${esc(group.hint)}</p>` : ''}</div>`
      + `<div class="ut-learning-grid">${group.items.map(topicCard).join('')}</div></section>`).join('');
    const trackSection = (track, head) => `<section class="ut-learning-track" data-learning-track="${esc(track.id)}" aria-labelledby="${titleId}-track-${esc(track.id)}">`
      + `${head}<h2 class="ut-learning-track-title" id="${titleId}-track-${esc(track.id)}">${esc(track.title)}</h2>`
      + `${groupHtml(groupedEntries(track.items), `${esc(track.id)}-`)}</section>`;
    const trackBack = state.lockTrack ? '' : `<button type="button" class="ut-learning-track-back" data-act="tracks"${disabled()}><span aria-hidden="true">‹</span> ${esc(text.track_back || text.topics)}</button>`;
    const cards = !selected ? `<div class="ut-learning-grid ut-learning-grid-roles">${ROLES.map(roleCard).join('')}</div>`
      : navTrack ? trackSection({ ...navTrack, items: navTrack.items.map((entry, n) => ({ ...entry, n })) }, trackBack)
      : nav ? `<div class="ut-learning-grid ut-learning-grid-tracks">${nav.map(trackCard).join('')}</div>`
      : tracked ? tracked.map((track) => trackSection(track, '')).join('')
      : groupHtml(groupedEntries());
    const note = selected?.note ? `<p class="ut-learning-entry-note">${esc(selected.note)}</p>` : '';
    const eyebrow = selected?.eyebrow || text.visual?.eyebrow || '';
    const masthead = eyebrow ? `<span class="ut-learning-eyebrow"><span class="ut-learning-signal" aria-hidden="true"></span>${esc(eyebrow)}</span>` : '';
    const title = selected?.label || text.title;
    const lic = text.visual?.copyright_link ? `<button type="button" class="ut-learning-lic" data-lic-notice>${esc(text.visual.copyright_link)}</button>` : '';
    const manual = text.visual?.manual_link ? `<button type="button" class="ut-learning-lic" data-manual-open>${esc(text.visual.manual_link)}</button>` : '';
    const footBits = [text.visual?.footer, manual, lic].filter(Boolean);
    const footer = footBits.length
      ? `<div class="ut-learning-home-footer">${text.visual?.footer ? `<span>${esc(text.visual.footer)}</span>` : ''}${manual}${lic}</div>`
      : `<div class="ut-learning-home-footer">${manual}${lic}</div>`;
    const heroSide = selected
      ? (navTrack ? photo(navTrack.art, 'ut-learning-hero-image ut-learning-hero-photo') : artwork(selected.art, 'ut-learning-hero-image'))
      : '';
    home.innerHTML = `<div class="ut-learning-home-content"><div class="ut-learning-intro${selected ? ' ut-learning-intro-topic' : ''}">${back}<div class="ut-learning-hero-copy">${masthead}<h2 id="${titleId}" tabindex="-1">${esc(title)}</h2>${intro ? `<p>${esc(intro)}</p>` : ''}${note}</div>${heroSide}</div>${cards}${footer}</div>`;
    auth.hidden = !state.authPending;
    bar.inert = topics.inert = home.inert = state.authPending;
    const gate = text.teacher_gate;
    auth.innerHTML = state.authPending ? `<form class="ut-learning-auth" role="dialog" aria-modal="true" aria-labelledby="${titleId}-auth" aria-describedby="${titleId}-auth-hint" data-teacher-gate>`
      + (gate.eyebrow ? `<span class="ut-learning-auth-kicker">${esc(gate.eyebrow)}</span>` : '')
      + `<h2 id="${titleId}-auth">${esc(gate.title)}</h2><p id="${titleId}-auth-hint">${esc(gate.hint)}</p>`
      + `<label for="${titleId}-password">${esc(gate.label)}</label><input id="${titleId}-password" type="password" inputmode="numeric" autocomplete="off" placeholder="${esc(gate.placeholder)}" data-learning-password${state.authError ? ` aria-invalid="true" aria-describedby="${titleId}-auth-error"` : ''}${disabled()}>`
      + `<p class="ut-learning-auth-error" id="${titleId}-auth-error" role="alert">${esc(state.authError)}</p>`
      + `<div class="ut-learning-auth-actions"><button type="button" data-act="teacher-cancel"${disabled()}>${esc(gate.cancel)}</button><button type="submit" data-act="teacher-submit"${disabled()}>${esc(gate.submit)}</button></div></form>` : '';
    placeOverlay();
  }

  function requestTeacher() {
    if (disposed || state.busy) return;
    state.authPending = true;
    state.authError = '';
    state.error = false;
    render();
    auth.querySelector('[data-learning-password]')?.focus({ preventScroll: true });
  }

  async function chooseRole(role) {
    if (disposed || !ROLES.includes(role) || state.busy) return;
    if (role === 'teacher' && !unlocked) { requestTeacher(); return; }
    if (role !== 'teacher') unlocked = false;
    state.role = role;
    state.route = null;
    state.track = null;
    state.lockTrack = false;
    state.home = true;
    state.error = false;
    state.authPending = false;
    state.authError = '';
    state.busy = true;
    render();
    try {
      await onRoleChange?.(role);
      const entry = entryRouteOf(role);
      if (entry && typeof onEntryRoute === 'function') {
        const opened = await onEntryRoute({ role, route: entry });
        if (!disposed && opened !== false) {
          state.route = entry;
          state.home = false;
          state.track = null;
        }
      }
    } catch {
      state.error = true;
    } finally {
      if (!disposed) {
        state.busy = false;
        render();
        if (state.home) home.querySelector('h2')?.focus({ preventScroll: true });
      }
    }
  }

  async function submitPassword() {
    if (disposed || state.busy || !state.authPending) return;
    const input = auth.querySelector('[data-learning-password]');
    const value = String(input?.value ?? '').trim();
    if (input) input.value = '';
    if (value !== TEACHER_PASSWORD) {
      state.authError = text.teacher_gate.error;
      render();
      auth.querySelector('[data-learning-password]')?.focus({ preventScroll: true });
      return;
    }
    unlocked = true;
    await chooseRole('teacher');
  }

  function cancelPassword() {
    state.authPending = false;
    state.authError = '';
    render();
    (state.home ? home : bar).querySelector('[data-role="teacher"]')?.focus({ preventScroll: true });
  }

  async function launch(index) {
    const item = entries()[index];
    if (!item || state.busy || state.authPending || typeof onLaunch !== 'function') return;
    if (state.role === 'teacher' && !unlocked) { requestTeacher(); return; }
    const payload = { role: state.role, route: item.route, ...(item.taskMode ? { taskMode: item.taskMode } : {}) };
    state.busy = true;
    state.error = false;
    render();
    try {
      const result = await onLaunch(payload);
      if (!disposed && result !== false) {
        state.role = payload.role;
        state.route = payload.route;
        state.track = trackOf(payload.route);
        state.home = false;
      }
    } catch {
      state.error = true;
      state.home = true;
    } finally {
      if (!disposed) {
        state.busy = false;
        render();
        if (!state.home) topics.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
      }
    }
  }

  function handleClick(event) {
    const button = event.target.closest('button');
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.dataset.act === 'teacher-submit') { event.preventDefault?.(); submitPassword(); }
    else if (button.dataset.act === 'teacher-cancel') cancelPassword();
    else if (state.authPending) return;
    else if (button.dataset.role) chooseRole(button.dataset.role);
    else if (button.dataset.track) chooseTrack(button.dataset.track);
    else if (button.dataset.entry != null) launch(Number(button.dataset.entry));
    else if (button.dataset.act === 'tracks') chooseTrack(null);
    else if (button.dataset.act === 'track-home') showHome();
    else if (button.dataset.act === 'bench') returnToBench();
    else if (button.dataset.act === 'home' || button.dataset.act === 'all-roles') showModeSelection();
  }

  async function returnToBench() {
    if (disposed || state.busy || typeof onReturnBench !== 'function') return;
    state.busy = true;
    state.error = false;
    render();
    try {
      const opened = await onReturnBench();
      if (!disposed && opened !== false) {
        state.role = 'student';
        state.route = 'bench';
        state.track = null;
        state.home = false;
      }
    } catch {
      state.error = true;
    } finally {
      if (!disposed) {
        state.busy = false;
        render();
      }
    }
  }

  function chooseTrack(id) {
    if (disposed || state.busy) return;
    const next = trackNav()?.some((track) => track.id === id) ? id : null;
    state.track = next;
    state.home = true;
    state.route = null;
    state.error = false;
    // Close open modules when returning to 探头选择; keep student role.
    if (!next) onRoleChange?.(state.role);
    const auto = next
      ? entries().find((item) => (item.track || text.tracks?.[0]?.id) === next && item.auto_enter)
      : null;
    if (auto) {
      const index = entries().indexOf(auto);
      if (index >= 0) {
        launch(index);
        return;
      }
    }
    render();
    home.querySelector('h2')?.focus({ preventScroll: true });
  }

  function handleSubmit(event) {
    if (!state.authPending || !root.contains(event.target)) return;
    event.preventDefault?.();
    submitPassword();
  }

  function handleKeydown(event) {
    if (!state.authPending) return;
    if (event.key === 'Escape') { event.preventDefault?.(); cancelPassword(); }
    else if (event.key === 'Enter' && event.target.matches?.('[data-learning-password]')) {
      event.preventDefault?.();
      submitPassword();
    } else if (event.key === 'Tab') {
      const fields = [...(auth.querySelectorAll?.('input, button') || [])].filter((field) => !field.disabled);
      if (!fields.length) return;
      const first = fields[0], last = fields[fields.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault?.(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault?.(); first.focus(); }
    }
  }

  async function showModeSelection() {
    if (disposed || state.busy) return;
    unlocked = false;
    Object.assign(state, { role: null, route: null, track: null, home: true, busy: true, error: false, authPending: false, authError: '' });
    render();
    try {
      await onRoleChange?.(null);
    } catch {
      state.error = true;
    } finally {
      if (!disposed) {
        state.busy = false;
        render();
        home.querySelector('h2')?.focus({ preventScroll: true });
      }
    }
  }

  function update(next = {}) {
    if (disposed) return;
    if (next.role === 'teacher' && !unlocked) { requestTeacher(); return; }
    if (Object.hasOwn(next, 'role')) {
      const role = ROLES.includes(next.role) ? next.role : null;
      if (role !== state.role) state.track = null;
      state.role = role;
      if (state.role !== 'teacher') unlocked = false;
      state.authPending = false;
      state.authError = '';
    }
    if (Object.hasOwn(next, 'route')) {
      state.route = next.route || null;
      state.home = !state.route;
      if (state.route === entryRouteOf()) state.track = null;
      else if (state.route) state.track = trackOf(state.route) || state.track;
    }
    if (!state.role) { state.route = null; state.track = null; state.home = true; }
    state.error = false;
    render();
  }

  async function openRoute(role, route) {
    if (disposed || state.busy || !ROLES.includes(role)) return false;
    if (role === 'teacher' && !unlocked) { requestTeacher(); return false; }
    if (state.role !== role) await chooseRole(role);
    const index = entries().findIndex((item) => item.route === route);
    if (index < 0) return false;
    // Lock the probe track before launch so the topic bar only lists that track.
    const nextTrack = trackOf(route);
    if (nextTrack) state.track = nextTrack;
    await launch(index);
    return true;
  }

  function showHome(role) {
    if (disposed || state.busy) return;
    if (ROLES.includes(role)) {
      chooseRole(role);
      return;
    }
    state.home = true;
    state.error = false;
    render();
    home.querySelector('h2')?.focus({ preventScroll: true });
  }

  /** Open the role's track / topic home (keeps role; clears route). */
  function showTopics(opts = {}) {
    if (disposed || state.busy || !state.role) return;
    state.home = true;
    state.route = null;
    state.lockTrack = !!opts.lockTrack;
    state.track = opts.track || (opts.keepTrack ? state.track : null);
    state.error = false;
    render();
    home.querySelector('h2')?.focus({ preventScroll: true });
  }

  root.addEventListener('click', handleClick);
  root.addEventListener('submit', handleSubmit);
  root.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', placeOverlay);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(placeOverlay);
    resizeObserver.observe(root);
  }
  render();
  return {
    element: root,
    update,
    openRoute,
    showHome,
    showTopics,
    showModeSelection,
    teacherUnlocked: () => !disposed && unlocked && state.role === 'teacher',
    getState: () => ({ role: state.role, route: state.route, track: state.track, home: state.home, teacherUnlocked: !disposed && unlocked && state.role === 'teacher', authPending: state.authPending }),
    destroy() {
      disposed = true;
      unlocked = false;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', placeOverlay);
      root.removeEventListener('click', handleClick);
      root.removeEventListener('submit', handleSubmit);
      root.removeEventListener('keydown', handleKeydown);
      root.remove();
    },
  };
}

createLearningShell.checkTeacherPassword = (value) => String(value ?? '').trim() === TEACHER_PASSWORD;
