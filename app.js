/* ===================== Thunder Mind Map — app.js ===================== */

const MAX_SAVED = 50;
const DAILY_LIMIT = 3;
const WEEKLY_LIMIT = 12;
const MAX_PDF_PAGES = 15;
const MAX_TEXT_CHARS = 9000;
const API_ENDPOINT = '/api/generate';
const EXAM_TAGS = ['SSC', 'Banking', 'CUET', 'JEE', 'NEET', 'UPSC', 'Other'];

/* ---------- PURE RENDERER FUNCTIONS ----------
   These functions are self-contained (no outer closures) so their
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
  nodes.push({ x: 0, y: 0, w: rootW, h: 56, label: truncateLabel(data.title || 'Mind Map', 26), depth: 0, color: '#573AFC', isRoot: true, path: [] });

  var R1 = 210, R2 = 400, R3 = 580;
  var maxRUsed = R1;

  branches.forEach(function (branch, bi) {
    var angle = (bi / n) * Math.PI * 2 - Math.PI / 2;
    var color = palette[bi % palette.length];
    var p1 = polarPoint(0, 0, R1, angle);
    var bW = Math.min(170, Math.max(90, (branch.label || '').length * 7 + 24));
    nodes.push({ x: p1.x, y: p1.y, w: bW, h: 40, label: truncateLabel(branch.label || '', 22), depth: 1, color: color, path: [bi] });
    edges.push({ x1: 0, y1: 0, x2: p1.x, y2: p1.y, color: color });

    var children = branch.children || [];
    var cCount = children.length;
    if (cCount > 0) {
      var spread = Math.min((Math.PI * 2 / n) * 0.85, 0.95);
      children.forEach(function (child, ci) {
        var cAngle = angle + (ci - (cCount - 1) / 2) * (spread / Math.max(cCount, 1));
        var p2 = polarPoint(0, 0, R2, cAngle);
        var cW = Math.min(160, Math.max(80, (child.label || '').length * 6.5 + 22));
        nodes.push({ x: p2.x, y: p2.y, w: cW, h: 36, label: truncateLabel(child.label || '', 20), depth: 2, color: color, path: [bi, ci] });
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
            nodes.push({ x: p3.x, y: p3.y, w: gW, h: 32, label: truncateLabel(leaf.label || '', 18), depth: 3, color: color, path: [bi, ci, gi] });
            edges.push({ x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y, color: color });
            maxRUsed = Math.max(maxRUsed, R3);
          });
        }
      });
    }
  });

  return { nodes: nodes, edges: edges, half: maxRUsed + 160 };
}

function buildMindMapLayoutFiltered(data, visibleBranchIndex) {
  if (visibleBranchIndex === null || visibleBranchIndex === undefined) {
    return buildMindMapLayout(data);
  }
  var filtered = {
    title: data.title,
    branches: (data.branches || []).filter(function (b, i) { return i === visibleBranchIndex; })
  };
  var layout = buildMindMapLayout(filtered);
  layout.nodes.forEach(function (n) {
    if (n.path && n.path.length > 0) n.path[0] = visibleBranchIndex;
  });
  return layout;
}

function drawMindMap(svg, g, data, opts) {
  opts = opts || {};
  while (g.firstChild) g.removeChild(g.firstChild);
  var layout = opts.studyBranch !== undefined
    ? buildMindMapLayoutFiltered(data, opts.studyBranch)
    : buildMindMapLayout(data);

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
    grp.setAttribute('class', 'map-node-group');
    if (n.path) grp.setAttribute('data-path', JSON.stringify(n.path));
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
  var dragging = false, lastX = 0, lastY = 0, moved = false;

  function getVB() {
    var parts = svg.getAttribute('viewBox').split(' ').map(Number);
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }
  function setVB(vb) {
    svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
  }
  function pointerDown(e) {
    dragging = true; moved = false;
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
    if (Math.abs(p.clientX - lastX) > 2 || Math.abs(p.clientY - lastY) > 2) moved = true;
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

  svg._wasDragged = function () { return moved; };
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

/* ---------- credits (client-side primary gate; server has its own backstop) ---------- */
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
  $('#mode-image').style.display = activeMode === 'image' ? 'block' : 'none';
  $('#mode-youtube').style.display = activeMode === 'youtube' ? 'block' : 'none';
}));

$('#textInput').addEventListener('input', (e) => {
  const len = e.target.value.length;
  $('#textCharHint').textContent = `${len} / ${MAX_TEXT_CHARS} characters`;
  $('#textCharHint').classList.toggle('warn', len > MAX_TEXT_CHARS);
});
$('#maxPagesLabel').textContent = MAX_PDF_PAGES;

/* ---------- depth selector ---------- */
let activeDepth = 'deep';
$$('.depth-chip').forEach(chip => chip.addEventListener('click', () => {
  $$('.depth-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  activeDepth = chip.dataset.depth;
}));

/* ---------- combine-with-existing toggle ---------- */
let combineMode = false;
$('#combineToggle').addEventListener('click', () => {
  if (!currentMapData) { toast('Open or generate a map first to combine into it.'); return; }
  combineMode = !combineMode;
  $('#combineToggle').classList.toggle('active', combineMode);
  $('#combineToggle').textContent = combineMode ? 'Will merge into current map \u2713' : 'Combine with current map';
});

/* ---------- PDF handling ---------- */
let pdfDoc = null;
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
  const to = Math.min(parseInt($('#pdfTo').value) || from, pdfDoc.numPages);
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
  let sawAnyText = false;
  for (let p = from; p <= to; p++) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items.map(i => i.str).join(' ');
    if (pageText.trim().length > 0) sawAnyText = true;
    text += pageText + '\n';
    if (text.length > MAX_TEXT_CHARS) break;
  }
  if (!sawAnyText) {
    throw new Error('SCANNED_PDF');
  }
  return text.slice(0, MAX_TEXT_CHARS);
}

/* ---------- image OCR input (Tesseract.js, client-side, free) ---------- */
let ocrFile = null;
let ocrExtractedText = '';
$('#imageDrop').addEventListener('click', () => $('#imageFile').click());
$('#imageFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  ocrFile = file;
  $('#imagePreviewWrap').style.display = 'block';
  $('#imagePreview').src = URL.createObjectURL(file);
  $('#ocrStatus').textContent = 'Tap "Scan Text" to read the photo.';
  $('#ocrCharHint').textContent = '';
  ocrExtractedText = '';
});
$('#ocrScanBtn').addEventListener('click', async () => {
  if (!ocrFile) { toast('Choose a photo first.'); return; }
  if (!window.Tesseract) {
    toast('OCR library failed to load — check your connection and reload.');
    return;
  }
  $('#ocrStatus').textContent = 'Scanning text from image... this can take 10-30s.';
  $('#ocrScanBtn').disabled = true;
  try {
    const result = await Tesseract.recognize(ocrFile, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          $('#ocrStatus').textContent = `Scanning text... ${Math.round((m.progress || 0) * 100)}%`;
        }
      }
    });
    ocrExtractedText = (result.data.text || '').trim().slice(0, MAX_TEXT_CHARS);
    if (!ocrExtractedText) {
      $('#ocrStatus').textContent = 'No readable text found — try a clearer, well-lit photo.';
    } else {
      $('#ocrStatus').textContent = 'Text scanned successfully. Review below, then Generate.';
      $('#ocrCharHint').textContent = `${ocrExtractedText.length} / ${MAX_TEXT_CHARS} characters extracted.`;
      $('#ocrPreviewText').value = ocrExtractedText;
      $('#ocrPreviewWrap').style.display = 'block';
    }
  } catch (err) {
    $('#ocrStatus').textContent = 'OCR failed on this image. Try a clearer photo or better lighting.';
  } finally {
    $('#ocrScanBtn').disabled = false;
  }
});
$('#ocrPreviewText') && $('#ocrPreviewText').addEventListener('input', (e) => {
  ocrExtractedText = e.target.value.slice(0, MAX_TEXT_CHARS);
  $('#ocrCharHint').textContent = `${ocrExtractedText.length} / ${MAX_TEXT_CHARS} characters.`;
});

/* ---------- YouTube transcript input ---------- */
function extractYouTubeId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
$('#ytFetchBtn').addEventListener('click', async () => {
  const url = $('#ytUrlInput').value.trim();
  const vid = extractYouTubeId(url);
  if (!vid) { toast('Could not find a valid YouTube video ID in that URL.'); return; }
  $('#ytStatus').textContent = 'Fetching transcript...';
  $('#ytFetchBtn').disabled = true;
  try {
    const res = await fetch('/api/youtube-transcript?id=' + encodeURIComponent(vid));
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    if (!data.transcript) throw new Error('no transcript');
    const text = data.transcript.slice(0, MAX_TEXT_CHARS);
    $('#ytPreviewText').value = text;
    $('#ytPreviewWrap').style.display = 'block';
    $('#ytStatus').textContent = `Transcript fetched (${text.length} characters). Review below, then Generate.`;
  } catch (err) {
    $('#ytStatus').textContent = 'Could not fetch a transcript for this video — it may not have captions available, or the video is private/restricted.';
  } finally {
    $('#ytFetchBtn').disabled = false;
  }
});

/* ---------- generate ---------- */
let currentMapData = null;
let currentMapMeta = null;
let studyModeActive = false;
let studyModeBranchIndex = null;

async function generateFromAPI(payload) {
  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (!res.ok) throw new Error('SERVER_ERROR');
  return res.json();
}

function mergeMindMaps(base, addition) {
  const existingLabels = new Set((base.branches || []).map(b => (b.label || '').toLowerCase().trim()));
  const merged = { title: base.title, branches: [...(base.branches || [])] };
  (addition.branches || []).forEach(b => {
    const key = (b.label || '').toLowerCase().trim();
    if (!existingLabels.has(key)) {
      merged.branches.push(b);
      existingLabels.add(key);
    }
  });
  return merged;
}

$('#generateBtn').addEventListener('click', async () => {
  if (!canGenerate()) { toast('No credits left — check the reset timer above.'); return; }

  let payloadMode, input;
  if (activeMode === 'topic') {
    input = $('#topicInput').value.trim();
    payloadMode = 'topic';
    if (!input) { toast('Enter a topic first.'); return; }
  } else if (activeMode === 'text') {
    input = $('#textInput').value.trim().slice(0, MAX_TEXT_CHARS);
    payloadMode = 'content';
    if (!input) { toast('Paste some text first.'); return; }
  } else if (activeMode === 'pdf') {
    if (!pdfDoc) { toast('Upload a PDF first.'); return; }
    $('#pdfStatus').textContent = 'Extracting selected pages...';
    try {
      input = await extractPdfRange();
    } catch (err) {
      if (err.message === 'SCANNED_PDF') {
        $('#pdfStatus').textContent = 'This looks like a scanned PDF (no selectable text). Try the "Photo / OCR" mode instead, or a text-based PDF.';
      } else {
        $('#pdfStatus').textContent = 'Could not extract text from that page range.';
      }
      return;
    }
    payloadMode = 'content';
    if (!input.trim()) { toast('Could not extract text from that page range.'); return; }
  } else if (activeMode === 'image') {
    input = ocrExtractedText.trim();
    payloadMode = 'content';
    if (!input) { toast('Scan a photo first using "Scan Text".'); return; }
  } else if (activeMode === 'youtube') {
    input = $('#ytPreviewText').value.trim().slice(0, MAX_TEXT_CHARS);
    payloadMode = 'content';
    if (!input) { toast('Fetch a transcript first.'); return; }
  }

  const btn = $('#generateBtn');
  const originalLabel = btn.lastChild.textContent;
  btn.disabled = true;
  btn.lastChild.textContent = ' Generating...';

  try {
    const data = await generateFromAPI({ mode: payloadMode, input: input, depth: activeDepth });
    if (!data || !data.title || !Array.isArray(data.branches)) throw new Error('SHAPE_ERROR');

    let finalData = data;
    if (combineMode && currentMapData) {
      finalData = mergeMindMaps(currentMapData, data);
      toast('Merged new branches into your current map.');
      combineMode = false;
      $('#combineToggle').classList.remove('active');
      $('#combineToggle').textContent = 'Combine with current map';
    }

    currentMapData = finalData;
    currentMapMeta = { id: 'm_' + Date.now(), title: finalData.title, source: 'ai', tag: currentMapMeta?.tag || null, createdAt: Date.now() };
    studyModeActive = false; studyModeBranchIndex = null;
    showViewer(finalData, currentMapMeta.title);
    consumeCredit();
  } catch (err) {
    if (err.message === 'RATE_LIMIT') {
      toast('Server is busy right now — please try again in a bit.');
    } else {
      toast('Generation failed. Please try again in a moment.');
    }
  } finally {
    btn.disabled = !canGenerate();
    btn.lastChild.textContent = originalLabel;
  }
});

/* ---------- node lookup / path helpers ---------- */
function getNodeByPath(data, path) {
  if (!path || path.length === 0) return { label: data.title, detail: data.detail || '', node: data, isRoot: true };
  let cur = data.branches[path[0]];
  if (path.length === 1) return { label: cur.label, detail: cur.detail || '', node: cur };
  cur = cur.children && cur.children[path[1]];
  if (!cur) return null;
  if (path.length === 2) return { label: cur.label, detail: cur.detail || '', node: cur };
  cur = cur.children && cur.children[path[2]];
  if (!cur) return null;
  return { label: cur.label, detail: cur.detail || '', node: cur };
}
function getParentArray(data, path) {
  if (path.length === 1) return data.branches;
  if (path.length === 2) return data.branches[path[0]].children || (data.branches[path[0]].children = []);
  if (path.length === 3) {
    const child = data.branches[path[0]].children[path[1]];
    return child.children || (child.children = []);
  }
  return null;
}

/* ---------- node detail panel + inline editing ---------- */
let activeNodePath = null;

function openNodePanel(path) {
  if (!currentMapData) return;
  activeNodePath = path;
  const info = getNodeByPath(currentMapData, path);
  if (!info) return;
  $('#nodePanelTitle').textContent = info.label || '(untitled)';
  $('#nodePanelDetail').textContent = info.detail || 'No detail available for this node.';
  $('#nodeLabelInput').value = info.label || '';
  $('#nodeDetailInput').value = info.detail || '';
  const isRoot = path.length === 0;
  const isLeafLevel = path.length === 3;
  $('#nodeDeleteBtn').style.display = isRoot ? 'none' : 'inline-flex';
  $('#nodeAddChildBtn').style.display = isLeafLevel ? 'none' : 'inline-flex';
  $('#nodeRegenBranchBtn').style.display = path.length === 1 ? 'inline-flex' : 'none';
  $('#nodePanel').classList.add('active');
}
function closeNodePanel() {
  $('#nodePanel').classList.remove('active');
  activeNodePath = null;
}
$('#nodePanelClose').addEventListener('click', closeNodePanel);

$('#nodeSaveBtn').addEventListener('click', () => {
  if (!activeNodePath || !currentMapData) return;
  const newLabel = $('#nodeLabelInput').value.trim();
  const newDetail = $('#nodeDetailInput').value.trim();
  if (!newLabel) { toast('Label cannot be empty.'); return; }
  if (activeNodePath.length === 0) {
    currentMapData.title = newLabel;
  } else {
    const info = getNodeByPath(currentMapData, activeNodePath);
    info.node.label = newLabel;
    info.node.detail = newDetail;
  }
  redrawCurrent();
  toast('Node updated.');
  closeNodePanel();
});

$('#nodeDeleteBtn').addEventListener('click', () => {
  if (!activeNodePath || activeNodePath.length === 0 || !currentMapData) return;
  const arr = getParentArray(currentMapData, activeNodePath);
  const idx = activeNodePath[activeNodePath.length - 1];
  if (arr && idx > -1) arr.splice(idx, 1);
  redrawCurrent();
  toast('Node deleted.');
  closeNodePanel();
});

$('#nodeAddChildBtn').addEventListener('click', () => {
  if (!activeNodePath || !currentMapData) return;
  const newLabel = prompt('New child node label:');
  if (!newLabel || !newLabel.trim()) return;
  let targetChildren;
  if (activeNodePath.length === 0) {
    targetChildren = currentMapData.branches || (currentMapData.branches = []);
  } else {
    const info = getNodeByPath(currentMapData, activeNodePath);
    targetChildren = info.node.children || (info.node.children = []);
  }
  targetChildren.push({ label: newLabel.trim(), detail: '', children: [] });
  redrawCurrent();
  toast('Child node added.');
  closeNodePanel();
});

$('#nodeRegenBranchBtn').addEventListener('click', async () => {
  if (!activeNodePath || activeNodePath.length !== 1 || !currentMapData) return;
  if (!canGenerate()) { toast('No credits left — check the reset timer above.'); return; }
  const branchIdx = activeNodePath[0];
  const branch = currentMapData.branches[branchIdx];
  const btn = $('#nodeRegenBranchBtn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Regenerating...';
  try {
    const otherLabels = currentMapData.branches.filter((b, i) => i !== branchIdx).map(b => b.label).join(', ');
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'branch',
        input: currentMapData.title,
        depth: activeDepth,
        branchLabel: branch.label,
        branchContext: `Other branches already in this map: ${otherLabels}`
      })
    });
    if (res.status === 429) throw new Error('RATE_LIMIT');
    if (!res.ok) throw new Error('SERVER_ERROR');
    const newBranch = await res.json();
    if (!newBranch || !newBranch.label) throw new Error('SHAPE_ERROR');
    currentMapData.branches[branchIdx] = newBranch;
    redrawCurrent();
    consumeCredit();
    toast('Branch regenerated.');
    closeNodePanel();
  } catch (err) {
    toast(err.message === 'RATE_LIMIT' ? 'Server is busy — try again shortly.' : 'Could not regenerate that branch. Try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

function redrawCurrent() {
  const svg = $('#map-svg');
  const g = $('#map-g');
  drawMindMap(svg, g, currentMapData, studyModeActive ? { studyBranch: studyModeBranchIndex } : {});
  attachNodeClickHandlers();
}

function attachNodeClickHandlers() {
  $$('.map-node-group').forEach(grp => {
    grp.style.cursor = 'pointer';
    grp.addEventListener('click', () => {
      const svg = $('#map-svg');
      if (svg._wasDragged && svg._wasDragged()) return;
      const pathAttr = grp.getAttribute('data-path');
      if (pathAttr === null) return;
      const path = JSON.parse(pathAttr);
      if (studyModeActive && path.length === 1) {
        studyModeBranchIndex = studyModeBranchIndex === path[0] ? null : path[0];
        redrawCurrent();
        return;
      }
      openNodePanel(path);
    });
  });
}

function showViewer(data, title) {
  $('#viewer-wrap').classList.add('active');
  $('#viewerTitle').textContent = title || 'Mind Map';
  studyModeActive = false;
  studyModeBranchIndex = null;
  $('#studyModeToggle').classList.remove('active');
  $('#studyModeToggle').textContent = 'Study Mode';
  redrawCurrent();
  setupPanZoom($('#map-svg'));
  $('#viewer-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#zoomIn').addEventListener('click', () => zoomBy($('#map-svg'), 1.25));
$('#zoomOut').addEventListener('click', () => zoomBy($('#map-svg'), 0.8));
$('#zoomReset').addEventListener('click', () => zoomResetSvg($('#map-svg')));

/* ---------- study mode ---------- */
$('#studyModeToggle').addEventListener('click', () => {
  if (!currentMapData) return;
  studyModeActive = !studyModeActive;
  studyModeBranchIndex = null;
  $('#studyModeToggle').classList.toggle('active', studyModeActive);
  $('#studyModeToggle').textContent = studyModeActive ? 'Study Mode: ON (tap a branch)' : 'Study Mode';
  redrawCurrent();
  toast(studyModeActive ? 'Study Mode on — tap one branch at a time to reveal it.' : 'Study Mode off — full map shown.');
});

/* ---------- save / my maps ---------- */
function loadSaved() {
  try { return JSON.parse(localStorage.getItem('tmm_saved')) || []; } catch (e) { return []; }
}
function writeSaved(list) { localStorage.setItem('tmm_saved', JSON.stringify(list)); }

function populateTagSelect(selectEl, current) {
  selectEl.innerHTML = '<option value="">No tag</option>' + EXAM_TAGS.map(t =>
    `<option value="${t}" ${t === current ? 'selected' : ''}>${t}</option>`
  ).join('');
}

$('#saveMapBtn').addEventListener('click', () => {
  if (!currentMapData) return;
  populateTagSelect($('#saveTagSelect'), currentMapMeta?.tag || '');
  $('#saveTagModal').classList.add('active');
});
$('#saveTagCancelBtn').addEventListener('click', () => $('#saveTagModal').classList.remove('active'));
$('#saveTagConfirmBtn').addEventListener('click', () => {
  const tag = $('#saveTagSelect').value || null;
  let list = loadSaved();
  if (list.length >= MAX_SAVED) {
    list.shift();
    toast('Saved 50 reached — oldest map removed to make room.');
  }
  list.push({ id: currentMapMeta.id, title: currentMapMeta.title, data: currentMapData, source: currentMapMeta.source, tag: tag, createdAt: Date.now() });
  writeSaved(list);
  if (currentMapMeta) currentMapMeta.tag = tag;
  $('#saveTagModal').classList.remove('active');
  toast('Saved to My Maps.');
});

let activeTagFilter = null;
function renderTagChips() {
  const wrap = $('#tagFilterRow');
  const counts = {};
  loadSaved().forEach(m => { const t = m.tag || 'Untagged'; counts[t] = (counts[t] || 0) + 1; });
  const tags = Object.keys(counts);
  if (tags.length === 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<button class="tag-chip' + (activeTagFilter === null ? ' active' : '') + '" data-tag="">All (' + loadSaved().length + ')</button>' +
    tags.map(t => `<button class="tag-chip${activeTagFilter === t ? ' active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)} (${counts[t]})</button>`).join('');
  $$('.tag-chip').forEach(chip => chip.addEventListener('click', () => {
    activeTagFilter = chip.dataset.tag || null;
    renderSavedList($('#mapSearch').value);
  }));
}

function renderSavedList(filter = '') {
  renderTagChips();
  const list = loadSaved().slice().reverse();
  const wrap = $('#savedList');
  $('#savedCountHint').textContent = `${loadSaved().length} / ${MAX_SAVED} saved`;
  wrap.innerHTML = '';
  let filtered = list.filter(m => m.title.toLowerCase().includes(filter.toLowerCase()));
  if (activeTagFilter) {
    filtered = filtered.filter(m => (m.tag || 'Untagged') === activeTagFilter);
  }
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
      <div class="meta"><strong>${escapeHtml(m.title)}</strong><span>${m.source === 'preset' ? 'Preset' : 'AI generated'}${m.tag ? ' · ' + escapeHtml(m.tag) : ''} · ${new Date(m.createdAt).toLocaleDateString()}</span></div>
      <div class="row-actions">
        <button class="openBtn" aria-label="Open"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button>
        <button class="delBtn" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg></button>
      </div>`;
    row.querySelector('.openBtn').addEventListener('click', () => {
      currentMapData = m.data;
      currentMapMeta = { id: m.id, title: m.title, source: m.source, tag: m.tag || null, createdAt: m.createdAt };
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
        currentMapMeta = { id: 'p_' + p.file, title: data.title, source: 'preset', tag: null, createdAt: Date.now() };
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

/* ---------- copy as outline text ---------- */
function flattenToOutline(data) {
  const lines = [data.title || 'Mind Map', ''];
  (data.branches || []).forEach(b => {
    lines.push(`- ${b.label}`);
    if (b.detail) lines.push(`  ${b.detail}`);
    (b.children || []).forEach(c => {
      lines.push(`  - ${c.label}`);
      if (c.detail) lines.push(`    ${c.detail}`);
      (c.children || []).forEach(g => {
        lines.push(`    - ${g.label}`);
        if (g.detail) lines.push(`      ${g.detail}`);
      });
    });
  });
  return lines.join('\n');
}
$('#copyOutlineBtn').addEventListener('click', async () => {
  if (!currentMapData) return;
  const text = flattenToOutline(currentMapData);
  try {
    await navigator.clipboard.writeText(text);
    toast('Outline copied to clipboard.');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Outline copied to clipboard.');
  }
});

/* ---------- download: HTML (with brand lock) ---------- */
$('#downloadHtmlBtn').addEventListener('click', () => {
  if (!currentMapData) return;
  const rendererSrc = [polarPoint, truncateLabel, svgEl, buildMindMapLayout, buildMindMapLayoutFiltered, drawMindMap, setupPanZoom, zoomBy, zoomResetSvg, verifyBrandLock]
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
  .zoom-row{display:flex;justify-content:center;gap:8px;margin:14px 0 10px;}
  .zoom-row button{width:40px;height:40px;border-radius:9999px;border:1px solid #ccc;background:#fff;}
  #node-detail-box{max-width:600px;margin:18px auto 30px;padding:16px 18px;border:1px solid #e6e6e6;border-radius:14px;background:#fafafa;font-size:14px;line-height:1.5;display:none;}
  #node-detail-box.show{display:block;}
  #node-detail-box strong{display:block;margin-bottom:6px;font-size:15px;}
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
  <div id="node-detail-box"><strong id="ndbTitle"></strong><span id="ndbText"></span></div>
  <div id="lock-fallback"><p>This mind map file appears to have been modified and can no longer be displayed.</p><p>Get an unmodified copy at mindmap.thunderstudy.indevs.in</p></div>
</main>
<script>
var MAP_DATA = ${dataJson};
${rendererSrc}
function findNodeByPath(data, path){
  if(!path || path.length===0) return {label:data.title, detail:data.detail||''};
  var cur = data.branches[path[0]];
  if(path.length===1) return {label:cur.label, detail:cur.detail||''};
  cur = cur.children && cur.children[path[1]];
  if(!cur) return null;
  if(path.length===2) return {label:cur.label, detail:cur.detail||''};
  cur = cur.children && cur.children[path[2]];
  if(!cur) return null;
  return {label:cur.label, detail:cur.detail||''};
}
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
  Array.prototype.forEach.call(document.querySelectorAll('.map-node-group'), function(grp){
    grp.style.cursor = 'pointer';
    grp.addEventListener('click', function(){
      if(svg._wasDragged && svg._wasDragged()) return;
      var pathAttr = grp.getAttribute('data-path');
      if(pathAttr === null) return;
      var path = JSON.parse(pathAttr);
      var info = findNodeByPath(MAP_DATA, path);
      if(!info) return;
      document.getElementById('ndbTitle').textContent = info.label;
      document.getElementById('ndbText').textContent = info.detail || 'No detail available for this node.';
      document.getElementById('node-detail-box').classList.add('show');
      document.getElementById('node-detail-box').scrollIntoView({behavior:'smooth', block:'nearest'});
    });
  });
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

/* ---------- download: Image (watermarked, with B&W toggle) ---------- */
let bwExportMode = false;
$('#bwToggle').addEventListener('click', () => {
  bwExportMode = !bwExportMode;
  $('#bwToggle').classList.toggle('active', bwExportMode);
  $('#bwToggle').textContent = bwExportMode ? 'Print Mode (B&W) \u2713' : 'Print Mode (B&W)';
});

function renderSvgToCanvas(svg, scale, bw) {
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  const w = vb[2] * scale, h = vb[3] * scale;
  const clone = svg.cloneNode(true);
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);

  if (bw) {
    clone.querySelectorAll('.node-rect').forEach((r) => {
      r.setAttribute('stroke', '#000000');
      r.setAttribute('fill', '#ffffff');
    });
    clone.querySelectorAll('.node-text').forEach(t => t.setAttribute('fill', '#000000'));
    clone.querySelectorAll('.edge-path').forEach(p => { p.setAttribute('stroke', '#000000'); p.setAttribute('opacity', '0.7'); });
  }

  const rectBg = svgEl('rect');
  rectBg.setAttribute('x', vb[0]); rectBg.setAttribute('y', vb[1]);
  rectBg.setAttribute('width', vb[2]); rectBg.setAttribute('height', vb[3]);
  rectBg.setAttribute('fill', bw ? '#ffffff' : '#f7f7f7');
  clone.insertBefore(rectBg, clone.firstChild);

  const svgStr = new XMLSerializer().serializeToString(clone);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      if (!bw) {
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
      }

      ctx.fillStyle = bw ? 'rgba(0,0,0,0.8)' : 'rgba(29,29,31,0.7)';
      ctx.font = `${Math.max(13, w * 0.012)}px Inter, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('Made with Thunder Mind Map · mindmap.thunderstudy.indevs.in', 18, h - 18);

      resolve(canvas);
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
  });
}

$('#downloadImgBtn').addEventListener('click', async () => {
  const svg = $('#map-svg');
  const canvas = await renderSvgToCanvas(svg, 2, bwExportMode);
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (currentMapData.title || 'mindmap').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + (bwExportMode ? '-print' : '') + '.png';
    a.click();
    toast('Image downloaded.');
  }, 'image/png');
});

/* ---------- download: PDF (Diagram or Detail Booklet) ---------- */
$('#downloadPdfBtn').addEventListener('click', () => {
  if (!currentMapData) return;
  $('#pdfTypeModal').classList.add('active');
});
$('#pdfTypeCancelBtn').addEventListener('click', () => $('#pdfTypeModal').classList.remove('active'));

$('#pdfDiagramBtn').addEventListener('click', async () => {
  $('#pdfTypeModal').classList.remove('active');
  await exportDiagramPdf();
});
$('#pdfBookletBtn').addEventListener('click', async () => {
  $('#pdfTypeModal').classList.remove('active');
  await exportBookletPdf();
});

async function ensureJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
}

/* ---------- shared PDF footer helper ----------
   Draws on the CURRENT page. Call after all content is placed on that page.
   Left  → @wondermayank
   Right → Created by ThunderStudy                                          */
function addPdfFooter(pdf, pageW, pageH) {
  const footerY = pageH - 18;
  const footerSize = 8.5;
  pdf.setFontSize(footerSize);
  pdf.setTextColor(160);
  // left: @wondermayank
  pdf.text('@wondermayank', 36, footerY, { align: 'left' });
  // right: Created by ThunderStudy
  pdf.text('Created by ThunderStudy', pageW - 36, footerY, { align: 'right' });
  // thin separator line above footer
  pdf.setDrawColor(220);
  pdf.setLineWidth(0.4);
  pdf.line(36, footerY - 8, pageW - 36, footerY - 8);
  // reset colours
  pdf.setTextColor(0);
  pdf.setDrawColor(0);
}

async function exportDiagramPdf() {
  toast('Building PDF...');
  const jsPDF = await ensureJsPDF();
  const svg = $('#map-svg');
  const canvas = await renderSvgToCanvas(svg, 2, bwExportMode);
  const imgData = canvas.toDataURL('image/png');
  const isLandscape = canvas.width >= canvas.height;
  const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 36;
  // Reserve 32 pt at bottom for footer
  const footerH = 32;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2 - footerH;
  const ratio = Math.min(availW / canvas.width, availH / canvas.height);
  const w = canvas.width * ratio, h = canvas.height * ratio;
  // Title
  pdf.setFontSize(16);
  pdf.setFont(undefined, 'bold');
  pdf.text(currentMapData.title || 'Mind Map', pageW / 2, margin, { align: 'center' });
  pdf.setFont(undefined, 'normal');
  // Mind map image
  pdf.addImage(imgData, 'PNG', (pageW - w) / 2, margin + 22, w, h);
  // Footer on this single page
  addPdfFooter(pdf, pageW, pageH);
  pdf.save((currentMapData.title || 'mindmap').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-diagram.pdf');
  toast('Diagram PDF downloaded.');
}

async function exportBookletPdf() {
  toast('Building study booklet...');
  const jsPDF = await ensureJsPDF();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 50;
  const maxW = pageW - margin * 2;
  // Footer reserves 32 pt at the very bottom of every page
  const footerH = 32;
  // Content area bottom boundary (don't print below this)
  const contentBottom = pageH - footerH - 10;

  /* ── PAGE 1: Title cover ─────────────────────────────────────────── */
  pdf.setFontSize(28);
  pdf.setFont(undefined, 'bold');
  const coverTitleLines = pdf.splitTextToSize(currentMapData.title || 'Mind Map', maxW);
  // Centre vertically in the content area
  const coverTitleH = coverTitleLines.length * 36;
  let coverY = (contentBottom - coverTitleH) / 2;
  pdf.text(coverTitleLines, pageW / 2, coverY, { align: 'center' });
  pdf.setFont(undefined, 'normal');
  // Sub-line
  pdf.setFontSize(12);
  pdf.setTextColor(120);
  pdf.text('Study Booklet \u00b7 generated with Thunder Mind Map', pageW / 2, coverY + coverTitleH + 22, { align: 'center' });
  pdf.text('mindmap.thunderstudy.indevs.in', pageW / 2, coverY + coverTitleH + 40, { align: 'center' });
  pdf.setTextColor(0);
  addPdfFooter(pdf, pageW, pageH);

  /* ── PAGE 2: Full mind map diagram ───────────────────────────────── */
  pdf.addPage('a4', 'landscape');
  const p2W = pdf.internal.pageSize.getWidth();
  const p2H = pdf.internal.pageSize.getHeight();
  const p2Margin = 36;
  const p2FooterH = 32;
  // Render map (reuse the live SVG; bwExportMode respected)
  const svg = $('#map-svg');
  const mapCanvas = await renderSvgToCanvas(svg, 2, bwExportMode);
  const mapImg = mapCanvas.toDataURL('image/png');
  const p2AvailW = p2W - p2Margin * 2;
  const p2AvailH = p2H - p2Margin * 2 - p2FooterH - 26; // 26 for title row
  const mapRatio = Math.min(p2AvailW / mapCanvas.width, p2AvailH / mapCanvas.height);
  const mW = mapCanvas.width * mapRatio, mH = mapCanvas.height * mapRatio;
  // Page title
  pdf.setFontSize(13);
  pdf.setFont(undefined, 'bold');
  pdf.text(currentMapData.title || 'Mind Map', p2W / 2, p2Margin, { align: 'center' });
  pdf.setFont(undefined, 'normal');
  pdf.addImage(mapImg, 'PNG', (p2W - mW) / 2, p2Margin + 18, mW, mH);
  addPdfFooter(pdf, p2W, p2H);

  /* ── PAGES 3+: Detail notes, one topic per page ──────────────────── */
  function addTopicPage(label, detail, breadcrumb, level) {
    pdf.addPage('a4', 'portrait');
    const pW = pdf.internal.pageSize.getWidth();
    const pH = pdf.internal.pageSize.getHeight();
    let y = margin;

    // Breadcrumb
    if (breadcrumb) {
      pdf.setFontSize(9);
      pdf.setTextColor(150);
      const bcLines = pdf.splitTextToSize(breadcrumb, maxW);
      pdf.text(bcLines, margin, y);
      pdf.setTextColor(0);
      y += bcLines.length * 13 + 6;
      // thin rule under breadcrumb
      pdf.setDrawColor(220);
      pdf.setLineWidth(0.5);
      pdf.line(margin, y, pW - margin, y);
      pdf.setDrawColor(0);
      y += 14;
    }

    // Topic heading
    const headingSize = level === 1 ? 22 : level === 2 ? 18 : 15;
    const lineH = level === 1 ? 29 : level === 2 ? 24 : 21;
    pdf.setFontSize(headingSize);
    pdf.setFont(undefined, 'bold');
    const titleLines = pdf.splitTextToSize(label, maxW);
    pdf.text(titleLines, margin, y);
    pdf.setFont(undefined, 'normal');
    y += titleLines.length * lineH + 16;

    // Level badge (Branch / Sub-topic / Key Point)
    const badge = level === 1 ? 'Branch' : level === 2 ? 'Sub-topic' : 'Key Point';
    pdf.setFontSize(8);
    pdf.setTextColor(100);
    pdf.text(badge.toUpperCase(), margin, y);
    pdf.setTextColor(0);
    y += 18;

    // Detail body text
    pdf.setFontSize(12);
    const detailText = (detail && detail.trim()) ? detail : 'No additional detail was generated for this topic.';
    const bodyLines = pdf.splitTextToSize(detailText, maxW);
    // Only draw lines that fit above the footer
    const lineSpacing = 17;
    bodyLines.forEach(line => {
      if (y + lineSpacing < contentBottom) {
        pdf.text(line, margin, y);
        y += lineSpacing;
      }
    });

    addPdfFooter(pdf, pW, pH);
  }

  (currentMapData.branches || []).forEach(branch => {
    addTopicPage(branch.label, branch.detail, currentMapData.title, 1);
    (branch.children || []).forEach(child => {
      addTopicPage(child.label, child.detail, currentMapData.title + ' \u2192 ' + branch.label, 2);
      (child.children || []).forEach(leaf => {
        addTopicPage(leaf.label, leaf.detail, currentMapData.title + ' \u2192 ' + branch.label + ' \u2192 ' + child.label, 3);
      });
    });
  });

  pdf.save((currentMapData.title || 'mindmap').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-booklet.pdf');
  toast('Study booklet PDF downloaded.');
}
