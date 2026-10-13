// dm.js — solvers for deltamath problems
// load: fetch('https://raw.githubusercontent.com/OogaBoogaPooga/Deltamath-Helper/refs/heads/main/dm.js').then(r=>r.text()).then(eval)

(function () {
  if (window.__dm3) { console.log('already running'); return; }
  window.__dm3 = 1;

  const CONFIG = {
    SELF_UPDATE_URL: 'https://raw.githubusercontent.com/OogaBoogaPooga/Deltamath-Helper/refs/heads/main/dm.js',
    OCR_LANG: 'eng',
    AI_MODEL: 'gemini-flash-latest',
    OWNER_WEBHOOK: '',
  };

  const KEY_STORAGE = '__dm_api_key';
  function getApiKey() { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; } }
  function setApiKey(k) { try { localStorage.setItem(KEY_STORAGE, k); } catch {} }
  function clearApiKey() { try { localStorage.removeItem(KEY_STORAGE); } catch {} }
  function promptForKey() {
    const k = window.prompt('Enter your API key.\n\nStored only in this browser.', getApiKey());
    if (k && /^(AIza|AQ\.)/.test(k.trim())) { setApiKey(k.trim()); return k.trim(); }
    if (k) showToast('invalid key format');
    return '';
  }

  const CLEANUP = [];
  function onCleanup(fn) { CLEANUP.push(fn); }
  function runCleanup() { while (CLEANUP.length) { try { CLEANUP.pop()(); } catch (e) {} } }

  const CDN = {
    nerdamer: ['https://cdn.jsdelivr.net/npm/nerdamer@1.1.13/All.min.js', 'https://unpkg.com/nerdamer@1.1.13/All.min.js'],
    tesseract: ['https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js', 'https://unpkg.com/tesseract.js@5.0.4/dist/tesseract.min.js'],
    html2canvas: ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'],
  };
  function loadScript(urls, name, onDone) {
    let i = 0;
    function tryNext() {
      if (i >= urls.length) { console.warn('failed to load ' + name); return; }
      const s = document.createElement('script');
      s.src = urls[i++];
      s.onload = () => onDone && onDone();
      s.onerror = tryNext;
      document.head.appendChild(s);
    }
    tryNext();
  }
  loadScript(CDN.nerdamer, 'nerdamer', () => { if (window.nerdamer) console.log('nerdamer loaded'); });
  loadScript(CDN.tesseract, 'tesseract', () => { if (window.Tesseract) console.log('ocr loaded'); });
  loadScript(CDN.html2canvas, 'html2canvas', () => { if (window.html2canvas) console.log('html2canvas loaded'); });

  // the ? button
  const btn = document.createElement('div');
  btn.id = '__dm_btn';
  btn.style.cssText = `position:fixed;bottom:20px;right:20px;width:44px;height:44px;border-radius:50%;background:#ffffff;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;z-index:2147483000;border:1px solid rgba(0,0,0,.05);box-shadow:0 2px 8px rgba(0,0,0,.16), 0 1px 3px rgba(0,0,0,.10);transition:background .12s ease, box-shadow .12s ease;`;
  btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2d3748" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  btn.addEventListener('mouseenter', () => { btn.style.background = '#f9fafb'; btn.style.boxShadow = '0 4px 12px rgba(0,0,0,.20), 0 2px 4px rgba(0,0,0,.12)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = '#ffffff'; btn.style.boxShadow = '0 2px 8px rgba(0,0,0,.16), 0 1px 3px rgba(0,0,0,.10)'; });
  document.documentElement.appendChild(btn);
  btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); run(); }, true);
  btn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); openMenu(); }, true);

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a; }
  function frac(x) {
    if (typeof x === 'string') return x;
    if (!isFinite(x)) return String(x);
    if (Math.abs(x) < 1e-10) return '0';
    const sign = x < 0 ? '−' : '';
    const ax = Math.abs(x);
    if (Math.abs(ax - Math.round(ax)) < 1e-8) return sign + String(Math.round(ax));
    for (let d = 2; d <= 500; d++) {
      const n = Math.round(ax * d);
      if (Math.abs(ax - n / d) < 1e-9) {
        const g = gcd(n, d); const nn = n / g, dd = d / g;
        return dd === 1 ? sign + String(nn) : sign + nn + '/' + dd;
      }
    }
    return sign + ax.toFixed(4);
  }
  function cleanLine(s) {
    return String(s).replace(/[\u2212\u2013\u2014\u2015]/g, '-').replace(/[\u00a0\u2007\u202f]/g, ' ')
      .replace(/×/g, '*').replace(/÷/g, '/').replace(/√/g, 'sqrt').replace(/[ \t]+/g, ' ').trim();
  }
  function unwrap(s) { return String(s).replace(/^\[|\]$/g, '').trim(); }
  function nerdamerVals(sol) { const list = Array.isArray(sol) ? sol : [sol]; return list.map(x => unwrap(x.toString())).filter(v => v !== ''); }
  function flipOp(o) { return { '<': '>', '<=': '>=', '>': '<', '>=': '<=' }[o] || o; }

  function walkMath(node) {
    if (!node) return '';
    if (node.nodeType === 3) return node.textContent || '';
    if (node.nodeType !== 1) return '';
    const cls = typeof node.className === 'string' ? node.className : '';
    const tag = (node.tagName || '').toLowerCase();
    if (/mq-fraction/.test(cls)) {
      const num = node.querySelector('.mq-numerator'), den = node.querySelector('.mq-denominator');
      return '(' + (num ? walkMath(num) : '?') + ')/(' + (den ? walkMath(den) : '?') + ')';
    }
    if (/mq-superscript/.test(cls)) { const sup = node.querySelector('.mq-sup'); return '^(' + (sup ? walkMath(sup) : '?') + ')'; }
    if (/mq-subscript/.test(cls)) { const sub = node.querySelector('.mq-sub'); return '_(' + (sub ? walkMath(sub) : '?') + ')'; }
    if (/mq-sqrt|mq-radical/.test(cls)) { const inner = node.querySelector('.mq-non-leaf, .mq-root-block'); return 'sqrt(' + (inner ? walkMath(inner) : '?') + ')'; }
    if (/\bmq-sup\b|\bmq-sub\b|\bmq-numerator\b|\bmq-denominator\b|\bmq-fraction-bar\b|\bmq-cursor\b/.test(cls)) return '';
    if (/\bkatex\b/.test(cls) && !/katex-mathml|katex-html|katex-display/.test(cls)) {
      const mml = node.querySelector('.katex-mathml'); if (mml) return walkMath(mml);
      const html = node.querySelector('.katex-html'); if (html) return walkMath(html);
      return '';
    }
    if (/katex-html/.test(cls)) { let out = ''; for (const c of node.childNodes) out += walkMath(c); return out; }
    if (/katex-mathml/.test(cls)) { const math = node.querySelector('math'); return math ? walkMath(math) : ''; }
    if (tag === 'mfrac') { const k = Array.from(node.children); return '(' + walkMath(k[0]) + ')/(' + walkMath(k[1]) + ')'; }
    if (tag === 'msup') { const k = Array.from(node.children); return walkMath(k[0]) + '^(' + walkMath(k[1]) + ')'; }
    if (tag === 'msub') { const k = Array.from(node.children); return walkMath(k[0]) + '_(' + walkMath(k[1]) + ')'; }
    if (tag === 'msqrt') return 'sqrt(' + Array.from(node.children).map(walkMath).join('') + ')';
    if (tag === 'mroot') { const k = Array.from(node.children); return '(' + walkMath(k[0]) + ')^(1/(' + walkMath(k[1]) + '))'; }
    if (tag === 'semantics') { for (const c of node.children) { const t = (c.tagName || '').toLowerCase(); if (t === 'annotation' || t === 'annotation-xml') continue; return walkMath(c); } return ''; }
    if (tag === 'annotation' || tag === 'annotation-xml') return '';
    let out = '';
    for (const c of node.childNodes) out += walkMath(c);
    return out;
  }

  function problemText() {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, link, meta, svg').forEach(n => n.remove());
    clone.querySelectorAll('.katex, .mq-root-block, math, .MathJax, .MathJax_Preview').forEach(el => {
      if (!el.parentNode) return;
      const txt = walkMath(el);
      if (txt && txt.trim()) el.replaceWith(document.createTextNode(' ' + txt + ' '));
    });
    const hidden = document.createElement('div');
    hidden.style.cssText = 'position:absolute;left:-99999px;top:0;width:800px;pointer-events:none;';
    document.documentElement.appendChild(hidden);
    hidden.appendChild(clone);
    const raw = String(hidden.innerText).replace(/[\u2212\u2013\u2014\u2015]/g, '-').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/×/g, '*').replace(/÷/g, '/').replace(/√/g, 'sqrt');
    hidden.remove();
    const cut = raw.search(/\bAnswer\b|\bAttempt\b/);
    const body = cut > 0 ? raw.slice(0, cut) : raw;
    let lines = body.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim());
    lines = lines.filter(l => {
      if (!l) return false;
      if (/^\s*=/.test(l)) return false;
      if (/, (equals|plus|minus|negative|x|y|z|a|b|c|w|is|the|of|over|times|divided)\b/i.test(l) && (l.match(/,/g) || []).length >= 3) return false;
      if (/^(minus|plus|negative|equals|open|close)\b/i.test(l)) return false;
      return true;
    });
    const merged = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], next = lines[i + 1];
      if (/=\s*$/.test(l) && next && !/^=/.test(next) && next.length < 100) { merged.push(l + next); i++; }
      else merged.push(l);
    }
    const out = [];
    for (const l of merged) {
      if ((l.match(/=/g) || []).length >= 2 && /\band\b/i.test(l)) {
        const parts = l.split(/\band\b/i).map(s => s.trim()).filter(Boolean);
        if (parts.length === 2 && parts.every(p => /=/.test(p))) { parts.forEach(p => out.push(p)); continue; }
      }
      out.push(l);
    }
    const result = out.join('\n');
    if (!/[-+0-9a-z]\s*=\s*[-+0-9a-z]/i.test(result)) {
      console.log('no equations in parsed DOM, using raw innerText');
      const rawBody = String(document.body.innerText)
        .replace(/[\u2212\u2013\u2014\u2015]/g, '-')
        .replace(/[\u00a0\u2007\u202f]/g, ' ')
        .replace(/×/g, '*').replace(/÷/g, '/').replace(/√/g, 'sqrt');
      const cut3 = rawBody.search(/\bAnswer\b|\bAttempt\b/);
      const body3 = cut3 > 0 ? rawBody.slice(0, cut3) : rawBody;
      return body3.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(l => l.length > 0).join('\n');
    }
    return result;
  }

  function normalizeEqText(text) {
    let t = text.replace(/(\d)\s*and\s+/gi, '$1 and ');
    const lines = t.split('\n');
    const out = [];
    for (const l of lines) {
      if ((l.match(/=/g) || []).length >= 2 && /\band\b/i.test(l)) {
        const parts = l.split(/\band\b/i).map(s => s.trim()).filter(Boolean);
        if (parts.length === 2 && parts.every(p => /=/.test(p))) {
          parts.forEach(p => out.push(p));
          continue;
        }
      }
      out.push(l);
    }
    return out.join('\n');
  }

  function findQuestionImages() {
    return [...document.querySelectorAll('img')].filter(im => {
      const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
      if (w < 80 || h < 40) return false;
      if (!im.src) return false;
      if (/logo|icon|avatar|deltamath\.com\/static/i.test(im.src)) return false;
      const r = im.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }
  async function ocrImages() {
    if (!window.Tesseract) { showToast('ocr not ready'); return ''; }
    const imgs = findQuestionImages();
    if (!imgs.length) return '';
    const out = [];
    for (const im of imgs) {
      try {
        showToast('reading image…');
        const { data: { text } } = await window.Tesseract.recognize(im.src, CONFIG.OCR_LANG, {});
        out.push(cleanLine(text.replace(/\n+/g, ' ')));
      } catch (e) { console.warn(e); }
    }
    return out.join('\n');
  }
  async function copyQuestionScreenshot() {
    let target = null;
    for (const el of document.querySelectorAll('div,section,main')) {
      const t = el.innerText || '';
      if (t.length < 100 || t.length > 4000) continue;
      if (/\bQuestion\b/.test(t) && (/\bAnswer\b|\bSubmit\b/.test(t))) {
        if (!target || t.length < (target.innerText || '').length) target = el;
      }
    }
    if (!target) { showToast('could not find question area'); return; }
    try {
      showToast('capturing…');
      if (window.html2canvas) {
        const canvas = await window.html2canvas(target, { scale: 1, logging: false, useCORS: true, backgroundColor: '#ffffff' });
        canvas.toBlob(async blob => {
          try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); showToast('copied'); }
          catch (e) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'problem.png'; a.click(); }
        }, 'image/png');
      } else {
        showToast('capture unavailable');
      }
    } catch (e) { console.warn(e); showToast('capture failed'); }
  }
  async function screenshotAndOCR() {
    if (!window.html2canvas || !window.Tesseract) return '';
    let target = null;
    for (const el of document.querySelectorAll('div,section,main')) {
      const t = el.innerText || '';
      if (t.length < 40 || t.length > 5000) continue;
      if (/\bQuestion\b/.test(t) && (/\bAnswer\b|\bSubmit\b/.test(t))) {
        if (!target || t.length < (target.innerText || '').length) target = el;
      }
    }
    if (!target) return '';
    try {
      showToast('reading equations…');
      const canvas = await window.html2canvas(target, { scale: 2, logging: false, useCORS: true, backgroundColor: '#ffffff' });
      const dataUrl = canvas.toDataURL('image/png');
      const { data: { text } } = await window.Tesseract.recognize(dataUrl, 'eng', {});
      let cleaned = text;
      const cut = cleaned.search(/\bAttempt\b/i);
      if (cut > 0) cleaned = cleaned.slice(0, cut);
      return cleaned.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(l => l.length > 0).join('\n');
    } catch (e) { console.warn('screenshot+OCR failed', e); return ''; }
  }

  function parseSideSide(s) {
    const coef = {}; let constVal = 0;
    const tokens = String(s).replace(/\s/g, '').match(/[+-]?\d*\.?\d*[a-z]|[+-]?\d+\.?\d*/gi) || [];
    for (const t of tokens) {
      const vm = t.match(/([+-]?)(\d*\.?\d*)([a-z])/i);
      if (vm) {
        const sg = vm[1] === '-' ? -1 : 1;
        const n = vm[2] === '' || vm[2] === '.' ? 1 : parseFloat(vm[2]);
        const v = vm[3].toLowerCase();
        coef[v] = (coef[v] || 0) + sg * n;
      } else {
        constVal += parseFloat(t) || 0;
      }
    }
    return { coef, const: constVal };
  }
  function parseEqFull(line) {
    const parts = line.split('=');
    if (parts.length !== 2) return null;
    const L = parseSideSide(parts[0]), R = parseSideSide(parts[1]);
    const coef = {};
    const keys = new Set([...Object.keys(L.coef), ...Object.keys(R.coef)]);
    for (const k of keys) coef[k] = (L.coef[k] || 0) - (R.coef[k] || 0);
    return { coef, rhs: R.const - L.const };
  }
  function scale(eq, m) { const out = { coef: {}, rhs: eq.rhs * m }; for (const k in eq.coef) out.coef[k] = eq.coef[k] * m; return out; }
  function addEq(A, B) {
    const out = { coef: {}, rhs: A.rhs + B.rhs };
    const keys = new Set([...Object.keys(A.coef), ...Object.keys(B.coef)]);
    for (const k of keys) out.coef[k] = (A.coef[k] || 0) + (B.coef[k] || 0);
    return out;
  }
  function subEq(A, B) { return addEq(A, scale(B, -1)); }
  function fmtEq(eq, vars) {
    let out = '', first = true;
    for (const v of vars) {
      const c = eq.coef[v] || 0;
      if (Math.abs(c) < 1e-10) continue;
      const absC = Math.abs(c);
      const cStr = Math.abs(absC - 1) < 1e-10 ? '' : frac(absC);
      const term = cStr + v;
      if (first) { out += (c < 0 ? '−' : '') + term; first = false; }
      else out += (c < 0 ? ' − ' : ' + ') + term;
    }
    if (first) out = '0';
    return out + ' = ' + frac(eq.rhs);
  }
  function splitEq(s) {
    const i = s.indexOf(' = ');
    if (i < 0) return { lhs: s, rhs: '' };
    return { lhs: s.slice(0, i), rhs: s.slice(i + 3) };
  }
  function stackLines(A_eq, B_eq, op, R_eq, label) {
    const A = splitEq(A_eq), B = splitEq(B_eq), R = splitEq(R_eq);
    const maxLHS = Math.max(A.lhs.length, B.lhs.length, R.lhs.length);
    const padR = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
    const dashLen = maxLHS + 14;
    return [
      '      ' + padR(A.lhs, maxLHS) + ' = ' + A.rhs,
      '    ' + op + ' ' + padR(B.lhs, maxLHS) + ' = ' + B.rhs,
      '    ' + '─'.repeat(dashLen),
      '      ' + padR(R.lhs, maxLHS) + ' = ' + R.rhs + '     ' + label,
    ];
  }

  function narrateSystem(eqs, vars) {
    const out = ['Given system:', ''];
    for (let i = 0; i < eqs.length; i++) out.push(`  (${i + 1})   ${fmtEq(eqs[i], vars)}`);
    out.push('');
    const allRows = [];
    let rows = eqs.map((e, i) => { const r = { coef: { ...e.coef }, rhs: e.rhs, label: String(i + 1) }; allRows.push(r); return r; });
    let counter = eqs.length;
    for (let stepIdx = 0; stepIdx < vars.length - 1; stepIdx++) {
      const elimVar = vars[stepIdx];
      let allValid = true;
      for (let k = 0; k + 1 < rows.length; k++) {
        const cA = rows[k].coef[elimVar] || 0, cB = rows[k + 1].coef[elimVar] || 0;
        if (Math.abs(cA) < 1e-10 || Math.abs(cB) < 1e-10) { allValid = false; break; }
      }
      if (!allValid) break;
      out.push(`Step ${stepIdx + 1}: Eliminate ${elimVar}`); out.push('');
      const nextRows = [];
      for (let k = 0; k + 1 < rows.length; k++) {
        const A = rows[k], B = rows[k + 1];
        const cA = A.coef[elimVar] || 0, cB = B.coef[elimVar] || 0;
        out.push(`  Stack (${A.label}) and (${B.label}):`);
        out.push(`    (${A.label})   ${fmtEq(A, vars)}`);
        out.push(`    (${B.label})   ${fmtEq(B, vars)}`);
        out.push('');
        const g2 = gcd(Math.abs(Math.round(cA)), Math.abs(Math.round(cB)));
        const mA = Math.abs(Math.round(cB)) / g2, mB = Math.abs(Math.round(cA)) / g2;
        const A2 = scale(A, mA), B2 = scale(B, mB);
        const sameSign = cA * cB > 0;
        const result = sameSign ? subEq(B2, A2) : addEq(B2, A2);
        if (mA !== 1 || mB !== 1) {
          out.push(`  Multiply to match ${elimVar}-coefficients:`);
          out.push(`    ${mA} × (${A.label}):   ${fmtEq(A2, vars)}`);
          out.push(`    ${mB} × (${B.label}):   ${fmtEq(B2, vars)}`);
          out.push('');
        }
        counter++;
        const newLabel = `(${counter})`;
        const aDesc = mA === 1 ? `(${A.label})` : `${mA} × (${A.label})`;
        const bDesc = mB === 1 ? `(${B.label})` : `${mB} × (${B.label})`;
        if (sameSign) {
          out.push(`  Subtract ${aDesc} from ${bDesc}:`);
          stackLines(fmtEq(B2, vars), fmtEq(A2, vars), '−', fmtEq(result, vars), newLabel).forEach(l => out.push(l));
        } else {
          out.push(`  Add ${aDesc} and ${bDesc}:`);
          stackLines(fmtEq(A2, vars), fmtEq(B2, vars), '+', fmtEq(result, vars), newLabel).forEach(l => out.push(l));
        }
        out.push('');
        const newRow = { coef: result.coef, rhs: result.rhs, label: String(counter) };
        nextRows.push(newRow); allRows.push(newRow);
      }
      rows = nextRows;
    }
    const sol = {};
    let guard = 0;
    while (Object.keys(sol).length < vars.length && guard++ < 20) {
      let found = false;
      for (const row of allRows) {
        const unknowns = vars.filter(v => Math.abs(row.coef[v] || 0) > 1e-10 && sol[v] === undefined);
        if (unknowns.length !== 1) continue;
        const v = unknowns[0], cV = row.coef[v];
        const knownSubs = []; let sumKnown = 0;
        for (const other of vars) { if (other === v) continue; if (sol[other] !== undefined) { knownSubs.push(`${other} = ${frac(sol[other])}`); sumKnown += (row.coef[other] || 0) * sol[other]; } }
        const rhsAfter = row.rhs - sumKnown, val = rhsAfter / cV;
        sol[v] = val;
        out.push(`From (${row.label}):`); out.push(`  ${fmtEq(row, vars)}`);
        if (knownSubs.length > 0) {
          out.push(`  Substitute ${knownSubs.join(', ')}:`);
          let subLine = '', first = true;
          for (const vv of vars) {
            const c = row.coef[vv] || 0; if (Math.abs(c) < 1e-10) continue;
            let term;
            if (vv !== v && sol[vv] !== undefined) {
              const cStr = Math.abs(Math.abs(c) - 1) < 1e-10 ? '' : frac(Math.abs(c));
              const vStr = frac(sol[vv]);
              term = Math.abs(c) === 1 ? `(${vStr})` : `${cStr}(${vStr})`;
            } else {
              const absC = Math.abs(c); const cStr = Math.abs(absC - 1) < 1e-10 ? '' : frac(absC); term = cStr + vv;
            }
            if (first) { subLine += (c < 0 ? '−' : '') + term; first = false; }
            else subLine += (c < 0 ? ' − ' : ' + ') + term;
          }
          out.push(`    ${subLine} = ${frac(row.rhs)}`);
          let evalLine = '', first2 = true;
          for (const vv of vars) {
            const c = row.coef[vv] || 0; if (Math.abs(c) < 1e-10) continue;
            let term, isNeg;
            if (vv !== v && sol[vv] !== undefined) { const prod = c * sol[vv]; term = frac(Math.abs(prod)); isNeg = prod < 0; }
            else { const absC = Math.abs(c); const cStr = Math.abs(absC - 1) < 1e-10 ? '' : frac(absC); term = cStr + vv; isNeg = c < 0; }
            if (first2) { evalLine += (isNeg ? '−' : '') + term; first2 = false; }
            else evalLine += (isNeg ? ' − ' : ' + ') + term;
          }
          if (evalLine !== subLine) out.push(`    ${evalLine} = ${frac(row.rhs)}`);
          if (Math.abs(sumKnown) > 1e-10) {
            const absC = Math.abs(cV); const cStr = Math.abs(absC - 1) < 1e-10 ? '' : frac(absC);
            const combinedLine = (cV < 0 ? '−' : '') + cStr + v + (sumKnown < 0 ? ' − ' : ' + ') + frac(Math.abs(sumKnown));
            if (combinedLine !== evalLine) out.push(`    ${combinedLine} = ${frac(row.rhs)}`);
          }
          if (Math.abs(cV - 1) > 1e-10) { const cVStr = Math.abs(cV + 1) < 1e-10 ? '−' : frac(cV); out.push(`    ${cVStr}${v} = ${frac(rhsAfter)}`); }
        } else {
          if (Math.abs(cV - 1) > 1e-10) out.push(`  Divide both sides by ${frac(cV)}:`);
        }
        out.push(`    ${v} = ${frac(val)}`); out.push('');
        found = true; break;
      }
      if (!found) break;
    }
    out.push(`Solution:   ${vars.map(v => `${v} = ${frac(sol[v])}`).join(',   ')}`);
    return { answers: vars.map(v => ({ v, val: frac(sol[v]) })), work: out };
  }

  function narrateSubstitution(eqs, vars, origLines) {
    const out = ['Given system:', ''];
    origLines.forEach((l, i) => out.push(`  (${i + 1})   ${l}`));
    out.push('');
    const nd = window.nerdamer;

    let isoIdx = -1, isoVar = null, isoExpr = null;
    for (let i = 0; i < origLines.length; i++) {
      const parts = origLines[i].split('=');
      if (parts.length !== 2) continue;
      const lhs = parts[0].trim().toLowerCase(), rhs = parts[1].trim().toLowerCase();
      for (const v of vars) {
        if (lhs === v) { isoIdx = i; isoVar = v; isoExpr = parts[1].trim(); break; }
        if (rhs === v) { isoIdx = i; isoVar = v; isoExpr = parts[0].trim(); break; }
      }
      if (isoVar) break;
    }

    if (!isoVar) {
      let best = null;
      for (let i = 0; i < eqs.length; i++) {
        for (const v of vars) {
          const c = Math.abs(eqs[i].coef[v] || 0);
          if (Math.abs(c - 1) < 1e-9) {
            if (!best || c < best.coef) best = { idx: i, v, coef: c };
          }
        }
      }
      if (!best) return narrateSystem(eqs, vars);
      isoIdx = best.idx;
      isoVar = best.v;
      const eq = eqs[isoIdx];
      const c = eq.coef[isoVar];
      let rhsParts = [];
      for (const other of vars) {
        if (other === isoVar) continue;
        const co = eq.coef[other] || 0;
        if (Math.abs(co) < 1e-9) continue;
        rhsParts.push({ v: other, c: -co });
      }
      const kConst = -eq.rhs;
      const m = c;
      let exprPieces = [];
      for (const rp of rhsParts) {
        const cc = rp.c / m;
        const absC = Math.abs(cc);
        const cStr = Math.abs(absC - 1) < 1e-9 ? '' : frac(absC);
        exprPieces.push({ sign: cc < 0 ? '−' : '+', str: cStr + rp.v, c: cc });
      }
      const kc = kConst / m;
      if (Math.abs(kc) > 1e-9) exprPieces.push({ sign: kc < 0 ? '−' : '+', str: frac(Math.abs(kc)), c: kc });
      let exprStr = '';
      exprPieces.forEach((p, i) => {
        if (i === 0) exprStr += (p.sign === '−' ? '−' : '') + p.str;
        else exprStr += ' ' + p.sign + ' ' + p.str;
      });
      if (!exprStr) exprStr = '0';
      isoExpr = exprStr;

      const eqLine = origLines[isoIdx];
      out.push(`Solve (${isoIdx + 1}) for ${isoVar}:`);
      out.push(`  ${eqLine}`);
      const terms = [];
      for (const other of vars) {
        if (other === isoVar) continue;
        const co = eq.coef[other] || 0;
        if (Math.abs(co) < 1e-9) continue;
        const absC = Math.abs(co);
        const cStr = Math.abs(absC - 1) < 1e-9 ? '' : frac(absC);
        terms.push({ c: co, str: cStr + other });
      }
      if (terms.length) {
        const t0 = terms[0];
        const op = t0.c > 0 ? 'Subtract' : 'Add';
        const letter = t0.str.match(/[a-z]/i)[0];
        const coefStr = Math.abs(Math.abs(t0.c) - 1) < 1e-9 ? '' : frac(Math.abs(t0.c));
        out.push(`  ${op} ${coefStr}${letter} ${t0.c > 0 ? 'from' : 'to'} both sides:`);
      }
      out.push(`  ${isoVar} = ${exprStr}`);
      out.push('');
    } else {
      out.push(`From (${isoIdx + 1}):   ${isoVar} = ${isoExpr}`);
      out.push('');
    }

    const otherIdx = origLines.findIndex((_, i) => i !== isoIdx);
    const otherLine = origLines[otherIdx];
    const otherVar = vars.find(v => v !== isoVar);

    out.push(`Substitute ${isoVar} = ${isoExpr} into (${otherIdx + 1}):`);
    out.push('');
    const subbed = otherLine.replace(new RegExp(`(?<![a-z])${isoVar}(?![a-z])`, 'gi'), `(${isoExpr})`);
    out.push(`  ${subbed}`);
    out.push('');

    let simplified = subbed;
    try {
      const eqParts = subbed.split('=');
      simplified = nd(eqParts[0]).expand().toString().replace(/\*/g, '') + ' = ' + eqParts[1].trim();
    } catch (e) {}
    out.push('Simplify:');
    out.push(`  ${simplified}`);
    out.push('');

    let otherVal;
    try { otherVal = nerdamerVals(nd.solve(subbed, otherVar))[0]; } catch (e) {}
    if (!otherVal) return narrateSystem(eqs, vars);

    try {
      const eqParts = simplified.split('=');
      const lhs = eqParts[0], rhs = parseFloat(eqParts[1]);
      const at0 = Number(nd(lhs).sub(otherVar, 0).evaluate().text('decimals'));
      const at1 = Number(nd(lhs).sub(otherVar, 1).evaluate().text('decimals'));
      const cC = at0, mC = at1 - cC;
      if (Math.abs(cC) > 1e-10) {
        const op = cC > 0 ? 'Subtract' : 'Add';
        out.push(`${op} ${frac(Math.abs(cC))} ${cC > 0 ? 'from' : 'to'} both sides:`);
        out.push(`  ${frac(mC)}${otherVar} = ${frac(rhs - cC)}`);
        out.push('');
      }
      if (Math.abs(mC - 1) > 1e-10 && Math.abs(mC) > 1e-10) {
        out.push(`Divide both sides by ${frac(mC)}:`);
        out.push(`  ${otherVar} = ${frac((rhs - cC) / mC)}`);
        out.push('');
      }
    } catch (e) {}

    out.push(`  ${otherVar} = ${otherVal}`);
    out.push('');

    out.push(`Substitute ${otherVar} = ${otherVal} into (${isoIdx + 1}):`);
    out.push(`  ${isoVar} = ${isoExpr}`);
    let isoVal = '?';
    try { isoVal = nerdamerVals(nd(isoExpr).sub(otherVar, otherVal).evaluate())[0] || '?'; } catch (e) {}
    out.push(`  ${isoVar} = ${isoVal}`);
    out.push('');

    const sol = {}; sol[isoVar] = isoVal; sol[otherVar] = otherVal;
    out.push(`Solution:   ${(isoVar < otherVar ? [isoVar, otherVar] : [otherVar, isoVar]).map(v => `${v} = ${sol[v]}`).join(',   ')}`);
    return { answers: vars.map(v => ({ v, val: sol[v] })), work: out };
  }

  function nSystem(text) {
    const isSub = /by substitution/i.test(text);
    const lines = text.split('\n').filter(l => /=/.test(l) && /[a-z]/i.test(l) && !/^\s*=/.test(l));
    const eqs = [], origLines = [];
    for (const l of lines) {
      const eq = parseEqFull(l);
      if (eq && Object.keys(eq.coef).length > 0) { eqs.push(eq); origLines.push(l); }
    }
    if (eqs.length < 2) return null;
    const varSet = new Set();
    for (const e of eqs) for (const v of Object.keys(e.coef)) varSet.add(v);
    const vars = [...varSet].sort();
    if (eqs.length !== vars.length) return null;
    try { return isSub ? narrateSubstitution(eqs, vars, origLines) : narrateSystem(eqs, vars); }
    catch (err) { console.warn('narrate error', err); return null; }
  }

  function nSingle(text) {
    const nd = window.nerdamer;
    const eqLine = text.split('\n').find(l => /=/.test(l) && /[a-z]/i.test(l) && !/^\s*=/.test(l));
    if (!eqLine) { console.log('nSingle: no equation'); return null; }
    let eq = cleanLine(eqLine);
    eq = eq.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, '($1/$2)');
    console.log('nSingle: solving', eq);
    const vars = [...new Set(eq.match(/[a-z]/gi) || [])].map(v => v.toLowerCase());
    if (vars.length !== 1) { console.log('nSingle: not single var', vars); return null; }
    const v = vars[0];
    let sol;
    try { sol = nd.solve(eq, v); } catch (err) { console.log('nSingle: nerdamer error', err.message); return null; }
    const vals = nerdamerVals(sol);
    if (!vals.length) { console.log('nSingle: no solutions'); return null; }
    const answer = { v, val: vals.join(', ') };
    const parts = eq.split('=');
    if (parts.length !== 2) return { answers: [answer], work: ['Equation:', '  ' + eq, '', 'Solution:', `  ${v} = ${vals.join(', ')}`] };
    const lhsRaw = parts[0].trim(), rhsRaw = parts[1].trim();
    function toNum(o) { try { return Number(o.text('decimals')); } catch (e) { return Number(o.toString()); } }
    function analyze(expr) {
      try {
        const f0 = toNum(nd(expr).sub(v, 0).evaluate());
        const f1 = toNum(nd(expr).sub(v, 1).evaluate());
        const f2 = toNum(nd(expr).sub(v, 2).evaluate());
        if (Math.abs((f2 - f1) - (f1 - f0)) > 1e-7) return null;
        return { coef: f1 - f0, constant: f0 };
      } catch (e) { return null; }
    }
    function fmtLin(a, b) {
      const out = [];
      if (Math.abs(a) > 1e-10) { if (Math.abs(a - 1) < 1e-10) out.push(v); else if (Math.abs(a + 1) < 1e-10) out.push('−' + v); else out.push(frac(a) + v); }
      if (Math.abs(b) > 1e-10) { if (out.length === 0) out.push(frac(b)); else out.push((b < 0 ? '−' : '+') + ' ' + frac(Math.abs(b))); }
      if (out.length === 0) out.push('0');
      return out.join(' ');
    }
    function expanded(expr) {
      try {
        return nd(expr).expand().toString().replace(/(\d)\s*\*\s*([a-z])/g, '$1$2').replace(/\s*\*\s*/g, ' ').replace(/\s*\+\s*/g, ' + ').replace(/\s*-\s*/g, ' − ').replace(/−\s*−/g, '+').trim();
      } catch (e) { return null; }
    }
    const L = analyze(lhsRaw), R = analyze(rhsRaw);
    if (!L || !R) return { answers: [answer], work: ['Equation:', '  ' + eq, '', 'Solution:', `  ${v} = ${vals.join(', ')}`] };
    const work = ['Equation:', '  ' + eq, ''];
    const hasParens = /\(/.test(eq);
    let workingL = L, workingR = R;
    if (hasParens) {
      const lhsExp = expanded(lhsRaw), rhsExp = expanded(rhsRaw);
      work.push('Distribute and combine like terms:');
      if (lhsExp && rhsExp) work.push(`  ${lhsExp} = ${rhsExp}`);
      else work.push(`  ${fmtLin(L.coef, L.constant)} = ${fmtLin(R.coef, R.constant)}`);
      work.push('');
    }
    if (Math.abs(workingL.coef) < 1e-10 && Math.abs(workingR.coef) > 1e-10) {
      const a = workingR.coef, b = workingR.constant, c = workingL.constant;
      if (hasParens) { work.push('Rewrite with the variable on the left:'); work.push(`  ${fmtLin(a, b)} = ${frac(c)}`); work.push(''); }
      if (Math.abs(b) > 1e-10) { work.push(`Subtract ${frac(b)} from both sides:`); work.push(`  ${fmtLin(a, b)} − ${frac(b)} = ${frac(c)} − ${frac(b)}`); work.push(`  ${fmtLin(a, 0)} = ${frac(c - b)}`); work.push(''); }
      if (Math.abs(a - 1) > 1e-10) { if (Math.abs(a) < 1) work.push(`Multiply both sides by ${frac(1/a)}:`); else work.push(`Divide both sides by ${frac(a)}:`); work.push(`  ${v} = ${frac((c - b) / a)}`); work.push(''); }
    } else if (Math.abs(workingR.coef) < 1e-10 && Math.abs(workingL.coef) > 1e-10) {
      const a = workingL.coef, b = workingL.constant, c = workingR.constant;
      if (Math.abs(b) > 1e-10) { work.push(`Subtract ${frac(b)} from both sides:`); work.push(`  ${fmtLin(a, b)} − ${frac(b)} = ${frac(c)} − ${frac(b)}`); work.push(`  ${fmtLin(a, 0)} = ${frac(c - b)}`); work.push(''); }
      if (Math.abs(a - 1) > 1e-10) { if (Math.abs(a) < 1) work.push(`Multiply both sides by ${frac(1/a)}:`); else work.push(`Divide both sides by ${frac(a)}:`); work.push(`  ${v} = ${frac((c - b) / a)}`); work.push(''); }
    } else if (Math.abs(workingL.coef) > 1e-10 && Math.abs(workingR.coef) > 1e-10) {
      const a1 = workingL.coef, b1 = workingL.constant, a2 = workingR.coef, b2 = workingR.constant;
      const a = a1 - a2, b = b1, c = b2;
      work.push(`Subtract ${frac(a2)}${v} from both sides:`);
      work.push(`  ${fmtLin(a1, b1)} − ${frac(a2)}${v} = ${fmtLin(a2, b2)} − ${frac(a2)}${v}`);
      work.push(`  ${fmtLin(a, b)} = ${frac(c)}`); work.push('');
      if (Math.abs(b) > 1e-10) { work.push(`Subtract ${frac(b)} from both sides:`); work.push(`  ${fmtLin(a, b)} − ${frac(b)} = ${frac(c)} − ${frac(b)}`); work.push(`  ${fmtLin(a, 0)} = ${frac(c - b)}`); work.push(''); }
      if (Math.abs(a - 1) > 1e-10) { if (Math.abs(a) < 1) work.push(`Multiply both sides by ${frac(1/a)}:`); else work.push(`Divide both sides by ${frac(a)}:`); work.push(`  ${v} = ${frac((c - b) / a)}`); work.push(''); }
    }
    work.push(`Solution:   ${v} = ${vals.join(', ')}`);
    return { answers: [answer], work };
  }

  function nQuadratic(text) {
    const nd = window.nerdamer;
    const m = text.match(/([^\n]*x\s*[\^²][^\n]*)/i);
    if (!m) return null;
    let eq = cleanLine(m[1]).replace(/x\s*²/g, 'x^2');
    if (!eq.includes('=')) eq += '=0';
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const vals = nerdamerVals(sol);
    return { answers: [{ v: 'x', val: vals.join(', ') }], work: ['Equation:', `  ${eq}`, '', 'Solutions:', ...vals.map(v => `  x = ${v}`)] };
  }

  function nSimplify(text) {
    const nd = window.nerdamer;
    const m = text.match(/([^\n]*(?:[a-z]|[\(\)])[^\n]*)/i);
    if (!m) return null;
    const expr = cleanLine(m[1]).replace(/^.*?:\s*/, '');
    let out; try { out = nd(expr).toString(); } catch (err) { return null; }
    return { answers: [{ v: 'simplified', val: out }], work: ['Original:', `  ${expr}`, '', 'Simplified:', `  ${out}`] };
  }

  function nFactor(text) {
    const nd = window.nerdamer;
    const m = text.match(/([^\n]*(?:x|[a-z])[^\n]*)/i);
    if (!m) return null;
    const expr = cleanLine(m[1]).replace(/^.*?:\s*/, '').replace(/=0$/, '');
    let out; try { out = nd(`factor(${expr})`).toString(); } catch (err) { return null; }
    return { answers: [{ v: 'factored', val: out }], work: ['Original:', `  ${expr}`, '', 'Factored:', `  ${out}`] };
  }

  function manualDistance(text) {
    const pts = text.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g);
    if (!pts || pts.length < 2) return null;
    const [a, b] = pts.slice(0, 2).map(p => p.replace(/[()]/g, '').split(',').map(Number));
    const dx = b[0] - a[0], dy = b[1] - a[1], dist = Math.hypot(dx, dy);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return { answers: [{ v: 'distance', val: frac(dist) }, { v: 'midpoint', val: `(${frac(mid[0])}, ${frac(mid[1])})` }],
      work: ['Points:', `  (${a[0]}, ${a[1]})   (${b[0]}, ${b[1]})`, '', 'Distance:', `  d = √((${dx})² + (${dy})²) = ${frac(dist)}`, '', 'Midpoint:', `  M = ((${a[0]}+${b[0]})/2, (${a[1]}+${b[1]})/2) = (${frac(mid[0])}, ${frac(mid[1])})`] };
  }

  function manualSlope(text) {
    const pts = text.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g);
    if (!pts || pts.length < 2) return null;
    const [a, b] = pts.slice(0, 2).map(p => p.replace(/[()]/g, '').split(',').map(Number));
    const dy = b[1] - a[1], dx = b[0] - a[0];
    const slope = dx === 0 ? 'undefined' : frac(dy / dx);
    return { answers: [{ v: 'slope', val: slope }],
      work: ['Points:', `  (${a[0]}, ${a[1]})   (${b[0]}, ${b[1]})`, '', 'm = (y₂ − y₁) / (x₂ − x₁)', `  m = (${b[1]} − ${a[1]}) / (${b[0]} − ${a[0]})`, `  m = ${dy} / ${dx}`, `  m = ${slope}`] };
  }

  function solveInequality(text) {
    const m = text.match(/([^\n]*[<>≤≥][^\n]*)/);
    if (!m) return null;
    let ineq = cleanLine(m[1]).replace(/≤/g, '<=').replace(/≥/g, '>=');
    const vars = [...new Set(ineq.match(/[a-z]/gi) || [])];
    if (vars.length !== 1) return null;
    const v = vars[0].toLowerCase();
    const opMatch = ineq.match(/<=|>=|<|>/);
    const op = opMatch ? opMatch[0] : '=';
    const eq = ineq.replace(/<=|>=|<|>/, '=');
    let sol; try { sol = window.nerdamer.solve(eq, v); } catch (err) { return null; }
    const vals = nerdamerVals(sol);
    const boundary = vals.join(', ');
    return { answers: [{ v, val: `${op} ${boundary}` }],
      work: ['Inequality:', `  ${ineq}`, '', 'Solve the boundary equation:', `  ${eq}`, `  ${v} = ${boundary}`, '', 'Answer:', `  ${v} ${op} ${boundary}`] };
  }

  function solveCompoundIneq(text) {
    const m = text.match(/(-?\d+\.?\d*)\s*([<>]\s*=?)\s*([^<>\n]+?)\s*([<>]\s*=?)\s*(-?\d+\.?\d*)/);
    if (!m) return null;
    const aStr = m[1], op1 = m[2].replace(/\s/g, ''), midStr = m[3].trim(), op2 = m[4].replace(/\s/g, ''), bStr = m[5];
    const a = parseFloat(aStr), b = parseFloat(bStr);
    const nd = window.nerdamer;
    const mid = midStr.replace(/\s/g, '');
    let cC, mC;
    try {
      cC = Number(nd(mid).sub('x', 0).evaluate().text('decimals'));
      mC = Number(nd(mid).sub('x', 1).evaluate().text('decimals')) - cC;
    } catch (e) { return null; }
    if (Math.abs(mC) < 1e-10) return null;
    let e1Op = flipOp(op1), e2Op = op2;
    if (mC < 0) { e1Op = flipOp(e1Op); e2Op = flipOp(e2Op); }
    const v1 = (a - cC) / mC, v2 = (b - cC) / mC;
    let low, high, loOp, hiOp;
    if (v1 <= v2) { low = v1; loOp = e1Op; high = v2; hiOp = e2Op; }
    else { low = v2; loOp = e2Op; high = v1; hiOp = e1Op; }
    const ans = `${frac(low)} ${loOp} x ${hiOp} ${frac(high)}`;
    const work = ['Compound inequality:', `  ${aStr} ${op1} ${midStr} ${op2} ${bStr}`, ''];
    if (Math.abs(cC) > 1e-10) {
      work.push(`Subtract ${frac(cC)} from all three parts:`);
      work.push(`  ${frac(a - cC)} ${op1} ${frac(mC)}x ${op2} ${frac(b - cC)}`);
      work.push('');
    }
    if (Math.abs(mC - 1) > 1e-10 && Math.abs(mC) > 1e-10) {
      work.push(mC < 0 ? `Divide all three parts by ${frac(mC)} (flip both inequalities):` : `Divide all three parts by ${frac(mC)}:`);
      work.push('');
    }
    work.push('Solution:', `  ${ans}`);
    return { answers: [{ v: 'x', val: ans }], work };
  }

  function solveAbsEq(text) {
    const eqLine = text.split('\n').find(l => /\|.*\|/.test(l) && /=/.test(l));
    if (!eqLine) return null;
    const eq = cleanLine(eqLine).replace(/\s+/g, '');
    const innerM = eq.match(/\|([^|]+)\|/);
    if (!innerM) return null;
    const inner = innerM[1];
    const nd = window.nerdamer;
    const vars = [...new Set(eq.match(/[a-z]/gi) || [])].map(c => c.toLowerCase());
    if (!vars.length) return null;
    const v = vars[0];
    const replaced = eq.replace(/\|[^|]+\|/, 'K');
    let rhsStr;
    try { rhsStr = nerdamerVals(nd.solve(replaced, 'K'))[0]; } catch (e) { return null; }
    if (!rhsStr) return null;
    const rhsVal = parseFloat(rhsStr);
    if (isNaN(rhsVal)) return null;
    let sol1, sol2;
    try {
      sol1 = nerdamerVals(nd.solve(`${inner}=${rhsVal}`, v))[0];
      sol2 = nerdamerVals(nd.solve(`${inner}=−${rhsVal}`, v))[0];
    } catch (e) { return null; }
    if (rhsVal < 0) {
      return { answers: [{ v, val: 'no solution' }], work: ['Absolute value equation:', `  ${eq}`, '', 'Absolute value equals a negative — no solution.'] };
    }
    const work = ['Absolute value equation:', `  ${eq}`, ''];
    work.push('Isolate the absolute value:');
    work.push(`  |${inner}| = ${frac(rhsVal)}`);
    work.push('');
    work.push('Split into two cases:');
    if (rhsVal === 0) {
      work.push(`  ${inner} = 0    →   ${v} = ${sol1}`);
      return { answers: [{ v, val: sol1 }], work };
    }
    work.push(`  Case 1:   ${inner} = ${frac(rhsVal)}    →   ${v} = ${sol1}`);
    work.push(`  Case 2:   ${inner} = −${frac(rhsVal)}   →   ${v} = ${sol2}`);
    work.push('');
    work.push('Check both in the original equation (extraneous solutions may occur).');
    work.push('');
    work.push(`Solution:   ${v} = ${sol1}, ${v} = ${sol2}`);
    return { answers: [{ v, val: `${sol1}, ${sol2}` }], work };
  }

  function solveAbsIneq(text) {
    const m = text.match(/\|\s*([^|]+?)\s*\|\s*(<=|>=|<|>)\s*(-?\d+\.?\d*)/);
    if (!m) return null;
    const inner = m[1].replace(/\s/g, '');
    const op = m[2];
    const c = parseFloat(m[3]);
    const nd = window.nerdamer;
    let s1, s2;
    try {
      s1 = nerdamerVals(nd.solve(`${inner}=${c}`, 'x'))[0];
      s2 = nerdamerVals(nd.solve(`${inner}=−${c}`, 'x'))[0];
    } catch (e) { return null; }
    if (!s1 || !s2) return null;
    const v1 = parseFloat(s1), v2 = parseFloat(s2);
    if (isNaN(v1) || isNaN(v2)) return null;
    const [lo, hi] = [Math.min(v1, v2), Math.max(v1, v2)];
    const work = ['Absolute value inequality:', `  |${inner}| ${op} ${c}`, ''];
    let ans;
    if (op === '<' || op === '<=') {
      work.push('Rewrite as a compound inequality:');
      work.push(`  −${c} ${op} ${inner} ${op} ${c}`);
      work.push('');
      work.push('Solve each side:');
      work.push(`  ${inner} ${op} ${c}      →   x ${op} ${frac(hi)}`);
      work.push(`  ${inner} ${flipOp(op)} −${c}   →   x ${flipOp(op)} ${frac(lo)}`);
      work.push('');
      ans = `${frac(lo)} ${op} x ${op} ${frac(hi)}`;
      work.push('Solution:', `  ${ans}`);
    } else {
      work.push('Split into two cases:');
      work.push(`  Case 1:   ${inner} ${op} ${c}      →   x ${op} ${frac(hi)}`);
      work.push(`  Case 2:   ${inner} ${flipOp(op)} −${c}   →   x ${flipOp(op)} ${frac(lo)}`);
      work.push('');
      ans = `x ${op} ${frac(hi)}   or   x ${flipOp(op)} ${frac(lo)}`;
      work.push('Solution:', `  ${ans}`);
    }
    return { answers: [{ v: 'x', val: ans }], work };
  }

  function solveAbsolute(text) {
    const m = text.match(/\|([^|]+)\|\s*=\s*(-?\d+\.?\d*)/);
    if (!m) return null;
    const nd = window.nerdamer;
    const inner = cleanLine(m[1]).replace(/\s/g, '');
    const rhs = parseFloat(m[2]);
    if (rhs < 0) return { answers: [{ v: 'x', val: 'no solution' }], work: ['No solution — absolute value cannot be negative.'] };
    let sol1, sol2;
    try {
      sol1 = nerdamerVals(nd.solve(`${inner}=${rhs}`, 'x'))[0];
      sol2 = nerdamerVals(nd.solve(`${inner}=−${rhs}`, 'x'))[0];
    } catch (err) { return null; }
    return { answers: [{ v: 'x', val: `${sol1},   ${sol2}` }],
      work: ['Absolute value equation:', `  |${inner}| = ${rhs}`, '', 'Split into two cases:', `  Case 1:   ${inner} = ${rhs}    →   x = ${sol1}`, `  Case 2:   ${inner} = −${rhs}   →   x = ${sol2}`] };
  }

  function solveLog(text) {
    const nd = window.nerdamer;
    const m = text.match(/[^\n]*(?:\blog\b|\bln\b)[^\n]*=[^\n]*/i);
    if (!m) return null;
    const eq = cleanLine(m[0]).replace(/\s+/g, '');
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const vals = nerdamerVals(sol);
    if (!vals.length) return null;
    return { answers: [{ v: 'x', val: vals.join(', ') }], work: ['Log equation:', `  ${eq}`, '', 'Solve:', '', ...vals.map(v => `  x = ${v}`)] };
  }

  function solveExp(text) {
    const nd = window.nerdamer;
    const m = text.match(/[^\n]*\d+\s*\^\s*\(?\s*x[^\n]*=[^\n]*/i) || text.match(/[^\n]*e\s*\^\s*\(?\s*x[^\n]*=[^\n]*/i);
    if (!m) return null;
    const eq = cleanLine(m[0]).replace(/\s+/g, '');
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const vals = nerdamerVals(sol);
    if (!vals.length) return null;
    return { answers: [{ v: 'x', val: vals.join(', ') }], work: ['Exponential equation:', `  ${eq}`, '', 'Solve:', '', ...vals.map(v => `  x = ${v}`)] };
  }

  function solveRadical(text) {
    const nd = window.nerdamer;
    const m = text.match(/[^\n]*sqrt\s*\([^\n]*=[^\n]*/i);
    if (!m) return null;
    const eq = cleanLine(m[0]).replace(/\s+/g, '');
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const vals = nerdamerVals(sol);
    if (!vals.length) return null;
    return { answers: [{ v: 'x', val: vals.join(', ') }], work: ['Radical equation:', `  ${eq}`, '', 'Solve:', '', ...vals.map(v => `  x = ${v}`), '', '(check for extraneous solutions)'] };
  }

  function solveRational(text) {
    const nd = window.nerdamer;
    const m = text.match(/[^\n]*\/\s*\([^)]*x[^\n]*=[^\n]*/i) || text.match(/[^\n]*\/\s*[a-z0-9][^\n]*=[^\n]*/i);
    if (!m) return null;
    const eq = cleanLine(m[0]).replace(/\s+/g, '');
    if (!/\/\s*\(?[^=]*x/.test(eq)) return null;
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const vals = nerdamerVals(sol);
    if (!vals.length) return null;
    return { answers: [{ v: 'x', val: vals.join(', ') }], work: ['Rational equation:', `  ${eq}`, '', 'Solve:', '', ...vals.map(v => `  x = ${v}`), '', '(check excluded values)'] };
  }

  function solveTrig(text) {
    const nd = window.nerdamer;
    const m = text.match(/[^\n]*(?:\bsin\b|\bcos\b|\btan\b)[^\n]*=[^\n]*/i);
    if (!m) return null;
    const eq = cleanLine(m[0]).replace(/\s+/g, '');
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const vals = nerdamerVals(sol);
    if (!vals.length) return null;
    return { answers: [{ v: 'x', val: vals.join(', ') }], work: ['Trig equation:', `  ${eq}`, '', 'General solution:', ...vals.map(v => `  x = ${v}`), '', '(n is any integer)'] };
  }

  function solveSystemIneq(text) {
    const lines = text.split('\n');
    const ineqs = [];
    for (const l of lines) {
      const m = l.match(/[+-]?[\d.]*\s*[a-z]\s*(?:[+-]\s*[\d.]*\s*[a-z])*\s*(<=|>=|<|>|≤|≥)\s*-?[\d.]+/);
      if (m) ineqs.push(cleanLine(l).replace(/≤/g, '<=').replace(/≥/g, '>='));
    }
    if (ineqs.length < 2) return null;
    const work = ['System of inequalities:'];
    ineqs.forEach((ineq, i) => work.push(`  (${i+1})   ${ineq}`));
    work.push('', 'Graph the boundary lines and shade the overlap region.');
    return { answers: [{ v: 'system', val: 'see work' }], work };
  }

  function solvePolyOps(text) {
    const nd = window.nerdamer;
    const m = text.match(/(?:add|subtract|multiply|divide|expand|simplify|rewrite in standard form)[:\s]+([^\n]+)/i) || text.match(/(\([^\)]*[a-z][^\)]*\)\s*[\+\-\*\/×]\s*\([^\)]*[a-z][^\)]*\))/);
    if (!m) return null;
    const expr = cleanLine(m[1] || m[0]).replace(/^.*?:\s*/, '');
    let out;
    try { out = nd(expr).expand().toString(); } catch (err) { return null; }
    return { answers: [{ v: 'result', val: out }], work: ['Expression:', `  ${expr}`, '', 'Simplify:', `  ${out}`] };
  }

  function solveComposition(text) {
    const nd = window.nerdamer;
    const fDef = text.match(/f\s*\(\s*x\s*\)\s*=\s*([^,\n]+)/i);
    const gDef = text.match(/g\s*\(\s*x\s*\)\s*=\s*([^,\n]+)/i);
    const comp = text.match(/f\s*\(\s*g\s*\(\s*x\s*\)\s*\)/i);
    const inv = text.match(/f\s*(?:-1|⁻¹|\^\{-1\})\s*\(\s*x\s*\)/i);
    const evalAt = text.match(/f\s*\(\s*(-?\d+)\s*\)/i);
    if (comp && fDef && gDef) {
      const fexpr = cleanLine(fDef[1]), gexpr = cleanLine(gDef[1]);
      let out;
      try { out = nd(fexpr).sub('x', `(${gexpr})`).expand().toString(); } catch(e) { return null; }
      return { answers: [{ v: 'f(g(x))', val: out }], work: ['f(x) = ' + fexpr, 'g(x) = ' + gexpr, '', 'f(g(x)) = ' + fexpr.replace(/x/g, `(${gexpr})`), '        = ' + out] };
    }
    if (inv && fDef) {
      const fexpr = cleanLine(fDef[1]);
      let out;
      try { out = nerdamerVals(nd.solve(`y=${fexpr}`, 'x')).join(', '); } catch(e) { return null; }
      return { answers: [{ v: 'f⁻¹(x)', val: out }], work: ['f(x) = ' + fexpr, '', 'Solve for x:', `  y = ${fexpr}`, `  x = ${out}`] };
    }
    if (evalAt && fDef) {
      const fexpr = cleanLine(fDef[1]);
      const xVal = evalAt[1];
      let out;
      try { out = nd(fexpr).sub('x', xVal).evaluate().toString(); } catch(e) { return null; }
      return { answers: [{ v: `f(${xVal})`, val: out }], work: ['f(x) = ' + fexpr, '', `f(${xVal}) = ${fexpr.replace(/x/g, `(${xVal})`)}`, `        = ${out}`] };
    }
    return null;
  }

  function solveStats(text) {
    const nums = text.match(/-?\d+\.?\d*(?:\s*,\s*-?\d+\.?\d*){2,}/);
    if (!nums) return null;
    const arr = nums[0].split(',').map(s => parseFloat(s.trim()));
    if (arr.length < 2) return null;
    const sorted = [...arr].sort((a,b) => a-b);
    const n = arr.length, sum = arr.reduce((a,b) => a+b, 0);
    const mean = sum / n;
    const median = n % 2 ? sorted[(n-1)/2] : (sorted[n/2-1] + sorted[n/2]) / 2;
    const freq = {};
    for (const x of arr) freq[x] = (freq[x]||0) + 1;
    const maxF = Math.max(...Object.values(freq));
    const modes = Object.keys(freq).filter(k => freq[k] === maxF).map(Number);
    const range = sorted[n-1] - sorted[0];
    const variance = n > 1 ? arr.reduce((a,b) => a + (b-mean)**2, 0) / (n-1) : 0;
    const stdev = Math.sqrt(variance);
    const modeStr = modes.length === arr.length && maxF === 1 ? 'none' : modes.join(', ');
    return { answers: [
      { v: 'mean', val: frac(mean) },
      { v: 'median', val: frac(median) },
      { v: 'mode', val: modeStr },
      { v: 'range', val: frac(range) },
      { v: 'stdev', val: frac(stdev) },
    ], work: [
      'Data:', `  ${arr.join(', ')}`, '',
      'Sorted:', `  ${sorted.join(', ')}`, '',
      'Mean:', `  ${frac(mean)}`,
      'Median:', `  ${frac(median)}`,
      'Mode:', `  ${modeStr}`,
      'Range:', `  ${frac(range)}`,
      'Stdev:', `  ${frac(stdev)}`
    ] };
  }

  function solveQuadForm(text) {
    const m = text.match(/([+-]?[\d.]*)\s*x\s*[\^²]\s*([+-]\s*[\d.]*)\s*x\s*([+-]\s*[\d.]+)?/);
    if (!m) return null;
    const aStr = m[1], bStr = m[2].replace(/\s/g, ''), cStr = (m[3] || '0').replace(/\s/g, '');
    const a = aStr === '' || aStr === '+' ? 1 : aStr === '-' ? -1 : parseFloat(aStr);
    const b = bStr === '' || bStr === '+' ? 1 : bStr === '-' ? -1 : parseFloat(bStr);
    const c = cStr === '' ? 0 : parseFloat(cStr);
    if (!a) return null;
    const vertexX = -b / (2*a);
    const vertexY = a*vertexX*vertexX + b*vertexX + c;
    const disc = b*b - 4*a*c;
    return { answers: [
      { v: 'vertex', val: `(${frac(vertexX)}, ${frac(vertexY)})` },
      { v: 'axis', val: `x = ${frac(vertexX)}` },
      { v: 'discriminant', val: frac(disc) }
    ], work: [
      'Quadratic:', `  y = ${fmtQuadratic(a, b, c)}`, '',
      `  a = ${a},   b = ${b},   c = ${c}`, '',
      `Axis: x = −b/(2a) = ${frac(vertexX)}`,
      `Vertex: (${frac(vertexX)}, ${frac(vertexY)})`,
      `Discriminant: b² − 4ac = ${frac(disc)}`
    ] };
  }
  function fmtQuadratic(a, b, c) {
    let s = '';
    if (a === 1) s += 'x²'; else if (a === -1) s += '−x²'; else s += frac(a) + 'x²';
    if (b > 0) s += ' + ' + (b === 1 ? '' : frac(b)) + 'x';
    else if (b < 0) s += ' − ' + (b === -1 ? '' : frac(Math.abs(b))) + 'x';
    if (c > 0) s += ' + ' + frac(c);
    else if (c < 0) s += ' − ' + frac(Math.abs(c));
    return s;
  }

  function solveToSlopeIntercept(text) {
    const eqM = text.match(/([^\n]*?=\s*-?\d+)/);
    if (!eqM) return null;
    const line = eqM[1].trim();
    if (/^y\s*=/.test(line)) return null;
    const nd = window.nerdamer;
    let yExpr;
    try { yExpr = nerdamerVals(nd.solve(line, 'y'))[0]; } catch (e) { return null; }
    if (!yExpr) return null;
    const clean = yExpr.replace(/\*/g, '');
    let mVal, bVal;
    try {
      const at0 = Number(nd(clean).sub('x', 0).evaluate().text('decimals'));
      const at1 = Number(nd(clean).sub('x', 1).evaluate().text('decimals'));
      mVal = at1 - at0; bVal = at0;
    } catch (e) { return null; }
    const mStr = frac(mVal);
    const bAbs = Math.abs(bVal);
    const bSign = bVal >= 0 ? '+ ' : '− ';
    const eqStr = `y = ${mStr === '1' ? '' : mStr === '−1' ? '−' : mStr}x ${bVal !== 0 ? bSign + frac(bAbs) : ''}`.trim();
    const work = ['Equation:', `  ${line}`, '', 'Solve for y:', `  ${eqStr}`, '', 'Slope-intercept form:', `  ${eqStr}`];
    return { answers: [{ v: 'y', val: eqStr.slice(4) }], work };
  }

  function solvePointSlopeFromPoints(text) {
    const pts = text.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g);
    if (!pts || pts.length < 2) return null;
    const [a, b] = pts.slice(0, 2).map(p => p.replace(/[()]/g, '').split(',').map(Number));
    if (a[0] === b[0]) {
      return { answers: [{ v: 'x', val: `${a[0]}` }], work: ['Vertical line:', `  x = ${a[0]}`] };
    }
    if (a[1] === b[1]) {
      return { answers: [{ v: 'y', val: `${a[1]}` }], work: ['Horizontal line:', `  y = ${a[1]}`] };
    }
    const m = (b[1] - a[1]) / (b[0] - a[0]);
    const mStr = frac(m);
    const y1 = a[1], x1 = a[0];
    const y1Part = y1 < 0 ? `+ ${Math.abs(y1)}` : `− ${y1}`;
    const x1Part = x1 < 0 ? `+ ${Math.abs(x1)}` : `− ${x1}`;
    const ans = `y ${y1Part} = ${mStr}(x ${x1Part})`;
    const work = [
      'Points:', `  (${a[0]}, ${a[1]})   (${b[0]}, ${b[1]})`, '',
      'Slope:', `  m = (y₂ − y₁) / (x₂ − x₁)`,
      `  m = (${b[1]} − ${a[1]}) / (${b[0]} − ${a[0]})`,
      `  m = ${frac(b[1] - a[1])} / ${frac(b[0] - a[0])} = ${mStr}`, '',
      'Point-slope form:   y − y₁ = m(x − x₁)',
      `  ${ans}`, '',
      'Answer:', `  ${ans}`
    ];
    return { answers: [{ v: 'Point-slope', val: ans }], work };
  }

  function solvePointSlopeGiven(text) {
    const ptM = text.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
    if (!ptM) return null;
    const slopeFrac = text.match(/slope\s*(?:of|=|is)?\s*(-?\d+)\s*\/\s*(\d+)/i);
    const slopeNum = text.match(/slope\s*(?:of|=|is)?\s*(-?\d+\.?\d*)/i);
    if (!slopeFrac && !slopeNum) return null;
    const x1 = parseFloat(ptM[1]), y1 = parseFloat(ptM[2]);
    const m = slopeFrac ? parseFloat(slopeFrac[1]) / parseFloat(slopeFrac[2]) : parseFloat(slopeNum[1]);
    const mStr = frac(m);
    const y1Part = y1 < 0 ? `+ ${Math.abs(y1)}` : `− ${y1}`;
    const x1Part = x1 < 0 ? `+ ${Math.abs(x1)}` : `− ${x1}`;
    const ans = `y ${y1Part} = ${mStr}(x ${x1Part})`;
    const work = [
      'Point:', `  (${x1}, ${y1})`,
      'Slope:', `  m = ${mStr}`, '',
      'Point-slope form:   y − y₁ = m(x − x₁)',
      `  ${ans}`, '',
      'Answer:', `  ${ans}`
    ];
    return { answers: [{ v: 'Point-slope', val: ans }], work };
  }

  function solveSlopeParallel(text) {
    const m = text.match(/([+-]?\s*\d*)\s*([xy])\s*([+-]\s*\d*)\s*([xy])\s*=\s*(-?\d+)/);
    if (!m) return null;
    const isPerp = /\bperpendicular\b/i.test(text);
    const isPar = /\bparallel\b/i.test(text);
    if (!isPerp && !isPar) return null;
    const parseCoef = s => { s = s.replace(/\s/g, ''); if (s === '' || s === '+') return 1; if (s === '-') return -1; return parseFloat(s); };
    const a1 = parseCoef(m[1]), a2 = parseCoef(m[3]);
    const v1 = m[2].toLowerCase();
    const A = v1 === 'x' ? a1 : a2;
    const B = v1 === 'y' ? a1 : a2;
    if (B === 0) return null;
    const mGiven = -A / B;
    const mAns = isPar ? mGiven : -1 / mGiven;
    const mStr = frac(mAns);
    const work = [
      'Given line:', `  ${m[0]}`, '',
      'Rewrite in slope-intercept form:',
      `  ${B}y = ${-A}x + ${m[5]}`,
      `  y = (${-A}/${B})x + ...`,
      `  m = ${frac(mGiven)}`, '',
      isPar ? 'Parallel lines have the same slope.' : 'Perpendicular slopes are negative reciprocals.',
      '', 'Answer:', `  m = ${mStr}`
    ];
    return { answers: [{ v: 'm', val: mStr }], work };
  }

  function solveParallelPerp(text) {
    const ptM = text.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
    if (!ptM) return null;
    const lineM = text.match(/([+-]?\s*\d*)\s*([xy])\s*([+-]\s*\d*)\s*([xy])\s*=\s*(-?\d+)/);
    if (!lineM) return null;
    const isPerp = /\bperpendicular\b/i.test(text);
    const isPar = /\bparallel\b/i.test(text);
    if (!isPerp && !isPar) return null;
    const x1 = parseFloat(ptM[1]), y1 = parseFloat(ptM[2]);
    const parseCoef = s => { s = s.replace(/\s/g, ''); if (s === '' || s === '+') return 1; if (s === '-') return -1; return parseFloat(s); };
    const a1 = parseCoef(lineM[1]), a2 = parseCoef(lineM[3]);
    const v1 = lineM[2].toLowerCase();
    const A = v1 === 'x' ? a1 : a2;
    const B = v1 === 'y' ? a1 : a2;
    if (B === 0) return null;
    const mGiven = -A / B;
    const mNew = isPar ? mGiven : -1 / mGiven;
    const b = y1 - mNew * x1;
    const mStr = frac(mNew);
    const bSign = b >= 0 ? '+ ' : '− ';
    const eqStr = `y = ${mStr === '1' ? '' : mStr === '−1' ? '−' : mStr}x ${bSign}${frac(Math.abs(b))}`.trim();
    const work = [
      `Point:  (${x1}, ${y1})`,
      `Given line:  ${lineM[0]}`,
      '',
      'Slope of given line:',
      `  m₁ = −A/B = ${frac(mGiven)}`,
      '',
      isPar ? 'Parallel slope (same):' : 'Perpendicular slope (negative reciprocal):',
      `  m₂ = ${mStr}`,
      '',
      'Point-slope form:',
      `  y − (${y1}) = ${mStr}(x − (${x1}))`,
      '',
      'Slope-intercept form:',
      `  ${eqStr}`,
      '',
      'Answer:', `  ${eqStr}`
    ];
    return { answers: [{ v: 'y', val: eqStr.slice(4) }], work };
  }

  function solveTranslation(text) {
    const ptM = text.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
    if (!ptM) return null;
    const x0 = parseFloat(ptM[1]), y0 = parseFloat(ptM[2]);
    const dirs = text.match(/(right|left|up|down)\s+(\d+)/gi);
    if (!dirs) return null;
    let dx = 0, dy = 0;
    for (const d of dirs) {
      const m = d.match(/(right|left|up|down)\s+(\d+)/i);
      const amt = parseFloat(m[2]);
      const dir = m[1].toLowerCase();
      if (dir === 'right') dx += amt;
      else if (dir === 'left') dx -= amt;
      else if (dir === 'up') dy += amt;
      else if (dir === 'down') dy -= amt;
    }
    const x1 = x0 + dx, y1 = y0 + dy;
    const work = [
      'Original point:', `  (${x0}, ${y0})`,
      'Translation:', `  ${dirs.join(', ')}`,
      '',
      'Apply the translation:',
      `  x:  ${x0} ${dx >= 0 ? '+' : '−'} ${Math.abs(dx)} = ${x1}`,
      `  y:  ${y0} ${dy >= 0 ? '+' : '−'} ${Math.abs(dy)} = ${y1}`,
      '',
      'Image point:', `  (${x1}, ${y1})`
    ];
    return { answers: [{ v: 'image', val: `(${x1}, ${y1})` }], work };
  }

  function solveIntercepts(text) {
    const m = text.match(/([+-]?\s*\d*)\s*([xy])\s*([+-]\s*\d*)\s*([xy])\s*=\s*(-?\d+)/);
    if (!m) return null;
    const parseCoef = s => { s = s.replace(/\s/g, ''); if (s === '' || s === '+') return 1; if (s === '-') return -1; return parseFloat(s); };
    const a1 = parseCoef(m[1]), a2 = parseCoef(m[3]);
    const v1 = m[2].toLowerCase();
    const cx = v1 === 'x' ? a1 : a2;
    const cy = v1 === 'y' ? a1 : a2;
    const c = parseFloat(m[5]);
    if (cx === 0 || cy === 0) return null;
    const xInt = c / cx, yInt = c / cy;
    const work = [
      'Equation:', `  ${m[0]}`, '',
      'X-intercept (set y = 0):',
      `  ${cx}x = ${c}`,
      `  x = ${frac(xInt)}`,
      `  (${frac(xInt)}, 0)`, '',
      'Y-intercept (set x = 0):',
      `  ${cy}y = ${c}`,
      `  y = ${frac(yInt)}`,
      `  (0, ${frac(yInt)})`, '',
      'Answer:', `  (${frac(xInt)}, 0)   and   (0, ${frac(yInt)})`
    ];
    return { answers: [
      { v: 'x-intercept', val: `(${frac(xInt)}, 0)` },
      { v: 'y-intercept', val: `(0, ${frac(yInt)})` }
    ], work };
  }

  function solveDirectVar(text) {
    const eqM = text.match(/y\s*=\s*\(?\s*(-?\d+)\s*\/\s*(\d+)\s*\)?\s*[*]?\s*x/i) || text.match(/y\s*=\s*(-?\d+\.?\d*)\s*[*]?\s*x/i);
    if (eqM) {
      const num = parseFloat(eqM[1]);
      const den = eqM[2] ? parseFloat(eqM[2]) : 1;
      const k = num / den;
      const work = [
        'Direct variation equation:', `  y = (${num}/${den})x`, '',
        'The constant of variation k is the coefficient of x:',
        `  k = ${frac(k)}`
      ];
      return { answers: [{ v: 'k', val: frac(k) }], work };
    }
    const pairs = [...text.matchAll(/\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)/g)];
    if (pairs.length >= 2) {
      const ratios = pairs.map(p => parseFloat(p[2]) / parseFloat(p[1]));
      const first = ratios[0];
      const allSame = ratios.every(r => Math.abs(r - first) < 1e-9);
      const work = ['Points:', '  ' + pairs.map(p => `(${p[1]}, ${p[2]})`).join(',  '), ''];
      work.push('Check y/x for each:');
      pairs.forEach((p, i) => work.push(`  ${p[2]} / ${p[1]} = ${frac(ratios[i])}`));
      work.push('');
      if (allSame) {
        work.push('Ratios equal → direct variation.');
        work.push(`  k = ${frac(first)}`);
        return { answers: [{ v: 'k', val: frac(first) }], work };
      }
      work.push('Ratios differ → not direct variation.');
      return { answers: [{ v: 'k', val: 'DNE' }], work };
    }
    return null;
  }

  function solveDirectVarFindY(text) {
    const nd = window.nerdamer;
    const xM = text.match(/x\s*[=:]\s*(-?\d+\.?\d*)/i);
    if (!xM) return null;
    const xVal = parseFloat(xM[1]);
    let k = null;
    const eqM = text.match(/y\s*=\s*\(?\s*(-?\d+)\s*\/\s*(\d+)\s*\)?\s*[*]?\s*x/i);
    if (eqM) k = parseFloat(eqM[1]) / parseFloat(eqM[2]);
    else {
      const simple = text.match(/y\s*=\s*(-?\d+\.?\d*)\s*[*]?\s*x/i);
      if (simple) k = parseFloat(simple[1]);
    }
    if (k === null) {
      const pairs = [...text.matchAll(/\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)/g)];
      if (pairs.length >= 1) k = parseFloat(pairs[0][2]) / parseFloat(pairs[0][1]);
    }
    if (k === null) return null;
    const yVal = k * xVal;
    const work = [
      'Direct variation equation:', `  y = ${frac(k)}x`, '',
      `Find y when x = ${xVal}:`,
      `  y = ${frac(k)}(${xVal})`,
      `  y = ${frac(yVal)}`, '',
      'Answers:',
      `  y = ${frac(k)}x    and    y = ${frac(yVal)}`
    ];
    return { answers: [
      { v: 'y', val: `${frac(k)}x` },
      { v: `when x = ${xVal}`, val: frac(yVal) }
    ], work };
  }

  function solveLine(text) {
    const slopeM = text.match(/slope\s*(?:of|=|is)?\s*(-?\d+\.?\d*(?:\/\d+)?)/i);
    const pts = text.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g);
    if (!pts || pts.length < 1) return null;
    let m, b;
    if (slopeM && pts.length >= 1) {
      m = parseFloat(slopeM[1]);
      const [x1, y1] = pts[0].replace(/[()]/g, '').split(',').map(Number);
      b = y1 - m * x1;
    } else if (pts.length >= 2) {
      const [a, bb] = pts.slice(0, 2).map(p => p.replace(/[()]/g, '').split(',').map(Number));
      if (a[0] === bb[0]) return null;
      m = (bb[1] - a[1]) / (bb[0] - a[0]);
      b = a[1] - m * a[0];
    } else return null;
    const mStr = frac(m);
    const bSign = b >= 0 ? '+ ' : '− ';
    const eq = `y = ${mStr === '1' ? '' : mStr === '−1' ? '−' : mStr}x ${bSign}${frac(Math.abs(b))}`;
    return { answers: [{ v: 'y', val: eq.slice(4) }], work: ['Slope:', `  m = ${mStr}`, 'Y-intercept:', `  b = ${frac(b)}`, '', `y = ${eq.slice(4)}`] };
  }

  function solveSequence(text) {
    const nums = text.match(/-?\d+\.?\d*(?:\s*,\s*-?\d+\.?\d*){2,}/);
    if (!nums) return null;
    const arr = nums[0].split(',').map(s => parseFloat(s.trim()));
    if (arr.length < 3) return null;
    const d1 = arr[1] - arr[0], d2 = arr[2] - arr[1];
    if (Math.abs(d1 - d2) < 1e-10) {
      const d = d1, next = arr[arr.length - 1] + d;
      const an = arr[0] + (arr.length - 1) * d;
      return { answers: [{ v: 'd', val: frac(d) }, { v: 'next', val: frac(next) }],
        work: ['Sequence:', `  ${arr.join(', ')}`, '', `d = ${frac(d)}`, `a${arr.length} = ${frac(an)}`, `Next: ${frac(next)}`] };
    }
    if (arr[0] !== 0) {
      const r1 = arr[1] / arr[0], r2 = arr[2] / arr[1];
      if (Math.abs(r1 - r2) < 1e-10) {
        const next = arr[arr.length - 1] * r1;
        return { answers: [{ v: 'r', val: frac(r1) }, { v: 'next', val: frac(next) }],
          work: ['Sequence:', `  ${arr.join(', ')}`, '', `r = ${frac(r1)}`, `Next: ${frac(next)}`] };
      }
    }
    return null;
  }

  function solveGeometry(text) {
    const t = text.toLowerCase();
    const rMatch = t.match(/radius\s*(?:of|=|is)?\s*(-?\d+\.?\d*)/i) || t.match(/r\s*=\s*(-?\d+\.?\d*)/);
    if (rMatch && /circle/i.test(t)) {
      const r = parseFloat(rMatch[1]);
      const area = Math.PI * r * r, circ = 2 * Math.PI * r;
      return { answers: [{ v: 'area', val: frac(Math.round(area*100)/100) }, { v: 'circumference', val: frac(Math.round(circ*100)/100) }],
        work: [`Circle, r = ${r}`, '', `A = πr² = ${frac(Math.round(area*100)/100)}`, `C = 2πr = ${frac(Math.round(circ*100)/100)}`] };
    }
    const lM = t.match(/length\s*(?:of|=|is)?\s*(\d+\.?\d*)/i);
    const wM = t.match(/width\s*(?:of|=|is)?\s*(\d+\.?\d*)/i);
    if (lM && wM) {
      const l = parseFloat(lM[1]), w = parseFloat(wM[1]);
      return { answers: [{ v: 'area', val: frac(l*w) }, { v: 'perimeter', val: frac(2*(l+w)) }],
        work: [`Rectangle l=${l}, w=${w}`, '', `A = ${frac(l*w)}`, `P = ${frac(2*(l+w))}`] };
    }
    const bM = t.match(/base\s*(?:of|=|is)?\s*(\d+\.?\d*)/i);
    const hM = t.match(/height\s*(?:of|=|is)?\s*(\d+\.?\d*)/i);
    if (bM && hM) {
      const b = parseFloat(bM[1]), h = parseFloat(hM[1]);
      return { answers: [{ v: 'area', val: frac(b*h/2) }], work: [`Triangle b=${b}, h=${h}`, '', `A = ½bh = ${frac(b*h/2)}`] };
    }
    return null;
  }

  function mkProp(name) {
    return { answers: [{ v: 'Property', val: name }], work: ['Property illustrated:', '', `  ${name}`] };
  }
  function solveProperty(text) {
    const m = text.match(/([^\n]*=\s*[^\n]*)/);
    if (!m) return null;
    const eq = cleanLine(m[0]).replace(/\s+/g, '');
    const parts = eq.split('=');
    if (parts.length !== 2) return null;
    const lhs = parts[0], rhs = parts[1];
    if (!lhs || !rhs) return null;
    function toMul(s) {
      return s.replace(/(\d)([a-z])/gi, '$1*$2').replace(/([a-z])([a-z])/gi, '$1*$2').replace(/([a-z])(\()/gi, '$1*$2').replace(/(\))([a-z\d])/gi, '$1*$2');
    }
    try {
      const lExp = window.nerdamer(toMul(lhs)).expand().toString();
      const rExp = window.nerdamer(toMul(rhs)).expand().toString();
      const diff = window.nerdamer(`(${lExp})-(${rExp})`).expand().toString();
      if (diff !== '0') return null;
    } catch (e) { return null; }
    const hasDistL = /[a-z0-9]\s*\(\s*[^)]*[+\-][^)]*\)/.test(lhs);
    const hasDistR = /[a-z0-9]\s*\(\s*[^)]*[+\-][^)]*\)/.test(rhs);
    if (hasDistL !== hasDistR) return mkProp('Distributive Property');
    const lExp2 = window.nerdamer(toMul(lhs)).expand().toString();
    const rExp2 = window.nerdamer(toMul(rhs)).expand().toString();
    if (lExp2 === '0' || rExp2 === '0') return mkProp('Zero Property of Multiplication');
    if (/[*×]\s*1\b|\b1\s*[*×]/.test(lhs) || /[*×]\s*1\b|\b1\s*[*×]/.test(rhs)) return mkProp('Identity Property of Multiplication');
    if (/\+\s*0\b|\b0\s*\+/.test(lhs) || /\+\s*0\b|\b0\s*\+/.test(rhs)) return mkProp('Identity Property of Addition');
    const varL = (lhs.match(/[a-z]/gi) || []).map(c => c.toLowerCase());
    const anyVar = varL[0];
    if (anyVar) {
      if (new RegExp(`\\+\\s*\\(?\\s*[-−]\\s*${anyVar}\\s*\\)?`).test(lhs)) return mkProp('Inverse Property of Addition');
    }
    const tokens = s => (s.match(/[a-z]|\d+/gi) || []).map(t => t.toLowerCase());
    const tL = tokens(lhs), tR = tokens(rhs);
    const isAdd = /\+/.test(lhs) && !/[*×]/.test(lhs.replace(/[-−]/g, ''));
    if (tL.join(',') === tR.join(',')) return mkProp(isAdd ? 'Associative Property of Addition' : 'Associative Property of Multiplication');
    const sortedL = [...tL].sort().join(','), sortedR = [...tR].sort().join(',');
    if (sortedL === sortedR) return mkProp(isAdd ? 'Commutative Property of Addition' : 'Commutative Property of Multiplication');
    return null;
  }

  const AI_SYSTEM_PROMPT = `You are a math tutor helping a student solve a word problem.

The input text is scraped from a homework page and may contain noise. Reconstruct the intended problem first, then solve.

Return ONLY valid JSON matching this exact shape:
{"variables":["x","y"],"meanings":{"x":"..."},"equations":["..."],"solution":{"x":"..."},"work":["step 1","step 2"]}

Rules:
- Equations use standard math notation.
- Solution values exact — use fractions like "3/2" not "1.5".
- Work steps read like a student writing in a notebook.
- If unsolvable, return {"error":"reason"}.`;

  function wrapText(s, width) {
    const words = s.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > width) { lines.push(cur.trim()); cur = w; }
      else cur += ' ' + w;
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }

  async function askAI(userText) {
    let key = getApiKey();
    if (!key) key = promptForKey();
    if (!key) throw new Error('no key');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.AI_MODEL}:generateContent?key=${key}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userText }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) { clearApiKey(); showToast('session expired, try again'); }
      throw new Error(`http ${r.status}`);
    }
    const data = await r.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('empty response');
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(text);
  }

  async function solveWordProblem(text) {
    if (!getApiKey()) { const k = promptForKey(); if (!k) return null; }
    const clean = text.split('\n').map(l => l.trim()).filter(l => l.length > 0).join(' ').trim();
    if (clean.length < 15) return null;
    let data;
    try { data = await askAI(clean); } catch (e) { console.warn('[net]', e.message); return null; }
    if (data.error) return null;
    if (!data.solution || !data.variables) return null;
    const answers = data.variables.map(v => ({ v, val: data.solution[v] != null ? String(data.solution[v]) : '?' }));
    const work = ['Word problem:', ''];
    wrapText(clean, 68).forEach(l => work.push('  ' + l));
    work.push('', 'Assign variables:');
    data.variables.forEach(v => work.push(`  ${v} = ${data.meanings?.[v] || v}`));
    work.push('', 'Set up equations:');
    (data.equations || []).forEach((eq, i) => work.push(`  (${i + 1})   ${eq}`));
    work.push('', 'Solve:');
    (data.work || []).forEach(line => work.push(`  ${line}`));
    return { answers, work };
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('dm_fails', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('fails')) {
          const store = db.createObjectStore('fails', { keyPath: 'id', autoIncrement: true });
          store.createIndex('time', 'time');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbAdd(entry) {
    try {
      const db = await openDB();
      return new Promise(res => {
        const tx = db.transaction('fails', 'readwrite');
        tx.objectStore('fails').add(entry);
        tx.oncomplete = () => res();
      });
    } catch (e) { console.warn('db add', e); }
  }
  async function dbAll() {
    try {
      const db = await openDB();
      return new Promise(res => {
        const tx = db.transaction('fails', 'readonly');
        const req = tx.objectStore('fails').getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
      });
    } catch (e) { return []; }
  }
  async function dbClear() {
    try {
      const db = await openDB();
      return new Promise(res => {
        const tx = db.transaction('fails', 'readwrite');
        tx.objectStore('fails').clear();
        tx.oncomplete = () => res();
      });
    } catch (e) {}
  }

  async function logFailure(problem, type) {
    let screenshot = null;
    try {
      if (window.html2canvas) {
        let target = null;
        for (const el of document.querySelectorAll('div,section,main')) {
          const t = el.innerText || '';
          if (t.length < 60 || t.length > 5000) continue;
          if (/\bQuestion\b/.test(t) && (/\bAnswer\b|\bSubmit\b/.test(t))) {
            if (!target || t.length < (target.innerText || '').length) target = el;
          }
        }
        if (target) {
          const canvas = await window.html2canvas(target, { scale: 1, logging: false, useCORS: true, backgroundColor: '#ffffff' });
          screenshot = canvas.toDataURL('image/png');
        }
      }
    } catch (e) { console.warn('screenshot failed', e); }

    await dbAdd({ time: Date.now(), url: location.href, type, problem, screenshot });
    console.log('failure logged');
  }

  function b64ToBlob(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: 'image/png' });
  }

  async function sendToOwner(failures) {
    if (!CONFIG.OWNER_WEBHOOK) { showToast('no webhook set'); return; }
    if (!failures.length) { showToast('nothing to send'); return; }
    let sent = 0, failed = 0;
    showToast(`sending ${failures.length}…`);
    for (const f of failures) {
      try {
        const truncated = f.problem.length > 1500 ? f.problem.slice(0, 1500) + '…' : f.problem;
        const content = `**DeltaMath failure** · \`${f.type}\`\n<t:${Math.floor(f.time / 1000)}:f>\nURL: ${f.url}\n\`\`\`\n${truncated}\n\`\`\``;
        const fd = new FormData();
        fd.append('payload_json', JSON.stringify({ content }));
        if (f.screenshot && f.screenshot.startsWith('data:image/png;base64,') && f.screenshot.length < 4000000) {
          const b64 = f.screenshot.split(',')[1];
          fd.append('files[0]', b64ToBlob(b64), `screenshot-${f.id || Date.now()}.png`);
        }
        const r = await fetch(CONFIG.OWNER_WEBHOOK, { method: 'POST', body: fd });
        if (r.ok) sent++;
        else failed++;
        await new Promise(res => setTimeout(res, 500));
      } catch (e) { console.warn(e); failed++; }
    }
    showToast(`sent ${sent}, failed ${failed}`);
  }

  async function showFailLog() {
    const fails = await dbAll();
    const old = document.getElementById('__dm_fails'); if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = '__dm_fails';
    wrap.style.cssText = `position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:2147483002;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;`;
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });

    const items = fails.sort((a, b) => b.time - a.time).map(f => `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:10px;background:#fafbfc">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#666;margin-bottom:6px">
          <span>${new Date(f.time).toLocaleString()}</span>
          <span style="font-family:monospace;color:#c49a3a">${f.type}</span>
        </div>
        <pre style="margin:0;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:#333;max-height:160px;overflow:auto;background:#fff;padding:8px;border-radius:4px;border:1px solid #e5e7eb">${f.problem}</pre>
        ${f.screenshot ? `<div style="margin-top:8px"><img src="${f.screenshot}" style="max-width:100%;border:1px solid #ddd;border-radius:6px"></div>` : '<em style="color:#999;font-size:12px">no screenshot</em>'}
      </div>`).join('') || '<div style="padding:20px;text-align:center;color:#666">No failures logged yet.</div>';

    const box = document.createElement('div');
    box.style.cssText = `background:#fff;color:#111;border-radius:10px;padding:22px 26px;min-width:640px;max-width:920px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);`;
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-shrink:0">
        <div style="font-family:Georgia,serif;font-size:20px;font-weight:600">Failed problems (${fails.length})</div>
        <div>
          <button id="__dm_f_send" style="padding:6px 12px;margin-right:6px;border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:6px;cursor:pointer;font-size:12px">Send to owner</button>
          <button id="__dm_f_copy" style="padding:6px 12px;margin-right:6px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:12px">Copy all text</button>
          <button id="__dm_f_dl" style="padding:6px 12px;margin-right:6px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:12px">Download JSON</button>
          <button id="__dm_f_clear" style="padding:6px 12px;margin-right:6px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:12px;color:#b91c1c">Clear</button>
          <button id="__dm_f_close" style="padding:6px 12px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:12px">Close</button>
        </div>
      </div>
      <div style="overflow:auto;flex:1">${items}</div>`;
    wrap.appendChild(box);
    document.body.appendChild(wrap);

    box.querySelector('#__dm_f_close').onclick = () => wrap.remove();
    box.querySelector('#__dm_f_clear').onclick = async () => {
      if (!confirm('Clear all logged failures?')) return;
      await dbClear(); wrap.remove(); showToast('cleared');
    };
    box.querySelector('#__dm_f_send').onclick = async () => { await sendToOwner(fails); };
    box.querySelector('#__dm_f_copy').onclick = () => {
      const text = fails.map((f, i) =>
        `--- Failure #${i + 1} (${new Date(f.time).toLocaleString()}) ---\nType: ${f.type}\nURL: ${f.url}\n\nProblem text:\n${f.problem}\n`
      ).join('\n\n');
      navigator.clipboard.writeText(text).then(() => showToast('copied'));
    };
    box.querySelector('#__dm_f_dl').onclick = () => {
      const blob = new Blob([JSON.stringify(fails, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dm-failures-' + Date.now() + '.json';
      a.click();
    };
  }

  function detect(t) {
    if (/\bsolve the (following )?system\b/i.test(t) || /\bby substitution\b/i.test(t) || /\bby elimination\b/i.test(t)) return 'system';
    if (/\bname the property\b/i.test(t) || /\bproperties?\s+of\s+real\s+numbers?\b/i.test(t)) return 'property';
    if (/\bcompound\s+inequalit/i.test(t) || (/-?\d+\.?\d*\s*[<>]=?\s*[^<>\n]+?\s*[<>]=?\s*-?\d+\.?\d*/.test(t) && /solve/i.test(t))) return 'compoundIneq';
    if (/\|\s*[^|]+\s*\|\s*(<=|>=|<|>)/.test(t)) return 'absIneq';
    if (/\|\s*[^|]+\s*\|/.test(t) && /=/.test(t)) return 'absEq';
    if (/\bdirect variation\b/i.test(t) && /when\s+x/i.test(t)) return 'directVarFindY';
    if (/\bdirect variation\b/i.test(t)) return 'directVar';
    if (/\btranslation\b/i.test(t)) return 'translation';
    if (/\bslope\b.*\bparallel\b/i.test(t) || /\bslope\b.*\bperpendicular\b/i.test(t)) return 'slopeParallel';
    if (/\bparallel\b.*through\b|\bperpendicular\b.*through/i.test(t)) return 'parallelPerp';
    if (/\bintercepts?\b/i.test(t) && /\border(ed)? pair/i.test(t)) return 'intercepts';
    if (/\bstandard\s+to\s+slope[- ]intercept\b/i.test(t) || /slope[- ]intercept\s+form/i.test(t)) return 'toSlopeIntercept';
    if (/\bpoint[- ]slope\s+form\b/i.test(t)) {
      if (/through\s+the\s+point/i.test(t) && /\bslope\b/i.test(t)) return 'pointSlopeGiven';
      if (/passes through the points/i.test(t)) return 'pointSlopeFromPoints';
    }
    if (/\bsolve\b/i.test(t) && /[<>≤≥]/.test(t) && /[a-z]\s*[<>≤≥]/.test(t)) {
      const ineqCount = (t.match(/[<>≤≥]/g) || []).length;
      if (ineqCount >= 2) return 'systemIneq';
      return 'inequality';
    }
    if (/\b(sin|cos|tan)\s*\(?/i.test(t) && /=/.test(t) && /\bsolve\b/i.test(t)) return 'trig';
    if (/(?:^|\s)(?:log|ln)\s*[\(\d]/.test(t) && /=/.test(t) && /\bsolve\b/i.test(t)) return 'log';
    if (/[\de]\s*\^\s*\(?\s*[a-z]/i.test(t) && /\bsolve\b/i.test(t)) return 'exp';
    if (/sqrt\s*\(/i.test(t) && /=/.test(t) && /\bsolve\b/i.test(t)) return 'radical';
    if (/\/\s*\([^)]*x/i.test(t) && /=/.test(t) && /\bsolve\b/i.test(t)) return 'rational';
    if (/\b(vertex|axis of symmetry|discriminant)\b/i.test(t)) return 'quadForm';
    if (/x\s*[\^²]/.test(t)) return 'quadratic';
    if (/f\s*\(\s*g\s*\(\s*x\s*\)\s*\)/i.test(t)) return 'composition';
    if (/f\s*(?:-1|⁻¹|\^\{-1\})\s*\(/i.test(t)) return 'composition';
    if (/f\s*\(\s*x\s*\)\s*=/i.test(t)) return 'composition';
    if (/\b(mean|median|mode|standard deviation|stdev)\b/i.test(t)) return 'stats';
    if (/\b(sequence|arithmetic|geometric|nth term|common difference|common ratio)\b/i.test(t)) return 'sequence';
    if (/\bslope\b/i.test(t) && /\(-?\d+\s*,\s*-?\d+\)/.test(t)) return 'slope';
    if (/\b(add|subtract|multiply|divide|expand)\b/i.test(t) && /\([^)]*[a-z][^)]*\)/.test(t)) return 'polyOps';
    if (/\bsolve\b.*\bfor\b/i.test(t) || /\bsolve\b/i.test(t)) {
      const lines = t.split('\n');
      const eqLines = lines.filter(l => /[a-z]/i.test(l) && /=/.test(l));
      const sv = eqLines.filter(l => {
        const distinct = [...new Set((l.match(/[a-z]/gi) || []).map(c => c.toLowerCase()))];
        return distinct.length === 1;
      });
      if (sv.length) return 'single';
    }
    if (/\bsimplif|rewrite in simplest|combine like terms|expand|multiply\b/i.test(t)) return 'simplify';
    if (/\bfactor/i.test(t)) return 'factor';
    if (/\bdistance\b|\bmidpoint\b/i.test(t)) return 'distance';
    if (/\b(area|perimeter|circumference|volume)\b/i.test(t)) return 'geometry';
    const wordCount = (t.match(/\b[a-z]+\b/gi) || []).length;
    const hasEquation = /[=<>≤≥]/.test(t) || /[a-z]\s*[\^²]/.test(t);
    if (!hasEquation && wordCount > 20) return 'word';
    return 'unknown';
  }

  async function run() {
    let text = problemText();
    const eqFound = /[-+0-9a-z]\s*=\s*[-+0-9a-z]/i.test(text);
    if (!eqFound) {
      const imgText = await ocrImages();
      if (imgText) text = text + '\n' + imgText;
    }
    if (!/[-+0-9a-z]\s*=\s*[-+0-9a-z]/i.test(text)) {
      console.log('no equations in DOM, falling back to screenshot+OCR');
      const ssText = await screenshotAndOCR();
      if (ssText) text = text + '\n' + ssText;
    }
    text = normalizeEqText(text);
    console.log('problem text:\n' + text);
    const type = detect(text);
    console.log('detected: ' + type);
    const nd = window.nerdamer;
    const table = {
      system: nd ? nSystem : null,
      systemIneq: nd ? solveSystemIneq : null,
      single: nd ? nSingle : null,
      quadratic: nd ? nQuadratic : null,
      quadForm: nd ? solveQuadForm : null,
      simplify: nd ? nSimplify : null,
      factor: nd ? nFactor : null,
      distance: manualDistance,
      slope: manualSlope,
      inequality: nd ? solveInequality : null,
      compoundIneq: nd ? solveCompoundIneq : null,
      abs: nd ? solveAbsolute : null,
      absEq: nd ? solveAbsEq : null,
      absIneq: nd ? solveAbsIneq : null,
      log: nd ? solveLog : null,
      exp: nd ? solveExp : null,
      radical: nd ? solveRadical : null,
      rational: nd ? solveRational : null,
      trig: nd ? solveTrig : null,
      composition: nd ? solveComposition : null,
      stats: solveStats,
      sequence: solveSequence,
      line: solveLine,
      polyOps: nd ? solvePolyOps : null,
      geometry: solveGeometry,
      property: solveProperty,
      directVar: solveDirectVar,
      directVarFindY: solveDirectVarFindY,
      translation: solveTranslation,
      slopeParallel: solveSlopeParallel,
      parallelPerp: solveParallelPerp,
      intercepts: solveIntercepts,
      toSlopeIntercept: nd ? solveToSlopeIntercept : null,
      pointSlopeGiven: solvePointSlopeGiven,
      pointSlopeFromPoints: solvePointSlopeFromPoints,
      word: solveWordProblem,
    };
    const fn = table[type];
    let r = null;
    if (fn) {
      try { r = await fn(text); } catch (e) { console.warn(e); r = null; }
    }
    if (!r) {
      try { r = await solveWordProblem(text); } catch (e) { console.warn('[net]', e.message); }
    }
    if (!r) {
      showToast('couldn\'t solve this one');
      logFailure(text, type);
      return;
    }
    showModal(r);
  }

  function openMenu() {
    const old = document.getElementById('__dm_menu'); if (old) old.remove();
    const m = document.createElement('div');
    m.id = '__dm_menu';
    m.style.cssText = `position:fixed;bottom:64px;right:20px;background:#1c1c1f;color:#d0d0d0;font:12px/1.4 ui-monospace,Menlo,monospace;border:1px solid #2c2c30;border-radius:6px;padding:4px 0;z-index:2147483001;box-shadow:0 4px 18px rgba(0,0,0,.5);min-width:180px;`;
    const items = [
      ['Copy problem screenshot', () => copyQuestionScreenshot()],
      ['Read text from image (OCR)', async () => { const t = await ocrImages(); showToast(t ? 'read' : 'no image'); }],
      ['Set API key', () => promptForKey()],
      ['Clear API key', () => { clearApiKey(); showToast('key cleared'); }],
      ['View failed problems', () => showFailLog()],
      ['Update from GitHub', () => selfUpdate()],
    ];
    items.forEach(([label, fn]) => {
      const it = document.createElement('div');
      it.textContent = label;
      it.style.cssText = `padding:6px 14px;cursor:pointer;`;
      it.addEventListener('mouseenter', () => it.style.background = '#2a2a2e');
      it.addEventListener('mouseleave', () => it.style.background = '');
      it.addEventListener('click', () => { m.remove(); fn(); });
      m.appendChild(it);
    });
    document.body.appendChild(m);
    const off = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off, true); } };
    setTimeout(() => document.addEventListener('click', off, true), 0);
  }

  async function selfUpdate() {
    if (!CONFIG.SELF_UPDATE_URL) { showToast('no update url'); return; }
    showToast('updating…');
    let code;
    try {
      const url = CONFIG.SELF_UPDATE_URL + (CONFIG.SELF_UPDATE_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      code = await r.text();
      if (!code || code.length < 200) throw new Error('empty');
    } catch (e) { console.warn(e); showToast('update failed'); return; }
    try { runCleanup(); } catch (e) {}
    document.querySelectorAll('#__dm_btn, #__dm_modal, #__dm_menu, #__dm_toast').forEach(n => n.remove());
    [...document.querySelectorAll('[id^="__dm_"]')].forEach(n => n.remove());
    window.__dm3 = 0;
    await new Promise(res => setTimeout(res, 60));
    try { (0, eval)(code); console.log('updated'); }
    catch (e) { console.warn(e); console.error('update eval failed, re-paste manually'); window.__dm3 = 0; }
  }

  function showModal(r) {
    const old = document.getElementById('__dm_modal'); if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = '__dm_modal';
    wrap.style.cssText = `position:fixed;inset:0;background:rgba(15,23,42,.35);backdrop-filter:blur(2px);z-index:2147483001;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;`;
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    const answers = r.answers.map(a => `
      <div style="display:flex;align-items:baseline;gap:14px;margin:6px 0">
        <span style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:22px;color:#333">${a.v}</span>
        <span style="font-size:20px;color:#999">=</span>
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:#111">${a.val}</span>
      </div>`).join('');
    const box = document.createElement('div');
    box.style.cssText = `background:#fff;color:#111;padding:26px 30px;border-radius:10px;min-width:340px;max-width:680px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3),0 0 0 1px rgba(0,0,0,.06);`;
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-shrink:0">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600">Solution</div>
        <button id="__dm_close" style="background:none;border:0;font-size:24px;color:#999;cursor:pointer;padding:0 4px;line-height:1">×</button>
      </div>
      <div style="padding:14px 18px;background:#f8f9fb;border-radius:8px;border:1px solid #e6e8ec;flex-shrink:0">${answers}</div>
      <div style="margin-top:16px;flex-shrink:0">
        <button id="__dm_work" style="background:#fff;border:1px solid #d1d5db;color:#374151;padding:7px 14px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:500">Show work</button>
      </div>
      <pre id="__dm_work_body" style="display:none;margin-top:14px;padding:16px 20px;background:#fafbfc;border-radius:8px;border:1px solid #e6e8ec;font:12.5px/1.7 ui-monospace,Menlo,monospace;color:#2d3748;white-space:pre;overflow:auto;flex:1;min-height:0"></pre>`;
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    box.querySelector('#__dm_work_body').textContent = r.work.join('\n');
    const wb = box.querySelector('#__dm_work_body'), wbtn = box.querySelector('#__dm_work');
    wbtn.onclick = () => {
      const open = wb.style.display === 'block';
      wb.style.display = open ? 'none' : 'block';
      wbtn.textContent = open ? 'Show work' : 'Hide work';
    };
    box.querySelector('#__dm_close').onclick = () => wrap.remove();
    const onKey = e => { if (e.key === 'Escape') { wrap.remove(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  }

  function showToast(text) {
    const t = document.createElement('div');
    t.id = '__dm_toast';
    t.textContent = text;
    t.style.cssText = `position:fixed;bottom:70px;right:20px;background:rgba(28,28,30,.9);color:#e6e6e6;font:12px/1.4 -apple-system,'Segoe UI',Roboto,sans-serif;padding:8px 14px;border-radius:6px;z-index:2147483001;box-shadow:0 4px 12px rgba(0,0,0,.3);`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  console.log('ready');
})();
