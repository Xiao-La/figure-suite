/*
 * Figure Suite — `seq`: sequence diagrams (time down) and space-time diagrams (time right).
 *
 *   seq
 *     C "Client"                   declare an actor (optional; first use also creates one)
 *     C -> S "SYN" delay=1         message; arrives `delay` steps later (slanted)
 *     S --> C "reply"              dashed reply
 *     C -> C "retry"               self message
 *     S * "crash"                  event dot on a lifeline
 */

const SEQ_ARROWS = ['<-->', '<->', '-->', '<--', '->', '<-'];

function spaceSeqArrows(text) {
  let out = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') { out += ch + (text[i + 1] || ''); i++; continue; }
    if (ch === '"') q = !q;
    if (!q) {
      const arrow = SEQ_ARROWS.find((a) => text.startsWith(a, i));
      if (arrow) { out += ` ${arrow} `; i += arrow.length - 1; continue; }
    }
    out += ch;
  }
  return out;
}

function layoutSeq(block, ctx, errors) {
  const size = ctx.size;
  const lw = ctx.lw;
  const o = block.opts;
  const dir = o.dir === 'right' ? 'right' : 'down';
  const defDelay = num(o.delay, dir === 'right' ? 1 : 0);
  const actors = new Map();
  const actor = (id, line) => {
    if (!actors.has(id)) actors.set(id, { id, label: id, index: actors.size, line });
    return actors.get(id);
  };
  const items = [];
  let clock = 0;
  let last = 0;
  const stepOf = (args) => {
    if (args.opts.at != null) {
      const v = num(args.opts.at, NaN);
      if (Number.isFinite(v)) return v;
    }
    return args.pos.includes('same') ? last : clock;
  };
  for (const entry of block.data) {
    const toks = tokenize(spaceSeqArrows(entry.text));
    const arrowAt = toks.findIndex((t) => !t.quoted && SEQ_ARROWS.includes(t.text));
    if (arrowAt === 1 && toks.length >= 3) {
      const args = splitArgs(toks.slice(3));
      for (const k of Object.keys(args.opts)) if (!['delay', 'at', 'label', 'color'].includes(k)) errors.push({ line: entry.line, msg: `Unknown message option "${k}=" (options: delay, at, label, color)`, warn: true });
      if (args.opts.delay != null) checkNumber('delay', args.opts.delay, 0, entry.line, errors);
      if (args.opts.at != null) checkNumber('at', args.opts.at, 0, entry.line, errors);
      let arrow = toks[1].text;
      let a = toks[0].text;
      let b = toks[2].text;
      if (arrow === '<-' || arrow === '<--') { [a, b] = [b, a]; arrow = arrow === '<-' ? '->' : '-->'; }
      const flags = new Set();
      const words = [];
      args.pos.forEach((p, k) => {
        if (!args.quoted.has(k) && ['same', 'lost', 'dashed', 'dotted', 'thick'].includes(p)) flags.add(p);
        else if (!args.quoted.has(k) && isColor(p)) flags.add(`color:${p}`);
        else words.push(p);
      });
      const s = stepOf(args);
      const delay = num(args.opts.delay, defDelay);
      items.push({
        kind: 'msg', from: actor(a, entry.line), to: actor(b, entry.line), t0: s, t1: s + Math.max(0, delay),
        both: arrow.startsWith('<'), dashed: arrow.includes('--') || flags.has('dashed'), dotted: flags.has('dotted'), thick: flags.has('thick'),
        lost: flags.has('lost'), label: args.opts.label ?? words.join(' '),
        color: strokeOf(args.opts.color || ([...flags].find((f) => f.startsWith('color:')) || '').slice(6), '#000000'), line: entry.line,
      });
      last = s;
      clock = Math.max(clock, s + Math.max(1, delay));
      continue;
    }
    if (toks.length >= 2 && toks[1].text === '*' && !toks[1].quoted) {
      const args = splitArgs(toks.slice(2));
      const s = stepOf(args);
      items.push({ kind: 'event', at: actor(toks[0].text, entry.line), t0: s, label: args.opts.label ?? args.pos.filter((p, k) => args.quoted.has(k) || p !== 'same').join(' '), line: entry.line });
      last = s;
      clock = Math.max(clock, s + 1);
      continue;
    }
    if (toks.length <= 2 && toks.length && !toks[0].quoted) {
      const a = actor(toks[0].text, entry.line);
      if (toks[1]) a.label = toks[1].text;
      continue;
    }
    errors.push({ line: entry.line, msg: 'seq: expected an actor (A "label"), a message (A -> B "text") or an event (A * "text")' });
  }
  const list = [...actors.values()];
  const rec = new Rec();
  if (!list.length) { rec.ext(0, 0, 10, 10); return rec.done(); }
  const maxT = Math.max(0, ...items.map((it) => (it.kind === 'msg' ? it.t1 : it.t0)));
  const lab = (t) => labelSize(t, size);
  const msgW = items.filter((it) => it.kind === 'msg' && it.from !== it.to)
    .map((it) => (lab(it.label).w + size * 1.2) / Math.max(1, Math.abs(it.from.index - it.to.index)));
  const showDots = truthy(o.dots) || (dir === 'right' && o.dots == null);
  const dot = (x, y, color = '#000000') => rec.raw((svg, dx, dy) => svg.push(`<circle cx="${n2(x + dx)}" cy="${n2(y + dy)}" r="${n2(2.4 * lw)}" fill="${color}"/>`), x - 3, y - 3, x + 3, y + 3);

  let P; // (actor index, step) → [x, y]
  let lineEnd;
  if (dir === 'down') {
    const boxes = !truthy(o.noboxes) && (o.boxes == null || truthy(o.boxes));
    const gap = num(o.gap, Math.max(size * 7, ...list.map((a) => lab(a.label).w + size * 2.2), ...msgW));
    const slanted = items.some((it) => it.kind === 'msg' && it.from !== it.to && it.t1 > it.t0);
    const stepH = num(o.step, size * (slanted ? 3.3 : 2.4));
    const headH = size * 1.9;
    const top = headH + size * 0.8;
    P = (i, t) => [i * gap, top + size * 0.6 + t * stepH];
    lineEnd = P(0, maxT)[1] + size * 1.4;
    list.forEach((a, i) => {
      const x = i * gap;
      const m = lab(a.label);
      if (boxes) rec.rect(x - m.w / 2 - size * 0.6, 0, m.w + size * 1.2, headH, '#ffffff', { width: lw });
      rec.label(a.label, x, headH / 2, size);
      rec.anchor(a.id, { kind: 'rect', cx: x, cy: headH / 2, hw: m.w / 2 + size * 0.6, hh: headH / 2 });
      if (truthy(o.time)) rec.connector(x, headH, x, lineEnd, { end: true, width: lw });
      else rec.line(x, headH, x, lineEnd, { width: lw });
    });
  } else {
    const labW = Math.max(...list.map((a) => lab(a.label).w));
    const gap = num(o.gap, size * 3.4);
    const stepW = num(o.step, size * 3.2);
    const x0 = labW + size * 0.8;
    P = (i, t) => [x0 + size * 0.8 + t * stepW, i * gap];
    lineEnd = P(0, maxT)[0] + size * 1.4;
    list.forEach((a, i) => {
      const y = i * gap;
      rec.labelAt(a.label, labW, y, size, 'r');
      rec.anchor(a.id, { kind: 'rect', cx: labW / 2, cy: y, hw: labW / 2 + 2, hh: size * 0.6 });
      if (truthy(o.time) || o.time == null) rec.connector(x0, y, lineEnd, y, { end: true, width: lw });
      else rec.line(x0, y, lineEnd, y, { width: lw });
    });
  }

  for (const it of items) {
    if (it.kind === 'event') {
      const [x, y] = P(it.at.index, it.t0);
      dot(x, y);
      if (it.label) {
        if (dir === 'down') rec.labelAt(it.label, x + size * 0.45, y, size, 'l');
        else { const m = lab(it.label); rec.label(it.label, x, y - size * 0.45 - m.h / 2, size); }
      }
      continue;
    }
    const width = lw * (it.thick ? 2.2 : 1);
    const dash = it.dotted ? '1.5 3' : it.dashed ? '5 3' : null;
    const [x1, y1] = P(it.from.index, it.t0);
    if (it.from === it.to) {
      // self message: a small loop beside the lifeline
      const [, y2raw] = P(it.to.index, it.t1);
      const y2 = dir === 'down' ? Math.max(y2raw, y1 + size * 1.2) : y1;
      if (dir === 'down') {
        const w = size * 1.8;
        rec.poly([[x1, y1], [x1 + w, y1], [x1 + w, y2], [x1, y2]], { width, color: it.color, dash });
        if (it.label) rec.labelAt(it.label, x1 + w + size * 0.4, (y1 + y2) / 2, size, 'l');
      } else {
        const [x2] = P(it.to.index, Math.max(it.t1, it.t0 + 0.6));
        const h = size * 1.2;
        rec.poly([[x1, y1], [x1, y1 - h], [x2, y1 - h], [x2, y1]], { width, color: it.color, dash });
        if (it.label) { const m = lab(it.label); rec.label(it.label, (x1 + x2) / 2, y1 - h - size * 0.3 - m.h / 2, size); }
      }
      continue;
    }
    let [x2, y2] = P(it.to.index, it.t1);
    if (it.lost) { x2 = x1 + (x2 - x1) * 0.62; y2 = y1 + (y2 - y1) * 0.62; }
    rec.connector(x1, y1, x2, y2, { end: !it.lost, start: it.both, width, color: it.color, dash });
    if (it.lost) {
      const k = size * 0.3;
      rec.line(x2 - k, y2 - k, x2 + k, y2 + k, { width: lw * 1.4, color: it.color });
      rec.line(x2 - k, y2 + k, x2 + k, y2 - k, { width: lw * 1.4, color: it.color });
    }
    if (showDots) { dot(x1, y1, it.color); if (!it.lost) dot(x2, y2, it.color); }
    if (it.label) {
      const m = lab(it.label);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      let nx = (y2 - y1) / len;
      let ny = -(x2 - x1) / len;
      if (ny > 0 || (Math.abs(ny) < 1e-6 && nx < 0)) { nx = -nx; ny = -ny; } // the side above the arrow
      const off = Math.abs(nx) * (m.w / 2) + Math.abs(ny) * (m.h / 2) + 3;
      rec.label(it.label, (x1 + x2) / 2 + nx * off, (y1 + y2) / 2 + ny * off, size);
    }
  }
  return rec.done();
}
