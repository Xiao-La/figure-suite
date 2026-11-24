/*
 * Figure Suite — `sets`: Venn and Euler diagrams.
 *
 *   sets universe                  venn layout for 1–3 sets
 *     A
 *     B
 *     shade: A&~B lightblue        & ∩   | ∪   - minus   ~ or ' complement   ( )
 *     in: A&B x y                  element labels placed inside a region
 *
 *   sets nested                    each set inside the previous one
 *   sets layout=manual             NP (-0.6,0) rx=1.3 ry=0.9
 */

/** Parse a set formula into a predicate over a membership map (id → bool). */
function compileSetFormula(text, ids) {
  const s = String(text)
    .replace(/\\cap|∩/g, '&').replace(/\\cup|∪/g, '|').replace(/\\setminus|∖/g, '-')
    .replace(/\\overline\s*\{([^{}]*)\}/g, '~($1)').replace(/\\(bar|neg|lnot)/g, '~');
  const toks = s.match(/[A-Za-z0-9_]+|[&|\-~!()']/g) || [];
  let i = 0;
  const known = new Set(ids);
  function expr() {
    let f = term();
    while (toks[i] === '|' || toks[i] === '-') {
      const op = toks[i++];
      const a = f;
      const b = term();
      f = op === '|' ? (m) => a(m) || b(m) : (m) => a(m) && !b(m);
    }
    return f;
  }
  function term() {
    let f = factor();
    while (toks[i] === '&') { i++; const a = f; const b = factor(); f = (m) => a(m) && b(m); }
    return f;
  }
  function factor() {
    if (toks[i] === '~' || toks[i] === '!') { i++; const a = factor(); return (m) => !a(m); }
    let f;
    const t = toks[i++];
    if (t === '(') {
      f = expr();
      if (toks[i++] !== ')') throw new Error('missing )');
    } else if (t === 'U' && !known.has('U')) f = () => true;
    else if (t != null && known.has(t)) f = (m) => !!m[t];
    else if (t == null) throw new Error('formula ends too early');
    else throw new Error(`no set called "${t}" (sets: ${ids.join(', ')})`);
    while (toks[i] === "'") { i++; const a = f; f = (m) => !a(m); }
    return f;
  }
  if (!toks.length) throw new Error('empty formula');
  const f = expr();
  if (i < toks.length) throw new Error(`unexpected "${toks[i]}"`);
  return f;
}

function layoutSets(block, ctx, errors) {
  const size = ctx.size;
  const lw = ctx.lw;
  const o = block.opts;
  const unit = num(o.unit, size * 3.4);
  const sets = [];
  for (const entry of block.data) {
    const toks = tokenize(entry.text);
    if (!toks.length) continue;
    const st = { id: toks[0].text, label: toks[0].text, c: null, rx: null, ry: null, color: null, line: entry.line };
    const args = splitArgs(toks.slice(1));
    args.pos.forEach((p, k) => {
      const pt = !args.quoted.has(k) && parsePoint(p);
      if (pt) st.c = pt;
      else if (args.quoted.has(k)) st.label = p;
      else if (isColor(p)) st.color = p;
      else errors.push({ line: entry.line, msg: `sets: "${p}" not understood (write id "label" (x,y) r= rx= ry= colour)`, warn: true });
    });
    for (const [k, v] of Object.entries(args.opts)) {
      if (k === 'r') { st.rx = st.ry = num(v, null); checkNumber('r', v, 0.01, entry.line, errors); } else if (k === 'rx' || k === 'ry') { st[k] = num(v, null); checkNumber(k, v, 0.01, entry.line, errors); } else if (k === 'label') st.label = v;
      else if (k === 'color') st.color = v;
      else errors.push({ line: entry.line, msg: `Unknown set option "${k}=" (options: r, rx, ry, label, color)`, warn: true });
    }
    if (sets.some((q) => q.id === st.id)) errors.push({ line: entry.line, msg: `sets: "${st.id}" is declared twice`, warn: true });
    sets.push(st);
  }
  const rec = new Rec();
  if (!sets.length) { rec.ext(0, 0, 10, 10); return rec.done(); }
  let layout = o.layout || (truthy(o.nested) ? 'nested' : truthy(o.manual) ? 'manual' : truthy(o.venn) ? 'venn' : sets.some((q) => q.c) ? 'manual' : 'venn');
  if (layout === 'venn' && sets.length > 3) {
    errors.push({ line: block.line, msg: 'sets: the venn layout draws 1–3 sets; use layout=manual with (x,y) positions for more', warn: true });
    layout = 'row';
  }
  const n = sets.length;
  if (layout === 'venn') {
    const centres = n === 1 ? [[0, 0]] : n === 2 ? [[-0.62, 0], [0.62, 0]] : [[-0.58, 0.34], [0.58, 0.34], [0, -0.66]];
    sets.forEach((q, k) => { q.c = q.c || centres[k]; q.rx = q.rx || 1; q.ry = q.ry || q.rx; });
  } else if (layout === 'nested') {
    // inside out: each ring leaves room for its label at the top and a thin margin below
    const topGap = (q) => (labelSize(q.label, size).h + size * 0.8) / unit;
    const botGap = (size * 0.55) / unit;
    const fitW = (q, rx, ry) => {
      // half-width needed so the label fits under the top of the outline
      const d = Math.min(ry * 0.95, (size * 0.35 + labelSize(q.label, size).h) / unit);
      return (labelSize(q.label, size).w / 2 / unit + size * 0.3 / unit) / Math.sqrt(1 - (1 - d / ry) ** 2);
    };
    let inner = null;
    for (let k = n - 1; k >= 0; k--) {
      const q = sets[k];
      if (!inner) {
        const ry = q.ry || Math.max(0.5, topGap(q) + botGap);
        q.ry = ry;
        q.rx = q.rx || Math.max(ry * 1.6, fitW(q, 0, ry));
        q.c = q.c || [0, 0];
      } else {
        const dy = (topGap(q) + botGap) / 2;
        q.ry = q.ry || inner.ry + dy;
        q.rx = q.rx || Math.max(inner.rx + dy * 1.5, fitW(q, 0, q.ry));
        q.c = q.c || [inner.c[0], inner.c[1] + (topGap(q) - botGap) / 2];
      }
      inner = q;
    }
  } else if (layout === 'row') {
    sets.forEach((q, k) => { q.c = q.c || [k * 1.3, 0]; q.rx = q.rx || 1; q.ry = q.ry || q.rx; });
  } else {
    sets.forEach((q) => {
      if (!q.c) { errors.push({ line: q.line, msg: `sets: "${q.id}" has no (x,y) position (layout=manual)`, warn: true }); q.c = [0, 0]; }
      q.rx = q.rx || q.ry || 1;
      q.ry = q.ry || q.rx;
    });
  }
  // px, y down
  const P = (x, y) => [x * unit, -y * unit];
  const shapes = sets.map((q) => { const [cx, cy] = P(q.c[0], q.c[1]); return { ...q, cx, cy, hw: q.rx * unit, hh: q.ry * unit }; });
  let bx1 = Math.min(...shapes.map((q) => q.cx - q.hw));
  let by1 = Math.min(...shapes.map((q) => q.cy - q.hh));
  let bx2 = Math.max(...shapes.map((q) => q.cx + q.hw));
  let by2 = Math.max(...shapes.map((q) => q.cy + q.hh));
  const universe = o.universe != null && o.universe !== 'false';
  const margin = unit * 0.35;
  bx1 -= margin; by1 -= margin; bx2 += margin; by2 += margin;
  // venn labels sit outside the circles; keep them inside the universe box
  if (layout === 'venn' || layout === 'row') { const lh = labelSize('A', size).h + 6; by1 -= lh * 0.3; by2 += lh; bx1 -= lh * 0.3; bx2 += lh * 0.3; }
  const uLabel = universe ? (o.universe === 'true' ? 'U' : unquote(o.universe)) : '';
  if (universe) by1 -= labelSize(uLabel, size).h * 0.6;
  const inside = (q, x, y) => ((x - q.cx) / q.hw) ** 2 + ((y - q.cy) / q.hh) ** 2 <= 1;
  const ids = shapes.map((q) => q.id);
  const member = (x, y) => Object.fromEntries(shapes.map((q) => [q.id, inside(q, x, y)]));

  // sample grid shared by region tests
  const G = 72;
  const gx = (i) => bx1 + ((i + 0.5) * (bx2 - bx1)) / G;
  const gy = (j) => by1 + ((j + 0.5) * (by2 - by1)) / G;
  const grid = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) grid.push(member(gx(i), gy(j)));
  /** Deepest grid point of a region (distance transform), or null if empty. */
  const deepest = (pred) => {
    const inR = grid.map((m) => pred(m));
    if (!inR.some(Boolean)) return null;
    const dist = inR.map((v) => (v ? Infinity : 0));
    const idx = (i, j) => j * G + i;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const k = idx(i, j);
      if (!dist[k]) continue;
      const up = j ? dist[idx(i, j - 1)] : 0;
      const left = i ? dist[idx(i - 1, j)] : 0;
      dist[k] = Math.min(dist[k], up + 1, left + 1);
    }
    for (let j = G - 1; j >= 0; j--) for (let i = G - 1; i >= 0; i--) {
      const k = idx(i, j);
      if (!dist[k]) continue;
      const dn = j < G - 1 ? dist[idx(i, j + 1)] : 0;
      const rt = i < G - 1 ? dist[idx(i + 1, j)] : 0;
      dist[k] = Math.min(dist[k], dn + 1, rt + 1);
    }
    let best = -1;
    let bi = 0;
    dist.forEach((d, k) => { if (d > best) { best = d; bi = k; } });
    return { x: gx(bi % G), y: gy(Math.floor(bi / G)), depth: (best * (bx2 - bx1)) / G };
  };

  // shaded regions: each satisfying atom (inside I, outside O) via clip paths + mask
  const regions = [];
  for (const d of block.directives.filter((q) => q.name === 'shade')) {
    const toks = tokenize(d.rest).map((t) => t.text);
    const color = toks.length > 1 && isColor(toks[toks.length - 1]) ? toks.pop() : 'shade';
    let pred;
    try { pred = compileSetFormula(toks.join(''), ids); } catch (err) { errors.push({ line: d.line, msg: `shade: ${err.message}` }); continue; }
    let any = false;
    for (let mask = 0; mask < 1 << n; mask++) {
      const m = Object.fromEntries(ids.map((id, k) => [id, !!(mask & (1 << k))]));
      if (!pred(m)) continue;
      // skip atoms that do not exist in this drawing
      if (!grid.some((g) => ids.every((id) => g[id] === m[id]))) continue;
      any = true;
      regions.push({ inSets: shapes.filter((q) => m[q.id]), outSets: shapes.filter((q) => !m[q.id]), fill: colorOf(color).fill });
    }
    if (!any) errors.push({ line: d.line, msg: `shade: the region ${toks.join('')} is empty in this drawing`, warn: true });
  }
  const ell = (q, dx, dy, attrs) => `<ellipse cx="${n2(q.cx + dx)}" cy="${n2(q.cy + dy)}" rx="${n2(q.hw)}" ry="${n2(q.hh)}" ${attrs}/>`;
  rec.raw((svg, dx, dy) => {
    if (universe) svg.push(`<rect x="${n2(bx1 + dx)}" y="${n2(by1 + dy)}" width="${n2(bx2 - bx1)}" height="${n2(by2 - by1)}" fill="#ffffff" stroke="#000" stroke-width="${n2(lw)}"/>`);
    // set fills (translucent, so overlaps show)
    for (const q of shapes) if (q.color || o.fill) svg.push(ell(q, dx, dy, `fill="${colorOf(q.color || o.fill).fill}" fill-opacity="0.45" stroke="none"`));
    if (!svg.defs) svg.defs = [];
    svg.uid = (svg.uid || 0) + 1;
    const base = `fsset${svg.uid}`;
    regions.forEach((r, k) => {
      const clipIds = r.inSets.map((q) => {
        const id = `${base}c${k}${q.id.replace(/\W/g, '_')}`;
        svg.defs.push(`<clipPath id="${id}">${ell(q, dx, dy, '')}</clipPath>`);
        return id;
      });
      let maskAttr = '';
      if (r.outSets.length) {
        const mid = `${base}m${k}`;
        svg.defs.push(`<mask id="${mid}" maskUnits="userSpaceOnUse" x="${n2(bx1 + dx)}" y="${n2(by1 + dy)}" width="${n2(bx2 - bx1)}" height="${n2(by2 - by1)}"><rect x="${n2(bx1 + dx)}" y="${n2(by1 + dy)}" width="${n2(bx2 - bx1)}" height="${n2(by2 - by1)}" fill="#ffffff"/>${r.outSets.map((q) => ell(q, dx, dy, 'fill="#000000"')).join('')}</mask>`);
        maskAttr = ` mask="url(#${mid})"`;
      }
      let el = `<rect x="${n2(bx1 + dx)}" y="${n2(by1 + dy)}" width="${n2(bx2 - bx1)}" height="${n2(by2 - by1)}" fill="${r.fill}"${maskAttr}/>`;
      for (const id of clipIds.reverse()) el = `<g clip-path="url(#${id})">${el}</g>`;
      svg.push(el);
    });
    for (const q of shapes) svg.push(ell(q, dx, dy, `fill="none" stroke="#000" stroke-width="${n2(lw)}"`));
  }, bx1, by1, bx2, by2);
  if (universe) rec.labelAt(uLabel, bx1 + size * 0.4, by1 + size * 0.75, size, 'l');
  for (const q of shapes) rec.anchor(q.id, { kind: 'ellipse', cx: q.cx, cy: q.cy, hw: q.hw, hh: q.hh });

  // set labels
  const cxAll = shapes.reduce((t, q) => t + q.cx, 0) / n;
  const cyAll = shapes.reduce((t, q) => t + q.cy, 0) / n;
  for (const q of shapes) {
    const m = labelSize(q.label, size);
    if (layout === 'venn' || layout === 'row') {
      let vx = q.cx - cxAll;
      let vy = q.cy - cyAll;
      const len = Math.hypot(vx, vy);
      if (len < 1e-6) { vx = 0; vy = -1; } else { vx /= len; vy /= len; }
      vy -= 0.8; // lean upward
      const l2 = Math.hypot(vx, vy) || 1;
      vx /= l2; vy /= l2;
      const t = 1 / Math.sqrt((vx / q.hw) ** 2 + (vy / q.hh) ** 2);
      const off = Math.abs(vx) * (m.w / 2) + Math.abs(vy) * (m.h / 2) + 4;
      rec.label(q.label, q.cx + vx * (t + off), q.cy + vy * (t + off), size);
    } else {
      // inside, just under the top of the outline, unless another outline crosses
      // that spot; then in the middle of the part only this set covers
      let x = q.cx;
      let y = q.cy - q.hh + size * 0.35 + m.h / 2;
      const hits = (lx, ly) => shapes.some((r) => r !== q && Array.from({ length: 96 }, (_, k) => (k * Math.PI) / 48)
        .some((a) => Math.abs(r.cx + r.hw * Math.cos(a) - lx) < m.w / 2 + 2 && Math.abs(r.cy + r.hh * Math.sin(a) - ly) < m.h / 2 + 2));
      if (layout === 'manual' && hits(x, y)) {
        const inQ = grid.map((g) => g[q.id]);
        const supers = new Set(shapes.filter((r) => r !== q && inQ.every((v, k) => !v || grid[k][r.id])).map((r) => r.id));
        const spot = deepest((g) => g[q.id] && shapes.every((r) => r === q || supers.has(r.id) || !g[r.id]));
        if (spot && spot.depth > Math.min(m.w, m.h) / 2) { x = spot.x; y = spot.y; }
      }
      rec.label(q.label, x, y, size);
    }
  }

  // elements in regions
  for (const d of block.directives.filter((q) => q.name === 'in')) {
    const toks = tokenize(d.rest);
    if (!toks.length) { errors.push({ line: d.line, msg: 'in: expected a region and some labels (in: A&B x y)' }); continue; }
    let pred;
    try { pred = compileSetFormula(toks[0].text, ids); } catch (err) { errors.push({ line: d.line, msg: `in: ${err.message}` }); continue; }
    const spot = deepest(pred);
    if (!spot) { errors.push({ line: d.line, msg: `in: the region ${toks[0].text} is empty in this drawing`, warn: true }); continue; }
    const labs = toks.slice(1).map((t) => t.text);
    const perRow = labs.length > 4 ? Math.ceil(labs.length / 2) : labs.length;
    const rowsN = Math.ceil(labs.length / Math.max(1, perRow));
    const gap = size * 0.7;
    for (let r = 0; r < rowsN; r++) {
      const row = labs.slice(r * perRow, (r + 1) * perRow);
      const widths = row.map((t) => labelSize(t, size).w);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
      let x = spot.x - total / 2;
      const y = spot.y + (r - (rowsN - 1) / 2) * size * 1.3;
      row.forEach((t, k) => { rec.label(t, x + widths[k] / 2, y, size); x += widths[k] + gap; });
    }
  }
  return rec.done();
}
