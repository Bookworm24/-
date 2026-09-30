/* ==========================================================================
   每日待办 · 应用逻辑
   纯原生 JavaScript · 零依赖 · 数据保存在浏览器 localStorage
   支持：不重复 / 每天 / 每周 / 每月 四种任务周期，到期自动重置
   ========================================================================== */
'use strict';

/* ---------- 常量 ---------- */
const STORAGE_KEY = 'flowtask.v2';

const CATEGORIES = [
  { id: 'work',   name: '工作' },
  { id: 'study',  name: '学习' },
  { id: 'life',   name: '生活' },
  { id: 'health', name: '健康' },
  { id: 'other',  name: '其他' }
];

const PRIORITY_LABEL = { high: '高', medium: '中', low: '低' };
const PRIORITY_RANK  = { high: 0, medium: 1, low: 2 };
const REPEAT_LABEL   = { none: '不重复', daily: '每天', weekly: '每周', monthly: '每月' };
const REPEAT_HINT    = {
  none: '一次性任务，完成后不再出现',
  daily: '每天自动重置，今天做完明天再来',
  weekly: '每周自动重置一次',
  monthly: '每月自动重置一次'
};
const RING_CIRCUMFERENCE = 326.73;

const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  edit:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L20 8a2.83 2.83 0 10-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
};

/* 空状态插画（手绘线条风） */
const EMPTY_ART = {
  notes:  '<svg class="empty-art" viewBox="0 0 88 88" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="8" width="60" height="72" rx="6"/><path d="M28 28h32M28 42h32M28 56h20"/></svg>',
  done:   '<svg class="empty-art" viewBox="0 0 88 88" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="44" cy="44" r="30"/><path d="M31 45l10 10 18-22"/></svg>',
  search: '<svg class="empty-art" viewBox="0 0 88 88" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="39" cy="39" r="22"/><path d="M55 55l16 16M30 39h18"/></svg>',
  layers: '<svg class="empty-art" viewBox="0 0 88 88" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="14" width="48" height="13" rx="3"/><rect x="20" y="37" width="48" height="13" rx="3"/><rect x="20" y="60" width="48" height="13" rx="3"/></svg>'
};

/* ---------- DOM 引用 ---------- */
const $ = s => document.querySelector(s);
const els = {
  dateLabel: $('#dateLabel'),
  searchInput: $('#searchInput'),
  notifyBtn: $('#notifyBtn'),
  themeBtn: $('#themeBtn'),
  sidebar: $('#sidebar'),
  filterToggle: $('#filterToggle'),
  drawerClose: $('#drawerClose'),
  drawerMask: $('#drawerMask'),
  ringFg: $('#ringFg'),
  ringPct: $('#ringPct'),
  progressText: $('#progressText'),
  weekChart: $('#weekChart'),
  categoryChips: $('#categoryChips'),
  priorityChips: $('#priorityChips'),
  statusChips: $('#statusChips'),
  statTotal: $('#statTotal'),
  statActive: $('#statActive'),
  statDone: $('#statDone'),
  statOverdue: $('#statOverdue'),
  alertBanner: $('#alertBanner'),
  resultInfo: $('#resultInfo'),
  sortSelect: $('#sortSelect'),
  clearCompletedBtn: $('#clearCompletedBtn'),
  taskList: $('#taskList'),
  fabBtn: $('#fabBtn'),
  modalOverlay: $('#modalOverlay'),
  modalTitle: $('#modalTitle'),
  modalClose: $('#modalClose'),
  taskForm: $('#taskForm'),
  titleInput: $('#titleInput'),
  descInput: $('#descInput'),
  prioritySeg: $('#prioritySeg'),
  categoryPicker: $('#categoryPicker'),
  repeatSeg: $('#repeatSeg'),
  repeatHint: $('#repeatHint'),
  dueInput: $('#dueInput'),
  cancelBtn: $('#cancelBtn'),
  submitBtn: $('#submitBtn'),
  confetti: $('#confetti'),
  toastWrap: $('#toastWrap'),
  metaTheme: $('#metaTheme')
};

/* ---------- 状态 ---------- */
function defaultState() {
  return {
    v: 2,
    seeded: false,
    theme: 'light',
    tasks: [],
    history: {},
    prefs: { filter: 'all', category: 'all', priority: 'all', sort: 'newest' }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || !Array.isArray(s.tasks)) return null;
    s.history = s.history || {};
    s.prefs = Object.assign(defaultState().prefs, s.prefs || {});
    return s;
  } catch (e) {
    return null;
  }
}

let state = loadState() || defaultState();
let searchTerm = '';
let editingId = null;
let draftPriority = 'medium';
let draftCat = 'other';
let draftRepeat = 'none';

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略存储异常 */ }
}

/* ---------- 工具函数 ---------- */
const pad = n => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const toLocalInput = d =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function fmtDueNeutral(dueAt) {
  const d = new Date(dueAt);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtTodayLabel() {
  const now = new Date();
  const wd = '日一二三四五六'[now.getDay()];
  const h = now.getHours();
  let greet = '晚上好';
  if (h < 6) greet = '夜深了';
  else if (h < 9) greet = '早上好';
  else if (h < 12) greet = '上午好';
  else if (h < 14) greet = '中午好';
  else if (h < 18) greet = '下午好';
  return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${wd} · ${greet}`;
}

function getCat(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

/* ---------- 重复任务核心 ---------- */
/* 当前周期标识：每天=今天日期 / 每周=本周日 / 每月=年月 */
function periodKeyFor(repeat) {
  const now = new Date();
  if (repeat === 'daily') return dateKey(now);
  if (repeat === 'weekly') {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    return 'W' + dateKey(d);
  }
  if (repeat === 'monthly') return 'M' + now.getFullYear() + '-' + pad(now.getMonth() + 1);
  return 'once';
}

/* 任务"当前是否已完成"：一次性看 completed；重复任务看本周期是否已完成 */
function isDone(t) {
  const repeat = t.repeat || 'none';
  if (repeat === 'none') return !!t.completed;
  return t.lastDone === periodKeyFor(repeat);
}

/* 任务在本周期内的实际截止时间（重复任务把时间部分套到当前周期） */
function effectiveDue(t) {
  if (!t.dueAt) return null;
  const src = new Date(t.dueAt);
  const repeat = t.repeat || 'none';
  if (repeat === 'none') return src;
  const now = new Date();
  const x = new Date(now);
  x.setHours(src.getHours(), src.getMinutes(), 0, 0);
  if (repeat === 'weekly') x.setDate(now.getDate() + (src.getDay() - now.getDay()));
  if (repeat === 'monthly') {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(src.getDate(), lastDay));
  }
  return x;
}

function isOverdue(t) {
  if (isDone(t)) return false;
  const eff = effectiveDue(t);
  return !!eff && eff.getTime() < Date.now();
}

/* 通知去重标识：一次性=once；重复任务=本周期 key（换周期后自动可再提醒） */
function notifiedStamp(t) {
  const repeat = t.repeat || 'none';
  return repeat === 'none' ? 'once' : periodKeyFor(repeat);
}

/* 截止时间展示 */
function fmtOnceDue(dueAt) {
  const d = new Date(dueAt);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff < 0) {
    const mins = Math.floor(-diff / 60000);
    let text;
    if (mins < 60) text = `已逾期 ${mins} 分钟`;
    else if (mins < 1440) text = `已逾期 ${Math.floor(mins / 60)} 小时`;
    else text = `已逾期 ${Math.floor(mins / 1440)} 天`;
    return { text, state: 'overdue' };
  }
  if (isSameDay(d, now)) return { text: `今天 ${hm}`, state: 'today' };
  if (isSameDay(d, addDays(now, 1))) return { text: `明天 ${hm}`, state: 'soon' };
  const wd = '日一二三四五六'[d.getDay()];
  return { text: `${d.getMonth() + 1}月${d.getDate()}日 周${wd} ${hm}`, state: 'future' };
}

function fmtDueForTask(t) {
  if (!t.dueAt) return null;
  const repeat = t.repeat || 'none';
  const done = isDone(t);
  if (repeat === 'none') {
    return done ? { text: fmtDueNeutral(t.dueAt), state: 'done' } : fmtOnceDue(t.dueAt);
  }
  const src = new Date(t.dueAt);
  const label = `${REPEAT_LABEL[repeat]} ${pad(src.getHours())}:${pad(src.getMinutes())}`;
  if (done) return { text: label, state: 'done' };
  const eff = effectiveDue(t);
  if (eff.getTime() < Date.now()) return { text: label + ' · 已逾期', state: 'overdue' };
  if (isSameDay(eff, new Date())) return { text: label + ' · 今天', state: 'today' };
  return { text: label, state: 'future' };
}

/* ---------- 轻提示 ---------- */
function showToast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  const span = document.createElement('span');
  span.className = 'toast-msg';
  span.textContent = msg;
  el.appendChild(span);

  el._dismissed = false;
  const dismiss = () => {
    if (el._dismissed) return;
    el._dismissed = true;
    clearTimeout(timer);
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  };

  if (opts.action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = opts.action;
    btn.addEventListener('click', () => {
      dismiss();
      if (opts.onAction) opts.onAction();
    });
    el.appendChild(btn);
  }

  els.toastWrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const timer = setTimeout(dismiss, opts.duration || (opts.action ? 5000 : 2800));
}

/* ---------- 渲染：侧边栏筛选项 ---------- */
function renderChips() {
  const cats = [{ id: 'all', name: '全部' }].concat(CATEGORIES);
  els.categoryChips.innerHTML = cats.map(c =>
    `<button class="chip ${state.prefs.category === c.id ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>`
  ).join('');

  const pris = [
    { id: 'all', name: '全部' },
    { id: 'high', name: '高' },
    { id: 'medium', name: '中' },
    { id: 'low', name: '低' }
  ];
  els.priorityChips.innerHTML = pris.map(p =>
    `<button class="chip ${state.prefs.priority === p.id ? 'active' : ''}" data-priority="${p.id}">${p.name}</button>`
  ).join('');
}

/* ---------- 渲染：统计 ---------- */
function computeCounts() {
  const counts = { all: state.tasks.length, active: 0, completed: 0, overdue: 0 };
  state.tasks.forEach(t => {
    if (isDone(t)) counts.completed++;
    else {
      counts.active++;
      if (isOverdue(t)) counts.overdue++;
    }
  });
  return counts;
}

function renderStatusChips() {
  const counts = computeCounts();
  els.statusChips.querySelectorAll('.chip').forEach(chip => {
    const f = chip.dataset.filter;
    chip.querySelector('.chip-count').textContent = counts[f] || 0;
    chip.classList.toggle('active', state.prefs.filter === f);
  });
}

function renderStats() {
  const c = computeCounts();
  els.statTotal.textContent = c.all;
  els.statActive.textContent = c.active;
  els.statDone.textContent = c.completed;
  els.statOverdue.textContent = c.overdue;
}

function renderProgress() {
  const total = state.tasks.length;
  const done = state.tasks.filter(t => isDone(t)).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  els.ringFg.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - pct / 100);
  els.ringPct.textContent = pct + '%';

  if (!total) {
    els.progressText.textContent = '还没有任务，开始添加吧';
    return;
  }
  const todayDone = state.history[dateKey(new Date())] || 0;
  let line = `${done} / ${total} 已完成`;
  if (todayDone > 0) line += `，今天完成 ${todayDone} 个`;
  if (done === total) line = '全部完成，太厉害了！';
  els.progressText.textContent = line;
}

function renderWeekChart() {
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(now, -i);
    days.push({
      key: dateKey(d),
      num: i === 0 ? '今天' : '日一二三四五六'[d.getDay()],
      count: state.history[dateKey(d)] || 0,
      today: i === 0
    });
  }
  const max = Math.max(1, ...days.map(d => d.count));
  els.weekChart.innerHTML = days.map(d => `
    <div class="week-col${d.today ? ' today' : ''}" title="${d.key} 完成 ${d.count} 个">
      <span class="week-num">${d.count > 0 ? d.count : ''}</span>
      <div class="week-track"><div class="week-bar" style="height:${Math.max(4, Math.round(d.count / max * 100))}%"></div></div>
      <span class="week-label">${d.num}</span>
    </div>`).join('');
}

function renderAlertBanner() {
  const now = new Date();
  let overdueCount = 0;
  let dueToday = 0;
  state.tasks.forEach(t => {
    if (isDone(t)) return;
    const eff = effectiveDue(t);
    if (!eff) return;
    if (eff.getTime() < now.getTime()) overdueCount++;
    else if (isSameDay(eff, now)) dueToday++;
  });

  let html = '';
  if (overdueCount) html += `<span>有 <b>${overdueCount}</b> 个任务已逾期</span>`;
  if (dueToday) html += `<span>今天有 <b>${dueToday}</b> 个任务到期</span>`;
  if (html) html += `<button data-jump="overdue">查看</button>`;
  els.alertBanner.innerHTML = html;
}

/* ---------- 渲染：任务列表 ---------- */
function dueSortValue(t) {
  const eff = effectiveDue(t);
  return eff ? eff.getTime() : Infinity;
}

function visibleTasks() {
  const { filter, category, priority, sort } = state.prefs;
  const q = searchTerm.trim().toLowerCase();

  const list = state.tasks.filter(t => {
    const done = isDone(t);
    if (filter === 'active' && done) return false;
    if (filter === 'completed' && !done) return false;
    if (filter === 'overdue' && !isOverdue(t)) return false;
    if (category !== 'all' && t.category !== category) return false;
    if (priority !== 'all' && t.priority !== priority) return false;
    if (q && !((t.title || '').toLowerCase().includes(q) || (t.desc || '').toLowerCase().includes(q))) return false;
    return true;
  });

  const cmp = {
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    due: (a, b) => dueSortValue(a) - dueSortValue(b),
    priority: (a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || (new Date(b.createdAt) - new Date(a.createdAt))
  }[sort] || null;

  list.sort((a, b) => {
    const ad = isDone(a), bd = isDone(b);
    if (ad !== bd) return ad ? 1 : -1;
    if (filter === 'completed') {
      return new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt);
    }
    return cmp ? cmp(a, b) : 0;
  });

  return list;
}

function taskCardHTML(t, i) {
  const done = isDone(t);
  const repeat = t.repeat || 'none';
  const due = fmtDueForTask(t);
  const cat = getCat(t.category);
  return `
    <article class="task-card p-${t.priority || 'medium'}${done ? ' completed' : ''}" style="--i:${i}" data-id="${t.id}">
      ${done ? '<span class="stamp">已完成</span>' : ''}
      <button class="check" data-action="toggle" title="标记完成 / 取消" aria-label="切换完成状态">${ICONS.check}</button>
      <div class="task-main">
        <div class="task-top">
          <h3 class="task-title">${escapeHtml(t.title)}</h3>
          <div class="task-badges">
            <span class="badge badge-priority ${t.priority || 'medium'}">${PRIORITY_LABEL[t.priority] || '中'}</span>
            ${repeat !== 'none' ? `<span class="badge badge-repeat">${REPEAT_LABEL[repeat]}</span>` : ''}
            <span class="badge badge-cat">${cat.name}</span>
          </div>
        </div>
        ${t.desc ? `<p class="task-desc">${escapeHtml(t.desc)}</p>` : ''}
        ${due ? `<div class="task-meta"><span class="due ${due.state}">${ICONS.clock}${due.text}</span></div>` : ''}
      </div>
      <div class="task-actions">
        <button class="icon-btn sm" data-action="edit" title="编辑">${ICONS.edit}</button>
        <button class="icon-btn sm danger" data-action="delete" title="删除">${ICONS.trash}</button>
      </div>
    </article>`;
}

function emptyHTML() {
  const f = state.prefs.filter;
  const box = (art, title, hint, withBtn) => `
    <div class="empty">
      ${art}
      <h3>${title}</h3>
      <p>${hint}</p>
      ${withBtn ? '<button class="btn primary" data-action="new">＋ 新建任务</button>' : ''}
    </div>`;

  if (searchTerm.trim()) return box(EMPTY_ART.search, '没有找到匹配的任务', '试试其他关键词，或清空搜索', false);
  if (f === 'completed') return box(EMPTY_ART.done, '还没有完成的任务', '完成第一个任务后，它会出现在这里', false);
  if (f === 'overdue') return box(EMPTY_ART.done, '没有逾期任务', '保持这个节奏，非常棒', false);
  if (f === 'active') return box(EMPTY_ART.done, '进行中的任务都清空啦', '休息一下，或者添加新任务', true);
  if (state.prefs.category !== 'all' || state.prefs.priority !== 'all') {
    return box(EMPTY_ART.layers, '当前筛选下没有任务', '换个分类或优先级看看吧', false);
  }
  return box(EMPTY_ART.notes, '还没有任务', '点击右下角「新建任务」，开始规划你的一天', true);
}

function renderList() {
  const list = visibleTasks();
  const todayDone = state.history[dateKey(new Date())] || 0;
  els.resultInfo.textContent = `共 ${list.length} 个任务${todayDone ? ` · 今日完成 ${todayDone}` : ''}`;

  if (!list.length) {
    els.taskList.innerHTML = emptyHTML();
    return;
  }
  els.taskList.innerHTML = list.map((t, i) => taskCardHTML(t, i)).join('');
}

/* ---------- 总渲染 ---------- */
function render() {
  renderChips();
  renderStatusChips();
  renderStats();
  renderProgress();
  renderWeekChart();
  renderAlertBanner();
  renderList();
}

/* ---------- 弹窗（新建 / 编辑） ---------- */
function renderPicker() {
  els.categoryPicker.innerHTML = CATEGORIES.map(c =>
    `<button type="button" class="chip ${draftCat === c.id ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>`
  ).join('');
}

function syncPrioritySeg() {
  els.prioritySeg.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.priority === draftPriority);
  });
}

function syncRepeatSeg() {
  els.repeatSeg.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.repeat === draftRepeat);
  });
  els.repeatHint.textContent = REPEAT_HINT[draftRepeat] || '';
}

function openModal(id) {
  const t = id ? state.tasks.find(x => x.id === id) : null;
  editingId = t ? t.id : null;
  els.modalTitle.textContent = t ? '编辑任务' : '新建任务';
  els.submitBtn.textContent = t ? '保存修改' : '保存任务';
  els.titleInput.value = t ? t.title : '';
  els.descInput.value = t ? (t.desc || '') : '';
  els.dueInput.value = t && t.dueAt ? toLocalInput(new Date(t.dueAt)) : '';
  draftPriority = t ? (t.priority || 'medium') : 'medium';
  draftCat = t ? (t.category || 'other') : 'other';
  draftRepeat = t ? (t.repeat || 'none') : 'none';
  syncPrioritySeg();
  syncRepeatSeg();
  renderPicker();
  els.modalOverlay.classList.add('show');
  document.body.classList.add('no-scroll');
  setTimeout(() => els.titleInput.focus(), 120);
}

function closeModal() {
  els.modalOverlay.classList.remove('show');
  document.body.classList.remove('no-scroll');
  editingId = null;
}

/* ---------- 移动端底部抽屉 ---------- */
function openDrawer() {
  els.sidebar.classList.add('open');
  els.drawerMask.classList.add('show');
  document.body.classList.add('no-scroll');
}

function closeDrawer() {
  els.sidebar.classList.remove('open');
  els.drawerMask.classList.remove('show');
  document.body.classList.remove('no-scroll');
}

/* ---------- 任务操作 ---------- */
function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  const repeat = t.repeat || 'none';
  const wasDone = isDone(t);

  // 先记下勾选位置（渲染后 DOM 会被替换）
  let burstAt = null;
  const checkEl = document.querySelector(`.task-card[data-id="${id}"] .check`);
  if (checkEl && !wasDone) {
    const r = checkEl.getBoundingClientRect();
    burstAt = [r.left + r.width / 2, r.top + r.height / 2];
  }

  const today = dateKey(new Date());
  if (!wasDone) {
    // 完成
    if (repeat === 'none') t.completed = true;
    else t.lastDone = periodKeyFor(repeat); // 标记本周期完成
    t.completedAt = new Date().toISOString();
    state.history[today] = (state.history[today] || 0) + 1;
  } else {
    // 取消完成
    if (repeat === 'none') t.completed = false;
    else if (t.lastDone === periodKeyFor(repeat)) t.lastDone = null;
    if (t.completedAt) {
      const k = dateKey(new Date(t.completedAt));
      state.history[k] = Math.max(0, (state.history[k] || 0) - 1);
    }
    t.completedAt = null;
  }

  save();
  render();

  if (!wasDone) {
    if (burstAt) burstConfetti(burstAt[0], burstAt[1], 1);
    const remaining = state.tasks.filter(x => !isDone(x)).length;
    if (remaining === 0 && state.tasks.length > 0) {
      setTimeout(() => burstConfetti(window.innerWidth / 2, window.innerHeight * .35, 3), 160);
      showToast('全部任务完成，太厉害了！');
    } else {
      showToast('完成！');
    }
  } else {
    showToast('已恢复为进行中');
  }
}

function deleteTask(id, cardEl) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  let undone = false;

  const finish = () => {
    if (undone) return;
    state.tasks = state.tasks.filter(x => x.id !== id);
    save();
    render();
  };

  if (cardEl) {
    cardEl.classList.add('removing');
    setTimeout(finish, 210);
  } else {
    finish();
  }

  showToast(`已删除「${t.title}」`, {
    action: '撤销',
    duration: 5000,
    onAction: () => {
      undone = true;
      state.tasks = state.tasks.filter(x => x.id !== id);
      state.tasks.push(t);
      save();
      render();
      showToast('已恢复');
    }
  });
}

function clearCompleted() {
  // 只清理"一次性且已完成"的任务，重复任务保留（它们代表长期习惯）
  const done = state.tasks.filter(t => (t.repeat || 'none') === 'none' && t.completed);
  if (!done.length) {
    showToast('没有可清除的一次性已完成任务');
    return;
  }
  state.tasks = state.tasks.filter(t => !((t.repeat || 'none') === 'none' && t.completed));
  save();
  render();

  showToast(`已清除 ${done.length} 个已完成任务`, {
    action: '撤销',
    duration: 5000,
    onAction: () => {
      state.tasks = state.tasks.concat(done);
      save();
      render();
      showToast('已恢复');
    }
  });
}

/* ---------- 主题 ---------- */
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  if (els.metaTheme) els.metaTheme.setAttribute('content', theme === 'dark' ? '#1d1a17' : '#f4efe5');
}

/* ---------- 到期通知 ---------- */
function notifySupported() {
  return typeof Notification !== 'undefined';
}

function refreshNotifyBtn() {
  els.notifyBtn.classList.toggle('on', notifySupported() && Notification.permission === 'granted');
}

function checkDue() {
  const now = Date.now();
  let changed = false;
  state.tasks.forEach(t => {
    if (isDone(t)) return;
    const eff = effectiveDue(t);
    if (!eff || eff.getTime() > now) return;
    if (t.notifiedStamp === notifiedStamp(t)) return; // 本周期已提醒过
    t.notifiedStamp = notifiedStamp(t);
    changed = true;
    showToast(`任务到期：${t.title}`, { duration: 4500 });
    if (notifySupported() && Notification.permission === 'granted') {
      try {
        new Notification('任务到期提醒', { body: t.title, tag: String(t.id) });
      } catch (e) { /* 某些环境不支持，忽略 */ }
    }
  });
  if (changed) {
    save();
    render();
  }
}

/* ---------- 彩带特效 ---------- */
const cvs = els.confetti;
const cctx = cvs.getContext('2d');
const CONFETTI_COLORS = ['#d6492b', '#2f7d5f', '#33628c', '#b57d1f', '#2a2521'];
let particles = [];
let confettiRaf = null;
let dpr = 1;

function sizeCanvas() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cvs.width = window.innerWidth * dpr;
  cvs.height = window.innerHeight * dpr;
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function burstConfetti(x, y, intensity) {
  intensity = intensity || 1;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const n = Math.round(24 * intensity) + 8;
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - .5) * 10 * intensity,
      vy: -(Math.random() * 8 + 4) * Math.sqrt(intensity),
      g: .35,
      size: 3.5 + Math.random() * 4.5,
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - .5) * .3,
      life: 70 + Math.random() * 45,
      shape: Math.random() < .55 ? 'rect' : 'circle'
    });
  }
  if (!confettiRaf) confettiRaf = requestAnimationFrame(tickConfetti);
}

function tickConfetti() {
  cctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter(p => p.life > 0 && p.y < window.innerHeight + 40);

  for (const p of particles) {
    p.vy += p.g;
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= .985;
    p.rot += p.vr;
    p.life--;

    const alpha = Math.min(1, p.life / 45);
    cctx.save();
    cctx.globalAlpha = alpha;
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rot);
    cctx.fillStyle = p.color;
    if (p.shape === 'rect') {
      cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
    } else {
      cctx.beginPath();
      cctx.arc(0, 0, p.size / 1.8, 0, Math.PI * 2);
      cctx.fill();
    }
    cctx.restore();
  }

  if (particles.length) {
    confettiRaf = requestAnimationFrame(tickConfetti);
  } else {
    confettiRaf = null;
    cctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

/* ---------- 示例数据（仅首次打开时） ---------- */
function seedDemo() {
  const now = new Date();
  const at = (d, h, m) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const base = {
    desc: '', completed: false, completedAt: null, lastDone: null,
    notifiedStamp: null, repeat: 'none', createdAt: new Date().toISOString()
  };
  state.tasks = [
    Object.assign({}, base, {
      id: uid(), title: '体验一下：点击任务前的圆圈完成它',
      desc: '完成时会飘出小彩带', priority: 'medium', category: 'other', dueAt: null
    }),
    Object.assign({}, base, {
      id: uid(), title: '阅读《深度工作》30 分钟',
      priority: 'high', category: 'study', dueAt: at(now, 20, 0)
    }),
    Object.assign({}, base, {
      id: uid(), title: '晨跑 3 公里',
      priority: 'low', category: 'health', dueAt: at(addDays(now, -1), 7, 30)
    }),
    Object.assign({}, base, {
      id: uid(), title: '喝够 8 杯水', desc: '每日重复示例：今天完成后明天会自动重置',
      priority: 'low', category: 'health', repeat: 'daily', dueAt: at(now, 21, 0)
    }),
    Object.assign({}, base, {
      id: uid(), title: '每周大扫除', desc: '每周重复示例',
      priority: 'medium', category: 'life', repeat: 'weekly', dueAt: at(addDays(now, 2), 9, 0)
    }),
    Object.assign({}, base, {
      id: uid(), title: '月度复盘总结', desc: '每月重复示例：本月已完成',
      priority: 'medium', category: 'work', repeat: 'monthly',
      dueAt: at(addDays(now, -2), 20, 0),
      completedAt: new Date().toISOString(),
      lastDone: periodKeyFor('monthly')
    })
  ];
  // 造一点历史数据，让"近 7 天"图表有内容
  state.history[dateKey(addDays(now, -1))] = 2;
  state.history[dateKey(addDays(now, -2))] = 1;
  state.history[dateKey(addDays(now, -4))] = 3;
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  // 新建按钮
  els.fabBtn.addEventListener('click', () => openModal(null));

  // 弹窗关闭
  els.modalClose.addEventListener('click', closeModal);
  els.cancelBtn.addEventListener('click', closeModal);
  els.modalOverlay.addEventListener('click', e => {
    if (e.target === els.modalOverlay) closeModal();
  });

  // 表单提交
  els.taskForm.addEventListener('submit', e => {
    e.preventDefault();
    const title = els.titleInput.value.trim();
    if (!title) {
      showToast('请先填写任务标题');
      els.titleInput.focus();
      return;
    }
    const desc = els.descInput.value.trim();
    const dueVal = els.dueInput.value ? new Date(els.dueInput.value).toISOString() : null;

    if (editingId) {
      const t = state.tasks.find(x => x.id === editingId);
      if (t) {
        const oldRepeat = t.repeat || 'none';
        if (t.dueAt !== dueVal) t.notifiedStamp = null; // 改了截止时间，重新提醒

        if (draftRepeat !== oldRepeat) {
          // 重复规则变化时迁移完成状态
          const wasDone = isDone(t);
          if (draftRepeat === 'none') {
            t.completed = wasDone;
            t.lastDone = null;
          } else {
            t.completed = false;
            t.lastDone = wasDone ? periodKeyFor(draftRepeat) : null;
          }
          t.repeat = draftRepeat;
          t.notifiedStamp = null;
        }

        t.title = title;
        t.desc = desc;
        t.priority = draftPriority;
        t.category = draftCat;
        t.dueAt = dueVal;
        showToast('修改已保存');
      }
    } else {
      state.tasks.push({
        id: uid(), title, desc,
        priority: draftPriority, category: draftCat, repeat: draftRepeat, dueAt: dueVal,
        completed: false, createdAt: new Date().toISOString(),
        completedAt: null, lastDone: null, notifiedStamp: null
      });
      showToast('任务已添加');
    }
    save();
    render();
    closeModal();
  });

  // 优先级选择
  els.prioritySeg.addEventListener('click', e => {
    const btn = e.target.closest('button[data-priority]');
    if (!btn) return;
    draftPriority = btn.dataset.priority;
    syncPrioritySeg();
  });

  // 重复选择
  els.repeatSeg.addEventListener('click', e => {
    const btn = e.target.closest('button[data-repeat]');
    if (!btn) return;
    draftRepeat = btn.dataset.repeat;
    syncRepeatSeg();
  });

  // 分类选择（弹窗内）
  els.categoryPicker.addEventListener('click', e => {
    const btn = e.target.closest('button[data-cat]');
    if (!btn) return;
    draftCat = btn.dataset.cat;
    renderPicker();
  });

  // 快捷截止时间
  document.querySelector('.quick-due').addEventListener('click', e => {
    const btn = e.target.closest('button[data-quick]');
    if (!btn) return;
    const now = new Date();
    const setAt = d => { els.dueInput.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`; };
    const kind = btn.dataset.quick;
    if (kind === 'today') setAt(now);
    if (kind === 'tomorrow') setAt(addDays(now, 1));
    if (kind === 'clear') els.dueInput.value = '';
  });

  // 状态筛选
  els.statusChips.addEventListener('click', e => {
    const chip = e.target.closest('.chip[data-filter]');
    if (!chip) return;
    state.prefs.filter = chip.dataset.filter;
    save();
    render();
  });

  // 侧边栏分类 / 优先级筛选
  els.sidebar.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    if (chip.dataset.cat) state.prefs.category = chip.dataset.cat;
    else if (chip.dataset.priority) state.prefs.priority = chip.dataset.priority;
    else return;
    save();
    render();
  });

  // 提醒横幅「查看」
  els.alertBanner.addEventListener('click', e => {
    const btn = e.target.closest('button[data-jump]');
    if (!btn) return;
    state.prefs.filter = btn.dataset.jump;
    save();
    render();
  });

  // 搜索（防抖）
  let searchTimer = null;
  els.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTerm = els.searchInput.value;
      renderList();
    }, 150);
  });

  // 排序
  els.sortSelect.addEventListener('change', () => {
    state.prefs.sort = els.sortSelect.value;
    save();
    render();
  });

  // 清除已完成
  els.clearCompletedBtn.addEventListener('click', clearCompleted);

  // 主题切换
  els.themeBtn.addEventListener('click', () => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    save();
    showToast(next === 'dark' ? '已切换到夜间模式' : '已切换到白天模式');
  });

  // 手机端底部抽屉
  els.filterToggle.addEventListener('click', openDrawer);
  els.drawerClose.addEventListener('click', closeDrawer);
  els.drawerMask.addEventListener('click', closeDrawer);

  // 任务卡片操作（事件委托）
  els.taskList.addEventListener('click', e => {
    const newBtn = e.target.closest('button[data-action="new"]');
    if (newBtn) { openModal(null); return; }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = e.target.closest('.task-card');
    if (!card) return;
    const id = card.dataset.id;
    const action = btn.dataset.action;
    if (action === 'toggle') toggleTask(id);
    else if (action === 'edit') openModal(id);
    else if (action === 'delete') deleteTask(id, card);
  });

  // 到期通知按钮
  els.notifyBtn.addEventListener('click', async () => {
    if (!notifySupported()) {
      showToast('当前浏览器不支持系统通知');
      return;
    }
    if (Notification.permission === 'granted') {
      showToast('到期提醒已开启');
      return;
    }
    if (Notification.permission === 'denied') {
      showToast('通知被浏览器拒绝，请在浏览器设置中开启');
      return;
    }
    try {
      const p = await Notification.requestPermission();
      showToast(p === 'granted' ? '到期提醒已开启' : '已取消开启通知');
    } catch (err) {
      showToast('开启失败，可稍后再试');
    }
    refreshNotifyBtn();
  });

  // 快捷键
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement ? document.activeElement.tagName : '');
    if (e.key === 'Escape') {
      if (els.modalOverlay.classList.contains('show')) closeModal();
      else if (els.sidebar.classList.contains('open')) closeDrawer();
      else if (document.activeElement === els.searchInput) els.searchInput.blur();
      return;
    }
    if (typing) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      openModal(null);
    } else if (e.key === '/') {
      e.preventDefault();
      els.searchInput.focus();
    }
  });

  // 窗口尺寸变化（彩带画布）
  window.addEventListener('resize', sizeCanvas);
}

/* ---------- PWA：Service Worker 与安装引导 ---------- */
let deferredInstall = null;

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .catch(() => { /* 离线能力不可用时静默降级，不打扰用户 */ });
  });
}

function setupInstallPrompt() {
  const bar = $('#installBar');
  if (!bar) return;
  const text = $('#installText');
  const btn = $('#installBtn');
  const close = $('#installClose');
  const DISMISS_KEY = 'flowtask.install.dismissed';

  const dismissedRecently = () => {
    try {
      const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
      return t > 0 && Date.now() - t < 7 * 24 * 3600 * 1000; // 关闭后 7 天内不再提示
    } catch (e) { return false; }
  };
  const dismiss = () => {
    bar.hidden = true;
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* ignore */ }
  };

  // Android / 桌面 Chrome：捕获安装事件，点「安装」拉起系统弹窗
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    if (!dismissedRecently()) bar.hidden = false;
  });

  // iOS Safari 没有 beforeinstallprompt，给出手动指引
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (isIos && !standalone && !dismissedRecently()) {
    text.textContent = '点下方「分享」按钮，选「添加到主屏幕」';
    btn.hidden = true;
    setTimeout(() => { bar.hidden = false; }, 1600);
  }

  btn.addEventListener('click', async () => {
    if (!deferredInstall) return;
    bar.hidden = true;
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch (e) { /* ignore */ }
    deferredInstall = null;
  });

  close.addEventListener('click', dismiss);

  window.addEventListener('appinstalled', () => {
    bar.hidden = true;
    showToast('已安装到桌面');
  });
}

/* ---------- 初始化 ---------- */
function init() {
  els.dateLabel.textContent = fmtTodayLabel();

  if (!state.seeded) {
    seedDemo();
    state.seeded = true;
    save();
    setTimeout(() => showToast('已放入几条示例任务（含每天/每周/每月重复），随时可删除'), 700);
  }

  applyTheme(state.theme || 'light');
  els.sortSelect.value = state.prefs.sort || 'newest';

  bindEvents();
  render();
  refreshNotifyBtn();
  sizeCanvas();

  registerSW();
  setupInstallPrompt();

  checkDue();
  setInterval(checkDue, 30000);

  // 回到页面时刷新（跨天重置重复任务、长时间挂起等场景）
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      els.dateLabel.textContent = fmtTodayLabel();
      render();
      checkDue();
    }
  });
}

init();
