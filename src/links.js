/*
 * Figure Suite — `link` lines: arrows between parts of different blocks.
 *
 *   link P[1] -> L.head[2] "next" dashed bend=20
 *   link
 *     T[1,2] -> T[3,1]
 *
 * A reference is a block name (id= or the name in its header) optionally
 * followed by [key] or .key; keys are the anchors a block registers with
 * Rec.anchor (array index, "r,c" table cell, list node, chains slot "k" or
 * "k,j", graph node id, tree node label or B-tree key, set, actor, row).
 */

const LINK_ARROWS = ['<->', '->', '<-', '--'];

/** Put spaces around arrows outside quotes and brackets so they tokenize alone. */
function spaceArrows(text) {
  let out = '';
  let q = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') { out += ch + (text[i + 1] || ''); i++; continue; }
    if (ch === '"') q = !q;
    if (!q) {
      if (ch === '[' || ch === '(' || ch === '{') depth++;
      else if ((ch === ']' || ch === ')' || ch === '}') && depth > 0) depth--;
      if (!depth) {
        const arrow = LINK_ARROWS.find((a) => text.startsWith(a, i));
        if (arrow) { out += ` ${arrow} `; i += arrow.length - 1; continue; }
      }
    }
    out += ch;
  }
  return out;
}

/** Parse one link spec; returns { from, to, arrow, label, opts, flags } or { error }. */
function parseLinkSpec(text) {
  const toks = tokenize(spaceArrows(text));
  const at = toks.findIndex((t) => !t.quoted && LINK_ARROWS.includes(t.text));
  if (at !== 1 || toks.length < 3) return { error: 'link: expected "A[i] -> B[j] [\\"label\\"] [options]"' };
  const args = splitArgs(toks.slice(3));
  const flags = new Set();
  const labels = [];
  args.pos.forEach((p, k) => {
    if (args.quoted.has(k)) labels.push(p);
    else if (['dashed', 'dotted', 'thick', 'swap'].includes(p) || isColor(p)) flags.add(p);
    else labels.push(p);
  });
  return { from: toks[0].text, to: toks[2].text, arrow: toks[1].text, label: args.opts.label ?? labels.join(' '), opts: args.opts, flags };
}

/** Names a block answers to in link references. */
function blockNames(block) {
  const names = [];
  if (block.opts.id) names.push(unquote(block.opts.id));
  if (block.pos.length) {
    names.push(block.pos.join(' '));
    names.push(block.pos[0]);
  }
  return names;
}

/** Point where the ray from the shape's centre toward (px, py) leaves its outline. */
function shapeBoundary(sh, px, py) {
  const dx = px - sh.cx;
  const dy = py - sh.cy;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return [sh.cx, sh.cy];
  let t;
  if (sh.kind === 'ellipse') t = 1 / Math.sqrt((dx / sh.hw) ** 2 + (dy / sh.hh) ** 2);
  else t = Math.min(Math.abs(dx) > 1e-9 ? sh.hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? sh.hh / Math.abs(dy) : Infinity);
  t = Math.min(t, 1);
  return [sh.cx + dx * t, sh.cy + dy * t];
}

/**
 * Draw every link of the figure on top of the placed blocks. `items` are the laid
 * out blocks ({ block, box }) after drawing. Returns the extents the links reach.
 */
function drawLinks(svg, fig, items, ctx, errors) {
  const ext = [Infinity, Infinity, -Infinity, -Infinity];
  const grow = (x, y, rx = 0, ry = 0) => {
    ext[0] = Math.min(ext[0], x - rx); ext[1] = Math.min(ext[1], y - ry);
    ext[2] = Math.max(ext[2], x + rx); ext[3] = Math.max(ext[3], y + ry);
  };
  if (!fig.links || !fig.links.length) return ext;
  const names = new Map();
  for (const it of items) for (const n of blockNames(it.block)) if (!names.has(n)) names.set(n, it);
  const known = () => [...new Set(items.flatMap((it) => blockNames(it.block).slice(0, 1)))].join(', ') || 'none';

  const lookup = (it, key, ref, line) => {
    const sh = it.box.anchors && it.box.anchors.get(key.replace(/\s+/g, ''));
    if (!sh) {
      errors.push({ line, msg: `link: ${ref} not found (${it.block.kind} ${blockNames(it.block)[0] || ''} has no "${key}")`, warn: true });
      return null;
    }
    return sh;
  };
  const resolve = (ref, line) => {
    let it = null;
    let sh = null;
    const m = ref.match(/^(.+?)\[(.+)\]$/);
    if (m && names.has(m[1])) { it = names.get(m[1]); sh = lookup(it, m[2], ref, line); if (!sh) return null; }
    else if (names.has(ref)) { it = names.get(ref); sh = it.box.anchors.get(''); }
    else {
      for (let i = ref.lastIndexOf('.'); i > 0; i = ref.lastIndexOf('.', i - 1)) {
        const n = ref.slice(0, i);
        if (names.has(n)) { it = names.get(n); sh = lookup(it, ref.slice(i + 1), ref, line); if (!sh) return null; break; }
      }
    }
    if (!it) { errors.push({ line, msg: `link: no block called "${ref.replace(/[[.].*$/, '')}" (named blocks: ${known()})`, warn: true }); return null; }
    if (!it.box.shift) return null;
    const [dx, dy] = it.box.shift;
    return { ...sh, cx: sh.cx + dx, cy: sh.cy + dy };
  };

  const lw = ctx.lw;
  const size = ctx.size;
  for (const L of fig.links) {
    const specs = [];
    if (L.rest.trim()) specs.push({ text: L.rest, line: L.line });
    for (const b of L.body) specs.push({ text: b.text, line: b.line });
    if (!specs.length) errors.push({ line: L.line, msg: 'link: nothing to link (write link A[1] -> B[2])', warn: true });
    for (const { text, line } of specs) {
      const spec = parseLinkSpec(text);
      if (spec.error) { errors.push({ line, msg: spec.error }); continue; }
      for (const k of Object.keys(spec.opts)) {
        if (!['bend', 'route', 'from', 'label', 'color', 'width'].includes(k)) errors.push({ line, msg: `Unknown link option "${k}=" (options: bend, route, from, label, color, width)`, warn: true });
      }
      if (spec.opts.bend != null) checkNumber('bend', spec.opts.bend, null, line, errors);
      if (spec.opts.route && !['hv', 'vh'].includes(spec.opts.route)) errors.push({ line, msg: `link route=${spec.opts.route}: expected hv | vh`, warn: true });
      if (spec.opts.from && !['center', 'edge'].includes(spec.opts.from)) errors.push({ line, msg: `link from=${spec.opts.from}: expected center | edge`, warn: true });
      const A = resolve(spec.from, line);
      const B = resolve(spec.to, line);
      if (!A || !B) continue;
      const color = strokeOf(spec.opts.color || [...spec.flags].find((f) => isColor(f)), '#000000');
      const width = lw * num(spec.opts.width, spec.flags.has('thick') ? 2.2 : 1);
      const dash = spec.flags.has('dashed') ? '4 3' : spec.flags.has('dotted') ? '1.5 3' : null;
      const heads = { end: spec.arrow === '->' || spec.arrow === '<->', start: spec.arrow === '<-' || spec.arrow === '<->' };
      const fromCenter = spec.opts.from === 'center' || (A.cell && spec.opts.from !== 'edge' && !heads.start);
      const angle = num(spec.opts.bend, 0);
      let mid;
      let normal;
      let s;
      let t;
      if (spec.opts.route === 'hv' || spec.opts.route === 'vh') {
        const corner = spec.opts.route === 'hv' ? [B.cx, A.cy] : [A.cx, B.cy];
        s = fromCenter ? [A.cx, A.cy] : shapeBoundary(A, corner[0], corner[1]);
        t = shapeBoundary(B, corner[0], corner[1]);
        const pts = [s, corner, t];
        pts.forEach((p) => grow(p[0], p[1]));
        svg.push(`<path d="M${pts.map((p) => `${n2(p[0])} ${n2(p[1])}`).join('L')}" fill="none" stroke="${color}" stroke-width="${n2(width)}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"/>`);
        // heads drawn over the line ends
        if (heads.end) {
          const a = Math.atan2(t[1] - corner[1], t[0] - corner[0]);
          svg.push(arrowHead(t[0], t[1], a, 1, color));
        }
        if (heads.start) {
          const a = Math.atan2(s[1] - corner[1], s[0] - corner[0]);
          svg.push(arrowHead(s[0], s[1], a, 1, color));
        }
        mid = corner;
        const horiz = spec.opts.route === 'hv';
        normal = horiz ? [0, -1] : [1, 0];
      } else {
        const len0 = Math.hypot(B.cx - A.cx, B.cy - A.cy) || 1;
        const ux = (B.cx - A.cx) / len0;
        const uy = (B.cy - A.cy) / len0;
        const lx = uy; // left of travel (screen coordinates)
        const ly = -ux;
        const h = Math.tan((Math.max(-80, Math.min(80, angle)) * Math.PI) / 180) * (len0 / 2);
        const C = [(A.cx + B.cx) / 2 + lx * h, (A.cy + B.cy) / 2 + ly * h];
        const aim = angle ? C : [B.cx, B.cy];
        s = fromCenter ? [A.cx, A.cy] : shapeBoundary(A, aim[0], aim[1]);
        t = shapeBoundary(B, angle ? C[0] : s[0], angle ? C[1] : s[1]);
        let bend = 0;
        if (angle) {
          const l2 = Math.hypot(t[0] - s[0], t[1] - s[1]) || 1;
          const cnx = -(t[1] - s[1]) / l2;
          const cny = (t[0] - s[0]) / l2;
          bend = ((C[0] - (s[0] + t[0]) / 2) * cnx + (C[1] - (s[1] + t[1]) / 2) * cny) / 2;
        }
        connector(svg, s[0], s[1], t[0], t[1], { ...heads, bend, width, color, dash });
        grow(s[0], s[1]); grow(t[0], t[1]);
        if (angle) {
          mid = [(s[0] + 2 * C[0] + t[0]) / 4, (s[1] + 2 * C[1] + t[1]) / 4];
          grow(mid[0], mid[1]);
          normal = angle > 0 ? [lx, ly] : [-lx, -ly];
        } else {
          mid = [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2];
          // label above a horizontal-ish line, to the right of a vertical one
          normal = Math.abs(ly) >= Math.abs(lx) ? (ly < 0 ? [lx, ly] : [-lx, -ly]) : (lx > 0 ? [lx, ly] : [-lx, -ly]);
        }
      }
      if (fromCenter) svg.push(`<circle cx="${n2(s[0])}" cy="${n2(s[1])}" r="${n2(1.8 * lw)}" fill="${color}"/>`);
      if (spec.label) {
        if (spec.flags.has('swap')) normal = [-normal[0], -normal[1]];
        const m = labelSize(spec.label, size * 0.9);
        const off = Math.abs(normal[0]) * (m.w / 2) + Math.abs(normal[1]) * (m.h / 2) + 3;
        const x = mid[0] + normal[0] * off;
        const y = mid[1] + normal[1] * off;
        svg.label(spec.label, x, y, size * 0.9);
        grow(x, y, m.w / 2, m.h / 2);
      }
    }
  }
  return ext;
}
