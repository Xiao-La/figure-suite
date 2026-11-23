/*
 * Figure Suite — figure composition: blocks → panels → rows → SVG.
 */

const LAYOUTS = {
  array: layoutArray,
  table: layoutTable,
  tree: layoutTree,
  graph: layoutGraph,
  list: layoutList,
  chains: layoutChains,
  text: layoutText,
  arrow: layoutArrow,
  space: layoutSpace,
};

const DEFAULT_RENDER = {
  fontSize: 15,
  background: '#ffffff',
  fill: '',
  listFill: 'light',
};

/**
 * Render figure source. Returns { svg, width, height, errors, hits, empty }.
 * `hits` lists draggable graph nodes in SVG pixel coordinates.
 */
function renderFigure(source, settings = {}, { embedSource = false } = {}) {
  const conf = { ...DEFAULT_RENDER, ...settings };
  const fig = parseFigure(source);
  const errors = fig.errors.slice();
  // typos like \\alpah would print literally: point at them
  String(source || '').split(/\r\n?|\n/).forEach((line, k) => {
    if (/^\s*(\/\/|%)/.test(line)) return;
    const bad = [...new Set(unknownCommands(stripComment(line)))];
    if (bad.length) errors.push({ line: k + 1, msg: `Unknown command ${bad.map((c) => `\\${c}`).join(', ')} (printed as is)`, warn: true });
  });
  const o = fig.opts;
  let size = num(o.size, conf.fontSize);
  if (!(size >= 4 && size <= 80)) {
    errors.push({ line: fig.line || 1, msg: `figure size=${o.size} is out of range (4–80)`, warn: true });
    size = Math.min(80, Math.max(4, size || conf.fontSize));
  }
  const globalFill = o.fill || conf.fill || '';
  const ctx = {
    size,
    lw: num(o.lw, 1),
    fills: {
      array: globalFill || 'white',
      table: globalFill || 'white',
      tree: globalFill || 'white',
      graph: globalFill || 'white',
      list: globalFill || conf.listFill || 'light',
    },
  };
  const svg = new SVG();
  const hits = [];

  // lay out every block
  const panels = fig.panels.map((p) => {
    const items = p.blocks.map((b) => {
      try {
        // any block may set its own font size
        let bctx = ctx;
        if (b.opts.size != null && b.kind !== 'text') {
          const bs = num(b.opts.size, size);
          bctx = { ...ctx, size: Math.min(80, Math.max(4, bs)) };
        }
        return { block: b, box: LAYOUTS[b.kind](b, bctx, errors) };
      } catch (err) {
        errors.push({ line: b.line, msg: `${b.kind}: ${err && err.message ? err.message : err}` });
        return null;
      }
    }).filter(Boolean);
    const dir = p.opts.dir === 'row' ? 'row' : 'col';
    const gap = num(p.opts.gap, size * 1.6);
    let w = 0;
    let h = 0;
    if (dir === 'col') {
      items.forEach((it, k) => { w = Math.max(w, it.box.w); h += it.box.h + (k ? gap : 0); });
    } else {
      items.forEach((it, k) => { h = Math.max(h, it.box.h); w += it.box.w + (k ? gap : 0); });
    }
    const capText = unquote(p.caption || '');
    const tag = capText.match(/^(\([A-Za-z0-9]{1,3}\))(\s+.*)?$/s);
    const caption = !capText ? '' : tag ? `\\textbf{${tag[1]}}${tag[2] || ''}` : capText;
    const cap = caption ? labelSize(caption, size, 'text') : null;
    return { p, items, dir, gap, w, h, caption, cap, arrow: !!p.arrow };
  });

  // rows of panels
  const cols = Math.max(1, Math.round(num(o.cols, panels.length || 1)));
  const rows = [];
  let current = [];
  let counted = 0;
  for (const panel of panels) {
    current.push(panel);
    if (!panel.arrow) counted++;
    if (counted >= cols) { rows.push(current); current = []; counted = 0; }
  }
  if (current.length) rows.push(current);
  const pgap = num(o.gap, size * 2.2);
  const rgap = num(o.rowgap, size * 2);
  const align = o.align || 'center';
  const capGap = size * 0.9;

  // Column-aligned grid (default): every column is as wide as its widest panel and
  // panels are centred in it; arrows sit in the gaps between columns, which widen
  // to fit them. `columns=packed` packs each row left to right instead.
  const packed = o.columns === 'packed';
  const pwOf = (pn) => Math.max(pn.w, pn.cap ? pn.cap.w : 0);
  // slot of each panel: column index, or gap index (arrow after column g; -1 = leading)
  const slots = rows.map((row) => {
    let c = 0;
    return row.map((pn) => (pn.arrow ? { gap: c - 1 } : { col: c++ }));
  });
  const colW = [];
  const gapArrows = new Map(); // gap → max total arrow width in that gap
  rows.forEach((row, r) => {
    const perGap = new Map();
    row.forEach((pn, k) => {
      const s = slots[r][k];
      if (s.col !== undefined) colW[s.col] = Math.max(colW[s.col] || 0, pwOf(pn));
      else perGap.set(s.gap, (perGap.get(s.gap) || 0) + pn.w + pgap * 0.6);
    });
    for (const [g, w] of perGap) gapArrows.set(g, Math.max(gapArrows.get(g) || 0, w));
  });
  const gapW = (g) => (gapArrows.has(g) ? gapArrows.get(g) + pgap * 0.6 * (g >= 0 && g + 1 < colW.length ? 1 : 0) : g >= 0 && g + 1 < colW.length ? pgap : 0);
  const colX = [];
  {
    let x = gapW(-1);
    colW.forEach((w, c) => { colX[c] = x; x += w + gapW(c); });
  }

  let y = 0;
  let width = 0;
  const placed = [];
  rows.forEach((row, r) => {
    const contentH = Math.max(0, ...row.filter((pn) => !pn.arrow).map((pn) => pn.h), ...row.map((pn) => (pn.arrow ? pn.h : 0)));
    const capH = Math.max(0, ...row.map((pn) => (pn.cap ? pn.cap.h : 0)));
    const topOf = (pn) => (pn.arrow || align === 'center' ? y + (contentH - pn.h) / 2 : align === 'bottom' ? y + contentH - pn.h : y);
    const capY = y + contentH + capGap + capH / 2;
    if (packed) {
      let x = 0;
      row.forEach((pn, k) => {
        const pw = pwOf(pn);
        placed.push({ pn, x, top: topOf(pn), pw, capY });
        x += pw + (k + 1 < row.length ? (pn.arrow || (row[k + 1] && row[k + 1].arrow) ? pgap * 0.6 : pgap) : 0);
      });
      width = Math.max(width, x);
    } else {
      // arrows: spread the ones sharing a gap evenly across it
      const inGap = new Map();
      row.forEach((pn, k) => { const s = slots[r][k]; if (s.gap !== undefined) inGap.set(s.gap, (inGap.get(s.gap) || []).concat(pn)); });
      row.forEach((pn, k) => {
        const s = slots[r][k];
        if (s.col !== undefined) {
          placed.push({ pn, x: colX[s.col], top: topOf(pn), pw: colW[s.col], capY });
          width = Math.max(width, colX[s.col] + colW[s.col]);
          return;
        }
        const left = s.gap >= 0 ? colX[s.gap] + colW[s.gap] : 0;
        const right = s.gap + 1 < colX.length ? colX[s.gap + 1] : left + gapW(s.gap);
        const list = inGap.get(s.gap);
        const total = list.reduce((t, a) => t + a.w, 0);
        const space = (right - left - total) / (list.length + 1);
        let x = left + space;
        for (const a of list) { if (a === pn) break; x += a.w + space; }
        placed.push({ pn, x, top: topOf(pn), pw: pn.w, capY });
        width = Math.max(width, x + pn.w);
      });
    }
    y += contentH + (capH ? capGap + capH : 0) + rgap;
  });
  const height = Math.max(0, y - rgap);

  for (const { pn, x, top, pw, capY } of placed) {
    if (pn.dir === 'col') {
      let yy = top;
      for (const it of pn.items) {
        it.box.draw(svg, x + (pw - it.box.w) / 2, yy, hits);
        yy += it.box.h + pn.gap;
      }
    } else {
      let xx = x + (pw - pn.w) / 2;
      for (const it of pn.items) {
        it.box.draw(svg, xx, top + (pn.h - it.box.h) / 2, hits);
        xx += it.box.w + pn.gap;
      }
    }
    if (pn.caption) svg.label(pn.caption, x + pw / 2, capY, size, '#000', 'text');
  }

  const pad = num(o.padding, Math.round(size * 0.6));
  const W = Math.ceil(width + pad * 2);
  const H = Math.ceil(height + pad * 2);
  const bg = o.background || conf.background;
  const out = svg.toString({ width: W, height: H, background: bg === 'transparent' ? null : bg, padding: pad, source: embedSource ? source : null });
  hits.forEach((h) => { h.x += pad; h.y += pad; h.ox += pad; h.oy += pad; });
  return { svg: out, width: W, height: H, errors: errors.sort((a, b) => a.line - b.line), hits, empty: !fig.blocks.length };
}
