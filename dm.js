/* DeltaMath assistant — single-file console script
 * Load: fetch('https://raw.githubusercontent.com/OogaBoogaPooga/Deltamath-Helper/refs/heads/main/dm.js').then(r=>r.text()).then(eval)
 */

(function () {
  if (window.__dm3) { console.log('already running'); return; }
  window.__dm3 = 1;

  // ============================================================
  // CONFIG
  // ============================================================
  const CONFIG = {
    SELF_UPDATE_URL: 'https://raw.githubusercontent.com/OogaBoogaPooga/Deltamath-Helper/refs/heads/main/dm.js',
    OCR_LANG: 'eng',
    GROQ_MODEL: 'openai/gpt-oss-120b',
  };

  const KEY_STORAGE = '__dm_groq_key';

  function getGroqKey() {
    try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
  }
  function setGroqKey(k) { try { localStorage.setItem(KEY_STORAGE, k); } catch {} }
  function clearGroqKey() { try { localStorage.removeItem(KEY_STORAGE); } catch {} }
  function promptForKey() {
    const k = window.prompt(
      'Enter your Groq API key.\n\nStored only in this browser (localStorage). Never sent anywhere except api.groq.com.',
      getGroqKey()
    );
    if (k && k.trim().startsWith('gsk_')) { setGroqKey(k.trim()); showToast('key saved'); return k.trim(); }
    if (k) showToast('invalid key — must start with gsk_');
    return '';
  }

  // ============================================================
  // CLEANUP REGISTRY
  // ============================================================
  const CLEANUP = [];
  function onCleanup(fn) { CLEANUP.push(fn); }
  function runCleanup() {
    while (CLEANUP.length) {
      try { CLEANUP.pop()(); } catch (e) { console.warn(e); }
    }
  }

  // ============================================================
  // ENGINE LOADERS
  // ============================================================
  const CDN = {
    nerdamer: [
      'https://cdn.jsdelivr.net/npm/nerdamer@1.1.13/All.min.js',
      'https://unpkg.com/nerdamer@1.1.13/All.min.js',
    ],
    tesseract: [
      'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js',
      'https://unpkg.com/tesseract.js@5.0.4/dist/tesseract.min.js',
    ],
  };

  function loadScript(urls, name, onDone) {
    let i = 0;
    function tryNext() {
      if (i >= urls.length) { console.warn('[vite] failed to load ' + name); return; }
      const s = document.createElement('script');
      s.src = urls[i++];
      s.onload = () => onDone && onDone();
      s.onerror = tryNext;
      document.head.appendChild(s);
    }
    tryNext();
  }

  loadScript(CDN.nerdamer, 'nerdamer', () => {
    if (window.nerdamer) console.log('%c[vite] nerdamer ready', 'color:#8a8a8a');
  });
  loadScript(CDN.tesseract, 'tesseract', () => {
    if (window.Tesseract) console.log('%c[vite] ocr ready', 'color:#8a8a8a');
  });

  // ============================================================
  // BUTTON
  // ============================================================
  const btn = document.createElement('div');
  btn.id = '__dm_btn';
  btn.style.cssText = `
    position:fixed;bottom:20px;right:20px;width:44px;height:44px;
    border-radius:50%;
    background:#ffffff;
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;user-select:none;
    z-index:2147483000;
    border:1px solid rgba(0,0,0,.05);
    box-shadow:0 2px 8px rgba(0,0,0,.16), 0 1px 3px rgba(0,0,0,.10);
    transition:background .12s ease, box-shadow .12s ease;`;
  btn.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
         stroke="#2d3748" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`;
  btn.addEventListener('mouseenter', () => {
    btn.style.background = '#f9fafb';
    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,.20), 0 2px 4px rgba(0,0,0,.12)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = '#ffffff';
    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,.16), 0 1px 3px rgba(0,0,0,.10)';
  });
  document.documentElement.appendChild(btn);
  btn.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    run();
  }, true);
  btn.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    openMenu();
  }, true);

  // ============================================================
  // HELPERS
  // ============================================================
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

  // ============================================================
  // MATH DOM WALKER — handles MathQuill, KaTeX, MathML
  // ============================================================
  function walkMath(node) {
    if (!node) return '';
    if (node.nodeType === 3) return node.textContent || '';
    if (node.nodeType !== 1) return '';

    const cls = typeof node.className === 'string' ? node.className : '';
    const tag = (node.tagName || '').toLowerCase();

    // ----- MathQuill -----
    if (/mq-fraction/.test(cls)) {
      const num = node.querySelector('.mq-numerator');
      const den = node.querySelector('.mq-denominator');
      return '(' + (num ? walkMath(num) : '?') + ')/(' + (den ? walkMath(den) : '?') + ')';
    }
    if (/mq-superscript/.test(cls)) {
      const sup = node.querySelector('.mq-sup');
      return '^(' + (sup ? walkMath(sup) : '?') + ')';
    }
    if (/mq-subscript/.test(cls)) {
      const sub = node.querySelector('.mq-sub');
      return '_(' + (sub ? walkMath(sub) : '?') + ')';
    }
    if (/mq-sqrt|mq-radical/.test(cls)) {
      const inner = node.querySelector('.mq-non-leaf, .mq-root-block');
      return 'sqrt(' + (inner ? walkMath(inner) : '?') + ')';
    }
    if (/\bmq-sup\b|\bmq-sub\b|\bmq-numerator\b|\bmq-denominator\b|\bmq-fraction-bar\b|\bmq-cursor\b/.test(cls)) {
      return '';
    }

    // ----- KaTeX -----
    if (/\bkatex\b/.test(cls) && !/katex-mathml|katex-html|katex-display/.test(cls)) {
      const mml = node.querySelector('.katex-mathml');
      if (mml) return walkMath(mml);
      const html = node.querySelector('.katex-html');
      if (html) return walkMath(html);
      return '';
    }
    if (/katex-html/.test(cls)) {
      let out = '';
      for (const c of node.childNodes) out += walkMath(c);
      return out;
    }
    if (/katex-mathml/.test(cls)) {
      const math = node.querySelector('math');
      return math ? walkMath(math) : '';
    }

    // ----- MathML -----
    if (tag === 'mfrac') {
      const kids = Array.from(node.children);
      return '(' + walkMath(kids[0]) + ')/(' + walkMath(kids[1]) + ')';
    }
    if (tag === 'msup') {
      const kids = Array.from(node.children);
      return walkMath(kids[0]) + '^(' + walkMath(kids[1]) + ')';
    }
    if (tag === 'msub') {
      const kids = Array.from(node.children);
      return walkMath(kids[0]) + '_(' + walkMath(kids[1]) + ')';
    }
    if (tag === 'msqrt') {
      return 'sqrt(' + Array.from(node.children).map(walkMath).join('') + ')';
    }
    if (tag === 'mroot') {
      const kids = Array.from(node.children);
      return '(' + walkMath(kids[0]) + ')^(1/(' + walkMath(kids[1]) + '))';
    }
    if (tag === 'semantics') {
      for (const c of node.children) {
        const t = (c.tagName || '').toLowerCase();
        if (t === 'annotation' || t === 'annotation-xml') continue;
        return walkMath(c);
      }
      return '';
    }
    if (tag === 'annotation' || tag === 'annotation-xml') return '';

    // ----- default -----
    let out = '';
    for (const c of node.childNodes) out += walkMath(c);
    return out;
  }

  // ============================================================
  // PROBLEM TEXT + OCR
  // ============================================================
  function problemText() {
    // Clone the body so we can safely mutate for text extraction
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, link, meta, svg').forEach(n => n.remove());

    // Replace every rendered math element with its reconstructed plain-text form
    clone.querySelectorAll('.katex, .mq-root-block, math, .MathJax, .MathJax_Preview').forEach(el => {
      if (!el.parentNode) return;
      const txt = walkMath(el);
      if (txt && txt.trim()) {
        el.replaceWith(document.createTextNode(' ' + txt + ' '));
      }
    });

    // Off-screen render so innerText computes correctly
    const hidden = document.createElement('div');
    hidden.style.cssText = 'position:absolute;left:-99999px;top:0;width:800px;pointer-events:none;';
    document.documentElement.appendChild(hidden);
    hidden.appendChild(clone);

    const raw = String(hidden.innerText)
      .replace(/[\u2212\u2013\u2014\u2015]/g, '-').replace(/[\u00a0\u2007\u202f]/g, ' ')
      .replace(/×/g, '*').replace(/÷/g, '/').replace(/√/g, 'sqrt');

    hidden.remove();

    const cut = raw.search(/\bAnswer\b|\bAttempt\b/);
    const body = cut > 0 ? raw.slice(0, cut) : raw;

    let lines = body.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim());

    lines = lines.filter(l => {
      if (!l) return false;
      if (/^=/.test(l)) return false;
      if (/, (equals|plus|minus|negative|x|y|z|a|b|c|w|is|the|of|over|times|divided)\b/i.test(l) && (l.match(/,/g) || []).length >= 3) return false;
      if (/^(minus|plus|negative|equals|open|close)\b/i.test(l)) return false;
      return true;
    });

    const merged = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], next = lines[i + 1];
      // merge a line ending in "=" with the following line
      if (/=\s*$/.test(l) && next && !/^=/.test(next) && next.length < 100) {
        merged.push(l + next);
        i++;
      } else {
        merged.push(l);
      }
    }
    return merged.join('\n');
  }

  function findQuestionImages() {
    const imgs = [...document.querySelectorAll('img')];
    return imgs.filter(im => {
      const w = im.naturalWidth || im.width;
      const h = im.naturalHeight || im.height;
      if (w < 80 || h < 40) return false;
      if (!im.src) return false;
      if (/logo|icon|avatar|deltamath\.com\/static/i.test(im.src)) return false;
      const r = im.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      return true;
    });
  }

  async function ocrImages() {
    if (!window.Tesseract) { showToast('OCR engine not ready'); return ''; }
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
      if (/\bQuestion\b/.test(t) && /\bAnswer\b|\bSubmit\b/.test(t)) {
        if (!target || t.length < (target.innerText || '').length) target = el;
      }
    }
    if (!target) { showToast('Could not find question region'); return; }
    try {
      showToast('capturing…');
      const rect = target.getBoundingClientRect();
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' } });
      const track = stream.getVideoTracks()[0];
      const imageCapture = new ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop();
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const sx = rect.left * (bitmap.width / window.innerWidth);
      const sy = rect.top * (bitmap.height / window.innerHeight);
      const sw = rect.width * (bitmap.width / window.innerWidth);
      const sh = rect.height * (bitmap.height / window.innerHeight);
      const cropped = document.createElement('canvas');
      cropped.width = sw; cropped.height = sh;
      cropped.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      cropped.toBlob(async blob => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast('copied — paste into a vision model');
        } catch (e) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'problem.png';
          a.click();
          showToast('downloaded problem.png');
        }
      }, 'image/png');
    } catch (e) {
      console.warn(e);
      showToast('capture cancelled');
    }
  }

  // ============================================================
  // EQUATION MODEL
  // ============================================================
  function parseEq(left, right) {
    const coef = {};
    const re = /([+-]?)\s*(\d*\.?\d*)\s*([a-z])/gi;
    let m; const s = String(left).replace(/\s/g, '');
    while ((m = re.exec(s))) {
      const sg = m[1] === '-' ? -1 : 1;
      const n = m[2] === '' || m[2] === '.' ? 1 : parseFloat(m[2]);
      const v = m[3].toLowerCase();
      coef[v] = (coef[v] || 0) + sg * n;
    }
    return { coef, rhs: parseFloat(String(right).replace(/\s/g, '')) || 0 };
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

  // ============================================================
  // PAPER-STYLE ELIMINATION
  // ============================================================
  function narrateSystem(eqs, vars) {
    const out = [];
    out.push('Given system:');
    out.push('');
    for (let i = 0; i < eqs.length; i++) out.push(`  (${i + 1})   ${fmtEq(eqs[i], vars)}`);
    out.push('');

    const allRows = [];
    let rows = eqs.map((e, i) => {
      const r = { coef: { ...e.coef }, rhs: e.rhs, label: String(i + 1) };
      allRows.push(r);
      return r;
    });
    let counter = eqs.length;

    for (let stepIdx = 0; stepIdx < vars.length - 1; stepIdx++) {
      const elimVar = vars[stepIdx];

      let allValid = true;
      for (let k = 0; k + 1 < rows.length; k++) {
        const cA = rows[k].coef[elimVar] || 0;
        const cB = rows[k + 1].coef[elimVar] || 0;
        if (Math.abs(cA) < 1e-10 || Math.abs(cB) < 1e-10) { allValid = false; break; }
      }
      if (!allValid) break;

      out.push(`Step ${stepIdx + 1}: Eliminate ${elimVar}`);
      out.push('');

      const nextRows = [];
      for (let k = 0; k + 1 < rows.length; k++) {
        const A = rows[k], B = rows[k + 1];
        const cA = A.coef[elimVar] || 0;
        const cB = B.coef[elimVar] || 0;

        out.push(`  Stack (${A.label}) and (${B.label}):`);
        out.push(`    (${A.label})   ${fmtEq(A, vars)}`);
        out.push(`    (${B.label})   ${fmtEq(B, vars)}`);
        out.push('');

        const g2 = gcd(Math.abs(Math.round(cA)), Math.abs(Math.round(cB)));
        const mA = Math.abs(Math.round(cB)) / g2;
        const mB = Math.abs(Math.round(cA)) / g2;
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
        nextRows.push(newRow);
        allRows.push(newRow);
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

        const v = unknowns[0];
        const cV = row.coef[v];

        const knownSubs = [];
        let sumKnown = 0;
        for (const other of vars) {
          if (other === v) continue;
          if (sol[other] !== undefined) {
            knownSubs.push(`${other} = ${frac(sol[other])}`);
            sumKnown += (row.coef[other] || 0) * sol[other];
          }
        }
        const rhsAfter = row.rhs - sumKnown;
        const val = rhsAfter / cV;
        sol[v] = val;

        out.push(`From (${row.label}):`);
        out.push(`  ${fmtEq(row, vars)}`);

        if (knownSubs.length > 0) {
          out.push(`  Substitute ${knownSubs.join(', ')}:`);

          let subLine = '', first = true;
          for (const vv of vars) {
            const c = row.coef[vv] || 0;
            if (Math.abs(c) < 1e-10) continue;
            let term;
            if (vv !== v && sol[vv] !== undefined) {
              const cStr = Math.abs(Math.abs(c) - 1) < 1e-10 ? '' : frac(Math.abs(c));
              const vStr = frac(sol[vv]);
              term = Math.abs(c) === 1 ? `(${vStr})` : `${cStr}(${vStr})`;
            } else {
              const absC = Math.abs(c);
              const cStr = Math.abs(absC - 1) < 1e-10 ? '' : frac(absC);
              term = cStr + vv;
            }
            if (first) { subLine += (c < 0 ? '−' : '') + term; first = false; }
            else subLine += (c < 0 ? ' − ' : ' + ') + term;
          }
          out.push(`    ${subLine} = ${frac(row.rhs)}`);

          let evalLine = '', first2 = true;
          for (const vv of vars) {
            const c = row.coef[vv] || 0;
            if (Math.abs(c) < 1e-10) continue;
            let term, isNeg;
            if (vv !== v && sol[vv] !== undefined) {
              const prod = c * sol[vv];
              term = frac(Math.abs(prod));
              isNeg = prod < 0;
            } else {
              const absC = Math.abs(c);
              const cStr = Math.abs(absC - 1) < 1e-10 ? '' : frac(absC);
              term = cStr + vv;
              isNeg = c < 0;
            }
            if (first2) { evalLine += (isNeg ? '−' : '') + term; first2 = false; }
            else evalLine += (isNeg ? ' − ' : ' + ') + term;
          }
          if (evalLine !== subLine) out.push(`    ${evalLine} = ${frac(row.rhs)}`);

          if (Math.abs(sumKnown) > 1e-10) {
            const absC = Math.abs(cV);
            const cStr = Math.abs(absC - 1) < 1e-10 ? '' : frac(absC);
            const combinedLine = (cV < 0 ? '−' : '') + cStr + v + (sumKnown < 0 ? ' − ' : ' + ') + frac(Math.abs(sumKnown));
            if (combinedLine !== evalLine) out.push(`    ${combinedLine} = ${frac(row.rhs)}`);
          }

          if (Math.abs(cV - 1) > 1e-10) {
            const cVStr = Math.abs(cV + 1) < 1e-10 ? '−' : frac(cV);
            out.push(`    ${cVStr}${v} = ${frac(rhsAfter)}`);
          }
        } else {
          if (Math.abs(cV - 1) > 1e-10) out.push(`  Divide both sides by ${frac(cV)}:`);
        }

        out.push(`    ${v} = ${frac(val)}`);
        out.push('');

        found = true;
        break;
      }
      if (!found) break;
    }

    out.push(`Solution:   ${vars.map(v => `${v} = ${frac(sol[v])}`).join(',   ')}`);
    return { answers: vars.map(v => ({ v, val: frac(sol[v]) })), work: out };
  }

  // ============================================================
  // CORE SOLVERS
  // ============================================================
  function nSystem(text) {
    const lines = text.split('\n');
    const eqs = [];
    for (const l of lines) {
      const m = l.match(/([+-]?[\d.]*\s*[a-z](?:\s*[+-]\s*[\d.]*\s*[a-z])+)\s*=\s*(-?[\d.]+)/i);
      if (m) eqs.push(parseEq(m[1], m[2]));
    }
    if (eqs.length < 2) return null;
    const varSet = new Set();
    for (const e of eqs) for (const v of Object.keys(e.coef)) varSet.add(v);
    const vars = [...varSet].sort();
    if (eqs.length !== vars.length) return null;
    try { return narrateSystem(eqs, vars); }
    catch (err) { console.warn('[vite] narrate error', err); return null; }
  }

  function nSingle(text) {
    const nd = window.nerdamer;
    // find the first line with both "=" and a letter, not starting with "="
    const eqLine = text.split('\n').find(l => /=/.test(l) && /[a-z]/i.test(l) && !/^\s*=/.test(l));
    if (!eqLine) { console.log('[vite] nSingle: no equation line'); return null; }
    let eq = cleanLine(eqLine);
    // (2)/(3) → (2/3) so nerdamer reads it as a single coefficient
    eq = eq.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, '($1/$2)');
    console.log('[vite] nSingle: solving', eq);

    const vars = [...new Set(eq.match(/[a-z]/gi) || [])].map(v => v.toLowerCase());
    if (vars.length !== 1) { console.log('[vite] nSingle: not single-var', vars); return null; }
    const v = vars[0];
    let sol; try { sol = nd.solve(eq, v); } catch (err) { console.log('[vite] nSingle: nerdamer error', err.message); return null; }
    const list = Array.isArray(sol) ? sol : [sol];
    const vals = list.map(x => x.toString()).filter(x => x !== '');
    if (!vals.length) { console.log('[vite] nSingle: no solutions'); return null; }
    const work = ['Equation:', `  ${eq}`, '', 'Solve for ' + v + ':', ''];
    for (const s of vals) work.push(`  ${v} = ${s}`);
    return { answers: [{ v, val: vals.join(', ') }], work };
  }

  function nQuadratic(text) {
    const nd = window.nerdamer;
    const m = text.match(/([^\n]*x\s*[\^²][^\n]*)/i);
    if (!m) return null;
    let eq = cleanLine(m[1]).replace(/x\s*²/g, 'x^2');
    if (!eq.includes('=')) eq += '=0';
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const list = Array.isArray(sol) ? sol : [sol];
    const vals = list.map(x => x.toString());
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
    return {
      answers: [{ v: 'distance', val: frac(dist) }, { v: 'midpoint', val: `(${frac(mid[0])}, ${frac(mid[1])})` }],
      work: ['Points:', `  (${a[0]}, ${a[1]})   (${b[0]}, ${b[1]})`, '', 'Distance:', `  d = √((${dx})² + (${dy})²) = ${frac(dist)}`, '', 'Midpoint:', `  M = ((${a[0]}+${b[0]})/2, (${a[1]}+${b[1]})/2) = (${frac(mid[0])}, ${frac(mid[1])})`]
    };
  }

  function manualSlope(text) {
    const pts = text.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g);
    if (!pts || pts.length < 2) return null;
    const [a, b] = pts.slice(0, 2).map(p => p.replace(/[()]/g, '').split(',').map(Number));
    const dy = b[1] - a[1], dx = b[0] - a[0];
    const slope = dx === 0 ? 'undefined' : frac(dy / dx);
    return {
      answers: [{ v: 'slope', val: slope }],
      work: ['Points:', `  (${a[0]}, ${a[1]})   (${b[0]}, ${b[1]})`, '', 'm = (y₂ − y₁) / (x₂ − x₁)', `  m = (${b[1]} − ${a[1]}) / (${b[0]} − ${a[0]})`, `  m = ${dy} / ${dx}`, `  m = ${slope}`]
    };
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
    const list = Array.isArray(sol) ? sol : [sol];
    const boundary = list.map(x => x.toString()).join(', ');
    return {
      answers: [{ v, val: `${op} ${boundary}` }],
      work: ['Inequality:', `  ${ineq}`, '', 'Solve the boundary equation:', `  ${eq}`, `  ${v} = ${boundary}`, '', 'Answer:', `  ${v} ${op} ${boundary}`]
    };
  }

  function solveAbsolute(text) {
    const m = text.match(/\|([^|]+)\|\s*=\s*(-?\d+\.?\d*)/);
    if (!m) return null;
    const nd = window.nerdamer;
    const inner = cleanLine(m[1]);
    const rhs = m[2];
    let sol1, sol2;
    try {
      sol1 = nd.solve(`${inner}=${rhs}`, 'x').toString();
      sol2 = nd.solve(`${inner}=−${rhs}`, 'x').toString();
    } catch (err) { return null; }
    return {
      answers: [{ v: 'x', val: `${sol1},   ${sol2}` }],
      work: ['Absolute value equation:', `  |${inner}| = ${rhs}`, '', 'Split into two cases:', `  Case 1:   ${inner} = ${rhs}    →   x = ${sol1}`, `  Case 2:   ${inner} = −${rhs}   →   x = ${sol2}`]
    };
  }

  function solveLog(text) {
    const nd = window.nerdamer;
    const m = text.match(/[^\n]*(?:\blog\b|\bln\b)[^\n]*=[^\n]*/i);
    if (!m) return null;
    const eq = cleanLine(m[0]).replace(/\s+/g, '');
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const list = Array.isArray(sol) ? sol : [sol];
    const vals = list.map(x => x.toString()).filter(v => v !== '');
    if (!vals.length) return null;
    return {
      answers: [{ v: 'x', val: vals.join(', ') }],
      work: ['Logarithmic equation:', `  ${eq}`, '', 'Rewrite in exponential form and solve:', '', ...vals.map(v => `  x = ${v}`)]
    };
  }

  function solveExp(text) {
    const nd = window.nerdamer;
    const m = text.match(/[^\n]*\d+\s*\^\s*\(?\s*x[^\n]*=[^\n]*/i) ||
              text.match(/[^\n]*e\s*\^\s*\(?\s*x[^\n]*=[^\n]*/i);
    if (!m) return null;
    const eq = cleanLine(m[0]).replace(/\s+/g, '');
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const list = Array.isArray(sol) ? sol : [sol];
    const vals = list.map(x => x.toString()).filter(v => v !== '');
    if (!vals.length) return null;
    return {
      answers: [{ v: 'x', val: vals.join(', ') }],
      work: ['Exponential equation:', `  ${eq}`, '', 'Take log of both sides and solve:', '', ...vals.map(v => `  x = ${v}`)]
    };
  }

  function solveRadical(text) {
    const nd = window.nerdamer;
    const m = text.match(/[^\n]*sqrt\s*\([^\n]*=[^\n]*/i);
    if (!m) return null;
    const eq = cleanLine(m[0]).replace(/\s+/g, '');
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const list = Array.isArray(sol) ? sol : [sol];
    const vals = list.map(x => x.toString()).filter(v => v !== '');
    if (!vals.length) return null;
    return {
      answers: [{ v: 'x', val: vals.join(', ') }],
      work: ['Radical equation:', `  ${eq}`, '', 'Isolate the radical, square both sides, solve:', '', ...vals.map(v => `  x = ${v}`), '', '(check for extraneous solutions)']
    };
  }

  function solveRational(text) {
    const nd = window.nerdamer;
    const m = text.match(/[^\n]*\/\s*\([^)]*x[^\n]*=[^\n]*/i) ||
              text.match(/[^\n]*\/\s*[a-z0-9][^\n]*=[^\n]*/i);
    if (!m) return null;
    const eq = cleanLine(m[0]).replace(/\s+/g, '');
    if (!/\/\s*\(?[^=]*x/.test(eq)) return null;
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const list = Array.isArray(sol) ? sol : [sol];
    const vals = list.map(x => x.toString()).filter(v => v !== '');
    if (!vals.length) return null;
    return {
      answers: [{ v: 'x', val: vals.join(', ') }],
      work: ['Rational equation:', `  ${eq}`, '', 'Multiply both sides by the LCD, solve:', '', ...vals.map(v => `  x = ${v}`), '', '(check excluded values)']
    };
  }

  function solveTrig(text) {
    const nd = window.nerdamer;
    const m = text.match(/[^\n]*(?:\bsin\b|\bcos\b|\btan\b)[^\n]*=[^\n]*/i);
    if (!m) return null;
    const eq = cleanLine(m[0]).replace(/\s+/g, '');
    let sol; try { sol = nd.solve(eq, 'x'); } catch (err) { return null; }
    const list = Array.isArray(sol) ? sol : [sol];
    const vals = list.map(x => x.toString()).filter(v => v !== '');
    if (!vals.length) return null;
    return {
      answers: [{ v: 'x', val: vals.join(', ') }],
      work: ['Trig equation:', `  ${eq}`, '', 'General solution:', ...vals.map(v => `  x = ${v}`), '', '(n is any integer)']
    };
  }

  function solveSystemIneq(text) {
    const nd = window.nerdamer;
    const lines = text.split('\n');
    const ineqs = [];
    for (const l of lines) {
      const m = l.match(/[+-]?[\d.]*\s*[a-z]\s*(?:[+-]\s*[\d.]*\s*[a-z])*\s*(<=|>=|<|>|≤|≥)\s*-?[\d.]+/);
      if (m) ineqs.push(cleanLine(l).replace(/≤/g, '<=').replace(/≥/g, '>='));
    }
    if (ineqs.length < 2) return null;
    const work = ['System of inequalities:'];
    ineqs.forEach((ineq, i) => work.push(`  (${i+1})   ${ineq}`));
    work.push('', 'Solve each inequality for y and graph the boundary lines.', 'Shade the overlapping region (test a point).', '');
    for (let i = 0; i < ineqs.length; i++) {
      const v = ineqs[i].match(/([a-z])/i);
      if (!v) continue;
      const varName = v[1].toLowerCase();
      const opMatch = ineqs[i].match(/<=|>=|<|>/);
      if (!opMatch) continue;
      const eq = ineqs[i].replace(/<=|>=|<|>/, '=');
      let sol; try { sol = nd.solve(eq, varName); } catch(e) { continue; }
      const list = Array.isArray(sol) ? sol : [sol];
      work.push(`  (${i+1})   ${varName} ${opMatch[0]} ${list.map(x => x.toString()).join(', ')}`);
    }
    return { answers: [{ v: 'system', val: 'see work' }], work };
  }

  function solvePolyOps(text) {
    const nd = window.nerdamer;
    const m = text.match(/(?:add|subtract|multiply|divide|expand|simplify|rewrite in standard form)[:\s]+([^\n]+)/i) ||
              text.match(/(\([^\)]*[a-z][^\)]*\)\s*[\+\-\*\/×]\s*\([^\)]*[a-z][^\)]*\))/);
    if (!m) return null;
    const expr = cleanLine(m[1] || m[0]).replace(/^.*?:\s*/, '');
    let out;
    try { out = nd(expr).expand().toString(); } catch (err) { return null; }
    return {
      answers: [{ v: 'result', val: out }],
      work: ['Expression:', `  ${expr}`, '', 'Simplify and combine like terms:', `  ${out}`]
    };
  }

  function solveComposition(text) {
    const nd = window.nerdamer;
    const fDef = text.match(/f\s*\(\s*x\s*\)\s*=\s*([^,\n]+)/i);
    const gDef = text.match(/g\s*\(\s*x\s*\)\s*=\s*([^,\n]+)/i);
    const comp = text.match(/f\s*\(\s*g\s*\(\s*x\s*\)\s*\)/i);
    const inv = text.match(/f\s*(?:-1|⁻¹|\^\{-1\})\s*\(\s*x\s*\)/i);
    const evalAt = text.match(/f\s*\(\s*(-?\d+)\s*\)/i);

    if (comp && fDef && gDef) {
      const fexpr = cleanLine(fDef[1]);
      const gexpr = cleanLine(gDef[1]);
      let out;
      try { out = nd(fexpr).sub('x', `(${gexpr})`).expand().toString(); } catch(e) { return null; }
      return {
        answers: [{ v: 'f(g(x))', val: out }],
        work: ['f(x) = ' + fexpr, 'g(x) = ' + gexpr, '', 'f(g(x)) = ' + fexpr.replace(/x/g, `(${gexpr})`), '        = ' + out]
      };
    }

    if (inv && fDef) {
      const fexpr = cleanLine(fDef[1]);
      let out;
      try { out = nd.solve(`y=${fexpr}`, 'x').toString(); } catch(e) { return null; }
      return {
        answers: [{ v: 'f⁻¹(x)', val: out }],
        work: ['f(x) = ' + fexpr, '', 'Set y = f(x), solve for x:', `  y = ${fexpr}`, `  x = ${out}`, '', `f⁻¹(x) = ${out}`]
      };
    }

    if (evalAt && fDef) {
      const fexpr = cleanLine(fDef[1]);
      const xVal = evalAt[1];
      let out;
      try { out = nd(fexpr).sub('x', xVal).evaluate().toString(); } catch(e) { return null; }
      return {
        answers: [{ v: `f(${xVal})`, val: out }],
        work: ['f(x) = ' + fexpr, '', `Substitute x = ${xVal}:`, `  f(${xVal}) = ${fexpr.replace(/x/g, `(${xVal})`)}`, `           = ${out}`]
      };
    }
    return null;
  }

  function solveStats(text) {
    const nums = text.match(/-?\d+\.?\d*(?:\s*,\s*-?\d+\.?\d*){2,}/);
    if (!nums) return null;
    const arr = nums[0].split(',').map(s => parseFloat(s.trim()));
    if (arr.length < 2) return null;

    const sorted = [...arr].sort((a,b) => a-b);
    const n = arr.length;
    const sum = arr.reduce((a,b) => a+b, 0);
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

    return {
      answers: [
        { v: 'mean', val: frac(mean) },
        { v: 'median', val: frac(median) },
        { v: 'mode', val: modeStr },
        { v: 'range', val: frac(range) },
        { v: 'stdev', val: frac(stdev) },
      ],
      work: [
        'Data:', `  ${arr.join(', ')}`, '',
        'Sorted:', `  ${sorted.join(', ')}`, '',
        'Mean:', `  (${arr.join(' + ')}) / ${n} = ${frac(mean)}`,
        'Median:', `  ${frac(median)}`,
        'Mode:', `  ${modeStr}`,
        'Range:', `  ${sorted[n-1]} − ${sorted[0]} = ${frac(range)}`,
        'Standard deviation (sample):', `  ${frac(stdev)}`
      ]
    };
  }

  function solveQuadForm(text) {
    const m = text.match(/([+-]?[\d.]*)\s*x\s*[\^²]\s*([+-]\s*[\d.]*)\s*x\s*([+-]\s*[\d.]+)?/);
    if (!m) return null;
    const aStr = m[1];
    const bStr = m[2].replace(/\s/g, '');
    const cStr = (m[3] || '0').replace(/\s/g, '');
    const a = aStr === '' || aStr === '+' ? 1 : aStr === '-' ? -1 : parseFloat(aStr);
    const b = bStr === '' || bStr === '+' ? 1 : bStr === '-' ? -1 : parseFloat(bStr);
    const c = cStr === '' ? 0 : parseFloat(cStr);
    if (!a) return null;

    const vertexX = -b / (2*a);
    const vertexY = a*vertexX*vertexX + b*vertexX + c;
    const disc = b*b - 4*a*c;

    return {
      answers: [
        { v: 'vertex', val: `(${frac(vertexX)}, ${frac(vertexY)})` },
        { v: 'axis', val: `x = ${frac(vertexX)}` },
        { v: 'discriminant', val: frac(disc) }
      ],
      work: [
        'Quadratic:', `  y = ${fmtQuadratic(a, b, c)}`, '',
        `  a = ${a},   b = ${b},   c = ${c}`, '',
        'Axis of symmetry:',
        `  x = −b / (2a) = −(${b}) / (2·${a}) = ${frac(vertexX)}`, '',
        'Vertex:', `  (${frac(vertexX)}, ${frac(vertexY)})`, '',
        'Discriminant:', `  b² − 4ac = ${b}² − 4(${a})(${c}) = ${frac(disc)}`, '',
        'Y-intercept:', `  (0, ${frac(c)})`
      ]
    };
  }

  function fmtQuadratic(a, b, c) {
    let s = '';
    if (a === 1) s += 'x²';
    else if (a === -1) s += '−x²';
    else s += frac(a) + 'x²';
    if (b > 0) s += ' + ' + (b === 1 ? '' : frac(b)) + 'x';
    else if (b < 0) s += ' − ' + (b === -1 ? '' : frac(Math.abs(b))) + 'x';
    if (c > 0) s += ' + ' + frac(c);
    else if (c < 0) s += ' − ' + frac(Math.abs(c));
    return s;
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

    return {
      answers: [{ v: 'y', val: eq.slice(4) }],
      work: ['Line equation:', '', `  slope m = ${mStr}`, `  y-intercept b = ${frac(b)}`, '', 'Slope-intercept form:', `  ${eq}`]
    };
  }

  function solveSequence(text) {
    const nums = text.match(/-?\d+\.?\d*(?:\s*,\s*-?\d+\.?\d*){2,}/);
    if (!nums) return null;
    const arr = nums[0].split(',').map(s => parseFloat(s.trim()));
    if (arr.length < 3) return null;

    const d1 = arr[1] - arr[0];
    const d2 = arr[2] - arr[1];
    if (Math.abs(d1 - d2) < 1e-10) {
      const d = d1;
      const next = arr[arr.length - 1] + d;
      const an = arr[0] + (arr.length - 1) * d;
      return {
        answers: [{ v: 'd', val: frac(d) }, { v: 'next', val: frac(next) }],
        work: ['Sequence:', `  ${arr.join(', ')}`, '', 'Common difference:', `  d = ${arr[1]} − ${arr[0]} = ${frac(d)}`, `  (check: ${arr[2]} − ${arr[1]} = ${frac(d2)})`, '', `Last given term (n=${arr.length}):`, `  a${arr.length} = ${frac(an)}`, `Next term:`, `  a${arr.length+1} = ${frac(an)} + ${frac(d)} = ${frac(next)}`]
      };
    }

    if (arr[0] !== 0) {
      const r1 = arr[1] / arr[0];
      const r2 = arr[2] / arr[1];
      if (Math.abs(r1 - r2) < 1e-10) {
        const next = arr[arr.length - 1] * r1;
        return {
          answers: [{ v: 'r', val: frac(r1) }, { v: 'next', val: frac(next) }],
          work: ['Sequence:', `  ${arr.join(', ')}`, '', 'Common ratio:', `  r = ${arr[1]} / ${arr[0]} = ${frac(r1)}`, `  (check: ${arr[2]} / ${arr[1]} = ${frac(r2)})`, '', 'Next term:', `  ${frac(arr[arr.length-1])} × ${frac(r1)} = ${frac(next)}`]
        };
      }
    }
    return null;
  }

  function solveGeometry(text) {
    const t = text.toLowerCase();

    const rMatch = t.match(/radius\s*(?:of|=|is)?\s*(-?\d+\.?\d*)/i) || t.match(/r\s*=\s*(-?\d+\.?\d*)/);
    if (rMatch && /circle/i.test(t)) {
      const r = parseFloat(rMatch[1]);
      const area = Math.PI * r * r;
      const circ = 2 * Math.PI * r;
      return {
        answers: [{ v: 'area', val: frac(Math.round(area*100)/100) }, { v: 'circumference', val: frac(Math.round(circ*100)/100) }],
        work: ['Circle, r = ' + r, '', 'Area:', `  A = πr² = π(${r})² = ${frac(Math.round(area*100)/100)}`, 'Circumference:', `  C = 2πr = 2π(${r}) = ${frac(Math.round(circ*100)/100)}`]
      };
    }

    const lM = t.match(/length\s*(?:of|=|is)?\s*(\d+\.?\d*)/i);
    const wM = t.match(/width\s*(?:of|=|is)?\s*(\d+\.?\d*)/i);
    if (lM && wM) {
      const l = parseFloat(lM[1]), w = parseFloat(wM[1]);
      return {
        answers: [{ v: 'area', val: frac(l*w) }, { v: 'perimeter', val: frac(2*(l+w)) }],
        work: [`Rectangle, l = ${l}, w = ${w}`, '', 'Area:', `  A = l × w = ${l} × ${w} = ${frac(l*w)}`, 'Perimeter:', `  P = 2l + 2w = 2(${l}) + 2(${w}) = ${frac(2*(l+w))}`]
      };
    }

    const bM = t.match(/base\s*(?:of|=|is)?\s*(\d+\.?\d*)/i);
    const hM = t.match(/height\s*(?:of|=|is)?\s*(\d+\.?\d*)/i);
    if (bM && hM) {
      const b = parseFloat(bM[1]), h = parseFloat(hM[1]);
      return {
        answers: [{ v: 'area', val: frac(b*h/2) }],
        work: [`Triangle, b = ${b}, h = ${h}`, '', 'Area:', `  A = ½bh = ½(${b})(${h}) = ${frac(b*h/2)}`]
      };
    }
    return null;
  }

  // ============================================================
  // WORD PROBLEM SOLVER (Groq) — last resort only
  // ============================================================
  const WORD_SYSTEM_PROMPT = `You are a math tutor helping a student solve a word problem.

The input text is scraped from a homework page and may contain noise (menu labels, headers, mangled KaTeX). Reconstruct the intended problem first, then solve.

Return ONLY valid JSON, no prose, matching this exact shape:
{
  "variables": ["x", "y"],
  "meanings": {"x": "Bill's age", "y": "Sam's age"},
  "equations": ["x = 2y", "(x+5) + (y+5) = 40"],
  "solution": {"x": "10", "y": "5"},
  "work": ["Let x = Bill's age...", "x = 2y", "..."]
}

Rules:
- Equations use standard math notation (x, y, =, +, -, *, /, ^).
- Solution values are exact — use fractions like "3/2" instead of "1.5" when applicable.
- Work steps read like a student writing in a notebook.
- If unsolvable or not a math problem, return {"error": "reason"}.`;

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

  async function askGroq(userText) {
    let key = getGroqKey();
    if (!key) key = promptForKey();
    if (!key) throw new Error('no key');

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: CONFIG.GROQ_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: WORD_SYSTEM_PROMPT },
          { role: 'user', content: userText },
        ],
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      if (r.status === 401) { clearGroqKey(); showToast('bad key — cleared, try again'); }
      throw new Error(`Groq ${r.status}: ${err.slice(0, 120)}`);
    }
    const data = await r.json();
    return JSON.parse(data.choices[0].message.content);
  }

  async function solveWordProblem(text) {
    if (!getGroqKey()) {
      const k = promptForKey();
      if (!k) { showToast('cancelled — key required'); return null; }
    }
    const clean = text.split('\n').map(l => l.trim()).filter(l => l.length > 0).join(' ').trim();
    if (clean.length < 15) { showToast('problem too short'); return null; }

    showToast('asking AI…');
    let data;
    try { data = await askGroq(clean); }
    catch (e) { console.warn(e); showToast('Groq call failed — see console'); return null; }
    if (data.error) { showToast('AI: ' + data.error); return null; }
    if (!data.solution || !data.variables) { showToast('AI gave bad response'); return null; }

    const answers = data.variables.map(v => ({
      v, val: data.solution[v] != null ? String(data.solution[v]) : '?',
    }));

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

  // ============================================================
  // DISPATCH
  // ============================================================
  function detect(t) {
    if (/\bsolve the (following )?system\b/i.test(t)) return 'system';
    if (/\bsolve\b/i.test(t) && /[<>≤≥]/.test(t) && /[a-z]\s*[<>≤≥]/.test(t)) {
      const ineqCount = (t.match(/[<>≤≥]/g) || []).length;
      if (ineqCount >= 2) return 'systemIneq';
      return 'inequality';
    }
    if (/\|.*\|/.test(t) && /\bsolve\b/i.test(t)) return 'abs';
    if (/\b(sin|cos|tan)\s*\(?/i.test(t) && /[=]/.test(t) && /\bsolve\b/i.test(t)) return 'trig';
    if (/(?:^|\s)(?:log|ln)\s*[\(\d]/.test(t) && /[=]/.test(t) && /\bsolve\b/i.test(t)) return 'log';
    if (/[\de]\s*\^\s*\(?\s*[a-z]/i.test(t) && /\bsolve\b/i.test(t)) return 'exp';
    if (/sqrt\s*\(/i.test(t) && /[=]/.test(t) && /\bsolve\b/i.test(t)) return 'radical';
    if (/\/\s*\([^)]*x/i.test(t) && /[=]/.test(t) && /\bsolve\b/i.test(t)) return 'rational';
    if (/\b(vertex|axis of symmetry|discriminant)\b/i.test(t)) return 'quadForm';
    if (/x\s*[\^²]/.test(t)) return 'quadratic';
    if (/f\s*\(\s*g\s*\(\s*x\s*\)\s*\)/i.test(t)) return 'composition';
    if (/f\s*(?:-1|⁻¹|\^\{-1\})\s*\(/i.test(t)) return 'composition';
    if (/f\s*\(\s*x\s*\)\s*=/i.test(t)) return 'composition';
    if (/\b(mean|median|mode|range|standard deviation|stdev)\b/i.test(t)) return 'stats';
    if (/\b(sequence|arithmetic|geometric|nth term|next term|common difference|common ratio)\b/i.test(t)) return 'sequence';
    if (/\b(slope.intercept|point.slope|equation of the line|line through)\b/i.test(t)) return 'line';
    if (/\bslope\b/i.test(t) && /\(-?\d+\s*,\s*-?\d+\)/.test(t)) return 'slope';
    if (/\b(add|subtract|multiply|divide|expand)\b/i.test(t) && /\([^)]*[a-z][^)]*\)/.test(t)) return 'polyOps';
    if (/\bsolve\b.*\bfor\b/i.test(t) || /\bsolve\b/i.test(t)) {
      const lines = t.split('\n');
      const eqLines = lines.filter(l => /[a-z]/i.test(l) && /=/.test(l));
      const sv = eqLines.filter(l => (l.match(/[a-z]/gi) || []).length === 1);
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

    console.log('%c[vite:problem]', 'color:#7a9ec9', '\n' + text);
    const type = detect(text);
    console.log('%c[vite] detected:', 'color:#7a9ec9', type);

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
      abs: nd ? solveAbsolute : null,
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
      word: solveWordProblem,
    };
    const fn = table[type];
    if (!fn) { showToast(`Unrecognized (${type})`); return; }
    let r; try { r = await fn(text); } catch (e) { console.warn(e); r = null; }
    if (!r) { showToast(`Couldn't solve (${type})`); return; }
    showModal(r);
  }

  // ============================================================
  // MENU
  // ============================================================
  function openMenu() {
    const old = document.getElementById('__dm_menu'); if (old) old.remove();
    const m = document.createElement('div');
    m.id = '__dm_menu';
    m.style.cssText = `position:fixed;bottom:64px;right:20px;background:#1c1c1f;color:#d0d0d0;
      font:12px/1.4 ui-monospace,Menlo,monospace;border:1px solid #2c2c30;border-radius:6px;
      padding:4px 0;z-index:2147483001;box-shadow:0 4px 18px rgba(0,0,0,.5);min-width:180px;`;
    const items = [
      ['Copy problem screenshot', () => copyQuestionScreenshot()],
      ['Read text from image (OCR)', async () => { const t = await ocrImages(); showToast(t ? 'read: ' + t.slice(0, 60) : 'no image'); }],
      ['Set Groq API key', () => promptForKey()],
      ['Clear Groq API key', () => { clearGroqKey(); showToast('key cleared'); }],
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

  // ============================================================
  // SELF UPDATE — full teardown + reinject
  // ============================================================
  async function selfUpdate() {
    if (!CONFIG.SELF_UPDATE_URL) { showToast('no SELF_UPDATE_URL set'); return; }

    // 1. fetch fresh code FIRST — never tear down unless we have a replacement
    showToast('updating…');
    let code;
    try {
      const url = CONFIG.SELF_UPDATE_URL + (CONFIG.SELF_UPDATE_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      code = await r.text();
      if (!code || code.length < 200) throw new Error('empty response');
    } catch (e) {
      console.warn(e);
      showToast('update failed — fetch');
      return;
    }

    // 2. full teardown of the current instance
    try { runCleanup(); } catch (e) { console.warn(e); }
    document.querySelectorAll('#__dm_btn, #__dm_modal, #__dm_menu, #__dm_toast').forEach(n => n.remove());
    [...document.querySelectorAll('[id^="__dm_"]')].forEach(n => n.remove());
    window.__dm3 = 0;

    // 3. let the browser settle
    await new Promise(res => setTimeout(res, 60));

    // 4. inject fresh version
    try {
      (0, eval)(code);
      console.log('%c[vite] updated to fresh build', 'color:#8a8a8a');
    } catch (e) {
      console.warn(e);
      console.error('[vite] update eval failed — old instance gone. Re-paste manually.');
      window.__dm3 = 0;
    }
  }

  // ============================================================
  // MODAL
  // ============================================================
  function showModal(r) {
    const old = document.getElementById('__dm_modal'); if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = '__dm_modal';
    wrap.style.cssText = `position:fixed;inset:0;background:rgba(15,23,42,.35);
      backdrop-filter:blur(2px);z-index:2147483001;display:flex;
      align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;`;
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });

    const answers = r.answers.map(a => `
      <div style="display:flex;align-items:baseline;gap:14px;margin:6px 0">
        <span style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:22px;color:#333">${a.v}</span>
        <span style="font-size:20px;color:#999">=</span>
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:#111">${a.val}</span>
      </div>`).join('');

    const box = document.createElement('div');
    box.style.cssText = `background:#fff;color:#111;padding:26px 30px;border-radius:10px;
      min-width:340px;max-width:680px;max-height:88vh;display:flex;flex-direction:column;
      box-shadow:0 20px 60px rgba(0,0,0,.3),0 0 0 1px rgba(0,0,0,.06);`;
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
    t.style.cssText = `position:fixed;bottom:70px;right:20px;background:rgba(28,28,30,.9);
      color:#e6e6e6;font:12px/1.4 -apple-system,'Segoe UI',Roboto,sans-serif;
      padding:8px 14px;border-radius:6px;z-index:2147483001;box-shadow:0 4px 12px rgba(0,0,0,.3);`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  console.log('%c[vite] connected', 'color:#8a8a8a');
})();
                                                                  
