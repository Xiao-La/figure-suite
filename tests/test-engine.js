/* Engine tests: parsing, labels, layouts, every template, source round-trips. */
const { loadEngine, check, finish } = require('./harness');

const api = loadEngine();
const R = (src) => api.renderFigure(src, {});

// tokenizer
const toks = api.tokenize('a "b c" key="x y" (1, 2) [A B] {p q}').map((t) => t.text);
check('tokenize groups', JSON.stringify(toks) === JSON.stringify(['a', 'b c', 'key=x y', '(1, 2)', '[A B]', '{p q}']), JSON.stringify(toks));
check('inner quotes kept', api.tokenize('T"(n)"')[0].text === 'T"(n)"');

// parser structure
let fig = api.parseFigure('figure cols=2\npanel (a)\narray A\n  1 2\narrow RL\ntree\n  x\n// comment\n  % also comment\ngraph\n  a -> b');
check('panels', fig.panels.length === 3, fig.panels.length);
check('arrow panel', fig.panels[1].arrow === true);
check('opts', fig.opts.cols === '2');
fig = api.parseFigure('table c start=0 index brackets');
check('header flags', fig.blocks[0].opts.index === 'true' && fig.blocks[0].opts.brackets === 'true' && fig.blocks[0].pos.join() === 'c');
fig = api.parseFigure('  stray\nbogus x');
check('errors reported', fig.errors.length === 2, JSON.stringify(fig.errors));

// labels
const w = (s) => api.typeset(s).w;
check('label width', w('x') > 0.4 && w('x') < 0.7, w('x'));
check('subscript narrower', w('x_1') < w('x1x'));
check('auto subscript', JSON.stringify(api.parseLabel('v1')).includes('"t":"s"'));
check('NIL small caps', JSON.stringify(api.parseLabel('NIL')).includes('"sc"'));
check('quoted = text', JSON.stringify(api.parseLabel('"ab"')).includes('"st":"r"'));
check('symbols', api.typeset('\\le \\infty \\nwarrow').w > 2);
check('frac', api.typeset('\\frac{n}{2}').asc > 0.6);
check('empty', api.typeset('').empty);

// every template renders without errors
for (const t of api.templates) {
  const r = R(t.source);
  check(`template ${t.name}`, !r.errors.length && r.width > 20 && r.height > 20 && !r.svg.includes('NaN'), JSON.stringify(r.errors));
}

// error tolerance: garbage never throws
for (const src of ['array\n  shade: x..y', 'table\n  arrow: nope', 'tree\n      a\n  b', 'graph\n  a -> ', 'graph layout=zzz\n  a -- b', 'list\n', 'chains\n  :', 'text', 'figure cols=0\narray\n  1']) {
  let ok = true;
  try { R(src); } catch (e) { ok = false; console.log(e); }
  check(`robust: ${JSON.stringify(src)}`, ok);
}

// tree layout: siblings never overlap
{
  const r = R('tree\n  1\n    2\n      4\n      5\n    3\n      6\n      7');
  const cs = [...r.svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
  let overlap = false;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (Math.hypot(cs[i][0] - cs[j][0], cs[i][1] - cs[j][1]) < cs[i][2] + cs[j][2]) overlap = true;
  check('tree no overlap', cs.length === 7 && !overlap);
}

// graph hits and position write-back
{
  const src = 'graph\n  a (0,0)\n  b\n  a -> b\n  b -> c';
  const r = R(src);
  check('graph hits', r.hits.length === 3 && r.hits.every((h) => h.block === 0));
  const pos = new Map(r.hits.map((h) => [h.id, [h.ux, h.uy]]));
  pos.set('a', [1.234, -2]);
  const out = api.setGraphPositions(src, 0, pos);
  check('a moved', /\n  a \(1\.23,-2\)/.test(out), out);
  check('b got coords', /\n  b \(-?[\d.]+,-?[\d.]+\)/.test(out), out);
  check('c declared', /\n  c \(-?[\d.]+,-?[\d.]+\)/.test(out), out);
  const r2 = R(out);
  check('manual after drag', r2.hits.find((h) => h.id === 'a').ux === 1.23);
  const at = api.setGraphPositions('graph\n  a at=(0,0) gray\n  a -- b', 0, new Map([['a', [2, 3]]]));
  check('at= replaced', at.includes('a at=(2,3) gray'), at);
}

// PNG source round trip (hand-made minimal PNG)
{
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); Buffer.from(data).copy(b, 8);
    return b;
  };
  const png = new Uint8Array(Buffer.concat([Buffer.from(sig), chunk('IHDR', new Array(13).fill(0)), chunk('IDAT', [1, 2, 3]), chunk('IEND', [])]));
  const src = 'tree\n  "中文 ok" right=-2';
  const once = api.pngWithSource(png, src, 2);
  const twice = api.pngWithSource(once, src + '\n', 2);
  check('png source', api.extractSource(once, 'png') === src);
  check('png source replaced', api.extractSource(twice, 'png') === `${src}\n` && twice.length === once.length + 1);
  const svg = api.renderFigure(src, {}, { embedSource: true }).svg;
  check('svg source', api.extractSource(new TextEncoder().encode(svg), 'svg') === src);
  check('no source', api.extractSource(png, 'png') === null);
}

// label spacing (regressions)
check('space in quoted label', w('a b') > w('ab') + 0.2);
check('space dropped by operators', Math.abs(w('a = b') - w('a=b')) < 1e-9);
check('log thin space', w('n \\log n') > w('nlog') + w('n') && Math.abs(w('n \\log n') - w('n\\log n') - 0.28) < 0.01);
check('italic correction', w('f:') > api.typeset('\\text{f:}').w - 0.2 && w('f:') > w('f') + 0.2);

// typo / range warnings
const msgs = (src) => R(src).errors.map((e) => e.msg).join(' | ');
check('unknown header option', /Unknown option "layot="/.test(msgs('graph layot=circle\n  a -- b')));
check('bad option value', /expected/.test(msgs('table grid=some\n  1')));
check('unknown directive', /Unknown directive "ptrs:"/.test(msgs('array A\n  1 2\n  ptrs: i=2')));
check('array range', /outside 1..2/.test(msgs('array A\n  1 2\n  ptr: i=5')));
check('ptr one past the end is fine', !msgs('array A\n  1 2\n  ptr: i=0 j=3\n  bar: 0 2'));
check('far ptr dropped', R('array A\n  1 2\n  ptr: j=40').width === R('array A\n  1 2').width);
check('far bar warned', /bar: 5/.test(msgs('array A\n  1 2\n  bar: 5')));
{
  const g = 'panel\narray\n  1\npanel\narray\n  1 2 3 4 5 6\npanel\narray\n  1 2 3 4 5 6\npanel\narray\n  1';
  const aligned = R('figure cols=2\n' + g);
  const packed = R('figure cols=2 packed\n' + g);
  check('aligned columns widen the grid', aligned.width > packed.width && !aligned.errors.length && !packed.errors.length);
  check('columns=packed same as flag', R('figure cols=2 columns=packed\n' + g).width === packed.width);
  check('stray figure word warned', /Unknown word "colss"/.test(msgs('figure colss\narray\n  1')));
  check('arrows in aligned grid', !R('figure cols=2\narray\n  1\narrow "a"\narray\n  2\narray\n  3 3 3\narrow\narray\n  4').errors.length);
}
{
  const svgOf = (src) => R(src).svg;
  check('n-1 graph node stays a circle', !/<ellipse/.test(svgOf('graph\n  a -- n-1')));
  check('n-1 tree node stays a circle', !/<ellipse/.test(svgOf('tree\n  n\n    n-1')));
  check('long label becomes ellipse', /<ellipse/.test(svgOf('graph\n  a -- b\n  b "a very long label"')));
  check('explicit circle kept', !/<ellipse/.test(svgOf('graph\n  a -- b\n  b "a very long label" circle')) && !/<ellipse/.test(svgOf('tree\n  "a very long label" circle')));
}
{
  const base = 'graph layout=line\n  0 -> 1 -> 2\n  0 -> 2';
  const up = R(base), down = R(base + ' below');
  check('line arc below differs', up.svg !== down.svg && !down.errors.length);
  check('line arc above is default for forward edges', R(base + ' above').svg === up.svg);
}
check('table range', /outside rows/.test(msgs('table\n  1 2\n  shade: (3,1)')));
check('tree flag typo', /Unknown word "blak"/.test(msgs('tree\n  1 blak')));
check('graph key typo', /Unknown edge option "bnd="/.test(msgs('graph\n  a -> b bnd=20')));
check('size clamp', /out of range/.test(msgs('figure size=0\narray\n  1')) && R('figure size=0\narray\n  1').width > 20);
check('colors are not typos', !msgs('tree\n  1 red\n    2 #abc thick').length);

// PNG display width from pHYs
{
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(600, 0); ihdr.writeUInt32BE(300, 4);
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); Buffer.from(data).copy(b, 8); return b; };
  const png = new Uint8Array(Buffer.concat([Buffer.from(sig), chunk('IHDR', ihdr), chunk('IEND', Buffer.alloc(0))]));
  check('css width 1x (no pHYs)', api.pngCssWidth(png) === 600);
  check('css width 2x', api.pngCssWidth(api.pngWithSource(png, 'x', 2)) === 300);
  check('scale read back', api.pngScale(png) === 1 && api.pngScale(api.pngWithSource(png, 'x', 4)) === 4);
  check('css width 3x', api.pngCssWidth(api.pngWithSource(png, 'x', 3)) === 200);
}

// ---- review round 3 ----
{
  const W = (src) => R(src).errors.map((e) => e.msg).join(' | ');
  const svgOf = (src) => R(src).svg;
  check('graph unknown directive is an error', /Unknown directive "groups:"/.test(W('graph\n  groups: a b\n  a -- b')));
  check('tree unknown directive is an error', /Unknown directive "levels:"/.test(W('tree\n  1\n  levels: 0 x')));
  check('quoted colon label is a node', !W('tree\n  "x:"\n    2'));
  check('inline comment', !W('array A // the input\n  1 2 // values\n  shade: 1 // first') && R('array A // c\n  1 2').width === R('array A\n  1 2').width);
  check('// inside quotes kept', R('text "a // b"').width > R('text "a"').width + 10);
  check('tree label@color', /fill="#000000"/.test(svgOf('tree\n  7@black')) && !/@/.test(svgOf('tree\n  7@black').replace(/<metadata[\s\S]*<\/metadata>/, '')));
  check('graph id@color', svgOf('graph\n  a@black -- b') === svgOf('graph\n  a black\n  a -- b'));
  check('tree shade directive', svgOf('tree\n  7\n    3\n  shade: 3 black') === svgOf('tree\n  7\n    3 black'));
  check('tree shade unknown label warns', /no node labelled "4"/.test(W('tree\n  7\n  shade: 4')));
  check('graph shade fills nodes', svgOf('graph\n  a -- b\n  shade: a black') === svgOf('graph\n  a black\n  a -- b'));
  check('graph color: alias', svgOf('graph\n  a -- b\n  color: a black') === svgOf('graph\n  a black\n  a -- b'));
  check('per-block size', R('tree size=30\n  1').width > R('tree\n  1').width * 1.5 && !W('array size=10\n  1'));
  check('numeric options checked', /gap=abc: expected a number/.test(W('figure gap=abc\narray\n  1')) && /unit=-5: must be at least 1/.test(W('graph unit=-5\n  a -- b')));
  check('edge option checks', /loop=up/.test(W('graph\n  a -> a loop=up')) && /bend=xx/.test(W('graph\n  a -> b bend=xx')));
  check('rank unknown node warns', /rank: unknown node "z"/.test(W('graph\n  a -> b\n  rank: a z')));
  check('ptr without index warns', /has no index/.test(W('array\n  1 2\n  ptr: i')) && /needs a number/.test(W('array\n  1 2\n  ptr: i=x')));
  check('ptr NaN not drawn', !/NaN/.test(svgOf('array\n  1 2\n  ptr: i=x')));
  check('level far below skipped', /below the deepest level/.test(W('tree\n  1\n  level: 5 x')) && !W('tree\n  1\n  level: 1 x'));
  check('unknown command warns', /Unknown command \\alpah/.test(W('array\n  \\alpah \\alpha \\log a\\\\b')) && !W('array\n  \\alpha \\frac{1}{2} \\cdots \\text{x}'));
  check('r too small warns', /too small/.test(W('tree r=3\n  10')) && /too small/.test(W('graph r=4\n  a -- b')) && !W('tree r=20\n  1'));
  check('NIL slash visible on dark list node', /stroke="#ffffff"/.test(svgOf('list L\n  1 2@black')));
  {
    const a = R('graph\n  a (0,0)\n  a -- b -- c -- d\n  b -- d');
    const pts = a.hits.map((h) => [h.x, h.y]);
    let minD = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) minD = Math.min(minD, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
    check('partial coordinates do not pile up', minD > 25, `min distance ${minD}`);
  }
}

// theory-CS additions: symbols, accents, blackboard/calligraphic letters, bottom-up layers
{
  const syms = '\\vdash \\models \\top \\bot \\supseteq \\sqsubseteq \\prec \\preceq \\ll \\gg \\oplus \\otimes \\odot \\sqcup \\sqcap \\uplus \\setminus \\bullet \\lhd \\rhd \\Box \\Diamond \\blacksquare \\hookrightarrow \\leadsto \\Leftarrow \\Uparrow \\Downarrow \\triangleq \\coloneqq \\propto \\nmid';
  const r = R(`array\n  "${syms}"`);
  check('theory symbols are known', !r.errors.length, r.errors.map((e) => e.msg).join('; '));
  const acc = R('array\n  \\hat{x} \\tilde{y} \\vec{v} \\dot{x} \\ddot{q} "\\overrightarrow{AB}" "\\widehat{xyz}" \\mathbb{N} "\\mathcal{O}(n)"');
  check('accents and letter styles render cleanly', !acc.errors.length && !acc.empty, acc.errors.map((e) => e.msg).join('; '));
  const b = api.typeset('\\mathbb{R}');
  check('\\mathbb maps to double-struck', b.items.some((it) => it.k === 't' && it.text === 'ℝ'));
  const up = R('graph layout=layered dir=up\n  a -> b').hits;
  check('dir=up puts sources at the bottom', up[0].y > up[1].y, JSON.stringify(up.map((h) => h.y)));
  const left = R('graph layout=layered dir=left\n  a -> b').hits;
  check('dir=left puts sources on the right', left[0].x > left[1].x, JSON.stringify(left.map((h) => h.x)));
  const theory = R(require('fs').readFileSync(require('path').join(__dirname, '..', 'docs', 'theory.fig'), 'utf8'));
  check('theory showcase renders cleanly', !theory.errors.length, theory.errors.map((e) => `${e.line}: ${e.msg}`).join('; '));
}

// ---- 1.1: links, plot, seq, timeline, sets ----
/** Lay out the first block of `src` alone; labels drawn are recorded with their centres. */
const L = (src) => {
  const f = api.parseFigure(src);
  const errors = [...f.errors];
  const b = f.blocks[0];
  const box = api.LAYOUTS[b.kind](b, { size: 16, lw: 1, fills: { array: 'white', table: 'white', tree: 'white', graph: 'white', list: 'light' } }, errors);
  const svg = new api.SVG();
  const labels = [];
  const orig = svg.label.bind(svg);
  svg.label = (text, x, y, ...rest) => { labels.push({ text, x, y }); return orig(text, x, y, ...rest); };
  box.draw(svg, 0, 0, []);
  // back to layout coordinates (the ones anchors use)
  const [sx, sy] = box.shift || [0, 0];
  for (const l of labels) { l.x -= sx; l.y -= sy; }
  return { box, errors, labels, svg: svg.toString ? svg.toString(box.w, box.h, 0) : '' };
};
const warns = (r) => r.errors.map((e) => e.msg).join('; ');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// links
{
  const f = api.parseFigure('array P id=P\n  1 2\nlist L\n  a b\nlink P[1] -> L[2] "next"\nlink\n  P[2] -> L[1] dashed');
  check('link lines are not panels or blocks', f.panels.length === 1 && f.blocks.length === 2 && f.links.length === 2, `${f.panels.length} ${f.blocks.length} ${f.links.length}`);
  const spec = api.parseLinkSpec('T[1,2]->T.x[3] "a b" bend=20 dashed red');
  check('link spec parses', spec.from === 'T[1,2]' && spec.to === 'T.x[3]' && spec.arrow === '->' && spec.label === 'a b' && spec.opts.bend === '20' && spec.flags.has('dashed') && spec.flags.has('red'), JSON.stringify(spec));
  check('arrows inside brackets stay put', api.parseLinkSpec('A[x->y] <- B').to === 'B');
  check('bad link spec is an error', !!api.parseLinkSpec('A B').error);
  const rect = { kind: 'rect', cx: 0, cy: 0, hw: 10, hh: 5 };
  const pb = api.shapeBoundary(rect, 100, 0);
  check('rect boundary', near(pb[0], 10) && near(pb[1], 0), pb);
  const pc = api.shapeBoundary(rect, 100, 100);
  check('rect boundary at a corner side', near(pc[0], 5) && near(pc[1], 5), pc);
  const pe = api.shapeBoundary({ kind: 'ellipse', cx: 0, cy: 0, hw: 10, hh: 5 }, 0, -50);
  check('ellipse boundary', near(pe[0], 0) && near(pe[1], -5), pe);
  const ok = R('figure cols=2\npanel\narray P\n  1 2 3\npanel\nlist L\n  a b c\nlink P[1] -> L[2] "next"\nlink P -> L');
  check('links resolve cleanly', !ok.errors.length, warns(ok));
  const plain = R('figure cols=2\npanel\narray P\n  1 2 3\npanel\nlist L\n  a b c');
  check('links add paths', (ok.svg.match(/<path/g) || []).length > (plain.svg.match(/<path/g) || []).length);
  const bad = R('array P\n  1 2\nlink P[9] -> Q[1]\nlink X -> P');
  check('unknown link targets warn', bad.errors.length === 3 && bad.errors.every((e) => e.warn), warns(bad));
  check('unknown block lists the names', /named blocks: P/.test(warns(bad)), warns(bad));
  const grow = R('array P\n  1 2\nlink P[1] -> P[2] bend=80 "far above"');
  const base = R('array P\n  1 2');
  check('links grow the canvas', grow.height > base.height, `${grow.height} vs ${base.height}`);
  const many = R('table T id=T\n  1 2\n  3 4\ntree B id=B\n  [3 7]\n    [1 2]\n    [5]\n    [9]\ngraph G id=G\n  a -> b\nchains H id=H\n  0: x y\nlink\n  T[1,1] -> T[2,2]\n  B[5] -> B[9] dashed\n  G.a -> H[0]\n  H[0,2] -> T[1,2] route=hv');
  check('links reach table cells, B-tree keys, graph nodes, chains', !many.errors.length, warns(many));
}

// plot: expression evaluator
{
  const ev = (src, x) => api.compileExpr(src)(x);
  check('n lg n', near(ev('n \\lg n', 8), 24));
  check('n log n (log = lg)', near(ev('n log n', 8), 24));
  check('2^n', near(ev('2^n', 5), 32));
  check('-n^2 is -(n^2)', near(ev('-n^2', 3), -9));
  check('\\frac{n}{2}', near(ev('\\frac{n}{2}', 7), 3.5));
  check('implicit product 2n', near(ev('2n', 4), 8));
  check('n! via gamma', near(ev('n!', 5), 120, 1e-6), ev('n!', 5));
  check('functions without parentheses', near(ev('\\sqrt n', 16), 4) && near(ev('sin(0)', 0), 0));
  check('n^{1/2}', near(ev('n^{1/2}', 9), 3));
  check('2^2^3 is right-associative', near(ev('2^2^3', 0), 256));
  check('x and t also work', near(ev('x^2', 3), 9) && near(ev('3t', 2), 6));
  let threw = false;
  try { api.compileExpr('n + * 2'); } catch (e) { threw = true; }
  check('bad expression throws', threw);
  threw = false;
  try { api.compileExpr('foo(n)'); } catch (e) { threw = true; }
  check('unknown function throws', threw);
}

// plot: layout
{
  const r = R('plot x=1..8\n  n\n  n^2 "quadratic" dashed\n  \\lg n');
  check('plot renders cleanly', !r.errors.length && !r.empty, warns(r));
  const lab = L('plot x=1..8\n  n\n  n^2\n  \\lg n').labels.map((l) => l.text);
  check('every curve is labelled', ['n', 'n^2', '\\lg n'].every((t) => lab.includes(t)), lab.join('|'));
  const auto = L('plot x=0..4\n  n^2').labels.map((l) => l.text);
  check('auto y range covers the curve', auto.includes('20') && !auto.includes('40'), auto.join('|'));
  const bad = R('plot\n  n +* 2');
  check('bad expression warns with the line', bad.errors.length === 1 && bad.errors[0].line === 2, warns(bad));
  const ext = R('plot\n  bars: 1 2 3\n  points: (1,1) (2,4)\n  vline: 2 n_0\n  hline: 3 c dotted');
  check('bars, points and reference lines', !ext.errors.length && /stroke-dasharray/.test(ext.svg) && (ext.svg.match(/<rect/g) || []).length >= 3, warns(ext));
  const v = L('plot x=0..10 ticks=none\n  n\n  vline: 4 n_0');
  check('vline is labelled', v.labels.some((l) => l.text === 'n_0'));
  check('ticks=none drops tick labels', !v.labels.some((l) => l.text === '2'), v.labels.map((l) => l.text).join('|'));
  const xt = L('plot x=0..4 y=0..100\n  n\n  xticks: 1 2:n_0').labels.map((l) => l.text);
  check('xticks with labels', xt.includes('n_0') && xt.includes('1') && !xt.includes('3'), xt.join('|'));
  const rng = R('plot x=abc\n  n');
  check('bad range warns', rng.errors.some((e) => /x=abc/.test(e.msg)), warns(rng));
}

// seq
{
  const s = L('seq\n  C "client"\n  S "server"\n  C -> S "SYN" delay=1\n  S --> C "ACK"\n  C -> C "retry"\n  S * "crash"');
  check('seq renders cleanly', !s.errors.length, warns(s));
  const a = s.box.anchors;
  check('actors in declaration order', a.get('C').cx < a.get('S').cx);
  check('actor labels drawn', ['client', 'server', 'SYN', 'ACK', 'retry', 'crash'].every((t) => s.labels.some((l) => l.text === t)), s.labels.map((l) => l.text).join('|'));
  const auto = L('seq\n  A -> B\n  B -> C').box.anchors;
  check('actors created on first use', auto.has('A') && auto.has('B') && auto.has('C') && auto.get('B').cx < auto.get('C').cx);
  const flat = L('seq\n  A -> B "m"');
  const slant = L('seq\n  A -> B "m" delay=1');
  check('delay slants the arrow (taller diagram)', slant.box.h > flat.box.h, `${slant.box.h} vs ${flat.box.h}`);
  const right = L('seq dir=right\n  P -> Q\n  Q -> R');
  check('dir=right: actors stacked vertically', right.box.anchors.get('P').cy < right.box.anchors.get('Q').cy && right.box.anchors.get('Q').cy < right.box.anchors.get('R').cy);
  check('dir=right: wider than tall for long runs', L('seq dir=right\n  P -> Q\n  Q -> P\n  P -> Q\n  Q -> P').box.w > right.box.w);
  const both = R('seq\n  A <-> B\n  A <- B\n  A -> B lost red');
  check('both-way, reversed and lost messages', !both.errors.length, warns(both));
  const bad = R('seq\n  A -> B wat=1\n  A B C D');
  check('seq bad lines warn', bad.errors.length === 2, warns(bad));
  check('seq in a figure has an anchor for links', !R('seq id=S\n  A -> B\narray X\n  1\nlink S.A -> X[1]').errors.length);
}

// timeline
{
  const t = L('timeline\n  a 0..3\n  b 2..5 "x"\n  a 6..8\n  d 9 "due"');
  check('timeline renders cleanly', !t.errors.length, warns(t));
  const names = t.labels.filter((l) => ['a', 'b', 'd'].includes(l.text));
  check('repeated names share a row', names.length === 3, names.map((l) => l.text).join('|'));
  const ya = names.find((l) => l.text === 'a').y;
  const yb = names.find((l) => l.text === 'b').y;
  check('rows go down in order', ya < yb);
  check('point event labelled', t.labels.some((l) => l.text === 'due'));
  const g = L('timeline gantt\n  P_1 0..24\n  P_2 24..27\n  P_3 27..30');
  const ticks = g.labels.map((l) => l.text);
  check('gantt ticks at every boundary', ['0', '24', '27', '30'].every((v) => ticks.includes(v)) && !ticks.includes('10'), ticks.join('|'));
  check('gantt names inside the bars', ['P_1', 'P_2', 'P_3'].every((v) => ticks.includes(v)));
  check('gantt is one row', g.box.h < t.box.h);
  const rev = R('timeline\n  a 5..2');
  check('reversed range warns', rev.errors.length === 1 && rev.errors[0].warn && /backwards/.test(rev.errors[0].msg), warns(rev));
  const cut = R('timeline to=3\n  a 0..5');
  check('interval past to= warns', cut.errors.some((e) => /outside/.test(e.msg)), warns(cut));
  const mk = L('timeline\n  a 0..4\n  mark: 2 t');
  check('mark is labelled', mk.labels.some((l) => l.text === 't') && /stroke-dasharray/.test(mk.svg));
}

// sets
{
  const f = api.compileSetFormula;
  const ids = ['A', 'B', 'C'];
  const m = (a, b, c) => ({ A: a, B: b, C: c });
  check('A-B', f('A-B', ids)(m(1, 0, 0)) && !f('A-B', ids)(m(1, 1, 0)));
  check('A&B|C precedence', f('A&B|C', ids)(m(0, 0, 1)) && !f('A&B|C', ids)(m(1, 0, 0)));
  check('complement forms', f("A'", ids)(m(0, 1, 0)) && f('~A', ids)(m(0, 0, 0)) && !f('!A', ids)(m(1, 0, 0)));
  check('TeX operators', f('A \\cap (B \\cup C)', ids)(m(1, 0, 1)) && !f('A \\setminus B', ids)(m(1, 1, 0)));
  check('U is everything', f('U-A', ids)(m(0, 1, 0)) && !f('U-A', ids)(m(1, 0, 0)));
  let threw = false;
  try { f('A&D', ids); } catch (e) { threw = /no set called "D"/.test(e.message); }
  check('unknown set in formula throws', threw);

  const v2 = L('sets\n  A\n  B');
  const A = v2.box.anchors.get('A');
  const B = v2.box.anchors.get('B');
  check('two-set venn: side by side, overlapping', near(A.cy, B.cy) && A.cx < B.cx && B.cx - A.cx < A.hw + B.hw);
  const v3 = L('sets\n  A\n  B\n  C').box.anchors;
  check('three-set venn: C below', v3.get('C').cy > v3.get('A').cy && near(v3.get('A').cy, v3.get('B').cy));
  const sh = R('sets universe\n  A\n  B\n  shade: A-B');
  check('shading uses a clip path and a mask', /<clipPath/.test(sh.svg) && /<mask/.test(sh.svg) && /<defs>/.test(sh.svg), sh.svg.slice(0, 200));
  const two = R('figure cols=2\npanel\nsets\n  A\n  B\n  shade: A&B\npanel\nsets\n  A\n  B\n  shade: A&B');
  const idsUsed = [...two.svg.matchAll(/<clipPath id="([^"]+)"/g)].map((x) => x[1]);
  check('clip ids are unique across blocks', idsUsed.length >= 4 && new Set(idsUsed).size === idsUsed.length, idsUsed.join(' '));
  const el = L('sets\n  A\n  B\n  C\n  in: A&B&C x\n  in: A-B-C y');
  const ins = (q, p) => ((p.x - q.cx) / q.hw) ** 2 + ((p.y - q.cy) / q.hh) ** 2 < 1;
  const an = el.box.anchors;
  const x = el.labels.find((l) => l.text === 'x');
  const y = el.labels.find((l) => l.text === 'y');
  check('in: puts x inside A, B and C', x && ins(an.get('A'), x) && ins(an.get('B'), x) && ins(an.get('C'), x));
  check('in: puts y in A only', y && ins(an.get('A'), y) && !ins(an.get('B'), y) && !ins(an.get('C'), y));
  const empty = R('sets nested\n  A\n  B\n  in: B-A z');
  check('empty region warns', empty.errors.some((e) => /empty/.test(e.msg)), warns(empty));
  const unk = R('sets\n  A\n  shade: A&Q');
  check('unknown set warns', unk.errors.some((e) => /no set called "Q"/.test(e.msg)), warns(unk));
  const nest = L('sets nested\n  EXP\n  PSPACE\n  NP\n  P').box.anchors;
  const inside = (o, i) => i.cx - i.hw >= o.cx - o.hw && i.cx + i.hw <= o.cx + o.hw && i.cy - i.hh >= o.cy - o.hh && i.cy + i.hh <= o.cy + o.hh;
  check('nested sets contain each other', inside(nest.get('EXP'), nest.get('PSPACE')) && inside(nest.get('PSPACE'), nest.get('NP')) && inside(nest.get('NP'), nest.get('P')));
  const man = L('sets layout=manual\n  NP (-0.6,0) rx=1.4 ry=1\n  coNP (0.6,0) rx=1.4 ry=1');
  const np = man.labels.find((l) => l.text === 'NP');
  check('manual: overlapping set label moves into its own part', np && !ins(man.box.anchors.get('coNP'), np), JSON.stringify(np));
  const many = R('sets\n  A\n  B\n  C\n  D');
  check('more than three venn sets warns', many.errors.some((e) => /1–3 sets/.test(e.msg)), warns(many));
  const nopos = R('sets layout=manual\n  A');
  check('manual set without a position warns', nopos.errors.some((e) => /no \(x,y\)/.test(e.msg)), warns(nopos));
}

{
  const more = R(require('fs').readFileSync(require('path').join(__dirname, '..', 'docs', 'more.fig'), 'utf8'));
  check('1.1 showcase renders cleanly', !more.errors.length, more.errors.map((e) => `${e.line}: ${e.msg}`).join('; '));
}

// Hasse diagrams and symmetric layered layouts (1.1.1)
{
  const A = (src) => L(src).box.anchors;
  const m3 = A('graph hasse\n  0 < x < 1\n  0 < y < 1\n  0 < z < 1');
  check('hasse: bottom-up by default', m3.get('0').cy > m3.get('x').cy && m3.get('x').cy > m3.get('1').cy);
  check('hasse: M3 is a symmetric diamond', near(m3.get('0').cx, m3.get('1').cx, 0.01) && near(m3.get('y').cx, m3.get('0').cx, 0.01) && near(m3.get('x').cx + m3.get('z').cx, 2 * m3.get('y').cx, 0.01),
    ['0', 'x', 'y', 'z', '1'].map((k) => m3.get(k).cx.toFixed(1)).join(' '));
  const n5 = A('graph hasse\n  0 < a < b < 1\n  0 < c < 1');
  check('hasse: N5 has 0 under 1', Math.abs(n5.get('0').cx - n5.get('1').cx) < 12, `${n5.get('0').cx} ${n5.get('1').cx}`);
  const chainSym = A('graph hasse\n  p1 < p2 < p3 < p5\n  p2 < p4 < p5');
  check('hasse: lone chain nodes centred', near(chainSym.get('p1').cx, chainSym.get('p5').cx, 0.01) && near(chainSym.get('p2').cx, chainSym.get('p5').cx, 0.01));
  const ng = A('graph hasse\n  a < b < c < d\n  a < e < d\n  f < d');
  check('hasse: a minimal element sits just under its cover', near(ng.get('f').cy, ng.get('c').cy, 0.01), `${ng.get('f').cy} vs ${ng.get('c').cy}`);
  const full = R('graph hasse\n  1 < 2 < 4\n  1 < 4\n  1 < 3');
  const covers = R('graph hasse\n  1 < 2 < 4\n  1 < 3');
  check('hasse: transitive edges are left out', full.svg === covers.svg && !full.errors.length, warns(full));
  const arrows = R('graph hasse\n  1 -> 2 -> 4\n  1 -> 3');
  check('hasse: -> draws plain lines', arrows.svg === covers.svg);
  const gt = R('graph hasse\n  1\n  2\n  4\n  3\n  2 > 1\n  4 > 2\n  3 > 1');
  check('hasse: > is the same order reversed', gt.svg === R('graph hasse\n  1\n  2\n  4\n  3\n  1 < 2 < 4\n  1 < 3').svg);
  const dup = R('graph hasse\n  1 < 2\n  1 < 2\n  1 -- 2');
  check('hasse: repeated pairs drawn once', dup.svg === R('graph hasse\n  1 < 2').svg);
  const cyc = R('graph hasse\n  a < b < c < a');
  check('hasse: a cycle warns', cyc.errors.some((e) => /cycle/.test(e.msg) && e.warn), warns(cyc));
  const self = R('graph hasse\n  a < a\n  a < b');
  check('hasse: a ≤ a warns', self.errors.some((e) => /always true/.test(e.msg)), warns(self));
  check('hasse: labels without circles by default', !/<circle/.test(covers.svg));
  check('hasse: shape= still works', /<circle/.test(R('graph hasse shape=point\n  a < b').svg));
  const plain = R('graph\n  a < b');
  check('< in a plain graph draws no arrow head', plain.svg === R('graph\n  a -- b').svg);
  const pow = A('graph hasse\n  e < a < ab < abc\n  e < b < bc < abc\n  e < c < ac < abc\n  a < ac\n  b < ab\n  c < bc');
  check('hasse: Boolean lattice symmetric', near(pow.get('e').cx, pow.get('abc').cx, 0.01) && near(pow.get('b').cx, pow.get('e').cx, 0.5),
    ['e', 'a', 'b', 'c', 'abc'].map((k) => pow.get(k).cx.toFixed(1)).join(' '));
  const sym = A('graph layout=layered\n  r -> a\n  r -> b\n  a -> c\n  b -> c');
  check('layered: diamond DAG is symmetric', near(sym.get('r').cx, sym.get('c').cx, 0.01) && near(sym.get('a').cx + sym.get('b').cx, 2 * sym.get('r').cx, 0.01));
}

// every example in the syntax reference renders cleanly, and both languages are filled in
for (const sec of api.help) {
  check(`help ${sec.id} has both languages`, sec.title.en && sec.title.zh && sec.items.every((it) => (it.p ? it.p.en && it.p.zh : it.ref ? it.ref.every(([, d]) => d.en && d.zh) : it.note ? it.note.en && it.note.zh : true)));
  for (const it of sec.items) if (it.ex) {
    const r = R(it.ex);
    check(`help example (${sec.id}: ${it.note.en}) renders cleanly`, !r.errors.length && !r.empty, r.errors.map((e) => `${e.line}: ${e.msg}`).join('; '));
  }
}

finish();
