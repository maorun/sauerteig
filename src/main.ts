import './style.css';
import {
  buildSchedule,
  calcAmounts,
  calcTargetOptions,
  calcTiming,
  DEFAULT_FLOUR,
  FLOUR_LABELS,
  isFlourType,
  getPhase,
  MAX_RATIO_PART,
  MAX_TEMP_C,
  MIN_TEMP_C,
  parseRatioParts,
  splitHours,
  type FlourType,
  type PhaseName,
  type TargetOption,
} from './calc';
import { nextTab, TAB_NAMES, type TabName } from './tabs';

const STORE_KEY = 'sauerteig:start';
const FLOUR_KEY = 'sauerteig:flour';
const MAX_TOTAL_G = 1_000_000;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const PHASE_LABEL: Record<PhaseName, string> = {
  lag: 'Anlaufphase',
  growth: 'Wachstum',
  peak: 'Peak – jetzt verwenden oder füttern',
  decline: 'Absinkend',
  over: 'Über dem Peak – bald füttern',
};

const fmtTime = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const fmtDuration = (hours: number): string => {
  const { hours: h, minutes: m } = splitHours(hours);
  return `${h} h ${String(m).padStart(2, '0')} min`;
};

const toLocalInput = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const flourEl = $<HTMLSelectElement>('flour');
// Select values come from the DOM, so a tampered option falls back to the default.
const getFlour = (el: HTMLSelectElement): FlourType => (isFlourType(el.value) ? el.value : DEFAULT_FLOUR);
const ratioFlourEl = $<HTMLInputElement>('ratio-flour');
const ratioWaterEl = $<HTMLInputElement>('ratio-water');
const ratioStarterEl = $<HTMLInputElement>('ratio-starter');
const tempEl = $<HTMLInputElement>('temp');
const totalEl = $<HTMLInputElement>('total');
const startEl = $<HTMLInputElement>('start');
const errorEl = $('error');

// Storage can throw in private or blocked modes. The app then runs without persistence.
const store = {
  get(key = STORE_KEY): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(value: string, key = STORE_KEY): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* no persistence available */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* no persistence available */
    }
  },
};

const savedDate = new Date(store.get() ?? NaN);
startEl.value = toLocalInput(Number.isNaN(savedDate.getTime()) ? new Date() : savedDate);

const savedFlour = store.get(FLOUR_KEY);
const initialFlour: FlourType = isFlourType(savedFlour) ? savedFlour : DEFAULT_FLOUR;
flourEl.value = initialFlour;

let tick: number | undefined;

const OUTPUT_IDS = ['o-flour', 'o-water', 'o-starter', 'o-doubling', 'o-peak', 's-start', 's-peak', 's-end'];

function showError(msg: string | null): void {
  errorEl.hidden = msg === null;
  errorEl.textContent = msg ?? '';
  if (msg === null) return;
  // Clear stale results so the page never shows values for invalid input.
  for (const id of OUTPUT_IDS) $(id).textContent = '–';
  $('phase-name').textContent = '–';
  delete $('phase-name').dataset.phase;
  $('bar').setAttribute('aria-valuenow', '0');
  $('bar-fill').style.width = '0%';
  $('countdown').textContent = '–';
}

function render(): void {
  window.clearInterval(tick);
  const ratio = parseRatioParts(ratioFlourEl.value, ratioWaterEl.value, ratioStarterEl.value);
  const temp = Number(tempEl.value);
  const total = Number(totalEl.value);
  const start = new Date(startEl.value);

  if (!ratio) return showError(`Mehl, Wasser und ASG müssen Zahlen zwischen 0 und ${MAX_RATIO_PART} sein.`);
  if (!Number.isFinite(temp) || tempEl.value === '' || temp < MIN_TEMP_C || temp > MAX_TEMP_C) {
    return showError(`Temperatur muss zwischen ${MIN_TEMP_C} und ${MAX_TEMP_C} °C liegen.`);
  }
  if (!Number.isFinite(total) || total <= 0 || total > MAX_TOTAL_G) {
    return showError(`Menge muss zwischen 1 und ${MAX_TOTAL_G} g liegen.`);
  }
  if (Number.isNaN(start.getTime())) return showError('Startzeit ungültig.');
  showError(null);

  const amounts = calcAmounts(ratio, total);
  if (amounts.flour < 1 || amounts.water < 1 || amounts.starter < 1) {
    return showError('Menge zu klein für dieses Verhältnis. Menge erhöhen.');
  }
  const timing = calcTiming(ratio, temp, getFlour(flourEl));
  const schedule = buildSchedule(start, timing);

  $('o-flour').textContent = `${amounts.flour} g`;
  $('o-water').textContent = `${amounts.water} g`;
  $('o-starter').textContent = `${amounts.starter} g`;
  $('o-doubling').textContent = fmtDuration(timing.doublingHours);
  $('o-peak').textContent = fmtDuration(timing.peakHours);
  $('s-start').textContent = fmtTime.format(schedule.start);
  $('s-peak').textContent = fmtTime.format(schedule.peak);
  $('s-end').textContent = fmtTime.format(schedule.windowEnd);

  const update = (): void => {
    const elapsed = (Date.now() - start.getTime()) / 3_600_000;
    const phase = getPhase(elapsed, timing);
    // Write only on change, so the live region does not announce the same phase each second.
    if ($('phase-name').dataset.phase !== phase.name) {
      $('phase-name').textContent = PHASE_LABEL[phase.name];
      $('phase-name').dataset.phase = phase.name;
    }
    const pct = Math.round(phase.progress * 100);
    $('bar').setAttribute('aria-valuenow', String(pct));
    $('bar-fill').style.width = `${pct}%`;
    const toPeak = timing.peakHours - elapsed;
    $('countdown').textContent =
      elapsed < 0
        ? `Start in ${fmtDuration(-elapsed)}`
        : toPeak > 0
          ? `Noch ${fmtDuration(toPeak)} bis Peak`
          : `Peak vor ${fmtDuration(-toPeak)} erreicht`;
  };
  update();
  tick = window.setInterval(update, 1000);
}

// Both flour selects stay in sync, and each change updates both calculators.
function setFlour(flour: FlourType, rerender = true): void {
  flourEl.value = flour;
  tFlourEl.value = flour;
  store.set(flour, FLOUR_KEY);
  if (!rerender) return;
  render();
  renderTarget();
}

// The start field renders on "change" only, so a half-typed date causes no error flash.
document.getElementById('form')?.addEventListener('input', (e) => {
  if (e.target === flourEl) setFlour(getFlour(flourEl));
  else if (e.target !== startEl) render();
});
startEl.addEventListener('change', () => {
  const d = new Date(startEl.value);
  if (Number.isNaN(d.getTime())) store.clear();
  else store.set(d.toISOString());
  render();
});
$('btn-start').addEventListener('click', () => {
  const now = new Date();
  startEl.value = toLocalInput(now);
  store.set(now.toISOString());
  render();
});
$('btn-reset').addEventListener('click', () => {
  store.clear();
  startEl.value = toLocalInput(new Date());
  render();
});

// --- Target time calculator ---
const tFlourEl = $<HTMLSelectElement>('t-flour');
tFlourEl.value = flourEl.value;
const tTargetEl = $<HTMLInputElement>('t-target');
const tStartEl = $<HTMLInputElement>('t-start');
const tTotalEl = $<HTMLInputElement>('t-total');
const tErrorEl = $('t-error');
const tStatusEl = $('t-status');
const tWrapEl = $('t-wrap');
const tBodyEl = $('t-body');
let tOptions: TargetOption[] = [];
// Start time of the last calculation, so a selected option keeps the shown peak time.
let tStartUsed = new Date();

const setTargetStatus = (text: string): void => {
  if (tStatusEl.textContent !== text) tStatusEl.textContent = text;
};

const fmtNum = (n: number): string => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

function showTargetError(msg: string | null): void {
  tErrorEl.hidden = msg === null;
  tErrorEl.textContent = msg ?? '';
}

function renderTarget(): void {
  tBodyEl.replaceChildren();
  tOptions = [];
  tWrapEl.hidden = true;
  setTargetStatus('');
  if (tTargetEl.value === '') return showTargetError(null);
  const target = new Date(tTargetEl.value);
  const start = tStartEl.value === '' ? new Date() : new Date(tStartEl.value);
  // The tracker input has minute resolution, so both views use the same whole minute.
  start.setSeconds(0, 0);
  const total = Number(tTotalEl.value);
  if (Number.isNaN(target.getTime()) || Number.isNaN(start.getTime())) return showTargetError('Zielzeit oder Startzeit ungültig.');
  if (!Number.isFinite(total) || total <= 0 || total > MAX_TOTAL_G) {
    return showTargetError(`Menge muss zwischen 1 und ${MAX_TOTAL_G} g liegen.`);
  }
  if (target.getTime() <= start.getTime()) return showTargetError('Zielzeit muss nach der Startzeit liegen.');
  showTargetError(null);
  tStartUsed = start;

  tOptions = calcTargetOptions(target, start, total, undefined, getFlour(tFlourEl));
  if (tOptions.length === 0) {
    setTargetStatus('Keine Temperatur ergibt ein realistisches Verhältnis. Zielzeit oder Menge ändern.');
    return;
  }
  setTargetStatus(`${tOptions.length} Option${tOptions.length === 1 ? '' : 'en'} mit ${FLOUR_LABELS[getFlour(tFlourEl)]} für ${fmtDuration(tOptions[0].durationHours)} bis zum Peak (Start ${fmtTime.format(start)}).`);
  tOptions.forEach((o, i) => {
    const tr = document.createElement('tr');
    const cells = [
      `${fmtNum(o.tempC)} °C`,
      `1 : 1 : ${fmtNum(o.starterShare)}`,
      `${o.amounts.flour} g`,
      `${o.amounts.water} g`,
      `${o.amounts.starter} g`,
      fmtDuration(o.durationHours),
    ];
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Wählen';
    btn.setAttribute('aria-label', `Option ${fmtNum(o.tempC)} °C übernehmen`);
    btn.dataset.index = String(i);
    td.append(btn);
    tr.append(td);
    tBodyEl.append(tr);
  });
  tWrapEl.hidden = false;
}

tBodyEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  const o = btn ? tOptions[Number(btn.dataset.index)] : undefined;
  if (!btn || !o) return;
  setFlour(o.flour, false);
  ratioFlourEl.value = '1';
  ratioWaterEl.value = '1';
  ratioStarterEl.value = String(Number(o.starterShare.toPrecision(6)));
  tempEl.value = String(o.tempC);
  totalEl.value = tTotalEl.value;
  // The tracker starts at the chosen start time, so its peak matches the target time.
  startEl.value = toLocalInput(tStartUsed);
  store.set(tStartUsed.toISOString());
  render();
  // The tracker panel shows the result. A status in the hidden target panel would stay silent.
  selectTab('tracker');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const heading = $('h-amounts');
  heading.tabIndex = -1;
  heading.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  heading.focus({ preventScroll: true });
});

// --- Tabs ---
function selectTab(name: TabName, focus = false): void {
  for (const n of TAB_NAMES) {
    const tab = $(`tab-${n}`);
    const active = n === name;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    $(`panel-${n}`).hidden = !active;
    if (active && focus) tab.focus();
  }
}
for (const n of TAB_NAMES) {
  $(`tab-${n}`).addEventListener('click', () => selectTab(n));
  $(`tab-${n}`).addEventListener('keydown', (e) => {
    const next = nextTab(n, e.key);
    if (!next) return;
    e.preventDefault();
    selectTab(next, true);
  });
}

const tFormEl = $('target-form');
tFormEl.addEventListener('input', (e) => {
  if (e.target === tFlourEl) setFlour(getFlour(tFlourEl));
  else renderTarget();
});
tFormEl.addEventListener('submit', (e) => e.preventDefault());

render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Reload when a new worker takes over, so the page runs the new release.
  // The first claim of an uncontrolled page needs no reload. Later takeovers do.
  let hasController = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hasController) {
      hasController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => reg.update())
      .catch(() => undefined);
  });
}
