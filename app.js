/* ===================== Thunder Mind Map — app.js ===================== */

const MAX_SAVED = 50;
const DAILY_LIMIT = 3;
const WEEKLY_LIMIT = 12;
const MAX_PDF_PAGES = 15;
const MAX_TEXT_CHARS = 9000;
const API_ENDPOINT = '/api/generate';

/* ---------- PURE RENDERER FUNCTIONS ----------
   These six functions are self-contained (no outer closures) so their
   .toString() source can be embedded verbatim into exported HTML files.
   Do not reference any variable from outside their own parameters. */

function polarPoint(cx, cy, r, angle) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function truncateLabel(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
}

function svgEl(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function buildMindMapLayout(data) {
  var palette = ['#573AFC', '#2F9E6B', '#2F8FE0', '#E0922F', '#D6487B', '#4FB3B3', '#8B5CF6', '#EF6C53'];
  var branches = (data && data.branches) || [];
  var n = Math.max(branches.length, 1);
  var nodes = [];
  var edges = [];
  var rootW = Math.min(260, Math.max(120, (data.title || '').length * 9 + 40));
  nodes.push({ x: 0, y: 0, w: rootW, h: 56, label: truncateLabel(data.title || 'Mind Map', 26), depth: 0, color: '#573AFC', isRoot: true });

  var R1 = 210, R2 = 400, R3 = 580;
  var maxRUsed = R1;

  branches.forEach(function (branch, bi) {
    var angle = (bi / n) * Math.PI * 2 - Math.PI / 2;
    var color = palette[bi % palette.length];
    var p1 = polarPoint(0, 0, R1, angle);
    var bW = Math.min(170, Math.max(90, (branch.label || '').length * 7 + 24));
    nodes.push({ x: p1.x, y: p1.y, w: bW, h: 40, label: truncateLabel(branch.label || '', 22), depth: 1, color: color });
    edges.push({ x1: 0, y1: 0, x2: p1.x, y2: p1.y, color: color });

    var children = branch.children || [];
    var cCount = children.length;
    if (cCount > 0) {
      var spread = Math.min((Math.PI * 2 / n) * 0.85, 0.95);
      children.forEach(function (child, ci) {
        var cAngle = angle + (ci - (cCount - 1) / 2) * (spread / Math.max(cCount, 1));
        var p2 = polarPoint(0, 0, R2, cAngle);
        var cW = Math.min(160, Math.max(80, (child.label || '').length * 6.5 + 22));
        nodes.push({ x: p2.x, y: p2.y, w: cW, h: 36, label: truncateLabel(child.label || '', 20), depth: 2, color: color });
        edges.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, color: color });
        maxRUsed = Math.max(maxRUsed, R2);

        var grand = child.children || [];
        var gCount = grand.length;
        if (gCount > 0) {
          var gSpread = Math.min(spread / Math.max(cCount, 1), 0.5);
          grand.forEach(function (leaf, gi) {
            var gAngle = cAngle + (gi - (gCount - 1) / 2) * (gSpread / Math.max(gCount, 1));
            var p3 = polarPoint(0, 0, R3, gAngle);
            var gW = Math.min(150, Math.max(70, (leaf.label || '').length * 6 + 20));
            nodes.push({ x: p3.x, y: p3.y, w: gW, h: 32, label: truncateLabel(leaf.label || '', 18), depth: 3, color: color });
            edges.push({ x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y, color: color });
            maxRUsed = Math.max(maxRUsed, R3);
          });
        }
      });
    }
  });

  return { nodes: nodes, edges: edges, half: maxRUsed + 160 };
}

function drawMindMap(svg, g, data) {
  while (g.firstChild) g.removeChild(g.firstChild);
  var layout = buildMindMapLayout(data);

  layout.edges.forEach(function (e) {
    var mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
    var dx = e.y2 - e.y1, dy = -(e.x2 - e.x1);
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var off = 18;
    var cx = mx + (dx / len) * off, cy = my + (dy / len) * off;
    var path = svgEl('path');
    path.setAttribute('d', 'M' + e.x1 + ',' + e.y1 + ' Q' + cx + ',' + cy + ' ' + e.x2 + ',' + e.y2);
    path.setAttribute('class', 'edge-path');
    path.setAttribute('stroke', e.color);
    g.appendChild(path);
  });

  layout.nodes.forEach(function (n) {
    var grp = svgEl('g');
    var rect = svgEl('rect');
    rect.setAttribute('x', n.x - n.w / 2);
    rect.setAttribute('y', n.y - n.h / 2);
    rect.setAttribute('width', n.w);
    rect.setAttribute('height', n.h);
    rect.setAttribute('rx', n.isRoot ? 16 : 12);
    rect.setAttribute('class', 'node-rect');
    rect.setAttribute('stroke', n.color);
    rect.setAttribute('fill', n.isRoot ? n.color : '#ffffff');
    grp.appendChild(rect);

    var text = svgEl('text');
    text.setAttribute('x', n.x);
    text.setAttribute('y', n.y + 5);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', n.isRoot ? 15 : (n.depth === 1 ? 13 : 11.5));
    text.setAttribute('class', 'node-text' + (n.isRoot ? ' root' : ''));
    if (!n.isRoot) text.setAttribute('fill', n.depth === 1 ? n.color : '#3c3c3c');
    text.textContent = n.label;
    grp.appendChild(text);

    var title = svgEl('title');
    title.textContent = n.label;
    grp.appendChild(title);

    g.appendChild(grp);
  });

  var half = layout.half;
  var vb = (-half) + ' ' + (-half) + ' ' + (half * 2) + ' ' + (half * 2);
  svg.setAttribute('viewBox', vb);
  svg._initialVB = vb;
  svg._vb = { x: -half, y: -half, w: half * 2, h: half * 2 };
}

function setupPanZoom(svg) {
  if (svg._panZoomReady) return;
  svg._panZoomReady = true;
  var dragging = false, lastX = 0, lastY = 0;

  function getVB() {
    var parts = svg.getAttribute('viewBox').split(' ').map(Number);
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }
  function setVB(vb) {
    svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
  }
  function pointerDown(e) {
    dragging = true;
    var p = e.touches ? e.touches[0] : e;
    lastX = p.clientX; lastY = p.clientY;
  }
  function pointerMove(e) {
    if (!dragging) return;
    var p = e.touches ? e.touches[0] : e;
    var rect = svg.getBoundingClientRect();
    var vb = getVB();
    var dx = (p.clientX - lastX) * (vb.w / rect.width);
    var dy = (p.clientY - lastY) * (vb.h / rect.height);
    vb.x -= dx; vb.y -= dy;
    setVB(vb);
    lastX = p.clientX; lastY = p.clientY;
    e.preventDefault();
  }
  function pointerUp() { dragging = false; }

  svg.addEventListener('mousedown', pointerDown);
  svg.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerUp);
  svg.addEventListener('touchstart', pointerDown, { passive: true });
  svg.addEventListener('touchmove', pointerMove, { passive: false });
  svg.addEventListener('touchend', pointerUp);
  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    var vb = getVB();
    var factor = e.deltaY > 0 ? 1.1 : 0.9;
    var cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    var nw = vb.w * factor, nh = vb.h * factor;
    setVB({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
  }, { passive: false });
}

function zoomBy(svg, factor) {
  var parts = svg.getAttribute('viewBox').split(' ').map(Number);
  var cx = parts[0] + parts[2] / 2, cy = parts[1] + parts[3] / 2;
  var nw = parts[2] / factor, nh = parts[3] / factor;
  svg.setAttribute('viewBox', (cx - nw / 2) + ' ' + (cy - nh / 2) + ' ' + nw + ' ' + nh);
}

function zoomResetSvg(svg) {
  if (svg._initialVB) svg.setAttribute('viewBox', svg._initialVB);
}

function verifyBrandLock() {
  var el = document.getElementById('ts-brand-lock');
  if (!el) return false;
  var links = el.querySelectorAll('a');
  if (links.length < 2) return false;
  var hrefs = Array.prototype.map.call(links, function (a) { return a.getAttribute('href') || ''; });
  var hasThunder = hrefs.some(function (h) { return h.indexOf('thunderstudy') !== -1; });
  var hasWonder = hrefs.some(function (h) { return h.indexOf('wondermayank') !== -1; });
  var txt = el.textContent || '';
  var hasText = txt.indexOf('ThunderStudy') !== -1 && txt.indexOf('Wondermayank') !== -1;
  return hasThunder && hasWonder && hasText;
}

/* ---------- end pure renderer functions ---------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- theme ---------- */
(function initTheme() {
  const saved = localStorage.getItem('tmm_theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
})();
window.addEventListener('DOMContentLoaded', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  $('#themeIconSun').innerHTML = isDark
    ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" stroke="none"/>'
    : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
});
$('#themeToggle').addEventListener('click', () => {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  if (next === 'dark') html.setAttribute('data-theme', 'dark'); else html.removeAttribute('data-theme');
  localStorage.setItem('tmm_theme', next);
  $('#themeIconSun').innerHTML = next === 'dark'
    ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" stroke="none"/>'
    : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
});

/* ---------- loader ---------- */
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => $('#loader').classList.add('hide'), 350);
});
setTimeout(() => { const l = $('#loader'); if (l) l.classList.add('hide'); }, 1500);

/* ---------- tabs ---------- */
$$('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('.tab-btn').forEach(b => b.classList.remove('active'));
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  $('#panel-' + btn.dataset.tab).classList.add('active');
  if (btn.dataset.tab === 'mymaps') renderSavedList();
}));

/* ---------- credits ---------- */
function todayStr() { return new Date().toISOString().slice(0, 10); }

function loadCredits() {
  let c;
  try { c = JSON.parse(localStorage.getItem('tmm_credits')); } catch (e) { c = null; }
  const now = Date.now();
  if (!c) c = { dailyUsed: 0, dailyDate: todayStr(), weeklyUsed: 0, weekStart: now };
  if (c.dailyDate !== todayStr()) { c.dailyUsed = 0; c.dailyDate = todayStr(); }
  if (now - c.weekStart > 7 * 24 * 60 * 60 * 1000) { c.weeklyUsed = 0; c.weekStart = now; }
  localStorage.setItem('tmm_credits', JSON.stringify(c));
  return c;
}
function consumeCredit() {
  const c = loadCredits();
  c.dailyUsed += 1; c.weeklyUsed += 1;
  localStorage.setItem('tmm_credits', JSON.stringify(c));
  renderCredits();
}
function canGenerate() {
  const c = loadCredits();
  return c.dailyUsed < DAILY_LIMIT && c.weeklyUsed < WEEKLY_LIMIT;
}
function renderCredits() {
  const c = loadCredits();
  const dLeft = Math.max(DAILY_LIMIT - c.dailyUsed, 0);
  const wLeft = Math.max(WEEKLY_LIMIT - c.weeklyUsed, 0);
  $('#dailyLabel').textContent = `${dLeft} / ${DAILY_LIMIT}`;
  $('#weeklyLabel').textContent = `${wLeft} / ${WEEKLY_LIMIT}`;
  $('#dailyBar').style.width = (dLeft / DAILY_LIMIT * 100) + '%';
  $('#weeklyBar').style.width = (wLeft / WEEKLY_LIMIT * 100) + '%';
  $('#creditPillText').textContent = `${dLeft} left today`;
  const hoursLeft = Math.ceil((new Date().setHours(24, 0, 0, 0) - Date.now()) / 3600000);
  const daysLeft = Math.ceil((c.weekStart + 7 * 24 * 60 * 60 * 1000 - Date.now()) / 86400000);
  $('#creditResetHint').textContent = `Daily credits reset in ~${hoursLeft}h. Weekly credits reset in ~${daysLeft}d.`;
  const genBtn = $('#generateBtn');
  if (dLeft === 0 || wLeft === 0) {
    genBtn.disabled = true;
    genBtn.lastChild.textContent = ' No credits left — try again later';
  } else {
    genBtn.disabled = false;
    genBtn.lastChild.textContent = ' Generate Mind Map';
  }
}
renderCredits();

/* ---------- mode chips ---------- */
let activeMode = 'topic';
$$('.mode-chip').forEach(chip => chip.addEventListener('click', () => {
  $$('.mode-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  activeMode = chip.dataset.mode;
  $('#mode-topic').style.display = activeMode === 'topic' ? 'block' : 'none';
  $('#mode-text').style.display = activeMode === 'text' ? 'block' : 'none';
  $('#mode-pdf').style.display = activeMode === 'pdf' ? 'block' : 'none';
}));

$('#textInput').addEventListener('input', (e) => {
  const len = e.target.value.length;
  $('#textCharHint').textContent = `${len} / ${MAX_TEXT_CHARS} characters`;
  $('#textCharHint').classList.toggle('warn', len > MAX_TEXT_CHARS);
});
$('#maxPagesLabel').textContent = MAX_PDF_PAGES;

/* ---------- PDF handling ---------- */
let pdfDoc = null;
let pdfExtractedText = '';
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';
}
$('#pdfDrop').addEventListener('click', () => $('#pdfFile').click());
$('#pdfFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('#pdfStatus').textContent = 'Reading PDF...';
  try {
    const buf = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    $('#pdfStatus').textContent = `${file.name} — ${pdfDoc.numPages} pages detected`;
    $('#pdfPageRange').style.display = 'flex';
    $('#pdfFrom').value = 1;
    $('#pdfFrom').max = pdfDoc.numPages;
    $('#pdfTo').value = Math.min(pdfDoc.numPages, MAX_PDF_PAGES);
    $('#pdfTo').max = pdfDoc.numPages;
    updatePdfHint();
  } catch (err) {
    $('#pdfStatus').textContent = 'Could not read this PDF. Try another file.';
  }
});
function updatePdfHint() {
  if (!pdfDoc) return;
  const from = parseInt($('#pdfFrom').value) || 1;
  const to = parseInt($('#pdfTo').value) || from;
  const span = to - from + 1;
  if (span > MAX_PDF_PAGES) {
    $('#pdfCharHint').textContent = `Selected ${span} pages — only the first ${MAX_PDF_PAGES} pages in range will be used to keep generation fast.`;
    $('#pdfCharHint').classList.add('warn');
  } else {
    $('#pdfCharHint').textContent = `Will read ${Math.max(span, 0)} page(s).`;
    $('#pdfCharHint').classList.remove('warn');
  }
}
$('#pdfFrom').addEventListener('input', updatePdfHint);
$('#pdfTo').addEventListener('input', updatePdfHint);

async function extractPdfRange() {
  const from = Math.max(parseInt($('#pdfFrom').value) || 1, 1);
  let to = parseInt($('#pdfTo').value) || from;
  to = Math.min(to, from + MAX_PDF_PAGES - 1, pdfDoc.numPages);
  let text = '';
  for (let p = from; p <= to; p++) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map(i => i.str).join(' ') + '\n';
    if (text.length > MAX_TEXT_CHARS) break;
  }
  return text.slice(0, MAX_TEXT_CHARS);
}

/* ---------- generate ---------- */
let currentMapData = null;
let currentMapMeta = null;

$('#generateBtn').addEventListener('click', async () => {
  if (!canGenerate()) { toast('No credits left — check the reset timer above.'); return; }

  let payloadMode, input, subjectTag = 'custom';
  if (activeMode === 'topic') {
    input = $('#topicInput').value.trim();
    payloadMode = 'topic';
    if (!input) { toast('Enter a topic first.'); return; }
  } else if (activeMode === 'text') {
    input = $('#textInput').value.trim().slice(0, MAX_TEXT_CHARS);
    payloadMode = 'content';
    if (!input) { toast('Paste some text first.'); return; }
  } else {
    if (!pdfDoc) { toast('Upload a PDF first.'); return; }
    $('#pdfStatus').textContent = 'Extracting selected pages...';
    input = await extractPdfRange();
    payloadMode = 'content';
    if (!input.trim()) { toast('Could not extract text from that page range.'); return; }
  }

  const btn = $('#generateBtn');
  const originalLabel = btn.lastChild.textContent;
  btn.disabled = true;
  btn.lastChild.textContent = ' Generating...';

  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: payloadMode, input: input })
    });
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    if (!data || !data.title || !Array.isArray(data.branches)) throw new Error('Bad response shape');

    currentMapData = data;
    currentMapMeta = { id: 'm_' + Date.now(), title: data.title, subject: subjectTag, source: 'ai', createdAt: Date.now() };
    showViewer(data, currentMapMeta.title);
    consumeCredit();
  } catch (err) {
    toast('Generation failed. Please try again in a moment.');
  } finally {
    btn.disabled = !canGenerate();
    btn.lastChild.textContent = originalLabel;
  }
});

function showViewer(data, title) {
  $('#viewer-wrap').classList.add('active');
  $('#viewerTitle').textContent = title || 'Mind Map';
  const svg = $('#map-svg');
  const g = $('#map-g');
  drawMindMap(svg, g, data);
  setupPanZoom(svg);
  $('#viewer-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#zoomIn').addEventListener('click', () => zoomBy($('#map-svg'), 1.25));
$('#zoomOut').addEventListener('click', () => zoomBy($('#map-svg'), 0.8));
$('#zoomReset').addEventListener('click', () => zoomResetSvg($('#map-svg')));

/* ---------- save / my maps ---------- */
function loadSaved() {
  try { return JSON.parse(localStorage.getItem('tmm_saved')) || []; } catch (e) { return []; }
}
function writeSaved(list) { localStorage.setItem('tmm_saved', JSON.stringify(list)); }

$('#saveMapBtn').addEventListener('click', () => {
  if (!currentMapData) return;
  let list = loadSaved();
  if (list.find(m => m.title === currentMapMeta.title && m.savedNow)) { /* no-op guard */ }
  if (list.length >= MAX_SAVED) {
    list.shift();
    toast('Saved 50 reached — oldest map removed to make room.');
  }
  list.push({ id: currentMapMeta.id, title: currentMapMeta.title, data: currentMapData, source: currentMapMeta.source, createdAt: Date.now() });
  writeSaved(list);
  toast('Saved to My Maps.');
}, );

function renderSavedList(filter = '') {
  const list = loadSaved().slice().reverse();
  const wrap = $('#savedList');
  $('#savedCountHint').textContent = `${loadSaved().length} / ${MAX_SAVED} saved`;
  wrap.innerHTML = '';
  const filtered = list.filter(m => m.title.toLowerCase().includes(filter.toLowerCase()));
  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 9h.01M8 14s1.5 2 4 2 4-2 4-2"/></svg>
      <p>No saved mind maps yet. Generate or open a preset, then tap Save.</p></div>`;
    return;
  }
  filtered.forEach(m => {
    const row = document.createElement('div');
    row.className = 'saved-row';
    row.innerHTML = `
      <span class="dot" style="background:${m.source === 'preset' ? '#2F9E6B' : '#573AFC'}"></span>
      <div class="meta"><strong>${escapeHtml(m.title)}</strong><span>${m.source === 'preset' ? 'Preset' : 'AI generated'} · ${new Date(m.createdAt).toLocaleDateString()}</span></div>
      <div class="row-actions">
        <button class="openBtn" aria-label="Open"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button>
        <button class="delBtn" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg></button>
      </div>`;
    row.querySelector('.openBtn').addEventListener('click', () => {
      currentMapData = m.data;
      currentMapMeta = { id: m.id, title: m.title, source: m.source, createdAt: m.createdAt };
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="create"]').classList.add('active');
      $('#panel-create').classList.add('active');
      showViewer(m.data, m.title);
    });
    row.querySelector('.delBtn').addEventListener('click', () => {
      const all = loadSaved().filter(x => x.id !== m.id);
      writeSaved(all);
      renderSavedList($('#mapSearch').value);
    });
    wrap.appendChild(row);
  });
}
$('#mapSearch').addEventListener('input', (e) => renderSavedList(e.target.value));

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- presets ---------- */
const presetIconColors = ['#573AFC', '#2F9E6B', '#2F8FE0', '#E0922F', '#D6487B'];
async function loadPresets() {
  try {
    const res = await fetch('/presets/index.json');
    const list = await res.json();
    const grid = $('#presetGrid');
    grid.innerHTML = '';
    list.forEach((p, i) => {
      const color = presetIconColors[i % presetIconColors.length];
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.innerHTML = `
        <div class="preset-icon" style="background:${color}22;">
          <svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M12 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>
        </div>
        <h3 style="font-size:16px;">${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.description)}</p>
        <button class="text-link">Open Preset <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><path d="M9 18l6-6-6-6"/></svg></button>`;
      card.querySelector('.text-link').addEventListener('click', async () => {
        const r = await fetch('/presets/' + p.file);
        const data = await r.json();
        currentMapData = data;
        currentMapMeta = { id: 'p_' + p.file, title: data.title, source: 'preset', createdAt: Date.now() };
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        $$('.tab-panel').forEach(pn => pn.classList.remove('active'));
        document.querySelector('[data-tab="create"]').classList.add('active');
        $('#panel-create').classList.add('active');
        showViewer(data, data.title);
        toast('Preset loaded — no credits used.');
      });
      grid.appendChild(card);
    });
  } catch (e) {
    $('#presetGrid').innerHTML = '<p class="hint">Presets could not be loaded.</p>';
  }
}
loadPresets();

/* ---------- download: HTML (with brand lock) ---------- */
$('#downloadHtmlBtn').addEventListener('click', () => {
  if (!currentMapData) return;
  const rendererSrc = [polarPoint, truncateLabel, svgEl, buildMindMapLayout, drawMindMap, setupPanZoom, zoomBy, zoomResetSvg, verifyBrandLock]
    .map(f => f.toString()).join('\n\n');
  const dataJson = JSON.stringify(currentMapData).replace(/</g, '\\u003c');
  const title = escapeHtml(currentMapData.title || 'Mind Map');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Thunder Mind Map</title>
<style>
  *{box-sizing:border-box;} body{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:#fff;color:#1d1d1f;}
  #ts-brand-lock{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;background:#F5F5FF;border-bottom:1px solid #e6e6e6;padding:14px 16px;font-size:13px;color:#3c3c3c;text-align:center;}
  #ts-brand-lock a{color:#573AFC;font-weight:700;text-decoration:none;}
  main{padding:16px;}
  h1{font-size:18px;text-align:center;margin:14px 0;}
  #map-canvas-wrap{border:1px solid #e6e6e6;border-radius:18px;background:#f7f7f7;overflow:hidden;height:560px;max-width:1000px;margin:0 auto;}
  #map-svg{width:100%;height:100%;cursor:grab;}
  .node-rect{fill:#fff;stroke-width:1.5px;} .node-text{font-weight:700;fill:#1d1d1f;} .node-text.root{fill:#fff;}
  .edge-path{fill:none;stroke-width:2px;opacity:.55;}
  .zoom-row{display:flex;justify-content:center;gap:8px;margin:14px 0 30px;}
  .zoom-row button{width:40px;height:40px;border-radius:9999px;border:1px solid #ccc;background:#fff;}
  #lock-fallback{display:none;text-align:center;padding:80px 20px;color:#6b6b6b;}
</style>
</head>
<body>
<div id="ts-brand-lock">
  Created by <a href="https://thunderstudy.indevs.in" target="_blank" rel="noopener">ThunderStudy</a> | <a href="https://wondermayank.indevs.in" target="_blank" rel="noopener">Wondermayank</a> &middot; Generate your own at <a href="https://mindmap.thunderstudy.indevs.in" target="_blank" rel="noopener">mindmap.thunderstudy.indevs.in</a>
</div>
<main>
  <h1>${title}</h1>
  <div id="map-canvas-wrap"><svg id="map-svg"><g id="map-g"></g></svg></div>
  <div class="zoom-row">
    <button id="zoomOut">&minus;</button>
    <button id="zoomReset">&#9679;</button>
    <button id="zoomIn">+</button>
  </div>
  <div id="lock-fallback"><p>This mind map file appears to have been modified and can no longer be displayed.</p><p>Get an unmodified copy at mindmap.thunderstudy.indevs.in</p></div>
</main>
<script>
var MAP_DATA = ${dataJson};
${rendererSrc}
function boot(){
  var svg = document.getElementById('map-svg');
  var g = document.getElementById('map-g');
  if(!verifyBrandLock()){
    document.getElementById('map-canvas-wrap').style.display='none';
    document.querySelector('.zoom-row').style.display='none';
    document.getElementById('lock-fallback').style.display='block';
    return;
  }
  drawMindMap(svg, g, MAP_DATA);
  setupPanZoom(svg);
  document.getElementById('zoomIn').addEventListener('click', function(){ zoomBy(svg, 1.25); });
  document.getElementById('zoomOut').addEventListener('click', function(){ zoomBy(svg, 0.8); });
  document.getElementById('zoomReset').addEventListener('click', function(){ zoomResetSvg(svg); });
}
document.addEventListener('DOMContentLoaded', boot);
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (currentMapData.title || 'mindmap').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.html';
  a.click();
  toast('HTML file downloaded.');
});

/* ---------- download: Image (watermarked) ---------- */
$('#downloadImgBtn').addEventListener('click', () => {
  const svg = $('#map-svg');
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  const scale = 2;
  const w = vb[2] * scale, h = vb[3] * scale;

  const clone = svg.cloneNode(true);
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  clone.style.background = '#f7f7f7';
  const rectBg = svgEl('rect');
  rectBg.setAttribute('x', vb[0]); rectBg.setAttribute('y', vb[1]);
  rectBg.setAttribute('width', vb[2]); rectBg.setAttribute('height', vb[3]);
  rectBg.setAttribute('fill', '#f7f7f7');
  clone.insertBefore(rectBg, clone.firstChild);

  const svgStr = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 8);
    ctx.font = `${Math.max(18, w * 0.018)}px Inter, sans-serif`;
    ctx.fillStyle = 'rgba(87,58,252,0.16)';
    ctx.textAlign = 'center';
    const step = Math.max(160, w * 0.16);
    for (let y = -h; y < h; y += step) {
      for (let x = -w; x < w; x += step * 2.4) {
        ctx.fillText('ThunderStudy.indevs.in', x, y);
      }
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(29,29,31,0.7)';
    ctx.font = `${Math.max(13, w * 0.012)}px Inter, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Made with Thunder Mind Map · mindmap.thunderstudy.indevs.in', 18, h - 18);

    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (currentMapData.title || 'mindmap').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png';
      a.click();
      toast('Image downloaded.');
    }, 'image/png');
  };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
});
