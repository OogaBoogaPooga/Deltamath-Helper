/* DeltaMath assistant — single-file console script
 * Load: fetch('https://raw.githubusercontent.com/<you>/<repo>/main/dm.js').then(r=>r.text()).then(eval)
 */

(function () {
  if (window.__dm3) { console.log('already running'); return; }
  window.__dm3 = 1;

  // ============================================================
  // CONFIG
  // ============================================================
  const CONFIG = {
    SELF_UPDATE_URL: '',
    OCR_LANG: 'eng',
  };

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
  btn.style.cssText = `position:fixed;bottom:20px;right:20px;width:36px;height:36px;
    border-radius:50%;background:rgba(28,28,30,.85);display:flex;align-items:center;
    justify-content:center;cursor:pointer;user-select:none;z-index:2147483000;
    box-shadow:0 2px 10px rgba(0,0,0,.35);backdrop-filter:blur(8px);
    -webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.08);
    transition:background .15s;`;
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="22" height="22" fill="#c8c8c8">
    <path d="M32 12 L58 24 L32 36 L6 24 Z"/>
    <path d="M18 30 L18 40 Q18 48 32 51 Q46 48 46 40 L46 30 L42 32 L42 40 Q42 44 32 46 Q22 44 22 40 L22 32 Z"/>
    <line x1="6" y1="24" x2="6" y2="36" stroke="#c8c8c8" stroke-width="1.6"/>
    <circle cx="6" cy="38" r="2.6"/>
    <path d="M3 42 L9 42 Q11 51 6 53 Q1 51 3 42 Z"/>
  </svg>`;
  btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(40,40,42,.95)');
  btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(28,28,30,.85)');
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
  // PROBLEM TEXT + OCR
  // ============================================================
  function problemText() {
    const raw = String(document.body.innerText)
      .replace(/[\u2212\u2013\u2014\u2015]/g, '-').replace(/[\u00a0\u2007\u202f]/g, ' ')
      .replace(/×/g, '*').replace(/÷/g, '/').replace(/√/g, 'sqrt');
    const cut = raw.search(/\bAnswer\b|\bAttempt\b/);
    const body = cut > 0 ? raw.slice(0, cut) : raw;
    let lines = body.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim());
    lines = lines.filter(l => {
      if (!l) return false;
      if (/, (equals|plus|minus|negative|x|y|z|a|b|c|w|is|the|of|over|times|divided)\b/i.test(l) && (l.match(/,/g) || []).length >= 3) return false;
      if (/^(minus|plus|negative|equals|open|close)\b/i.test(l)) return false;
      return true;
    });
    const merged = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], next = lines[i + 1];
      if (/=\s*$/.test(l) && next && /^-?\d+\.?\d*\s*$/.test(next)) { merged.push(l + next); i++; }
      else merged.push(l);
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
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
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

  // ============================================================
  // PAPER-STYLE ELIMINATION
  // ============================================================
  function narrateSystem(eqs, vars) {
    const out = [];
    out.push('Given system:');
    out.push('');
    for (let i = 0; i < eqs.length; i++) out.push(`  (${i + 1})   ${fmtEq(eqs[i], vars)}`);
    out.push('');

    let rows = eqs.map((e, i) => ({ coef: { ...e.coef }, rhs: e.rhs, label: String(i + 1) }));
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

      out.push(`Step ${stepIdx + 1}:  Eliminate ${elimVar}.`);
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
          if (mA !== 1) out.push(`    ${mA} × (${A.label}):   ${fmtEq(A2, vars)}`);
          if (mB !== 1) out.push(`    ${mB} × (${B.label}):   ${fmtEq(B2, vars)}`);
          out.push('');
        }

        counter++;
        const newLabel = String(counter);

        out.push(sameSign ? `  Subtract (${A.label}) from (${B.label}):` : `  Add the two equations:`);
        if (sameSign) {
          out.push(`    (${fmtEq(B2, vars)}) − (${fmtEq(A2, vars)})`);
        } else {
          out.push(`    (${fmtEq(A2, vars)}) + (${fmtEq(B2, vars)})`);
        }
        out.push(`    ${fmtEq(result, vars)}     ... (${newLabel})`);
        out.push('');

        nextRows.push({ coef: result.coef, rhs: result.rhs, label: newLabel });
      }
      rows = nextRows;
    }

    // ---- Solve ----
    const sol = {};
    const allRows = [
      ...rows,
      ...eqs.map((e, i) => ({ coef: e.coef, rhs: e.rhs, label: String(i + 1) }))
    ];

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

        out.push(`From (${row.label}):   ${fmtEq(row, vars)}`);

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
            out.push(`    ${frac(cV)}${v} = ${frac(rhsAfter)}`);
          }
        } else {
          if (Math.abs(cV - 1) > 1e-10) {
            out.push(`  Divide both sides by ${frac(cV)}:`);
          }
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
  // SOLVERS
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
    const m = text.match(/([^\n]*[a-z][^\n]*=[^\n]*)/i);
    if (!m) return null;
    const eq = cleanLine(m[1]);
    const vars = [...new Set(eq.match(/[a-z]/gi) || [])].map(v => v.toLowerCase());
    if (vars.length !== 1) return null;
    const v = vars[0];
    let sol; try { sol = nd.solve(eq, v); } catch (err) { return null; }
    const list = Array.isArray(sol) ? sol : [sol];
    const vals = list.map(x => x.toString());
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
    const work = [
      'Inequality:', `  ${ineq}`, '',
      'Solve the boundary equation:', `  ${eq}`, `  ${v} = ${boundary}`, '',
      'Answer:', `  ${v} ${op} ${boundary}`
    ];
    return { answers: [{ v, val: `${op} ${boundary}` }], work };
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
    const work = [
      'Absolute value equation:', `  |${inner}| = ${rhs}`, '',
      'Split into two cases:',
      `  Case 1:   ${inner} = ${rhs}    →   x = ${sol1}`,
      `  Case 2:   ${inner} = −${rhs}   →   x = ${sol2}`
    ];
    return { answers: [{ v: 'x', val: `${sol1},   ${sol2}` }], work };
  }

  // ============================================================
  // DISPATCH
  // ============================================================
  function detect(t) {
    if (/\bsolve the (following )?system\b/i.test(t)) return 'system';
    if (/\|.*\|/.test(t) && /\bsolve\b/i.test(t)) return 'abs';
    if (/[<>≤≥]/.test(t) && /\bsolve\b/i.test(t)) return 'inequality';
    if (/x\s*[\^²]/.test(t)) return 'quadratic';
    if (/\bsolve\b.*\bfor\b/i.test(t) || /\bsolve\b/i.test(t)) {
      const lines = t.split('\n');
      const eqLines = lines.filter(l => /[a-z]/i.test(l) && /=/.test(l));
      const sv = eqLines.filter(l => (l.match(/[a-z]/gi) || []).length === 1);
      if (sv.length) return 'single';
    }
    if (/\bsimplif|rewrite in simplest|combine like terms|expand|multiply\b/i.test(t)) return 'simplify';
    if (/\bfactor/i.test(t)) return 'factor';
    if (/\bdistance\b|\bmidpoint\b/i.test(t)) return 'distance';
    if (/\bslope\b/i.test(t) && /\(-?\d+\s*,\s*-?\d+\)/.test(t)) return 'slope';
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
      single: nd ? nSingle : null,
      quadratic: nd ? nQuadratic : null,
      simplify: nd ? nSimplify : null,
      factor: nd ? nFactor : null,
      distance: manualDistance,
      slope: manualSlope,
      inequality: nd ? solveInequality : null,
      abs: nd ? solveAbsolute : null,
    };
    const fn = table[type];
    if (!fn) { showToast(`Unrecognized (${type})`); return; }
    let r; try { r = fn(text); } catch (e) { console.warn(e); r = null; }
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
    if (!CONFIG.SELF_UPDATE_URL) { showToast('no SELF_UPDATE_URL set'); return; }
    try {
      const t = await (await fetch(CONFIG.SELF_UPDATE_URL)).text();
      window.__dm3 = 0;
      document.querySelectorAll('#__dm_modal,#__dm_menu,#__dm_toast').forEach(n => n.remove());
      [...document.querySelectorAll('div')].forEach(d => {
        if (d.style.position === 'fixed' && d.style.bottom === '20px' && d.style.right === '20px') d.remove();
      });
      (0, eval)(t);
      showToast('updated');
    } catch (e) { showToast('update failed'); }
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
