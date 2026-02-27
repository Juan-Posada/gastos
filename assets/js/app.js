/* ══════════════════════════════════════════════════════
   CONSTANTS & DEFAULTS
══════════════════════════════════════════════════════ */
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const COLORS = ['#b56eff','#e879f9','#7c3aed','#a78bfa','#c084fc',
                '#d946ef','#8b5cf6','#818cf8','#e040fb','#9333ea','#a21caf'];

const DEFAULT_SALARY = 1860000;
const DEFAULT_EXPENSES = [
  { name: 'Casa',          amount: 440000 },
  { name: 'Deudas',        amount: 150000 },
  { name: 'PC',            amount: 100000 },
  { name: 'Celulares',     amount: 80000  },
  { name: 'Madre',         amount: 280000 },
  { name: 'Titos',         amount: 60000  },
  { name: 'Transporte',    amount: 140000 },
  { name: 'Seis',          amount: 70000  },
  { name: 'Mis cosas',     amount: 140000 },
  { name: 'Madre y Karla', amount: 280000 },
  { name: 'Tenis',         amount: 50000  },
];

/* ══════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════ */
let activePanelId  = null;   // ID del gasto con panel abierto
let activePanelQ   = 1;      // quincena activa en el panel (1 o 2)
let modalType      = 'normal'; // tipo seleccionado en el modal

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem('gastos_app_v3');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* */ }

  const now = new Date();
  const key = monthKey(now.getFullYear(), now.getMonth());
  const expenses = DEFAULT_EXPENSES.map((e, i) => makeExpense(e.name, e.amount, todayISO(), '', COLORS[i % COLORS.length], 'normal'));

  return {
    salary:       DEFAULT_SALARY,
    currentYear:  now.getFullYear(),
    currentMonth: now.getMonth(),
    months:       { [key]: expenses },
  };
}

/* Factoría de gasto */
function makeExpense(name, amount, date, notes, color, type) {
  return {
    id:       crypto.randomUUID(),
    name, amount, date, notes, color,
    type:     type || 'normal',   // 'normal' | 'quincenal'
    included: true,
    subs:     { 1: [], 2: [] },   // listas independientes Q1 / Q2
  };
}

function save() {
  localStorage.setItem('gastos_app_v3', JSON.stringify(state));
}

function monthKey(y, m) { return `${y}-${String(m).padStart(2,'0')}`; }
function currentKey()   { return monthKey(state.currentYear, state.currentMonth); }
function currentExpenses() { return state.months[currentKey()] || []; }
function todayISO()     { return new Date().toISOString().split('T')[0]; }

/* ══════════════════════════════════════════════════════
   FORMATTING
══════════════════════════════════════════════════════ */
function fmt(n) { return '$' + Math.round(n).toLocaleString('es-CO'); }

function fmtInput(val) {
  const num = val.replace(/\D/g,'');
  return num ? parseInt(num).toLocaleString('es-CO') : '';
}

function parseAmount(str) { return parseInt(str.replace(/\D/g,'')) || 0; }

/* ══════════════════════════════════════════════════════
   RENDER PRINCIPAL
══════════════════════════════════════════════════════ */
function render() {
  renderMonthNav();
  renderSalary();
  renderStats();
  renderFeed();
  if (activePanelId) renderSubPanel(activePanelId);
  save();
  lucide.createIcons(); // re-hidrata iconos generados por JS
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

  document.getElementById('stat-spent').textContent = fmt(spent);
  document.getElementById('stat-pct').textContent   = pct + '%';
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('prog-label-pct').textContent = pct + '%';

  const leftEl = document.getElementById('stat-left');
  leftEl.textContent = fmt(left);
  leftEl.className = 'value';
  if (left < 0)           leftEl.classList.add('danger');
  else if (left < 100000) leftEl.classList.add('warn');
}

function renderFeed() {
  const feed     = document.getElementById('feed');
  const expenses = currentExpenses();
  document.getElementById('feed-count').textContent = expenses.length;

  if (!expenses.length) {
    feed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="inbox"></i></div>
        <p>Sin gastos este mes.<br>Presiona <strong>Nuevo gasto</strong> para comenzar.</p>
      </div>`;
    return;
  }

  feed.innerHTML = '';
  expenses.forEach((exp, i) => feed.appendChild(buildItem(exp, i)));
}

/* ──────────────────────────────────────────────────────
   BUILD ITEM
────────────────────────────────────────────────────── */
function buildItem(exp, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'expense-item' + (exp.included ? '' : ' excluded');
  wrap.dataset.id = exp.id;
  wrap.style.animationDelay = `${idx * 0.04}s`;

  const dateStr = exp.date
    ? new Date(exp.date + 'T00:00:00').toLocaleDateString('es-CO', {day:'numeric',month:'short',year:'numeric'})
    : '–';

  // sub-indicator: suma de ambas quincenas
  const subs1    = (exp.subs?.[1] || []);
  const subs2    = (exp.subs?.[2] || []);
  const allSubs  = [...subs1, ...subs2];
  const subCount = allSubs.length;
  const subUsed  = allSubs.filter(s => s.included).reduce((a,s) => a + s.amount, 0);
  const subIndicatorHTML = subCount > 0
    ? `<div class="sub-indicator">
         <i data-lucide="layers"></i>
         ${subCount} subgasto${subCount!==1?'s':''} · ${fmt(subUsed)}
       </div>`
    : '';

  const quincenalBadge = exp.type === 'quincenal'
    ? `<span class="quincenal-badge"><i data-lucide="calendar-range"></i>Quincenal</span>`
    : '';

  // type selector para el detalle editable
  const detailTypeSelector = `
    <div class="detail-type-selector">
      <button class="type-btn ${exp.type==='normal'?'active':''}" data-type="normal" data-action="change-type">
        <i data-lucide="circle-dot"></i> Normal
      </button>
      <button class="type-btn ${exp.type==='quincenal'?'active':''}" data-type="quincenal" data-action="change-type">
        <i data-lucide="calendar-range"></i> Quincenal
      </button>
    </div>`;

  wrap.innerHTML = `
    <div class="item-main">
      <div class="item-check ${exp.included?'checked':''}" data-action="toggle"></div>
      <div class="item-dot" style="background:${exp.color}"></div>
      <div class="item-info">
        <div class="name">${exp.name}</div>
        <div class="date">${dateStr}</div>
        ${subIndicatorHTML}
      </div>
      ${quincenalBadge}
      <div class="item-amount" style="color:${exp.color}">${fmt(exp.amount)}</div>
      <button class="sub-btn" data-action="open-subs">
        <i data-lucide="list"></i> Desglose
      </button>
      <button class="expand-btn" data-action="expand" aria-label="Editar">
        <i data-lucide="pencil"></i>
      </button>
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
            ${detailTypeSelector}
          </div>
          <div class="detail-field full">
            <label>Notas</label>
            <textarea data-field="notes" rows="2">${exp.notes||''}</textarea>
          </div>
        </div>
        <div class="detail-actions">
          <button class="btn btn-delete" data-action="delete">
            <i data-lucide="trash-2"></i> Eliminar
          </button>
          <button class="btn btn-save" data-action="save">
            <i data-lucide="check"></i> Guardar
          </button>
        </div>
      </div>
    </div>`;

  // format amount on focus/blur
  const amtInp = wrap.querySelector('[data-field="amount"]');
  amtInp.addEventListener('focus', () => { amtInp.value = amtInp.value.replace(/\D/g,''); });
  amtInp.addEventListener('blur',  () => { amtInp.value = fmtInput(amtInp.value); });

  // type buttons inside detail
  wrap.querySelectorAll('[data-action="change-type"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      wrap.querySelectorAll('[data-action="change-type"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // click delegation
  wrap.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action || action === 'change-type') return;

    if (action === 'toggle') {
      toggleIncluded(exp.id);
    } else if (action === 'expand') {
      const det = wrap.querySelector('.item-detail');
      det.classList.toggle('open');
    } else if (action === 'open-subs') {
      e.stopPropagation();
      openSubPanel(exp.id);
    } else if (action === 'save') {
      saveItem(wrap, exp.id);
    } else if (action === 'delete') {
      deleteItem(exp.id);
    }
  });

  return wrap;
}

/* ══════════════════════════════════════════════════════
   ACTIONS — GASTOS PRINCIPALES
══════════════════════════════════════════════════════ */
function toggleIncluded(id) {
  mutate(id, e => ({ ...e, included: !e.included }));
  render();
}

function saveItem(wrap, id) {
  const name   = wrap.querySelector('[data-field="name"]').value.trim();
  const amount = parseAmount(wrap.querySelector('[data-field="amount"]').value);
  const date   = wrap.querySelector('[data-field="date"]').value;
  const notes  = wrap.querySelector('[data-field="notes"]').value.trim();
  const color  = wrap.querySelector('[data-field="color"]').value;
  const typeEl = wrap.querySelector('[data-action="change-type"].active');
  const type   = typeEl ? typeEl.dataset.type : 'normal';

  if (!name || !amount) { toast('Nombre y monto son obligatorios', 'error'); return; }

  mutate(id, e => ({ ...e, name, amount, date, notes, color, type }));
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

function addExpense(name, amount, date, notes, type) {
  const key = currentKey();
  if (!state.months[key]) state.months[key] = [];

  const usedColors = state.months[key].map(e => e.color);
  const color = COLORS.find(c => !usedColors.includes(c)) || COLORS[state.months[key].length % COLORS.length];

  state.months[key].push(makeExpense(name, amount, date, notes, color, type));
  render();
}

/* Mutación inmutable de un gasto por ID */
function mutate(id, fn) {
  const key = currentKey();
  state.months[key] = state.months[key].map(e => e.id === id ? fn(e) : e);
}

/* ══════════════════════════════════════════════════════
   SUBGASTOS — PANEL LATERAL
══════════════════════════════════════════════════════ */
function getParent(id) { return currentExpenses().find(e => e.id === id); }

function openSubPanel(parentId) {
  activePanelId = parentId;
  const parent  = getParent(parentId);
  activePanelQ  = 1; // siempre empieza en Q1

  // mostrar u ocultar toggle según tipo
  const toggleWrap = document.getElementById('quincenal-toggle-wrap');
  if (parent.type === 'quincenal') {
    toggleWrap.classList.add('visible');
  } else {
    toggleWrap.classList.remove('visible');
  }

  // resetear botones Q
  document.querySelectorAll('.q-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.q) === 1);
  });

  renderSubPanel(parentId);
  document.getElementById('subpanel').classList.add('open');
  document.getElementById('subpanel-overlay').classList.add('open');
  clearSubForm();
  setTimeout(() => document.getElementById('sub-name').focus(), 420);
}

function closeSubPanel() {
  activePanelId = null;
  document.getElementById('subpanel').classList.remove('open');
  document.getElementById('subpanel-overlay').classList.remove('open');
}

function renderSubPanel(parentId) {
  const parent = getParent(parentId);
  if (!parent) return;

  // Presupuesto: si es quincenal, dividir a la mitad por quincena
  const fullBudget = parent.amount;
  const budget     = parent.type === 'quincenal' ? Math.floor(fullBudget / 2) : fullBudget;

  // subs de la quincena activa (o la única lista si es normal)
  const subsKey = parent.type === 'quincenal' ? activePanelQ : 1;
  const subs    = (parent.subs?.[subsKey] || []);

  const used  = subs.filter(s => s.included).reduce((a,s) => a + s.amount, 0);
  const avail = budget - used;
  const pct   = budget > 0 ? Math.min(Math.round(used / budget * 100), 100) : 0;

  // header
  document.getElementById('subpanel-title').textContent  = parent.name;
  const budgetLabel = parent.type === 'quincenal'
    ? `Presupuesto: ${fmt(budget)} / quincena (total ${fmt(fullBudget)})`
    : `Presupuesto: ${fmt(budget)}`;
  document.getElementById('subpanel-budget').textContent = budgetLabel;
  document.getElementById('subpanel-dot').style.background = parent.color;

  // progress bar
  const fill = document.getElementById('subpanel-progress-fill');
  fill.style.width  = pct + '%';
  fill.className    = 'subpanel-progress-fill';
  if (pct >= 100)   fill.classList.add('danger');
  else if (pct >= 80) fill.classList.add('warn');

  document.getElementById('subpanel-used-label').textContent = `Usado: ${fmt(used)}`;
  const leftLabel = document.getElementById('subpanel-left-label');
  leftLabel.textContent = `Disponible: ${fmt(avail)}`;
  leftLabel.style.color = avail < 0
    ? 'var(--danger)'
    : avail < budget * 0.1
      ? 'var(--warning)'
      : 'var(--success)';

  // feed
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

  lucide.createIcons();
}

function buildSubItem(sub, parentId, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'sub-item' + (sub.included ? '' : ' excluded');
  wrap.dataset.id = sub.id;
  wrap.style.animationDelay = `${idx * 0.03}s`;

  wrap.innerHTML = `
    <div class="item-check ${sub.included?'checked':''}" data-action="sub-toggle"></div>
    <div class="sub-item-info">
      <div class="name">${sub.name}</div>
      ${sub.notes ? `<div class="notes">${sub.notes}</div>` : ''}
    </div>
    <div class="sub-item-amount">${fmt(sub.amount)}</div>
    <button class="sub-item-delete" data-action="sub-delete" title="Eliminar">
      <i data-lucide="x"></i>
    </button>`;

  wrap.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'sub-toggle') toggleSubIncluded(parentId, sub.id);
    if (action === 'sub-delete') deleteSub(parentId, sub.id);
  });

  return wrap;
}

/* ──────────────────────────────────────────────────────
   ACCIONES DE SUBGASTOS
────────────────────────────────────────────────────── */
function getSubsKey(parentId) {
  const parent = getParent(parentId);
  return parent?.type === 'quincenal' ? activePanelQ : 1;
}

function toggleSubIncluded(parentId, subId) {
  const qKey = getSubsKey(parentId);
  mutate(parentId, e => ({
    ...e,
    subs: {
      ...e.subs,
      [qKey]: e.subs[qKey].map(s => s.id === subId ? { ...s, included: !s.included } : s),
    },
  }));
  render();
}

function deleteSub(parentId, subId) {
  const qKey = getSubsKey(parentId);
  mutate(parentId, e => ({
    ...e,
    subs: {
      ...e.subs,
      [qKey]: e.subs[qKey].filter(s => s.id !== subId),
    },
  }));
  toast('Subgasto eliminado');
  render();
}

function addSub(parentId, name, amount, notes) {
  const parent = getParent(parentId);
  if (!parent) return;

  const budget  = parent.type === 'quincenal' ? Math.floor(parent.amount / 2) : parent.amount;
  const qKey    = getSubsKey(parentId);
  const subs    = parent.subs?.[qKey] || [];
  const used    = subs.filter(s => s.included).reduce((a,s) => a + s.amount, 0);

  if (used + amount > budget) {
    const over = fmt(used + amount - budget);
    toast(`Se excede el presupuesto por ${over}`, 'error');
    return;
  }

  mutate(parentId, e => ({
    ...e,
    subs: {
      ...e.subs,
      [qKey]: [...(e.subs[qKey] || []), {
        id:       crypto.randomUUID(),
        name, amount, notes,
        included: true,
      }],
    },
  }));

  toast('Subgasto agregado', 'success');
  render();
  clearSubForm();
  document.getElementById('sub-name').focus();
}

function clearSubForm() {
  document.getElementById('sub-name').value   = '';
  document.getElementById('sub-amount').value = '';
  document.getElementById('sub-notes').value  = '';
}

/* ══════════════════════════════════════════════════════
   MONTH NAV
══════════════════════════════════════════════════════ */
document.getElementById('prev-month').addEventListener('click', () => {
  state.currentMonth--;
  if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
  closeSubPanel();
  render();
});
document.getElementById('next-month').addEventListener('click', () => {
  state.currentMonth++;
  if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
  closeSubPanel();
  render();
});

/* ══════════════════════════════════════════════════════
   SALARY
══════════════════════════════════════════════════════ */
const salaryInput = document.getElementById('salary-input');
salaryInput.addEventListener('focus', () => {
  salaryInput.value = state.salary ? String(Math.round(state.salary)) : '';
});
salaryInput.addEventListener('input', () => {
  salaryInput.value = fmtInput(salaryInput.value);
});
salaryInput.addEventListener('blur', () => {
  state.salary = parseAmount(salaryInput.value);
  render();
});

/* ══════════════════════════════════════════════════════
   MODAL — NUEVO GASTO
══════════════════════════════════════════════════════ */
const overlay = document.getElementById('modal-overlay');

function openModal() {
  modalType = 'normal';
  document.getElementById('m-name').value   = '';
  document.getElementById('m-amount').value = '';
  document.getElementById('m-date').value   = todayISO();
  document.getElementById('m-notes').value  = '';
  // reset type selector
  document.querySelectorAll('#m-type-selector .type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === 'normal');
  });
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('m-name').focus(), 120);
}

function closeModal() { overlay.classList.remove('open'); }

document.getElementById('open-modal').addEventListener('click', openModal);
document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('close-modal-2').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

// type selector en modal
document.querySelectorAll('#m-type-selector .type-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    modalType = btn.dataset.type;
    document.querySelectorAll('#m-type-selector .type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// format modal amount
const mAmount = document.getElementById('m-amount');
mAmount.addEventListener('focus', () => { mAmount.value = mAmount.value.replace(/\D/g,''); });
mAmount.addEventListener('input', () => { mAmount.value = fmtInput(mAmount.value); });

document.getElementById('save-expense').addEventListener('click', () => {
  const name   = document.getElementById('m-name').value.trim();
  const amount = parseAmount(document.getElementById('m-amount').value);
  const date   = document.getElementById('m-date').value || todayISO();
  const notes  = document.getElementById('m-notes').value.trim();

  if (!name)   { toast('Escribe un nombre', 'error');  return; }
  if (!amount) { toast('Escribe un monto',  'error');  return; }

  addExpense(name, amount, date, notes, modalType);
  closeModal();
  toast('Gasto agregado', 'success');
});

document.querySelectorAll('#modal-overlay input').forEach(inp => {
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('save-expense').click();
  });
});

/* ══════════════════════════════════════════════════════
   PANEL LATERAL — EVENTOS
══════════════════════════════════════════════════════ */
document.getElementById('subpanel-close').addEventListener('click', closeSubPanel);
document.getElementById('subpanel-overlay').addEventListener('click', closeSubPanel);

// Toggle Q1 / Q2
document.querySelectorAll('.q-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const q = parseInt(btn.dataset.q);
    if (activePanelQ === q) return;
    activePanelQ = q;
    document.querySelectorAll('.q-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.q) === q));
    renderSubPanel(activePanelId);
    clearSubForm();
  });
});

// Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (activePanelId) closeSubPanel();
    else closeModal();
  }
});

// format sub-amount
const subAmountInp = document.getElementById('sub-amount');
subAmountInp.addEventListener('focus', () => { subAmountInp.value = subAmountInp.value.replace(/\D/g,''); });
subAmountInp.addEventListener('input', () => { subAmountInp.value = fmtInput(subAmountInp.value); });

document.getElementById('sub-save').addEventListener('click', () => {
  if (!activePanelId) return;
  const name   = document.getElementById('sub-name').value.trim();
  const amount = parseAmount(document.getElementById('sub-amount').value);
  const notes  = document.getElementById('sub-notes').value.trim();
  if (!name)   { toast('Escribe un nombre', 'error');  return; }
  if (!amount) { toast('Escribe un monto',  'error');  return; }
  addSub(activePanelId, name, amount, notes);
});

// Enter en formulario sub
['sub-name','sub-amount','sub-notes'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('sub-save').click();
  });
});

/* ══════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════ */
let toastTimer;
function toast(msg, type = 'info') {
  const el      = document.getElementById('toast');
  const msgEl   = document.getElementById('toast-msg');
  const iconEl  = document.getElementById('toast-icon');

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
VANTA.FOG({
  el: '#vanta-bg',
  mouseControls: true,
  touchControls: true,
  gyroControls: false,
  minHeight: 200.00,
  minWidth: 200.00,
  highlightColor: 0x4d079d,
  midtoneColor: 0x2c2440,
  lowlightColor: 0x3d016d,
  baseColor: 0x101010,
  speed: 2.20,
});

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
render();