/*
 * Render a figure source file to PNG for the docs (uses macOS `sips`).
 *   node tools/render-doc.js docs/showcase.fig docs/showcase.png [scale]
 */
const { loadEngine } = require('../tests/harness.js');
const fs = require('fs');
const cp = require('child_process');
const [src, out, scale = '2'] = process.argv.slice(2);
const api = loadEngine();
const r = api.renderFigure(fs.readFileSync(src, 'utf8'), {});
if (r.errors.length) console.log(r.errors);
const k = Number(scale);
const svg = r.svg.replace(/^<svg ([^>]*?)width="[\d.]+" height="[\d.]+"/, `<svg $1width="${r.width * k}" height="${r.height * k}"`);
const tmp = `${out}.tmp.svg`;
fs.writeFileSync(tmp, svg);
cp.execSync(`sips -s format png "${tmp}" --out "${out}" >/dev/null`);
fs.unlinkSync(tmp);
console.log(`${out}: ${r.width}×${r.height} @${k}×`);
