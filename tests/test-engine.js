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

// every example in the syntax reference renders cleanly, and both languages are filled in
for (const sec of api.help) {
  check(`help ${sec.id} has both languages`, sec.title.en && sec.title.zh && sec.items.every((it) => (it.p ? it.p.en && it.p.zh : it.ref ? it.ref.every(([, d]) => d.en && d.zh) : it.note ? it.note.en && it.note.zh : true)));
  for (const it of sec.items) if (it.ex) {
    const r = R(it.ex);
    check(`help example (${sec.id}: ${it.note.en}) renders cleanly`, !r.errors.length && !r.empty, r.errors.map((e) => `${e.line}: ${e.msg}`).join('; '));
  }
}

finish();
