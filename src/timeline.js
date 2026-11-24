/*
 * Figure Suite — `timeline`: intervals on a time axis (interval scheduling) and
 * Gantt charts (CPU scheduling).
 *
 *   timeline from=0 to=12        one row per name; repeated names share the row
 *     a 0..3 "1"
 *     b 2..6
 *     a 7..9
 *     d 10 "deadline"            a point event
 *     mark: 5 t dashed
 *
 *   timeline gantt               single row, ticks at every boundary
 *     P1 0..24
 *     P2 24..27
 */

function layoutTimeline(block, ctx, errors) {
  const size = ctx.size;
  const lw = ctx.lw;
  const o = block.opts;
  const gantt = truthy(o.gantt);
  const rows = new Map();
  const segs = [];
  for (const entry of block.data) {
    const toks = tokenize(entry.text);
    if (toks.length < 2) { errors.push({ line: entry.line, msg: 'timeline: expected "name start..end [\\"text\\"] [colour]"' }); continue; }
    const name = toks[0].text;
    const m = toks[1].text.match(/^(-?[\d.]+)\s*(?:\.\.|–)\s*(-?[\d.]+)$/);
    let a;
    let b;
    if (m) { a = parseFloat(m[1]); b = parseFloat(m[2]); } else { a = b = Number(toks[1].text); }
    if (!Number.isFinite(a) || !Number.isFinite(b)) { errors.push({ line: entry.line, msg: `timeline: "${toks[1].text}" is not a time or a range like 2..5` }); continue; }
    if (a > b) { errors.push({ line: entry.line, msg: `timeline: ${toks[1].text} runs backwards; read as ${b}..${a}`, warn: true }); [a, b] = [b, a]; }
    const args = splitArgs(toks.slice(2));
    for (const k of Object.keys(args.opts)) if (!['label', 'color'].includes(k)) errors.push({ line: entry.line, msg: `Unknown option "${k}=" (options: label, color)`, warn: true });
    let color = args.opts.color || null;
    const words = [];
    args.pos.forEach((p, k) => { if (!args.quoted.has(k) && isColor(p)) color = p; else words.push(p); });
    if (!rows.has(name)) rows.set(name, { name, index: rows.size, segs: [] });
    const seg = { row: rows.get(name), a, b, point: !m, text: args.opts.label ?? (words.length ? words.join(' ') : null), color, line: entry.line };
    rows.get(name).segs.push(seg);
    segs.push(seg);
  }
  const marks = [];
  for (const d of block.directives) {
    if (d.name !== 'mark') continue;
    const toks = tokenize(d.rest);
    const t = toks.length ? Number(toks[0].text) : NaN;
    if (!Number.isFinite(t)) { errors.push({ line: d.line, msg: 'mark: expected a time first' }); continue; }
    let color = null;
    let dash = '4 3';
    const words = [];
    toks.slice(1).forEach((tk) => {
      if (!tk.quoted && isColor(tk.text)) color = tk.text;
      else if (!tk.quoted && tk.text === 'solid') dash = null;
      else if (!tk.quoted && tk.text === 'dashed') dash = '4 3';
      else if (!tk.quoted && tk.text === 'dotted') dash = '1.5 3';
      else words.push(tk.text);
    });
    marks.push({ t, label: words.join(' '), color, dash });
  }
  const rec = new Rec();
  if (!segs.length) { rec.ext(0, 0, 10, 10); return rec.done(); }
  const lo = Math.min(...segs.map((s) => s.a), ...marks.map((mk) => mk.t));
  const hi = Math.max(...segs.map((s) => s.b), ...marks.map((mk) => mk.t));
  const from = num(o.from, gantt ? lo : Math.min(0, lo));
  const to = num(o.to, hi > from ? hi : from + 1);
  if (!(to > from)) errors.push({ line: block.line, msg: `timeline: to=${to} must be after from=${from}`, warn: true });
  const span = to > from ? to - from : 1;
  const unit = num(o.unit, Math.min(size * 3, Math.max(size * 0.5, (size * 24) / span)));
  const h = num(o.h, size * 1.7);
  const rowGap = size * 0.55;
  const showNames = !gantt && o.labels !== 'none';
  const labW = showNames ? Math.max(0, ...[...rows.values()].map((r) => labelSize(r.name, size).w)) + size * 0.8 : 0;
  const X = (t) => labW + (t - from) * unit;
  const rowY = (r) => (gantt ? 0 : r.index * (h + rowGap));
  const nRows = gantt ? 1 : rows.size;
  const bottom = nRows * h + (nRows - 1) * rowGap;
  const outside = segs.some((s) => s.a < from || s.b > to);
  if (outside) errors.push({ line: block.line, msg: `timeline: some intervals fall outside ${from}..${to} and are cut`, warn: true });

  if (showNames) for (const r of rows.values()) rec.labelAt(r.name, labW - size * 0.8, rowY(r) + h / 2, size, 'r');
  for (const s of segs) {
    const y = rowY(s.row);
    if (s.point) {
      const x = X(Math.max(from, Math.min(to, s.a)));
      const k = size * 0.32;
      const col = fillFor(s.color || 'black', ctx, 'array');
      rec.raw((svg, dx, dy) => svg.push(`<path d="M${n2(x + dx)} ${n2(y + h / 2 - k + dy)}L${n2(x + k + dx)} ${n2(y + h / 2 + dy)}L${n2(x + dx)} ${n2(y + h / 2 + k + dy)}L${n2(x - k + dx)} ${n2(y + h / 2 + dy)}Z" fill="${col.fill}" stroke="#000" stroke-width="${n2(lw)}"/>`), x - k, y + h / 2 - k, x + k, y + h / 2 + k);
      if (s.text) rec.labelAt(s.text, x + k + size * 0.25, y + h / 2, size, 'l');
      if (!rec.anchors.has(s.row.name)) rec.anchor(s.row.name, { kind: 'rect', cx: x, cy: y + h / 2, hw: k, hh: k });
      continue;
    }
    const a = Math.max(from, s.a);
    const b = Math.min(to, s.b);
    if (b < a) continue;
    const col = fillFor(s.color || o.fill || (gantt ? 'white' : 'light'), ctx, 'array');
    rec.rect(X(a), y, (b - a) * unit, h, col.fill, { width: lw });
    rec.anchor(s.row.name, { kind: 'rect', cx: (X(a) + X(b)) / 2, cy: y + h / 2, hw: ((b - a) * unit) / 2, hh: h / 2 });
    const text = s.text ?? (gantt ? s.row.name : null);
    if (text) {
      const m = labelSize(text, size);
      if (m.w + size * 0.3 <= (b - a) * unit) rec.label(text, (X(a) + X(b)) / 2, y + h / 2, size, col.text);
      else rec.label(text, (X(a) + X(b)) / 2, y - size * 0.25 - m.h / 2, size);
    }
  }
  // axis
  const small = size * 0.8;
  const th = labelSize('0', small).h;
  let tickVals;
  const tk = o.ticks;
  if (tk === 'none') tickVals = [];
  else if (tk === 'bounds' || (gantt && tk == null)) tickVals = [...new Set([from, to, ...segs.flatMap((s) => [s.a, s.b])])].filter((v) => v >= from && v <= to);
  else {
    const step = tk != null && Number(tk) > 0 ? Number(tk) : niceStep(span, 8);
    if (tk != null && !(Number(tk) > 0)) errors.push({ line: block.line, msg: `timeline ticks=${tk}: expected a step, bounds or none`, warn: true });
    tickVals = [];
    for (let v = Math.ceil(from / step - 1e-9) * step; v <= to + step * 1e-9; v += step) tickVals.push(Math.abs(v) < 1e-9 ? 0 : Number(v.toPrecision(10)));
  }
  const axisY = gantt ? bottom : bottom + size * 0.5;
  if (!gantt) rec.connector(X(from), axisY, X(to) + size * 0.8, axisY, { end: true, width: lw });
  for (const v of tickVals) {
    if (!gantt) rec.line(X(v), axisY, X(v), axisY + size * 0.3, { width: lw });
    rec.label(fmtNum(v), X(v), axisY + size * 0.3 + 2 + th / 2, small);
  }
  // marks
  for (const mk of marks) {
    const x = X(mk.t);
    rec.line(x, -size * 0.4, x, axisY, { width: lw, dash: mk.dash, color: strokeOf(mk.color, '#000000') });
    if (mk.label) { const m = labelSize(mk.label, size); rec.label(mk.label, x, -size * 0.4 - 2 - m.h / 2, size); }
  }
  return rec.done();
}
