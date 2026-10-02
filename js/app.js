import {
  LOW_MIDI, HIGH_MIDI, NOTE_COUNT, SCALE_TYPES,
  buildScale, noteName, rootLabel, spell, isBlackKey, pcOf, freqToMidi, midiToFreq, statusOf,
} from './music.js';
import { YinDetector } from './pitch.js';
import { Synth } from './synth.js';
import { detectLanguage, translator } from './i18n.js';

const STORAGE_KEY = 'tumyc.settings.v1';
const MIN_ROW = 8;
const MAX_ROW = 32;
const ZOOM_STEP = 2;
const HOP_SEC = 0.025;     // seconds between pitch analyses
const GAP_SEC = 0.12;      // break the trace when voiced samples are further apart than this
const LIVE_HOLD_MS = 350;  // keep the readout briefly after the voice stops
const NOW_POS = 0.85;      // the "now" line sits at 85% of the grid width while tracking
const WIDTH_CHUNK = 256;   // grow the scrollable area in steps while recording
const SPEEDS = [50, 100, 150, 200]; // horizontal zoom presets, px per second
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const $ = (id) => document.getElementById(id);
const els = {
  start: $('start'), clear: $('clear'),
  live: $('live'), liveNote: $('live-note'), liveCents: $('live-cents'), meter: $('meter'), needle: $('meter-needle'),
  root: $('root'), type: $('type'), clearScale: $('clear-scale'),
  zoomIn: $('zoom-in'), zoomOut: $('zoom-out'), zoomFit: $('zoom-fit'),
  settings: $('settings'), tolerance: $('tolerance'), speed: $('speed'), gate: $('gate'), names: $('names'),
  langToggles: [...document.querySelectorAll('.lang-toggle')],
  themeToggles: [...document.querySelectorAll('.theme-toggle')],
  roll: $('roll'), content: $('roll-content'), ruler: $('ruler'), piano: $('piano'), grid: $('grid'),
  hint: $('hint'), toast: $('toast'), scaleInfo: $('scale-info'), legend: $('legend'),
};

const DEFAULTS = {
  theme: null, lang: null, names: null, namesAuto: true,
  root: '', type: 'minor', tolerance: 15, pxPerSec: 100, gate: 0.01,
};

const state = {
  settings: loadSettings(),
  scale: null,
  tracking: false,
  samples: [],        // { t: seconds, midi: number | null }
  resumeMarks: [],    // times at which tracking resumed after a stop
  recorded: 0,        // seconds of material on the grid
  viewStart: 0,       // time at the grid's left edge (mirrors the scroll position)
  rowHeight: 12,
  zoomMode: 'fit',
  live: null,         // { midi, nearest, cents, status }
  scrollTarget: null,
};

const theme = {};
const synth = new Synth();
let t = translator('en');
let keyEls = new Map();
let pianoSignature = '';
let sungKey = null;
let lastVoicedWall = -Infinity;
let contentWidth = 0;

// ---------- settings ----------

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { /* ignore */ }
  const s = { ...DEFAULTS, ...saved };
  if (s.theme !== 'light' && s.theme !== 'dark') {
    s.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  if (s.lang !== 'en' && s.lang !== 'es') s.lang = detectLanguage();
  if (s.names !== 'letters' && s.names !== 'solfege') {
    s.names = s.lang === 'es' ? 'solfege' : 'letters';
    s.namesAuto = true;
  }
  if (!SCALE_TYPES[s.type]) s.type = DEFAULTS.type;
  if (!SPEEDS.includes(s.pxPerSec)) s.pxPerSec = DEFAULTS.pxPerSec;
  return s;
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch { /* ignore */ }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rulerHeight = () => els.roll.querySelector('.ruler-row').offsetHeight;

// ---------- audio ----------

let audioCtx = null;
let stream = null;
let source = null;
let analyser = null;
let detector = null;
let timeBuf = null;
let resumeWall = 0;
let resumeOffset = 0;
let lastAnalysis = -Infinity;
let rafId = 0;

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  synth.attach(audioCtx);
  return audioCtx;
}

async function startTracking() {
  if (state.tracking) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    notify(t('mic.unsupported'));
    return;
  }
  els.start.disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
  } catch (err) {
    els.start.disabled = false;
    notify(err.name === 'NotAllowedError' ? t('mic.denied') : t('mic.error', { name: err.name }));
    return;
  }

  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  source = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = ctx.sampleRate > 50000 ? 8192 : 4096;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  detector = new YinDetector(ctx.sampleRate, {
    bufferSize: analyser.fftSize,
    minFreq: midiToFreq(LOW_MIDI) * 0.9,
    maxFreq: midiToFreq(HIGH_MIDI) * 1.1,
  });
  timeBuf = new Float32Array(analyser.fftSize);

  resumeOffset = state.recorded;
  resumeWall = performance.now();
  lastAnalysis = -Infinity;
  if (resumeOffset > 0) state.resumeMarks.push(resumeOffset);

  state.tracking = true;
  els.start.disabled = false;
  els.grid.classList.add('tracking');
  updateTransport();
  rafId = requestAnimationFrame(tick);
}

function stopTracking() {
  if (!state.tracking) return;
  state.tracking = false;
  cancelAnimationFrame(rafId);
  source?.disconnect();
  stream?.getTracks().forEach((track) => track.stop());
  source = analyser = stream = null;
  state.scrollTarget = null;
  els.grid.classList.remove('tracking');
  setLive(null, true);
  updateTransport();
  updateContentWidth(true);
  draw();
}

function toggleTracking() {
  if (state.tracking) stopTracking();
  else startTracking();
}

function clearGrid() {
  state.samples = [];
  state.resumeMarks = [];
  state.recorded = 0;
  state.scrollTarget = null;
  if (state.tracking) {
    resumeOffset = 0;
    resumeWall = performance.now();
    lastAnalysis = -Infinity;
  }
  updateContentWidth(true);
  els.roll.scrollLeft = 0;
  state.viewStart = 0;
  updateTransport();
  draw();
}

function tick() {
  if (!state.tracking) return;
  const now = resumeOffset + (performance.now() - resumeWall) / 1000;
  if (now - lastAnalysis >= HOP_SEC) {
    lastAnalysis = now;
    analyser.getFloatTimeDomainData(timeBuf);
    const result = detector.detect(timeBuf, state.settings.gate);
    let midi = null;
    if (result) {
      midi = freqToMidi(result.freq);
      if (midi < LOW_MIDI - 0.5 || midi > HIGH_MIDI + 0.5) midi = null;
    }
    state.samples.push({ t: now, midi });
    state.recorded = now;
    setLive(midi);
  }
  followNow();
  draw();
  rafId = requestAnimationFrame(tick);
}

// ---------- live readout ----------

function setLive(midi, force = false) {
  const now = performance.now();
  if (midi != null) {
    lastVoicedWall = now;
    const nearest = Math.round(midi);
    state.live = {
      midi,
      nearest,
      cents: (midi - nearest) * 100,
      status: statusOf(midi, state.scale, state.settings.tolerance),
    };
  } else if (force || now - lastVoicedWall > LIVE_HOLD_MS) {
    state.live = null;
  }
  renderLive();
}

function renderLive() {
  const live = state.live;
  const nearest = live ? live.nearest : null;
  if (sungKey !== nearest) {
    keyEls.get(sungKey)?.classList.remove('sung');
    keyEls.get(nearest)?.classList.add('sung');
    sungKey = nearest;
  }
  if (!live) {
    els.live.classList.remove('voiced');
    els.live.dataset.status = 'none';
    els.liveNote.textContent = '—';
    els.liveCents.textContent = '';
    return;
  }
  els.live.classList.add('voiced');
  els.live.dataset.status = live.status;
  const name = noteName(nearest, state.scale, state.settings.names);
  if (els.liveNote.textContent !== name) els.liveNote.textContent = name;
  const cents = Math.round(live.cents);
  els.liveCents.textContent = `${cents > 0 ? '+' : cents < 0 ? '−' : '±'}${Math.abs(cents)} ¢`;
  els.needle.style.left = `${50 + clamp(live.cents, -50, 50)}%`;
}

function updateTransport() {
  els.start.classList.toggle('recording', state.tracking);
  els.start.querySelector('.btn-text').textContent = state.tracking ? t('app.stop') : t('app.start');
  els.start.setAttribute('aria-pressed', String(state.tracking));
  els.hint.classList.toggle('hidden', state.tracking || state.samples.length > 0);
}

let toastTimer = 0;
function notify(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 7000);
}

// ---------- language, scale, theme and settings controls ----------

function fillSelect(select, options, value, fallback) {
  select.innerHTML = options.map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
  select.value = String(value);
  if (select.selectedIndex < 0) select.value = String(fallback);
}

function populateControls() {
  const s = state.settings;
  const toleranceNote = (c) => (c === 5 ? ` · ${t('tolerance.strict')}` : c === 15 ? ` · ${t('tolerance.default')}` : c === 30 ? ` · ${t('tolerance.relaxed')}` : '');

  fillSelect(els.root, [['', t('scale.none')], ...Array.from({ length: 12 }, (_, pc) => [pc, rootLabel(pc, s.names)])], s.root ?? '', '');
  fillSelect(els.type, Object.keys(SCALE_TYPES).map((key) => [key, t(`scale.${key}`)]), s.type, DEFAULTS.type);
  fillSelect(els.tolerance, [5, 10, 15, 20, 25, 30].map((c) => [c, `±${c} ¢${toleranceNote(c)}`]), s.tolerance, DEFAULTS.tolerance);
  const speedLabels = [t('speed.slow'), t('speed.normal'), t('speed.fast'), t('speed.faster')];
  fillSelect(els.speed, SPEEDS.map((v, i) => [v, speedLabels[i]]), s.pxPerSec, DEFAULTS.pxPerSec);
  fillSelect(els.gate, [[0.004, t('gate.high')], [0.01, t('gate.normal')], [0.025, t('gate.low')]], s.gate, DEFAULTS.gate);
  fillSelect(els.names, [['letters', t('names.letters')], ['solfege', t('names.solfege')]], s.names, 'letters');
}

function applyLanguage(lang) {
  state.settings.lang = lang;
  if (state.settings.namesAuto) state.settings.names = lang === 'es' ? 'solfege' : 'letters';
  t = translator(lang);
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const text = t(el.dataset.i18nTitle);
    el.title = text;
    el.setAttribute('aria-label', text);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));

  for (const button of els.langToggles) {
    button.textContent = lang.toUpperCase();
    button.title = t('lang.switch');
    button.setAttribute('aria-label', t('lang.switch'));
  }

  populateControls();
  saveSettings();
  applyTheme(state.settings.theme);
  applyScale();
  updateTransport();
  renderLive();
}

function scaleName(scale) {
  return t(`scale.name.${scale.typeKey}`, { root: spell(scale.rootName, state.settings.names) });
}

function applyScale() {
  const root = els.root.value;
  const type = els.type.value;
  state.settings.root = root;
  state.settings.type = type;
  saveSettings();
  state.scale = root === '' ? null : buildScale(Number(root), type);

  els.type.disabled = !state.scale;
  els.clearScale.disabled = !state.scale;
  els.legend.hidden = !state.scale;
  els.scaleInfo.textContent = state.scale
    ? t('status.scale', { scale: scaleName(state.scale), tol: state.settings.tolerance })
    : t('status.noScale');
  els.meter.style.setProperty('--tol', String(state.settings.tolerance));

  if (state.live) setLive(state.live.midi);
  buildPiano();
  draw();
}

function applyTheme(name) {
  state.settings.theme = name;
  document.documentElement.dataset.theme = name;
  const label = name === 'dark' ? t('theme.toLight') : t('theme.toDark');
  for (const button of els.themeToggles) {
    button.textContent = name === 'dark' ? '☀' : '☾';
    button.title = label;
    button.setAttribute('aria-label', label);
  }
  readTheme();
  saveSettings();
  draw();
}

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  for (const key of ['grid-bg', 'ruler-bg', 'row-line', 'octave-line', 'black-row', 'foam',
    'time-line', 'time-line-strong', 'resume', 'ink', 'now', 'good', 'meh', 'bad', 'muted', 'text']) {
    theme[key] = cs.getPropertyValue(`--${key}`).trim();
  }
}

const traceColor = (status) => (
  status === 'good' ? theme.good : status === 'meh' ? theme.meh : status === 'bad' ? theme.bad : theme.ink
);

// ---------- layout ----------

function layout() {
  const roll = els.roll;
  if (state.zoomMode === 'fit') {
    const available = roll.clientHeight - rulerHeight();
    state.rowHeight = clamp(Math.floor(available / NOTE_COUNT), MIN_ROW, MAX_ROW);
  }
  const totalHeight = NOTE_COUNT * state.rowHeight;
  const gridWidth = Math.max(1, roll.clientWidth - els.piano.offsetWidth);
  els.piano.style.height = `${totalHeight}px`;
  els.grid.style.width = `${gridWidth}px`;
  els.grid.style.height = `${totalHeight}px`;
  els.ruler.style.width = `${gridWidth}px`;
  buildPiano();
  resizeCanvases();
  updateContentWidth(!state.tracking);
  state.viewStart = roll.scrollLeft / state.settings.pxPerSec;
  draw();
}

function resizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  setCanvasSize(els.grid, els.grid.clientWidth, NOTE_COUNT * state.rowHeight, dpr);
  setCanvasSize(els.ruler, els.ruler.clientWidth, els.ruler.clientHeight, dpr);
}

function setCanvasSize(canvas, cssW, cssH, dpr) {
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
}

/** Sizes the scrollable area to the recording (plus room for the "now" line). */
function updateContentWidth(exact = false) {
  const gridWidth = els.grid.clientWidth;
  const pps = state.settings.pxPerSec;
  let recordedPx = state.recorded * pps;
  if (!exact) recordedPx = Math.ceil(recordedPx / WIDTH_CHUNK) * WIDTH_CHUNK;
  const needed = Math.max(gridWidth, recordedPx + gridWidth * (1 - NOW_POS));
  const total = Math.ceil(els.piano.offsetWidth + needed);
  if (total !== contentWidth) {
    contentWidth = total;
    els.content.style.width = `${total}px`;
  }
}

function setZoom(mode, delta = 0) {
  const roll = els.roll;
  const rulerH = rulerHeight();
  const oldTotal = NOTE_COUNT * state.rowHeight;
  const centreFraction = (roll.scrollTop + roll.clientHeight / 2 - rulerH) / oldTotal;
  state.zoomMode = mode;
  if (mode === 'manual') state.rowHeight = clamp(state.rowHeight + delta, MIN_ROW, MAX_ROW);
  layout();
  roll.scrollTop = centreFraction * NOTE_COUNT * state.rowHeight - roll.clientHeight / 2 + rulerH;
}

// ---------- piano ----------

function buildPiano() {
  const rh = state.rowHeight;
  const { names, lang } = state.settings;
  const signature = `${rh}|${state.scale ? state.scale.key : ''}|${names}|${lang}`;
  if (signature === pianoSignature) return;
  pianoSignature = signature;

  const piano = els.piano;
  piano.innerHTML = '';
  const fragment = document.createDocumentFragment();
  const whites = [];
  const blacks = [];
  keyEls = new Map();

  for (let midi = LOW_MIDI; midi <= HIGH_MIDI; midi++) {
    const row = HIGH_MIDI - midi;
    const name = noteName(midi, state.scale, names);
    const key = document.createElement('button');
    key.type = 'button';
    key.dataset.midi = String(midi);
    key.title = `${name} · ${midiToFreq(midi).toFixed(1)} Hz`;
    key.setAttribute('aria-label', t('piano.play', { note: name }));

    if (isBlackKey(midi)) {
      key.className = 'key black';
      key.style.top = `${row * rh}px`;
      key.style.height = `${rh}px`;
      blacks.push(key);
    } else {
      key.className = 'key white';
      // Piano-roll geometry: white keys reach to the middle of neighbouring black keys.
      let top = row * rh;
      let bottom = (row + 1) * rh;
      if (midi + 1 <= HIGH_MIDI && isBlackKey(midi + 1)) top -= rh / 2;
      if (midi - 1 >= LOW_MIDI && isBlackKey(midi - 1)) bottom += rh / 2;
      key.style.top = `${top}px`;
      key.style.height = `${bottom - top}px`;
      const isC = pcOf(midi) === 0;
      if (isC || rh >= 14) {
        const label = document.createElement('span');
        label.className = isC ? 'label octave' : 'label';
        label.textContent = name;
        key.appendChild(label);
      }
      whites.push(key);
    }
    keyEls.set(midi, key);
  }

  whites.forEach((k) => fragment.appendChild(k));
  blacks.forEach((k) => fragment.appendChild(k));
  piano.appendChild(fragment);
  keyEls.get(sungKey)?.classList.add('sung');
}

const activeVoices = new Map(); // pointerId -> { el, voice }

function pressKey(pointerId, el) {
  releaseKey(pointerId);
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const voice = synth.play(midiToFreq(Number(el.dataset.midi)));
  el.classList.add('pressed');
  activeVoices.set(pointerId, { el, voice });
}

function releaseKey(pointerId) {
  const active = activeVoices.get(pointerId);
  if (!active) return;
  active.voice.release();
  active.el.classList.remove('pressed');
  activeVoices.delete(pointerId);
}

// ---------- view ----------

function followNow() {
  const roll = els.roll;
  const pps = state.settings.pxPerSec;
  updateContentWidth(false);
  roll.scrollLeft = Math.max(0, state.recorded * pps - els.grid.clientWidth * NOW_POS);
  state.viewStart = roll.scrollLeft / pps;

  if (state.live) {
    const rulerH = rulerHeight();
    const y = rulerH + (HIGH_MIDI - state.live.midi + 0.5) * state.rowHeight;
    const margin = Math.min(72, roll.clientHeight * 0.15);
    const top = roll.scrollTop + rulerH + margin;
    const bottom = roll.scrollTop + roll.clientHeight - margin;
    if (y < top || y > bottom) state.scrollTarget = y - roll.clientHeight / 2;
  }
  if (state.scrollTarget != null) {
    const target = clamp(state.scrollTarget, 0, roll.scrollHeight - roll.clientHeight);
    const next = roll.scrollTop + (target - roll.scrollTop) * 0.18;
    if (Math.abs(target - next) < 1) {
      roll.scrollTop = target;
      state.scrollTarget = null;
    } else {
      roll.scrollTop = next;
    }
  }
}

function lowerBound(samples, time) {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const labelStep = (pps) => (pps >= 60 ? 1 : pps >= 30 ? 2 : 5);

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// ---------- drawing ----------

function draw() {
  drawGrid();
  drawRuler();
}

function drawGrid() {
  const canvas = els.grid;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = NOTE_COUNT * state.rowHeight;
  const rh = state.rowHeight;
  const { scale } = state;
  const pps = state.settings.pxPerSec;
  const vs = state.viewStart;
  const visibleSec = w / pps;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme['grid-bg'];
  ctx.fillRect(0, 0, w, h);

  // Row backgrounds.
  for (let row = 0; row < NOTE_COUNT; row++) {
    const midi = HIGH_MIDI - row;
    if (scale) {
      if (scale.pcs.has(pcOf(midi))) {
        ctx.fillStyle = theme.foam;
        ctx.fillRect(0, row * rh, w, rh);
      }
    } else if (isBlackKey(midi)) {
      ctx.fillStyle = theme['black-row'];
      ctx.fillRect(0, row * rh, w, rh);
    }
  }

  // Row separators; the B/C boundary marks each octave.
  const rowLines = new Path2D();
  const octaveLines = new Path2D();
  for (let row = 1; row < NOTE_COUNT; row++) {
    const midiBelow = HIGH_MIDI - row;
    const y = row * rh + 0.5;
    const path = pcOf(midiBelow) === 11 ? octaveLines : rowLines;
    path.moveTo(0, y);
    path.lineTo(w, y);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme['row-line'];
  ctx.stroke(rowLines);
  ctx.strokeStyle = theme['octave-line'];
  ctx.stroke(octaveLines);

  // Time grid.
  const step = labelStep(pps);
  const timeLines = new Path2D();
  const strongLines = new Path2D();
  for (let k = Math.ceil(vs / step); k * step <= vs + visibleSec; k++) {
    const seconds = k * step;
    const x = Math.round((seconds - vs) * pps) + 0.5;
    const path = seconds % (step * 5) === 0 ? strongLines : timeLines;
    path.moveTo(x, 0);
    path.lineTo(x, h);
  }
  ctx.strokeStyle = theme['time-line'];
  ctx.stroke(timeLines);
  ctx.strokeStyle = theme['time-line-strong'];
  ctx.stroke(strongLines);

  // Resume markers.
  if (state.resumeMarks.length) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = theme.resume;
    ctx.beginPath();
    for (const time of state.resumeMarks) {
      const x = Math.round((time - vs) * pps) + 0.5;
      if (x < -1 || x > w + 1) continue;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
    ctx.restore();
  }

  // The pitch trace, batched by colour.
  const paths = { plain: new Path2D(), good: new Path2D(), meh: new Path2D(), bad: new Path2D() };
  const yOf = (midi) => (HIGH_MIDI - midi + 0.5) * rh;
  const xOf = (time) => (time - vs) * pps;
  const { samples } = state;
  const tolerance = state.settings.tolerance;
  const tMax = vs + visibleSec + 1;
  let i = lowerBound(samples, vs - 1);
  if (i > 0) i--;
  for (; i < samples.length - 1 && samples[i].t <= tMax; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (a.midi == null || b.midi == null || b.t - a.t > GAP_SEC) continue;
    const path = paths[statusOf((a.midi + b.midi) / 2, scale, tolerance)];
    path.moveTo(xOf(a.t), yOf(a.midi));
    path.lineTo(xOf(b.t), yOf(b.midi));
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, rh * 0.5);
  for (const status of ['bad', 'meh', 'good', 'plain']) {
    ctx.strokeStyle = traceColor(status);
    ctx.stroke(paths[status]);
  }

  // "Now" line and the live pitch dot.
  if (state.tracking || samples.length) {
    const nx = Math.round(xOf(state.recorded)) + 0.5;
    ctx.save();
    ctx.globalAlpha = state.tracking ? 1 : 0.5;
    ctx.strokeStyle = theme.now;
    ctx.lineWidth = state.tracking ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(nx, 0);
    ctx.lineTo(nx, h);
    ctx.stroke();
    ctx.restore();
    if (state.tracking && state.live) {
      ctx.fillStyle = traceColor(state.live.status);
      ctx.beginPath();
      ctx.arc(nx, yOf(state.live.midi), Math.max(3.5, rh * 0.42), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRuler() {
  const canvas = els.ruler;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pps = state.settings.pxPerSec;
  const vs = state.viewStart;
  const visibleSec = w / pps;
  const step = labelStep(pps);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme['ruler-bg'];
  ctx.fillRect(0, 0, w, h);
  ctx.font = `11px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;

  for (let k = Math.ceil(vs / step); k * step <= vs + visibleSec; k++) {
    const seconds = k * step;
    const x = Math.round((seconds - vs) * pps) + 0.5;
    const strong = seconds % (step * 5) === 0;
    ctx.strokeStyle = strong ? theme['time-line-strong'] : theme['time-line'];
    ctx.beginPath();
    ctx.moveTo(x, strong ? h - 10 : h - 6);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.fillText(formatTime(seconds), x + 4, h / 2 - 1);
  }

  if (state.tracking || state.samples.length) {
    const nx = (state.recorded - vs) * pps;
    if (nx >= -6 && nx <= w + 6) {
      ctx.fillStyle = theme.now;
      ctx.beginPath();
      ctx.moveTo(nx - 5, h - 9);
      ctx.lineTo(nx + 5, h - 9);
      ctx.lineTo(nx, h - 1);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ---------- events ----------

function capturePointer(el, pointerId) {
  try { el.setPointerCapture(pointerId); } catch { /* pointer already gone */ }
}

function wireEvents() {
  els.start.addEventListener('click', () => { toggleTracking(); els.start.blur(); });
  els.clear.addEventListener('click', () => { clearGrid(); els.clear.blur(); });

  els.root.addEventListener('change', applyScale);
  els.type.addEventListener('change', applyScale);
  els.clearScale.addEventListener('click', () => { els.root.value = ''; applyScale(); });

  els.zoomIn.addEventListener('click', () => setZoom('manual', ZOOM_STEP));
  els.zoomOut.addEventListener('click', () => setZoom('manual', -ZOOM_STEP));
  els.zoomFit.addEventListener('click', () => setZoom('fit'));

  for (const button of els.themeToggles) {
    button.addEventListener('click', () => applyTheme(state.settings.theme === 'dark' ? 'light' : 'dark'));
  }
  for (const button of els.langToggles) {
    button.addEventListener('click', () => applyLanguage(state.settings.lang === 'es' ? 'en' : 'es'));
  }

  els.tolerance.addEventListener('change', () => {
    state.settings.tolerance = Number(els.tolerance.value);
    saveSettings();
    applyScale();
  });
  els.speed.addEventListener('change', () => {
    const time = state.viewStart;
    state.settings.pxPerSec = Number(els.speed.value);
    saveSettings();
    updateContentWidth(!state.tracking);
    els.roll.scrollLeft = time * state.settings.pxPerSec; // keep the same moment in view
    state.viewStart = els.roll.scrollLeft / state.settings.pxPerSec;
    draw();
  });
  els.gate.addEventListener('change', () => {
    state.settings.gate = Number(els.gate.value);
    saveSettings();
  });
  els.names.addEventListener('change', () => {
    state.settings.names = els.names.value;
    state.settings.namesAuto = false;
    saveSettings();
    populateControls();
    applyScale();
    renderLive();
  });

  document.addEventListener('click', (e) => {
    if (els.settings.open && !els.settings.contains(e.target)) els.settings.open = false;
  });

  // Native scrolling drives the time window; the canvas only ever covers the viewport.
  els.roll.addEventListener('scroll', () => {
    const viewStart = els.roll.scrollLeft / state.settings.pxPerSec;
    if (viewStart !== state.viewStart) {
      state.viewStart = viewStart;
      draw();
    }
  }, { passive: true });

  // Piano keys: press to sound, slide across keys, release to fade out.
  els.piano.addEventListener('pointerdown', (e) => {
    const key = e.target.closest('.key');
    if (!key) return;
    e.preventDefault();
    capturePointer(els.piano, e.pointerId);
    pressKey(e.pointerId, key);
  });
  els.piano.addEventListener('pointermove', (e) => {
    const active = activeVoices.get(e.pointerId);
    if (!active) return;
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.key');
    if (under && under !== active.el) pressKey(e.pointerId, under);
    else if (!under) releaseKey(e.pointerId);
  });
  els.piano.addEventListener('pointerup', (e) => releaseKey(e.pointerId));
  els.piano.addEventListener('pointercancel', (e) => releaseKey(e.pointerId));
  els.piano.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const key = e.target.closest('.key');
    if (!key) return;
    e.preventDefault();
    pressKey('keyboard', key);
    setTimeout(() => releaseKey('keyboard'), 700);
  });

  // Mouse users can also drag the grid to pan; touch scrolls natively.
  let drag = null;
  els.grid.addEventListener('pointerdown', (e) => {
    if (state.tracking || e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, left: els.roll.scrollLeft, top: els.roll.scrollTop };
    capturePointer(els.grid, e.pointerId);
    els.grid.classList.add('dragging');
  });
  els.grid.addEventListener('pointermove', (e) => {
    if (!drag) return;
    els.roll.scrollLeft = drag.left - (e.clientX - drag.x);
    els.roll.scrollTop = drag.top - (e.clientY - drag.y);
  });
  const endDrag = () => { drag = null; els.grid.classList.remove('dragging'); };
  els.grid.addEventListener('pointerup', endDrag);
  els.grid.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    const target = e.target;
    if (target instanceof HTMLElement
      && (target.tagName === 'SELECT' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    toggleTracking();
  });

  new ResizeObserver(() => layout()).observe(els.roll);
}

// ---------- init ----------

function init() {
  applyLanguage(state.settings.lang);
  wireEvents();
  layout();
}

init();
