/*
 * Test harness: loads the engine files from src/ into one scope (no Obsidian),
 * with the bundled fonts, and returns its API.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ENGINE = ['fontdata.js', 'font.js', 'mathtext.js', 'svg.js', 'parse.js', 'blocks.js', 'tree.js', 'graph.js', 'links.js', 'plot.js', 'seq.js', 'timeline.js', 'sets.js', 'compose.js', 'edit.js', 'templates.js', 'help.js', 'export.js'];

function loadEngine() {
  const code = ENGINE.filter((f) => fs.existsSync(path.join(root, 'src', f)))
    .map((f) => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
  const api = new Function(`${code}\nreturn { FONT_DATA, FS, TTFont, renderFigure, parseFigure, tokenize, typeset, parseLabel, setGraphPositions, pngWithSource, extractSource, pngCssWidth, pngScale, templates: TEMPLATES, help: HELP, compileExpr, shapeBoundary, parseLinkSpec, compileSetFormula, LAYOUTS, SVG };`)();
  // the subset fonts that ship inside main.js
  const font = (key) => new api.TTFont(new Uint8Array(Buffer.from(api.FONT_DATA[key], 'base64')));
  api.FS.fonts = { r: font('r'), i: font('i'), b: font('b') };
  return api;
}

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) passed++;
  else { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); }
}
function finish() {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

module.exports = { loadEngine, check, finish, root };
