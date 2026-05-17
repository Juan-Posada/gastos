/* ══════════════════════════════════════════════════════
   APP.JS  —  finZa
   • Plantillas rápidas
   • Categorías opcionales con presupuesto
   • Modo claro / oscuro
   • [FIX] Color al crear gasto
   • [FIX] Edición de subgastos
   • [FIX] FAB visible tras login
══════════════════════════════════════════════════════ */

import { db, currentUser }     from "./auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ── CONSTANTS ──────────────────────────────────────── */
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const COLORS = [
  '#E63E88','#384D95','#f06aaa','#4f68c0','#b82e6b',
  '#263570','#e8699f','#6479c8','#c93578','#2d4284','#ea85b5',
];

/* ── STATE ──────────────────────────────────────────── */
let activePanelId  = null;
let activePanelQ   = 1;
let editingSubId   = null;   // subgasto en edición
let modalType      = 'normal';
let isSaving       = false;
let collapsedCats  = new Set();
let dragSrcId      = null;

let searchQuery    = "";
let searchDateFrom = "";
let searchDateTo   = "";

let state = buildEmptyState();

function buildEmptyState() {
  const now = new Date();
  return {
    salary:       0,
    currentYear:  now.getFullYear(),
    currentMonth: now.getMonth(),
    months:       {},
    templates:    [],
    bundles:      [],
    darkMode:     true,
  };
}

/* ── FIRESTORE ──────────────────────────────────────── */
function userDocRef() {
  if (!currentUser) return null;
  return doc(db, "users", currentUser.uid, "data", "gastos");
}

export async function loadFromFirestore() {
  const ref = userDocRef();
  if (!ref) return;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const remote = snap.data();
      state = {
        ...remote,
        templates:    remote.templates   || [],
        bundles:      remote.bundles     || [],
        darkMode:     remote.darkMode !== undefined ? remote.darkMode : true,
        currentYear:  state.currentYear,
        currentMonth: state.currentMonth,
      };
    } else {
      state = buildEmptyState();
    }
  } catch (err) {
    console.error("[Firestore] Error al cargar:", err);
    toast("Error al cargar tus datos", "error");
  }
  applyTheme();
}

let saveTimer;
export function save() {
  try { localStorage.setItem('gastos_cache', JSON.stringify(state)); } catch(_) {}
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const ref = userDocRef();
    if (!ref || isSaving) return;
    isSaving = true;
    try {
      await setDoc(ref, JSON.parse(JSON.stringify(state)));
    } catch (err) {
      console.error("[Firestore] Error al guardar:", err);
      toast("No se pudo guardar en la nube", "error");
    } finally {
      isSaving = false;
    }
  }, 800);
}

/* ── HELPERS ────────────────────────────────────────── */
function makeExpense(name, amount, date, notes, color, type) {
  return {
    id: crypto.randomUUID(),
    name, amount, date, notes, color,
    type:       type       || 'normal',
    included:   true,
    subs:       { 1: [], 2: [] },
  };
}

function monthKey(y, m)    { return `${y}-${String(m).padStart(2,'0')}`; }
function currentKey()      { return monthKey(state.currentYear, state.currentMonth); }
function currentExpenses() { return state.months[currentKey()] || []; }
function todayISO()        { return new Date().toISOString().split('T')[0]; }
function fmt(n)            { return '$' + Math.round(n).toLocaleString('es-CO'); }
function fmtInput(val) {
  const num = val.replace(/\D/g,'');
  return num ? parseInt(num).toLocaleString('es-CO') : '';
}
function parseAmount(str)  { return parseInt((str||'').replace(/\D/g,'')) || 0; }
function pickColor(usedColors) {
  return COLORS.find(c => !usedColors.includes(c)) || COLORS[Math.floor(Math.random()*COLORS.length)];
}

function mutate(id, fn) {
  const key = currentKey();
  state.months[key] = state.months[key].map(e => e.id === id ? fn(e) : e);
}

/* ══════════════════════════════════════════════════════
   TEMA
══════════════════════════════════════════════════════ */
function applyTheme() {
  // Verificar localStorage para aplicar tema inmediato (evitar flash)
  const cached = localStorage.getItem('finza_darkMode');
  if (cached !== null && state.darkMode === true) {
    state.darkMode = cached === 'true';
  }
  document.documentElement.classList.toggle('light-mode', !state.darkMode);
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.querySelector('[data-lucide]')?.setAttribute('data-lucide', state.darkMode ? 'sun' : 'moon');
    lucide.createIcons({ nodes: [btn] });
  }
}

function toggleTheme() {
  // Abrir modal de confirmación en vez de cambiar directo
  const overlay = document.getElementById('theme-modal-overlay');
  const titleEl = document.getElementById('theme-confirm-title');
  const descEl  = document.getElementById('theme-confirm-desc');
  const iconEl  = document.getElementById('theme-confirm-icon');
  const willBeLight = state.darkMode;
  titleEl.textContent = willBeLight ? '¿Cambiar a modo claro?' : '¿Cambiar a modo oscuro?';
  descEl.textContent  = 'La página se recargará para aplicar el nuevo tema visual.';
  iconEl.innerHTML = `<i data-lucide="${willBeLight ? 'sun' : 'moon'}"></i>`;
  lucide.createIcons({ nodes: [iconEl] });
  overlay.classList.add('open');
}

function confirmThemeChange() {
  state.darkMode = !state.darkMode;
  localStorage.setItem('finza_darkMode', String(state.darkMode));
  // Guardar en Firestore antes de recargar
  const ref = userDocRef();
  if (ref) {
    setDoc(ref, JSON.parse(JSON.stringify(state))).finally(() => {
      location.reload();
    });
  } else {
    location.reload();
  }
}

function closeThemeModal() {
  document.getElementById('theme-modal-overlay').classList.remove('open');
}

/* ══════════════════════════════════════════════════════
   PLANTILLAS
══════════════════════════════════════════════════════ */
function saveTemplate(exp) {
  if (!state.templates) state.templates = [];
  const existingIdx = state.templates.findIndex(t => t.name === exp.name);
  // Extraer día de la fecha
  const day = exp.date ? parseInt(exp.date.split('-')[2]) : new Date().getDate();
  const tpl = {
    id:     existingIdx >= 0 ? state.templates[existingIdx].id : crypto.randomUUID(),
    name:   exp.name,
    amount: exp.amount,
    notes:  exp.notes  || '',
    type:   exp.type   || 'normal',
    color:  exp.color,
    day,
  };
  if (existingIdx >= 0) {
    state.templates[existingIdx] = tpl;
    toast(`Plantilla "${exp.name}" actualizada`, 'success');
  } else {
    state.templates.push(tpl);
    toast(`"${exp.name}" guardado como plantilla`, 'success');
  }
  save(); renderTemplatePanel(); renderModalQuick();
}

function deleteTemplate(id) {
  state.templates = state.templates.filter(t => t.id !== id);
  toast('Plantilla eliminada');
  save(); renderTemplatePanel(); renderModalQuick();
}

function buildDateForMonth(day, year, month) {
  // month es 0-indexed. Clamp al último día válido del mes.
  const lastDay = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(day || 1, lastDay);
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(clampedDay).padStart(2,'0')}`;
}

function applyTemplate(tpl) {
  const key = currentKey();
  if (!state.months[key]) state.months[key] = [];
  const usedColors = state.months[key].map(e => e.color);
  const color = usedColors.includes(tpl.color)
    ? (COLORS.find(c => !usedColors.includes(c)) || tpl.color)
    : tpl.color;
  const date = tpl.day
    ? buildDateForMonth(tpl.day, state.currentYear, state.currentMonth)
    : todayISO();
  state.months[key].push(makeExpense(tpl.name, tpl.amount, date, tpl.notes, color, tpl.type, null));
  toast(`"${tpl.name}" agregado al mes`, 'success');
  render();
}

function renderTemplatePanel() {
  const list  = document.getElementById('tpl-list');
  const empty = document.getElementById('tpl-empty');
  if (!list) return;
  const tpls = state.templates || [];
  empty.classList.toggle('hidden', tpls.length > 0);
  list.innerHTML = '';
  tpls.forEach(tpl => list.appendChild(buildTemplateItem(tpl)));
  lucide.createIcons();
}

function buildTemplateItem(tpl) {
  const wrap = document.createElement('div');
  wrap.className = 'tpl-item';
  const dayLabel = tpl.day ? `Día ${tpl.day}` : '';
  wrap.innerHTML = `
    <div class="tpl-dot" style="background:${tpl.color}"></div>
    <div class="tpl-info">
      <span class="tpl-name">${tpl.name}</span>
      <span class="tpl-notes">${[dayLabel, tpl.notes].filter(Boolean).join(' · ')}</span>
    </div>
    <span class="tpl-amount">${fmt(tpl.amount)}</span>
    <button class="tpl-add-btn" title="Agregar al mes"><i data-lucide="plus-circle"></i></button>
    <button class="tpl-del-btn" title="Eliminar plantilla"><i data-lucide="trash-2"></i></button>`;
  wrap.querySelector('.tpl-add-btn').addEventListener('click', () => { applyTemplate(tpl); closeTplPanel(); });
  wrap.querySelector('.tpl-del-btn').addEventListener('click', () => deleteTemplate(tpl.id));
  return wrap;
}

function renderModalQuick() {
  const wrap = document.getElementById('modal-quick-wrap');
  const list = document.getElementById('modal-quick-list');
  if (!wrap || !list) return;
  const tpls = state.templates || [];
  wrap.classList.toggle('hidden', tpls.length === 0);
  list.innerHTML = '';
  tpls.forEach(tpl => {
    const btn = document.createElement('button');
    btn.className = 'quick-chip'; btn.type = 'button';
    btn.innerHTML = `<span class="quick-dot" style="background:${tpl.color}"></span>${tpl.name}`;
    btn.addEventListener('click', () => {
      document.getElementById('m-name').value   = tpl.name;
      document.getElementById('m-amount').value = Math.round(tpl.amount).toLocaleString('es-CO');
      document.getElementById('m-date').value   = todayISO();
      document.getElementById('m-notes').value  = tpl.notes || '';
      document.getElementById('m-color').value  = tpl.color;
      updateModalColorPreview(tpl.color);
      modalType = tpl.type || 'normal';
      document.querySelectorAll('#m-type-selector .type-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.type === modalType));
      list.querySelectorAll('.quick-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
    });
    list.appendChild(btn);
  });
  lucide.createIcons();
}

function updateModalColorPreview(color) {
  const preview = document.getElementById('m-color-preview');
  if (preview) preview.style.background = color;
}

function openTplPanel() {
  renderTemplatePanel();
  renderBundleTab();
  // Reset to individual tab
  document.querySelectorAll('.tpl-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'individual'));
  document.getElementById('tab-individual').classList.remove('hidden');
  document.getElementById('tab-bundles').classList.add('hidden');
  closeBundleForm();
  document.getElementById('tpl-overlay').classList.add('open');
}
function closeTplPanel() { document.getElementById('tpl-overlay').classList.remove('open'); }

/* ══════════════════════════════════════════════════════
   PLANTILLAS DE CONJUNTO (BUNDLES)
══════════════════════════════════════════════════════ */
function saveBundleFromMonth(name) {
  if (!state.bundles) state.bundles = [];
  const expenses = currentExpenses();
  if (!expenses.length) { toast('No hay gastos en este mes', 'error'); return; }

  const snapshot = expenses.map(exp => ({
    name:       exp.name,
    amount:     exp.amount,
    day:        exp.date ? parseInt(exp.date.split('-')[2]) : 1,
    color:      exp.color,
    type:       exp.type   || 'normal',
    notes:      exp.notes  || '',
    included:   exp.included !== false,
    subs: {
      1: (exp.subs?.[1] || []).map(s => ({ name: s.name, amount: s.amount, notes: s.notes || '', included: s.included !== false })),
      2: (exp.subs?.[2] || []).map(s => ({ name: s.name, amount: s.amount, notes: s.notes || '', included: s.included !== false })),
    },
  }));

  const bundle = {
    id:          crypto.randomUUID(),
    name:        name || `${MONTHS[state.currentMonth]} ${state.currentYear}`,
    createdFrom: currentKey(),
    expenses:    snapshot,
  };
  state.bundles.push(bundle);
  toast(`Conjunto "${bundle.name}" guardado con ${snapshot.length} gasto${snapshot.length !== 1 ? 's' : ''}`, 'success');
  save();
  renderBundleTab();
  closeBundleForm();
}

function deleteBundle(id) {
  state.bundles = (state.bundles || []).filter(b => b.id !== id);
  toast('Conjunto eliminado');
  save();
  renderBundleTab();
}

function applyBundle(bundle) {
  const key = currentKey();
  if (!state.months[key]) state.months[key] = [];

  bundle.expenses.forEach(snap => {
    const date = buildDateForMonth(snap.day, state.currentYear, state.currentMonth);
    const exp  = makeExpense(snap.name, snap.amount, date, snap.notes, snap.color, snap.type);
    exp.included = snap.included !== false;
    // Copiar subgastos
    exp.subs = {
      1: (snap.subs?.[1] || []).map(s => ({ id: crypto.randomUUID(), name: s.name, amount: s.amount, notes: s.notes || '', included: s.included !== false })),
      2: (snap.subs?.[2] || []).map(s => ({ id: crypto.randomUUID(), name: s.name, amount: s.amount, notes: s.notes || '', included: s.included !== false })),
    };
    state.months[key].push(exp);
  });

  toast(`Conjunto "${bundle.name}" aplicado — ${bundle.expenses.length} gasto${bundle.expenses.length !== 1 ? 's' : ''} agregados`, 'success');
  render();
}

function renderBundleTab() {
  const list  = document.getElementById('bundle-list');
  const empty = document.getElementById('bundle-empty');
  const saveBtn = document.getElementById('btn-save-bundle');
  if (!list) return;
  const bundles = state.bundles || [];
  empty.classList.toggle('hidden', bundles.length > 0);
  // Ocultar botón guardar si no hay gastos en el mes
  const hasExpenses = currentExpenses().length > 0;
  saveBtn.classList.toggle('hidden', !hasExpenses);
  list.innerHTML = '';
  bundles.forEach(b => list.appendChild(buildBundleItem(b)));
  lucide.createIcons();
}

function buildBundleItem(bundle) {
  const wrap = document.createElement('div');
  wrap.className = 'bundle-item';
  const total = bundle.expenses.reduce((a, e) => a + e.amount, 0);
  const count = bundle.expenses.length;
  wrap.innerHTML = `
    <div class="bundle-icon"><i data-lucide="package"></i></div>
    <div class="bundle-info">
      <span class="bundle-name">${bundle.name}</span>
      <div class="bundle-meta">
        <span class="bundle-meta-badge"><i data-lucide="receipt"></i>${count} gasto${count !== 1 ? 's' : ''}</span>
        <span>${fmt(total)}</span>
      </div>
    </div>
    <button class="bundle-apply-btn" title="Aplicar al mes"><i data-lucide="play"></i></button>
    <button class="bundle-del-btn" title="Eliminar"><i data-lucide="trash-2"></i></button>`;
  wrap.querySelector('.bundle-apply-btn').addEventListener('click', () => { applyBundle(bundle); closeTplPanel(); });
  wrap.querySelector('.bundle-del-btn').addEventListener('click', () => deleteBundle(bundle.id));
  return wrap;
}

function openBundleForm() {
  const defaultName = `${MONTHS[state.currentMonth]} ${state.currentYear}`;
  document.getElementById('bundle-fname').value = defaultName;
  document.getElementById('bundle-form-wrap').classList.remove('hidden');
  document.getElementById('btn-save-bundle').classList.add('hidden');
  document.getElementById('bundle-fname').focus();
}

function closeBundleForm() {
  document.getElementById('bundle-form-wrap')?.classList.add('hidden');
  const saveBtn = document.getElementById('btn-save-bundle');
  if (saveBtn && currentExpenses().length > 0) saveBtn.classList.remove('hidden');
}

function buildBundleSuggestionHTML() {
  const bundles = state.bundles || [];
  if (!bundles.length) return '';
  const items = bundles.map(b => {
    const total = b.expenses.reduce((a, e) => a + e.amount, 0);
    const count = b.expenses.length;
    return `
      <div class="bundle-suggest-chip" data-bundle-id="${b.id}">
        <div class="bundle-icon"><i data-lucide="package"></i></div>
        <div class="bundle-suggest-info">
          <div class="bundle-suggest-name">${b.name}</div>
          <div class="bundle-suggest-meta">${count} gasto${count !== 1 ? 's' : ''} · ${fmt(total)}</div>
        </div>
        <span class="bundle-suggest-apply"><i data-lucide="play"></i>Aplicar</span>
      </div>`;
  }).join('');
  return `
    <div class="empty-bundles-suggestion">
      <p>¿Aplicar un <strong>conjunto guardado</strong>?</p>
      <div class="bundle-suggest-list">${items}</div>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   RENDER PRINCIPAL
══════════════════════════════════════════════════════ */
export function render() {
  renderMonthNav();
  renderSalary();
  renderStats();
  renderFeed();
  if (activePanelId) renderSubPanel(activePanelId);
  save();
  lucide.createIcons();
}

function renderMonthNav() {
  const { currentYear: y, currentMonth: m } = state;
  document.getElementById('month-label').textContent = `${MONTHS[m]} ${y}`;
}

function renderSalary() {
  const inp = document.getElementById('salary-input');
  if (document.activeElement !== inp)
    inp.value = state.salary ? Math.round(state.salary).toLocaleString('es-CO') : '';
}

function renderStats() {
  const expenses = currentExpenses();
  const salary   = state.salary || 0;
  const spent    = expenses.filter(e => e.included).reduce((s,e) => s + e.amount, 0);
  const left     = salary - spent;
  const pct      = salary > 0 ? Math.min(Math.round(spent / salary * 100), 100) : 0;

  document.getElementById('stat-spent').textContent     = fmt(spent);
  document.getElementById('stat-pct').textContent       = pct + '%';
  document.getElementById('progress-fill').style.width  = pct + '%';
  document.getElementById('prog-label-pct').textContent = pct + '%';

  const leftEl = document.getElementById('stat-left');
  leftEl.textContent = fmt(left);
  leftEl.className   = 'value';
  if (left < 0)           leftEl.classList.add('danger');
  else if (left < 100000) leftEl.classList.add('warn');
}

/* ── FEED ───────────────────────────────────────────── */
function reorderExpense(oldIndex, newIndex) {
  const key = currentKey();
  const list = [...(state.months[key] || [])];
  if (oldIndex === newIndex) return;

  const [moved] = list.splice(oldIndex, 1);
  list.splice(newIndex, 0, moved);
  state.months[key] = list;

  save();
  // No llamamos a render() aquí para evitar parpadeos, 
  // ya que Sortable ya movió el DOM.
}

function renderFeed() {
  const feed     = document.getElementById('feed');
  let expenses   = currentExpenses();
  
  // ── FILTROS DE BÚSQUEDA ──
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    expenses = expenses.filter(e => 
      e.name.toLowerCase().includes(q) || 
      e.amount.toString().includes(q) ||
      (e.notes && e.notes.toLowerCase().includes(q))
    );
  }
  if (searchDateFrom) expenses = expenses.filter(e => e.date >= searchDateFrom);
  if (searchDateTo)   expenses = expenses.filter(e => e.date <= searchDateTo);

  document.getElementById('feed-count').textContent = expenses.length;

  if (!expenses.length) {
    const isSearching = q || searchDateFrom || searchDateTo;
    if (isSearching) {
      feed.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i data-lucide="search-x"></i></div>
          <p>No se encontraron resultados para tu búsqueda.</p>
          <button class="btn btn-cancel" style="margin-top:12px;" onclick="document.getElementById('search-clear').click()">Limpiar filtros</button>
        </div>`;
    } else {
      const suggestionHTML = buildBundleSuggestionHTML();
      feed.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i data-lucide="inbox"></i></div>
          <p>Sin gastos este mes.<br>Presiona <strong>Nuevo gasto</strong> para comenzar.</p>
          ${suggestionHTML}
        </div>`;
    }
    // Bind clicks en sugerencias de bundles
    feed.querySelectorAll('.bundle-suggest-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const bundleId = chip.dataset.bundleId;
        const bundle = (state.bundles || []).find(b => b.id === bundleId);
        if (bundle) applyBundle(bundle);
      });
    });
    lucide.createIcons(); return;
  }

  feed.innerHTML = '';
  expenses.forEach((exp, i) => feed.appendChild(buildItem(exp, i, false)));

  // Inicializar SortableJS
  if (window.Sortable) {
    // Destruir instancia previa si existe (opcional, Sortable suele manejarlo pero es más limpio)
    if (feed._sortable) feed._sortable.destroy();
    
    feed._sortable = new Sortable(feed, {
      animation: 350,
      handle: '.drag-handle', // Solo arrastrable desde el tirador
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      forceFallback: false, // Usar nativo cuando sea posible, pero Sortable maneja Touch
      onEnd: (evt) => {
        reorderExpense(evt.oldIndex, evt.newIndex);
      }
    });
  }

  lucide.createIcons();
}

/* ── BUILD ITEM ─────────────────────────────────────── */
function buildItem(exp, idx, indented) {
  const wrap = document.createElement('div');
  wrap.className = 'expense-item' + (exp.included ? '' : ' excluded') + (indented ? ' cat-indented' : '');
  wrap.dataset.id = exp.id;
  wrap.style.animationDelay = `${idx * 0.04}s`;

  const dateStr = exp.date
    ? new Date(exp.date + 'T00:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'})
    : '–';

  const allSubs  = [...(exp.subs?.[1]||[]), ...(exp.subs?.[2]||[])];
  const subCount = allSubs.length;
  const subUsed  = allSubs.filter(s => s.included).reduce((a,s) => a + s.amount, 0);

  const subIndicatorHTML = subCount > 0
    ? `<div class="sub-indicator"><i data-lucide="layers"></i><strong>${subCount} subgasto${subCount!==1?'s':''}</strong> · ${fmt(subUsed)}</div>`
    : `<div class="sub-indicator sub-empty-hint"><i data-lucide="layers"></i>Sin subgastos</div>`;

  const isTpl = (state.templates || []).some(t => t.name === exp.name);

  const isQuin = exp.type === 'quincenal';
  const typeText = isQuin ? 'Quincenal' : 'Normal';
  const typeIcon = isQuin ? 'calendar-range' : 'circle-dot';

  wrap.innerHTML = `
    <div class="item-side-block" style="background:${exp.color}15; color:${exp.color}">
      <div class="drag-handle" title="Arrastrar para reordenar"><i data-lucide="grip-vertical"></i></div>
      <div class="item-side-text">
        <i data-lucide="${typeIcon}"></i>
        <span>${typeText}</span>
      </div>
    </div>
    <div class="item-content-col">
      <div class="item-main">
        <div class="item-check ${exp.included?'checked':''}" data-action="toggle"></div>
        <div class="item-info">
          <div class="name-row">
            <span class="name">${exp.name}</span>
            <span class="date-sep">|</span>
            <span class="date">${dateStr}</span>
          </div>
          ${subIndicatorHTML}
        </div>
        <div class="item-amount" style="color:${exp.color}">${fmt(exp.amount)}</div>
        <div class="item-actions">
          <button class="sub-btn" data-action="open-subs">
            <i data-lucide="list"></i><span class="sub-btn-label"> Desglose</span>
          </button>
          <button class="expand-btn" data-action="expand" aria-label="Editar">
            <i data-lucide="pencil"></i>
          </button>
        </div>
      </div>
      <div class="item-detail">
      <div class="item-detail-inner">
        <div class="detail-fields">
          <div class="detail-field">
            <label>Nombre</label>
            <input type="text" data-field="name" value="${exp.name}" />
          </div>
          <div class="detail-field">
            <label>Monto ($)</label>
            <input type="text" data-field="amount" value="${Math.round(exp.amount).toLocaleString('es-CO')}" />
          </div>
          <div class="detail-field">
            <label>Fecha</label>
            <input type="date" data-field="date" value="${exp.date||''}" />
          </div>
          <div class="detail-field">
            <label>Color</label>
            <input type="color" data-field="color" value="${exp.color}" style="height:38px;padding:2px 6px;cursor:pointer" />
          </div>
          <div class="detail-field full">
            <label>Tipo de gasto</label>
            <div class="detail-type-selector">
              <button class="type-btn ${exp.type==='normal'?'active':''}" data-type="normal" data-action="change-type">
                <i data-lucide="circle-dot"></i> Normal
              </button>
              <button class="type-btn ${exp.type==='quincenal'?'active':''}" data-type="quincenal" data-action="change-type">
                <i data-lucide="calendar-range"></i> Quincenal
              </button>
            </div>
          </div>
          <div class="detail-field full">
            <label>Notas</label>
            <textarea data-field="notes" rows="2">${exp.notes||''}</textarea>
          </div>
        </div>
        <div class="detail-actions">
          <button class="btn btn-tpl ${isTpl?'btn-tpl-active':''}" data-action="save-tpl">
            <i data-lucide="${isTpl?'bookmark-check':'bookmark'}"></i>
            ${isTpl ? 'Actualizar plantilla' : 'Guardar plantilla'}
          </button>
          <button class="btn btn-delete" data-action="delete">
            <i data-lucide="trash-2"></i> Eliminar
          </button>
          <button class="btn btn-save" data-action="save">
            <i data-lucide="check"></i> Guardar
          </button>
        </div>
      </div>
    </div>
  </div>`;

  const amtInp = wrap.querySelector('[data-field="amount"]');
  amtInp.addEventListener('focus', () => { amtInp.value = amtInp.value.replace(/\D/g,''); });
  amtInp.addEventListener('input', () => { amtInp.value = fmtInput(amtInp.value); });
  amtInp.addEventListener('blur',  () => { amtInp.value = fmtInput(amtInp.value); });

  // DnD manejado por SortableJS en renderFeed()

  wrap.querySelectorAll('[data-action="change-type"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      wrap.querySelectorAll('[data-action="change-type"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  wrap.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action || action === 'change-type') return;
    if (action === 'toggle')    { toggleIncluded(exp.id); }
    if (action === 'expand')    { wrap.querySelector('.item-detail').classList.toggle('open'); }
    if (action === 'open-subs') { e.stopPropagation(); openSubPanel(exp.id); }
    if (action === 'save')      { saveItem(wrap, exp.id); }
    if (action === 'delete')    { deleteItem(exp.id); }
    if (action === 'save-tpl')  { saveTemplate(getItemFormData(wrap, exp)); }
  });

  return wrap;
}

function getItemFormData(wrap, exp) {
  return {
    name:   wrap.querySelector('[data-field="name"]')?.value.trim()                 || exp.name,
    amount: parseAmount(wrap.querySelector('[data-field="amount"]')?.value          || '0'),
    notes:  wrap.querySelector('[data-field="notes"]')?.value.trim()               || exp.notes,
    color:  wrap.querySelector('[data-field="color"]')?.value                      || exp.color,
    type:   wrap.querySelector('[data-action="change-type"].active')?.dataset.type || exp.type,
  };
}

/* ── ACTIONS ────────────────────────────────────────── */
function toggleIncluded(id) { mutate(id, e => ({ ...e, included: !e.included })); render(); }

function saveItem(wrap, id) {
  const name   = wrap.querySelector('[data-field="name"]').value.trim();
  const amount = parseAmount(wrap.querySelector('[data-field="amount"]').value);
  const date   = wrap.querySelector('[data-field="date"]').value;
  const notes  = wrap.querySelector('[data-field="notes"]').value.trim();
  const color  = wrap.querySelector('[data-field="color"]').value;
  const typeEl = wrap.querySelector('[data-action="change-type"].active');
  const type   = typeEl ? typeEl.dataset.type : 'normal';
  if (!name || !amount) { toast('Nombre y monto son obligatorios', 'error'); return; }
  mutate(id, e => ({
    ...e, name, amount, date, notes, color, type,
  }));
  toast('Cambios guardados', 'success');
  render();
}

function deleteItem(id) {
  if (activePanelId === id) closeSubPanel();
  const key = currentKey();
  state.months[key] = state.months[key].filter(e => e.id !== id);
  toast('Gasto eliminado');
  render();
}

function addExpense(name, amount, date, notes, color, type) {
  const key = currentKey();
  if (!state.months[key]) state.months[key] = [];
  state.months[key].push(makeExpense(name, amount, date, notes, color, type));
  render();
}

/* ══════════════════════════════════════════════════════
   SUBGASTOS  (con edición inline)
══════════════════════════════════════════════════════ */
function getParent(id) { return currentExpenses().find(e => e.id === id); }
function getSubsKey(parentId) {
  return getParent(parentId)?.type === 'quincenal' ? activePanelQ : 1;
}

function openSubPanel(parentId) {
  activePanelId = parentId;
  activePanelQ  = 1;
  editingSubId  = null;
  const parent  = getParent(parentId);
  document.getElementById('quincenal-toggle-wrap')
    .classList.toggle('visible', parent.type === 'quincenal');
  document.querySelectorAll('.q-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.q) === 1));
  renderSubPanel(parentId);
  document.getElementById('subpanel').classList.add('open');
  document.getElementById('subpanel-overlay').classList.add('open');
  clearSubForm();
  setTimeout(() => document.getElementById('sub-name').focus(), 420);
}

function closeSubPanel() {
  activePanelId = null;
  editingSubId  = null;
  document.getElementById('subpanel').classList.remove('open');
  document.getElementById('subpanel-overlay').classList.remove('open');
}

function renderSubPanel(parentId) {
  const parent = getParent(parentId);
  if (!parent) return;
  const fullBudget = parent.amount;
  const budget     = parent.type === 'quincenal' ? Math.floor(fullBudget / 2) : fullBudget;
  const subsKey    = parent.type === 'quincenal' ? activePanelQ : 1;
  const subs       = parent.subs?.[subsKey] || [];
  const used       = subs.filter(s => s.included).reduce((a,s) => a + s.amount, 0);
  const avail      = budget - used;
  const pct        = budget > 0 ? Math.min(Math.round(used / budget * 100), 100) : 0;

  document.getElementById('subpanel-title').textContent  = parent.name;
  document.getElementById('subpanel-budget').textContent = parent.type === 'quincenal'
    ? `Presupuesto: ${fmt(budget)} / quincena (total ${fmt(fullBudget)})`
    : `Presupuesto: ${fmt(budget)}`;
  document.getElementById('subpanel-dot').style.background = parent.color;

  const fill = document.getElementById('subpanel-progress-fill');
  fill.style.width = pct + '%';
  fill.className = 'subpanel-progress-fill' + (pct >= 100 ? ' danger' : pct >= 80 ? ' warn' : '');

  document.getElementById('subpanel-used-label').textContent = `Usado: ${fmt(used)}`;
  const leftLabel = document.getElementById('subpanel-left-label');
  leftLabel.textContent = `Disponible: ${fmt(avail)}`;
  leftLabel.style.color = avail < 0 ? 'var(--danger)' : avail < budget * 0.1 ? 'var(--warning)' : 'var(--success)';

  const feed = document.getElementById('subpanel-feed');
  if (!subs.length) {
    feed.innerHTML = `
      <div class="sub-empty">
        <div class="empty-icon"><i data-lucide="clipboard-list"></i></div>
        <p>Sin subgastos aún.<br>Agrega uno abajo.</p>
      </div>`;
  } else {
    feed.innerHTML = '';
    subs.forEach((sub, i) => feed.appendChild(buildSubItem(sub, parentId, i)));
  }

  updateDuplicateBtn(parentId);

  // Actualizar label del botón guardar subgasto
  const saveBtn  = document.getElementById('sub-save');
  const saveIcon = saveBtn.querySelector('[data-lucide]');
  if (editingSubId) {
    saveBtn.innerHTML = `<i data-lucide="check"></i> Actualizar subgasto`;
    const cancelBtn = document.getElementById('sub-cancel');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
  } else {
    saveBtn.innerHTML = `<i data-lucide="plus"></i> Agregar`;
    const cancelBtn = document.getElementById('sub-cancel');
    if (cancelBtn) cancelBtn.classList.add('hidden');
  }

  lucide.createIcons();
}

function buildSubItem(sub, parentId, idx) {
  const wrap = document.createElement('div');
  const isEditing = editingSubId === sub.id;
  wrap.className = 'sub-item' + (sub.included ? '' : ' excluded') + (isEditing ? ' sub-editing' : '');
  wrap.dataset.id = sub.id;
  wrap.style.animationDelay = `${idx * 0.03}s`;

  if (isEditing) {
    // Modo edición inline
    wrap.innerHTML = `
      <div class="sub-edit-form">
        <div class="sub-edit-row">
          <div class="form-field">
            <label>Nombre</label>
            <input type="text" id="sub-edit-name" value="${sub.name}" autocomplete="off" />
          </div>
          <div class="form-field">
            <label>Monto ($)</label>
            <input type="text" id="sub-edit-amount" value="${Math.round(sub.amount).toLocaleString('es-CO')}" inputmode="numeric" />
          </div>
        </div>
        <div class="form-field">
          <label>Notas</label>
          <input type="text" id="sub-edit-notes" value="${sub.notes||''}" placeholder="Observación..." />
        </div>
        <div class="sub-edit-actions">
          <button class="btn btn-cancel sub-edit-cancel"><i data-lucide="x"></i> Cancelar</button>
          <button class="btn btn-save sub-edit-save"><i data-lucide="check"></i> Guardar</button>
        </div>
      </div>`;

    const editAmtInp = wrap.querySelector('#sub-edit-amount');
    editAmtInp.addEventListener('focus', () => { editAmtInp.value = editAmtInp.value.replace(/\D/g,''); });
    editAmtInp.addEventListener('input', () => { editAmtInp.value = fmtInput(editAmtInp.value); });

    wrap.querySelector('.sub-edit-cancel').addEventListener('click', () => {
      editingSubId = null;
      renderSubPanel(parentId);
    });
    wrap.querySelector('.sub-edit-save').addEventListener('click', () => {
      const newName   = wrap.querySelector('#sub-edit-name').value.trim();
      const newAmount = parseAmount(wrap.querySelector('#sub-edit-amount').value);
      const newNotes  = wrap.querySelector('#sub-edit-notes').value.trim();
      if (!newName)   { toast('Escribe un nombre', 'error'); return; }
      if (!newAmount) { toast('Escribe un monto',  'error'); return; }

      const qKey  = getSubsKey(parentId);
      const parent = getParent(parentId);
      const budget = parent.type === 'quincenal' ? Math.floor(parent.amount / 2) : parent.amount;
      const otherSubs = (parent.subs?.[qKey] || []).filter(s => s.id !== sub.id && s.included);
      const otherUsed = otherSubs.reduce((a,s) => a + s.amount, 0);
      if (otherUsed + newAmount > budget) {
        toast(`Se excede el presupuesto por ${fmt(otherUsed + newAmount - budget)}`, 'error');
        return;
      }
      mutate(parentId, e => ({
        ...e,
        subs: {
          ...e.subs,
          [qKey]: e.subs[qKey].map(s =>
            s.id === sub.id ? { ...s, name: newName, amount: newAmount, notes: newNotes } : s
          ),
        },
      }));
      editingSubId = null;
      toast('Subgasto actualizado', 'success');
      render();
    });
  } else {
    // Modo normal
    wrap.innerHTML = `
      <div class="item-check ${sub.included?'checked':''}" data-action="sub-toggle"></div>
      <div class="sub-item-info">
        <div class="name">${sub.name}</div>
        ${sub.notes ? `<div class="notes">${sub.notes}</div>` : ''}
      </div>
      <div class="sub-item-amount">${fmt(sub.amount)}</div>
      <button class="sub-item-edit"   data-action="sub-edit"   title="Editar"><i data-lucide="pencil"></i></button>
      <button class="sub-item-delete" data-action="sub-delete" title="Eliminar"><i data-lucide="x"></i></button>`;

    wrap.addEventListener('click', e => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'sub-toggle') { toggleSubIncluded(parentId, sub.id); }
      if (action === 'sub-edit')   {
        editingSubId = sub.id;
        renderSubPanel(parentId);
        setTimeout(() => wrap.querySelector('#sub-edit-name')?.focus(), 50);
      }
      if (action === 'sub-delete') { deleteSub(parentId, sub.id); }
    });
  }
  return wrap;
}

function toggleSubIncluded(parentId, subId) {
  const qKey = getSubsKey(parentId);
  mutate(parentId, e => ({
    ...e,
    subs: { ...e.subs, [qKey]: e.subs[qKey].map(s => s.id === subId ? { ...s, included: !s.included } : s) },
  }));
  render();
}

function deleteSub(parentId, subId) {
  if (editingSubId === subId) editingSubId = null;
  const qKey = getSubsKey(parentId);
  mutate(parentId, e => ({
    ...e,
    subs: { ...e.subs, [qKey]: e.subs[qKey].filter(s => s.id !== subId) },
  }));
  toast('Subgasto eliminado');
  render();
}

function addSub(parentId, name, amount, notes) {
  const parent = getParent(parentId);
  if (!parent) return;
  const budget = parent.type === 'quincenal' ? Math.floor(parent.amount / 2) : parent.amount;
  const qKey   = getSubsKey(parentId);
  const used   = (parent.subs?.[qKey] || []).filter(s => s.included).reduce((a,s) => a + s.amount, 0);
  if (used + amount > budget) {
    toast(`Se excede el presupuesto por ${fmt(used + amount - budget)}`, 'error');
    return;
  }
  mutate(parentId, e => ({
    ...e,
    subs: { ...e.subs, [qKey]: [...(e.subs[qKey] || []), { id: crypto.randomUUID(), name, amount, notes, included: true }] },
  }));
  toast('Subgasto agregado', 'success');
  render();
  clearSubForm();
  document.getElementById('sub-name').focus();
}

function clearSubForm() {
  ['sub-name','sub-amount','sub-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

/* ══════════════════════════════════════════════════════
   DUPLICAR SUBGASTOS
══════════════════════════════════════════════════════ */
function duplicateSubsToOtherQ(parentId) {
  const parent = getParent(parentId);
  if (!parent || parent.type !== 'quincenal') return;
  const fromQ = activePanelQ, toQ = fromQ === 1 ? 2 : 1;
  const subs  = parent.subs?.[fromQ] || [];
  if (!subs.length) { toast('No hay subgastos en esta quincena', 'error'); return; }
  const budget   = Math.floor(parent.amount / 2);
  const total    = subs.filter(s => s.included).reduce((a,s) => a + s.amount, 0);
  const destUsed = (parent.subs?.[toQ] || []).filter(s => s.included).reduce((a,s) => a + s.amount, 0);
  if (destUsed + total > budget) { toast('Se excedería el presupuesto de la otra quincena', 'error'); return; }
  const copies = subs.map(s => ({ id: crypto.randomUUID(), name: s.name, amount: s.amount, notes: s.notes||'', included: s.included !== false }));
  mutate(parentId, e => ({ ...e, subs: { ...e.subs, [toQ]: [...(e.subs[toQ]||[]), ...copies] } }));
  toast(`${copies.length} subgasto${copies.length!==1?'s':''} copiado${copies.length!==1?'s':''} a la ${toQ===1?'1ª':'2ª'} quincena`, 'success');
  render();
}

function updateDuplicateBtn(parentId) {
  const btn = document.getElementById('sub-duplicate-btn');
  if (!btn) return;
  const parent = getParent(parentId);
  if (!parent || parent.type !== 'quincenal') { btn.classList.add('hidden'); return; }
  const has = (parent.subs?.[activePanelQ] || []).length > 0;
  btn.classList.toggle('hidden', !has);
  btn.querySelector('span').textContent = `Duplicar a la ${activePanelQ===1?'2ª':'1ª'} quincena`;
}

/* ══════════════════════════════════════════════════════
   BORRAR TODOS
══════════════════════════════════════════════════════ */
function openClearModal() {
  if (!currentExpenses().length) { toast('No hay gastos para borrar', 'info'); return; }
  document.getElementById('clear-confirm-month').textContent = `${MONTHS[state.currentMonth]} ${state.currentYear}`;
  document.getElementById('clear-modal-overlay').classList.add('open');
}
function closeClearModal() { document.getElementById('clear-modal-overlay').classList.remove('open'); }
function confirmClearAll() {
  state.months[currentKey()] = [];
  closeSubPanel(); closeClearModal();
  toast('Todos los gastos eliminados', 'info');
  render();
}

/* ══════════════════════════════════════════════════════
   EVENTOS — MES
══════════════════════════════════════════════════════ */
document.getElementById('prev-month').addEventListener('click', () => {
  state.currentMonth--;
  if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
  closeSubPanel(); collapsedCats.clear(); render();
});
document.getElementById('next-month').addEventListener('click', () => {
  state.currentMonth++;
  if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
  closeSubPanel(); collapsedCats.clear(); render();
});

/* ── TEMA ───────────────────────────────────────────── */
document.getElementById('btn-theme').addEventListener('click', toggleTheme);

/* ── SALARY ─────────────────────────────────────────── */
const salaryInput = document.getElementById('salary-input');
salaryInput.addEventListener('focus', () => { salaryInput.value = state.salary ? String(Math.round(state.salary)) : ''; });
salaryInput.addEventListener('input', () => { salaryInput.value = fmtInput(salaryInput.value); });
salaryInput.addEventListener('blur',  () => { state.salary = parseAmount(salaryInput.value); render(); });

/* ══════════════════════════════════════════════════════
   EVENTOS — MODAL NUEVO GASTO
══════════════════════════════════════════════════════ */
const overlay = document.getElementById('modal-overlay');

function openModal() {
  modalType = 'normal';
  const usedColors = currentExpenses().map(e => e.color);
  const defaultColor = pickColor(usedColors);

  document.getElementById('m-name').value   = '';
  document.getElementById('m-amount').value = '';
  document.getElementById('m-date').value   = todayISO();
  document.getElementById('m-notes').value  = '';
  document.getElementById('m-color').value  = defaultColor;
  updateModalColorPreview(defaultColor);
  document.querySelectorAll('#m-type-selector .type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === 'normal'));
  document.querySelectorAll('.quick-chip').forEach(c => c.classList.remove('active'));
  renderModalQuick();
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('m-name').focus(), 120);
}

function closeModal() { overlay.classList.remove('open'); }

document.getElementById('open-modal').addEventListener('click', openModal);
document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('close-modal-2').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

// Color preview en tiempo real
document.getElementById('m-color').addEventListener('input', e => updateModalColorPreview(e.target.value));

document.querySelectorAll('#m-type-selector .type-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    modalType = btn.dataset.type;
    document.querySelectorAll('#m-type-selector .type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

const mAmount = document.getElementById('m-amount');
mAmount.addEventListener('focus', () => { mAmount.value = mAmount.value.replace(/\D/g,''); });
mAmount.addEventListener('input', () => { mAmount.value = fmtInput(mAmount.value); });

document.getElementById('save-expense').addEventListener('click', () => {
  const name   = document.getElementById('m-name').value.trim();
  const amount = parseAmount(document.getElementById('m-amount').value);
  const date   = document.getElementById('m-date').value || todayISO();
  const notes  = document.getElementById('m-notes').value.trim();
  const color  = document.getElementById('m-color').value;
  if (!name)   { toast('Escribe un nombre', 'error'); return; }
  if (!amount) { toast('Escribe un monto',  'error'); return; }
  addExpense(name, amount, date, notes, color, modalType);
  closeModal();
  toast('Gasto agregado', 'success');
});

document.querySelectorAll('#modal-overlay input').forEach(inp => {
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && inp.type !== 'color') document.getElementById('save-expense').click();
  });
});

/* ── PANEL PLANTILLAS ───────────────────────────────── */
document.getElementById('open-templates').addEventListener('click', openTplPanel);
document.getElementById('close-tpl').addEventListener('click', closeTplPanel);
document.getElementById('tpl-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('tpl-overlay')) closeTplPanel();
});

/* ── TAB TOGGLE (Individuales / Conjuntos) ─────────── */
document.querySelectorAll('.tpl-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tpl-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isIndividual = tab.dataset.tab === 'individual';
    document.getElementById('tab-individual').classList.toggle('hidden', !isIndividual);
    document.getElementById('tab-bundles').classList.toggle('hidden', isIndividual);
    if (!isIndividual) renderBundleTab();
  });
});

/* ── BUNDLES ────────────────────────────────────────── */
document.getElementById('btn-save-bundle').addEventListener('click', openBundleForm);
document.getElementById('bundle-form-cancel').addEventListener('click', closeBundleForm);
document.getElementById('bundle-form-save').addEventListener('click', () => {
  const name = document.getElementById('bundle-fname').value.trim();
  if (!name) { toast('Escribe un nombre para el conjunto', 'error'); return; }
  saveBundleFromMonth(name);
});
document.getElementById('bundle-fname')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('bundle-form-save').click();
});

/* ── MODAL CAMBIO TEMA ─────────────────────────────── */
document.getElementById('theme-confirm').addEventListener('click', confirmThemeChange);
document.getElementById('theme-cancel').addEventListener('click', closeThemeModal);
document.getElementById('theme-modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('theme-modal-overlay')) closeThemeModal();
});


/* ── SUBPANEL ───────────────────────────────────────── */
document.getElementById('subpanel-close').addEventListener('click', closeSubPanel);
document.getElementById('subpanel-overlay').addEventListener('click', closeSubPanel);

document.querySelectorAll('.q-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const q = parseInt(btn.dataset.q);
    if (activePanelQ === q) return;
    activePanelQ = q;
    editingSubId = null;
    document.querySelectorAll('.q-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.q) === q));
    renderSubPanel(activePanelId);
    updateDuplicateBtn(activePanelId);
    clearSubForm();
  });
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('theme-modal-overlay').classList.contains('open')) closeThemeModal();
  else if (document.getElementById('tpl-overlay').classList.contains('open')) closeTplPanel();
  else if (activePanelId) closeSubPanel();
  else closeModal();
});

const subAmountInp = document.getElementById('sub-amount');
subAmountInp.addEventListener('focus', () => { subAmountInp.value = subAmountInp.value.replace(/\D/g,''); });
subAmountInp.addEventListener('input', () => { subAmountInp.value = fmtInput(subAmountInp.value); });

document.getElementById('sub-save').addEventListener('click', () => {
  if (!activePanelId) return;
  const name   = document.getElementById('sub-name').value.trim();
  const amount = parseAmount(document.getElementById('sub-amount').value);
  const notes  = document.getElementById('sub-notes').value.trim();
  if (!name)   { toast('Escribe un nombre', 'error'); return; }
  if (!amount) { toast('Escribe un monto',  'error'); return; }
  addSub(activePanelId, name, amount, notes);
});

['sub-name','sub-amount','sub-notes'].forEach(id => {
  document.getElementById(id)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('sub-save').click();
  });
});

/* ── DUPLICAR SUBGASTOS ─────────────────────────────── */
document.getElementById('sub-duplicate-btn')?.addEventListener('click', () => {
  if (activePanelId) duplicateSubsToOtherQ(activePanelId);
});

/* ── BUSCADOR ───────────────────────────────────────── */
document.getElementById('btn-toggle-search')?.addEventListener('click', () => {
  const container = document.getElementById('search-container');
  container.classList.toggle('hidden');
  if (!container.classList.contains('hidden')) {
    document.getElementById('search-input').focus();
  }
});

let searchDebounce;
function handleSearch() {
  searchQuery    = document.getElementById('search-input').value;
  searchDateFrom = document.getElementById('search-date-from').value;
  searchDateTo   = document.getElementById('search-date-to').value;
  
  const hasFilter = searchQuery || searchDateFrom || searchDateTo;
  document.getElementById('search-clear').classList.toggle('hidden', !hasFilter);
  
  renderFeed();
}

document.getElementById('search-input')?.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(handleSearch, 300);
});

document.getElementById('search-date-from')?.addEventListener('change', handleSearch);
document.getElementById('search-date-to')?.addEventListener('change', handleSearch);

document.getElementById('search-clear')?.addEventListener('click', () => {
  document.getElementById('search-input').value = '';
  document.getElementById('search-date-from').value = '';
  document.getElementById('search-date-to').value = '';
  handleSearch();
});

document.getElementById('btn-adv-search')?.addEventListener('click', () => {
  const panel = document.getElementById('search-adv-panel');
  const icon  = document.getElementById('adv-search-icon');
  panel.classList.toggle('hidden');
  icon.classList.toggle('open');
});

/* ── BORRAR TODOS ───────────────────────────────────── */
document.getElementById('btn-clear-all')?.addEventListener('click', openClearModal);
document.getElementById('clear-cancel')?.addEventListener('click', closeClearModal);
document.getElementById('clear-confirm')?.addEventListener('click', confirmClearAll);
document.getElementById('clear-modal-overlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('clear-modal-overlay')) closeClearModal();
});

/* ══════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════ */
let toastTimer;
export function toast(msg, type = 'info') {
  const el     = document.getElementById('toast');
  const msgEl  = document.getElementById('toast-msg');
  const iconEl = document.getElementById('toast-icon');
  msgEl.textContent = msg;
  el.className = '';
  const iconMap = { success: 'check-circle', error: 'alert-circle', info: 'info' };
  iconEl.setAttribute('data-lucide', iconMap[type] || 'info');
  lucide.createIcons({ nodes: [iconEl] });
  if (type === 'error')   el.classList.add('toast-error');
  if (type === 'success') el.classList.add('toast-success');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ══════════════════════════════════════════════════════
   VANTA
══════════════════════════════════════════════════════ */
export function initVanta() {
  const isLight = !state.darkMode;
  VANTA.FOG({
    el: '#vanta-bg',
    mouseControls: false, touchControls: false, gyroControls: false,
    minHeight: 200, minWidth: 200,
    highlightColor: isLight ? 0x84AFFB : 0x0259DD,
    midtoneColor:   isLight ? 0xffffff : 0x012c70,
    lowlightColor:  isLight ? 0xFF6648 : 0xd64f33,
    baseColor:      isLight ? 0xFFE1D7 : 0x08091a,
    speed: 0.40,
  });
}