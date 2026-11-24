/*
 * Figure Suite — `plot`: function curves, points and bar charts on simple axes.
 *
 *   plot x=1..10 y=0..100 xlabel=n ylabel="T(n)"
 *     n^2                         curve; its label defaults to the expression (TeX)
 *     n \lg n "n \lg n" dashed    quoted text replaces the label
 *     vline: 3 n_0 dashed
 *     points: (1,1) (2,4) line
 *     bars: 3 1 4 1 5
 */

/* ---------------- expressions ---------------- */

const PLOT_FUNCS = {
  sqrt: Math.sqrt, lg: Math.log2, log: Math.log2, log2: Math.log2, ln: Math.log, log10: Math.log10,
  exp: Math.exp, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, min: Math.min, max: Math.max,
};
const PLOT_CONSTS = { e: Math.E, pi: Math.PI };
const PLOT_VARS = new Set(['n', 'x', 't', 'k']);

/** Γ(z) by the Lanczos approximation (for n!). */
function gammaFn(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  z -= 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * a;
}

/** TeX-ish expression → plain expression text. */
function plainExpr(src) {
  let s = String(src);
  for (let k = 0; k < 4; k++) s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
  return s
    .replace(/\\(cdot|times|ast)/g, '*')
    .replace(/\\(left|right|big|Big)/g, '')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\([A-Za-z]+)/g, ' $1 ')
    .replace(/\blog\s*_\s*\{?\s*(2|10)\s*\}?/g, 'log$1')
    .replace(/\{/g, '(').replace(/\}/g, ')');
}

/**
 * Compile an expression in one variable (n, x, t or k) into a function.
 * Throws Error with a readable message on bad input.
 */
function compileExpr(src) {
  const s = plainExpr(src);
  const toks = [];
  const re = /\s*(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[A-Za-z][A-Za-z0-9]*|\*\*|[-+*/^(),!])/gy;
  let m;
  let pos = 0;
  re.lastIndex = 0;
  while (pos < s.length) {
    if (/^\s*$/.test(s.slice(pos))) break;
    re.lastIndex = pos;
    m = re.exec(s);
    if (!m) throw new Error(`unexpected "${s.slice(pos).trim()[0]}"`);
    toks.push(m[1] === '**' ? '^' : m[1]);
    pos = re.lastIndex;
  }
  let i = 0;
  const peek = () => toks[i];
  const isNum = (t) => t != null && /^[\d.]/.test(t);
  const isIdent = (t) => t != null && /^[A-Za-z]/.test(t);
  const startsPrimary = (t) => isNum(t) || isIdent(t) || t === '(';

  function expr() {
    let f = term();
    while (peek() === '+' || peek() === '-') {
      const op = toks[i++];
      const a = f;
      const b = term();
      f = op === '+' ? (v) => a(v) + b(v) : (v) => a(v) - b(v);
    }
    return f;
  }
  function term() {
    let f = unary();
    for (;;) {
      const t = peek();
      if (t === '*' || t === '/') {
        i++;
        const a = f;
        const b = unary();
        f = t === '*' ? (v) => a(v) * b(v) : (v) => a(v) / b(v);
      } else if (startsPrimary(t)) {
        const a = f;
        const b = power();
        f = (v) => a(v) * b(v);
      } else return f;
    }
  }
  function unary() {
    if (peek() === '-') { i++; const a = unary(); return (v) => -a(v); }
    if (peek() === '+') { i++; return unary(); }
    return power();
  }
  function power() {
    const base = postfix();
    if (peek() === '^') {
      i++;
      const ex = unary();
      return (v) => base(v) ** ex(v);
    }
    return base;
  }
  function postfix() {
    let f = primary();
    while (peek() === '!') { i++; const a = f; f = (v) => gammaFn(a(v) + 1); }
    return f;
  }
  function primary() {
    const t = toks[i++];
    if (t == null) throw new Error('expression ends too early');
    if (isNum(t)) { const c = parseFloat(t); return () => c; }
    if (t === '(') {
      const f = expr();
      if (toks[i++] !== ')') throw new Error('missing )');
      return f;
    }
    if (isIdent(t)) {
      if (PLOT_VARS.has(t)) return (v) => v;
      if (t in PLOT_CONSTS) { const c = PLOT_CONSTS[t]; return () => c; }
      if (t in PLOT_FUNCS) {
        const fn = PLOT_FUNCS[t];
        if (peek() === '(') {
          i++;
          const args = [expr()];
          while (peek() === ',') { i++; args.push(expr()); }
          if (toks[i++] !== ')') throw new Error(`missing ) after ${t}(`);
          return (v) => fn(...args.map((a) => a(v)));
        }
        const a = power(); // lg n^2 = lg(n^2)
        return (v) => fn(a(v));
      }
      throw new Error(`unknown name "${t}" (variable: n, x, t or k; functions: ${Object.keys(PLOT_FUNCS).join(' ')})`);
    }
    throw new Error(`unexpected "${t}"`);
  }
  if (!toks.length) throw new Error('empty expression');
  const f = expr();
  if (i < toks.length) throw new Error(`unexpected "${toks[i]}"`);
  return f;
}

/* ---------------- axes helpers ---------------- */

function niceStep(range, target = 5) {
  if (!(range > 0)) return 1;
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

function fmtNum(v) {
  if (Math.abs(v) < 1e-12) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) {
    const e = Math.floor(Math.log10(a));
    const c = Number((v / 10 ** e).toPrecision(3));
    return c === 1 ? `10^{${e}}` : `${c} \\cdot 10^{${e}}`;
  }
  return String(Number(v.toPrecision(6)));
}

function parseFloatRange(text) {
  const m = String(text || '').match(/^\s*(-?[\d.]+(?:e[+-]?\d+)?)\s*(?:\.\.|:)\s*(-?[\d.]+(?:e[+-]?\d+)?)\s*$/i);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  return Number.isFinite(a) && Number.isFinite(b) && a !== b ? [Math.min(a, b), Math.max(a, b)] : null;
}

/** Clip segment p→q to the box [0,W]×[0,H] (Liang–Barsky); returns [p', q'] or null. */
function clipSeg(p, q, W, H) {
  let t0 = 0;
  let t1 = 1;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const edges = [[-dx, p[0]], [dx, W - p[0]], [-dy, p[1]], [dy, H - p[1]]];
  for (const [pp, qq] of edges) {
    if (Math.abs(pp) < 1e-12) { if (qq < 0) return null; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]];
}

/** Split a line's tokens into the expression part and trailing style options. */
function splitSeriesLine(text) {
  const toks = tokenize(text);
  const style = { flags: new Set(), opts: {}, label: null, color: null };
  let end = toks.length;
  while (end > 1) {
    const t = toks[end - 1];
    const kv = !t.quoted && t.text.match(KEYVAL);
    if (t.quoted) style.label = t.text;
    else if (kv) style.opts[kv[1].toLowerCase()] = unquote(kv[2]);
    else if (['dashed', 'dotted', 'solid', 'thick', 'nolabel', 'line', 'nodots'].includes(t.text)) style.flags.add(t.text);
    else if (isColor(t.text) && !PLOT_CONSTS[t.text]) style.color = t.text;
    else break;
    end--;
  }
  return { expr: toks.slice(0, end).map((t) => (t.quoted ? `"${t.text}"` : t.text)).join(' '), style };
}

const PLOT_BAR_FILLS = ['light', 'gray', 'lightblue', 'tan', 'pink', 'lightgreen'];

function layoutPlot(block, ctx, errors) {
  const size = ctx.size;
  const small = size * 0.8;
  const o = block.opts;
  const lw = ctx.lw;
  const W = num(o.w, size * 16);
  const H = num(o.h, size * 11);
  const curves = [];
  for (const entry of block.data) {
    const { expr, style } = splitSeriesLine(entry.text);
    try {
      const f = compileExpr(expr);
      curves.push({ f, expr, style, line: entry.line });
    } catch (err) {
      errors.push({ line: entry.line, msg: `plot: ${err.message} in "${expr}"` });
    }
  }
  const pointSets = [];
  const barSets = [];
  const ticks = { x: null, y: null };
  const refLines = [];
  for (const d of block.directives) {
    if (d.name === 'points') {
      const toks = tokenize(d.rest);
      const pts = [];
      const rest = [];
      for (const t of toks) { const p = !t.quoted && parsePoint(t.text); if (p) pts.push(p); else rest.push(t); }
      if (!pts.length) { errors.push({ line: d.line, msg: 'points: expected (x,y) pairs' }); continue; }
      const { style } = splitSeriesLine(`_ ${rest.map((t) => (t.quoted ? `"${t.text}"` : t.text)).join(' ')}`);
      pointSets.push({ pts, style, line: d.line });
    } else if (d.name === 'bars') {
      const toks = tokenize(d.rest);
      const vals = [];
      const rest = [];
      for (const t of toks) { const v = t.quoted ? NaN : Number(t.text); if (Number.isFinite(v)) vals.push(v); else rest.push(t); }
      if (!vals.length) { errors.push({ line: d.line, msg: 'bars: expected numbers' }); continue; }
      const { style } = splitSeriesLine(`_ ${rest.map((t) => (t.quoted ? `"${t.text}"` : t.text)).join(' ')}`);
      barSets.push({ vals, style, line: d.line });
    } else if (d.name === 'xticks' || d.name === 'yticks') {
      const list = [];
      for (const t of tokenize(d.rest)) {
        const mm = t.text.match(/^(-?[\d.]+(?:e[+-]?\d+)?)(?::(.*))?$/i);
        if (!mm) { errors.push({ line: d.line, msg: `${d.name}: "${t.text}" is not a number (write 3 or 3:n_0)`, warn: true }); continue; }
        list.push({ v: parseFloat(mm[1]), label: mm[2] != null ? mm[2] : null });
      }
      ticks[d.name[0]] = list;
    } else if (d.name === 'hline' || d.name === 'vline') {
      const toks = tokenize(d.rest);
      const v = toks.length ? Number(toks[0].text) : NaN;
      if (!Number.isFinite(v)) { errors.push({ line: d.line, msg: `${d.name}: expected a number first` }); continue; }
      const { style } = splitSeriesLine(`_ ${toks.slice(1).map((t) => (t.quoted ? `"${t.text}"` : t.text)).join(' ')}`);
      const words = toks.slice(1).filter((t) => !t.quoted && !['dashed', 'dotted', 'thick'].includes(t.text) && !isColor(t.text) && !KEYVAL.test(t.text));
      refLines.push({ axis: d.name === 'vline' ? 'x' : 'y', v, style, label: style.label ?? (words.map((t) => t.text).join(' ') || null) });
    }
  }

  // ranges
  let xr = parseFloatRange(o.x);
  if (o.x != null && !xr) errors.push({ line: block.line, msg: `plot x=${o.x}: expected a range like 0..10`, warn: true });
  let yr = parseFloatRange(o.y);
  if (o.y != null && !yr) errors.push({ line: block.line, msg: `plot y=${o.y}: expected a range like 0..100`, warn: true });
  const maxBars = Math.max(0, ...barSets.map((b) => b.vals.length));
  if (!xr) {
    const xs = pointSets.flatMap((p) => p.pts.map((q) => q[0])).concat(refLines.filter((r) => r.axis === 'x').map((r) => r.v));
    if (maxBars) xr = [0.4, maxBars + 0.6];
    else if (xs.length) {
      const lo = Math.min(0, ...xs);
      const hi = Math.max(...xs);
      xr = [lo, hi > lo ? hi : lo + 1];
    } else xr = [0, 10];
  }
  const N = 240;
  const samples = curves.map((c) => {
    const out = [];
    for (let k = 0; k <= N; k++) {
      const x = xr[0] + ((xr[1] - xr[0]) * k) / N;
      let y;
      try { y = c.f(x); } catch (e) { y = NaN; }
      out.push([x, y]);
    }
    return out;
  });
  if (!yr) {
    const ys = samples.flat().map((p) => p[1]).filter(Number.isFinite)
      .concat(pointSets.flatMap((p) => p.pts.map((q) => q[1])))
      .concat(barSets.flatMap((b) => b.vals))
      .concat(refLines.filter((r) => r.axis === 'y').map((r) => r.v));
    let lo = Math.min(0, ...ys);
    let hi = ys.length ? Math.max(...ys) : 1;
    if (!(hi > lo)) hi = lo + 1;
    const step = niceStep(hi - lo);
    lo = Math.floor(lo / step + 1e-9) * step;
    hi = Math.ceil(hi / step - 1e-9) * step;
    yr = [lo, hi];
  }
  const X = (x) => ((x - xr[0]) / (xr[1] - xr[0])) * W;
  const Y = (y) => H - ((y - yr[0]) / (yr[1] - yr[0])) * H;

  const rec = new Rec();
  rec.ext(0, 0, W, H);
  const showTicks = (o.ticks || 'on') !== 'none' && o.ticks !== 'off';
  const autoTicks = (r, isX) => {
    if (isX && maxBars && !parseFloatRange(o.x)) return Array.from({ length: maxBars }, (_, k) => ({ v: k + 1, label: null }));
    const step = niceStep(r[1] - r[0]);
    const out = [];
    for (let v = Math.ceil(r[0] / step - 1e-9) * step; v <= r[1] + step * 1e-9; v += step) out.push({ v: Math.abs(v) < step * 1e-9 ? 0 : v, label: null });
    return out;
  };
  const xt = ticks.x || (showTicks ? autoTicks(xr, true) : []);
  const yt = ticks.y || (showTicks ? autoTicks(yr, false) : []);
  // grid
  if (truthy(o.grid)) {
    for (const t of xt) if (t.v > xr[0] && t.v <= xr[1]) rec.line(X(t.v), 0, X(t.v), H, { width: lw * 0.6, color: '#d0d0d0' });
    for (const t of yt) if (t.v > yr[0] && t.v <= yr[1]) rec.line(0, Y(t.v), W, Y(t.v), { width: lw * 0.6, color: '#d0d0d0' });
  }
  // bars (grouped when several series)
  barSets.forEach((bs, s) => {
    const m = barSets.length;
    const bw = 0.8 / m;
    const col = fillFor(bs.style.color || PLOT_BAR_FILLS[s % PLOT_BAR_FILLS.length], ctx, 'array');
    const base = Math.max(yr[0], Math.min(yr[1], 0));
    bs.vals.forEach((v, k) => {
      const xc = k + 1 + (s - (m - 1) / 2) * bw;
      const x1 = X(xc - bw / 2);
      const x2 = X(xc + bw / 2);
      const vy = Math.max(yr[0], Math.min(yr[1], v));
      const top = Math.min(Y(vy), Y(base));
      const hgt = Math.abs(Y(vy) - Y(base));
      if (hgt > 0) rec.rect(x1, top, x2 - x1, hgt, col.fill, { width: lw });
    });
  });
  // reference lines
  for (const r of refLines) {
    const dash = r.style.flags.has('dotted') ? '1.5 3' : r.style.flags.has('dashed') || !r.style.flags.has('solid') ? '4 3' : null;
    const color = strokeOf(r.style.color, '#000000');
    if (r.axis === 'x' && r.v >= xr[0] && r.v <= xr[1]) {
      rec.line(X(r.v), 0, X(r.v), H, { width: lw, dash, color });
      if (r.label) { const m = labelSize(r.label, size); rec.label(r.label, X(r.v), H + size * 0.45 + (xt.length ? labelSize('0', small).h + 2 : 0) + m.h / 2, size); }
    } else if (r.axis === 'y' && r.v >= yr[0] && r.v <= yr[1]) {
      rec.line(0, Y(r.v), W, Y(r.v), { width: lw, dash, color });
      if (r.label) rec.labelAt(r.label, W + size * 0.3, Y(r.v), size, 'l');
    }
  }
  // curves
  const labels = [];
  curves.forEach((c, k) => {
    const pts = samples[k].map(([x, y]) => [X(x), Y(y)]);
    const runs = [];
    let run = null;
    for (let j = 0; j + 1 < pts.length; j++) {
      const p = pts[j];
      const q = pts[j + 1];
      if (![p[0], p[1], q[0], q[1]].every(Number.isFinite)) { run = null; continue; }
      const seg = clipSeg(p, q, W, H);
      if (!seg) { run = null; continue; }
      if (!run || Math.hypot(run[run.length - 1][0] - seg[0][0], run[run.length - 1][1] - seg[0][1]) > 0.01) { run = [seg[0]]; runs.push(run); }
      run.push(seg[1]);
    }
    if (!runs.length) { errors.push({ line: c.line, msg: `plot: "${c.expr}" is not visible in x=${fmtNum(xr[0])}..${fmtNum(xr[1])}, y=${fmtNum(yr[0])}..${fmtNum(yr[1])}`, warn: true }); return; }
    const st = c.style;
    const color = strokeOf(st.color, '#000000');
    const width = lw * num(st.opts.width, st.flags.has('thick') ? 2.2 : 1.2);
    const dash = st.flags.has('dashed') ? '5 3' : st.flags.has('dotted') ? '1.5 3' : null;
    for (const r of runs) {
      rec.raw((svg, dx, dy) => svg.push(`<path d="M${r.map((p) => `${n2(p[0] + dx)} ${n2(p[1] + dy)}`).join('L')}" fill="none" stroke="${color}" stroke-width="${n2(width)}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`), 0, 0, 0, 0);
    }
    const label = st.opts.label ?? st.label ?? (st.flags.has('nolabel') ? '' : c.expr);
    if (label && label !== 'none') {
      const lastRun = runs[runs.length - 1];
      const end = lastRun[lastRun.length - 1];
      labels.push({ text: label, x: end[0], y: end[1], top: end[1] < 1, color });
    }
  });
  // points
  pointSets.forEach((ps) => {
    const st = ps.style;
    const color = strokeOf(st.color, '#000000');
    const pts = ps.pts.map(([x, y]) => [X(x), Y(y)]);
    if (st.flags.has('line')) rec.raw((svg, dx, dy) => svg.push(`<path d="M${pts.map((p) => `${n2(p[0] + dx)} ${n2(p[1] + dy)}`).join('L')}" fill="none" stroke="${color}" stroke-width="${n2(lw * 1.2)}"${st.flags.has('dashed') ? ' stroke-dasharray="5 3"' : ''} stroke-linejoin="round"/>`), 0, 0, 0, 0);
    if (!st.flags.has('nodots')) for (const p of pts) rec.raw((svg, dx, dy) => svg.push(`<circle cx="${n2(p[0] + dx)}" cy="${n2(p[1] + dy)}" r="${n2(2.6 * lw)}" fill="${color}"/>`), p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3);
    const label = st.opts.label ?? st.label;
    if (label) { const p = pts[pts.length - 1]; labels.push({ text: label, x: p[0], y: p[1], top: false, color }); }
  });
  // curve labels: at the right end, or above where the curve leaves the top; nudge apart
  labels.forEach((l) => { l.m = labelSize(l.text, size); l.cy = l.top ? l.y - l.m.h / 2 - 2 : l.y; l.cx = l.top ? l.x : l.x + 4 + l.m.w / 2; });
  const sideLabels = labels.filter((l) => !l.top).sort((a, b) => a.cy - b.cy);
  for (let k = 1; k < sideLabels.length; k++) {
    const a = sideLabels[k - 1];
    const b = sideLabels[k];
    const need = (a.m.h + b.m.h) / 2 + 2;
    if (Math.abs(a.cx - b.cx) < (a.m.w + b.m.w) / 2 && b.cy - a.cy < need) b.cy = a.cy + need;
  }
  const topLabels = labels.filter((l) => l.top).sort((a, b) => a.cx - b.cx);
  for (let k = 1; k < topLabels.length; k++) {
    const a = topLabels[k - 1];
    const b = topLabels[k];
    const need = (a.m.w + b.m.w) / 2 + 4;
    if (b.cx - a.cx < need && Math.abs(a.cy - b.cy) < (a.m.h + b.m.h) / 2) b.cy = a.cy - (a.m.h + b.m.h) / 2 - 1;
  }
  for (const l of labels) rec.label(l.text, l.cx, l.cy, size, l.color === '#000000' ? '#000000' : l.color);
  // axes
  const over = size * 0.7;
  rec.connector(0, H, W + over, H, { end: true, width: lw });
  rec.connector(0, H, 0, -over, { end: true, width: lw });
  const tl = size * 0.3;
  const th = labelSize('0', small).h;
  for (const t of xt) {
    if (t.v < xr[0] - 1e-9 || t.v > xr[1] + 1e-9) continue;
    rec.line(X(t.v), H, X(t.v), H + tl, { width: lw });
    const text = t.label != null ? t.label : fmtNum(t.v);
    if (text) rec.label(text, X(t.v), H + tl + 3 + th / 2, t.label != null ? size : small);
  }
  for (const t of yt) {
    if (t.v < yr[0] - 1e-9 || t.v > yr[1] + 1e-9) continue;
    rec.line(-tl, Y(t.v), 0, Y(t.v), { width: lw });
    const text = t.label != null ? t.label : fmtNum(t.v);
    if (text) rec.labelAt(text, -tl - 3, Y(t.v), t.label != null ? size : small, 'r');
  }
  if (o.xlabel) {
    // under the arrow tip, clear of the last tick label (curve labels sit to the right)
    const m = labelSize(unquote(o.xlabel), size);
    let right = -Infinity;
    for (const t of xt) {
      if (t.v < xr[0] - 1e-9 || t.v > xr[1] + 1e-9) continue;
      const text = t.label != null ? t.label : fmtNum(t.v);
      right = Math.max(right, X(t.v) + labelSize(text, t.label != null ? size : small).w / 2);
    }
    const cx = Math.max(W + over + m.w / 2, right + size * 0.7 + m.w / 2);
    rec.label(unquote(o.xlabel), cx, H + tl + 3 + Math.max(th, m.h) / 2, size);
  }
  if (o.ylabel) { const m = labelSize(unquote(o.ylabel), size); rec.label(unquote(o.ylabel), 0, -over - 4 - m.h / 2, size); }
  return rec.done();
}
