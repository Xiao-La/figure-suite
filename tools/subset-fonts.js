/*
 * Build step: subset the bundled CMU Serif fonts (SIL OFL 1.1, see fonts/OFL.txt)
 * to the characters figure labels use and write them base64-encoded into
 * src/fontdata.js, so main.js carries its fonts (community plugins ship only
 * main.js, manifest.json and styles.css).
 *
 * Glyph ids are kept: unused glyphs are just emptied, so composite glyphs need
 * no renumbering. Output tables: cmap (format 12), glyf, loca (long), head,
 * hhea, hmtx, maxp, name.
 *
 *   node tools/subset-fonts.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const RANGES = [
  [0x20, 0x7e], // ASCII
  [0xa0, 0x17f], // Latin-1, Latin Extended-A
  [0x370, 0x3ff], // Greek
  [0x2010, 0x2044], // dashes, quotes, bullets, primes
  [0x2070, 0x209f], // super/subscripts
  [0x2100, 0x214f], // letterlike (ℓ ℕ …)
  [0x2190, 0x21ff], // arrows
  [0x2200, 0x22ff], // math operators
  [0x2300, 0x23ff], // ⌈ ⌉ ⌊ ⌋ …
  [0x25a0, 0x25ff], // geometric shapes
  [0x27e8, 0x27e9], // ⟨ ⟩
];

function tables(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = {};
  for (let i = 0; i < v.getUint16(4); i++) {
    const r = 12 + i * 16;
    const tag = buf.toString('latin1', r, r + 4);
    out[tag] = buf.subarray(v.getUint32(r + 8), v.getUint32(r + 8) + v.getUint32(r + 12));
  }
  return out;
}

function readCmap(cmap) {
  const v = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const map = new Map();
  let fmt4 = null; let fmt12 = null;
  for (let i = 0; i < v.getUint16(2); i++) {
    const off = v.getUint32(4 + i * 8 + 4);
    const f = v.getUint16(off);
    if (f === 12) fmt12 = off; else if (f === 4) fmt4 = off;
  }
  if (fmt12 != null) {
    const n = v.getUint32(fmt12 + 12);
    for (let g = 0; g < n; g++) {
      const p = fmt12 + 16 + g * 12;
      const a = v.getUint32(p); const b = v.getUint32(p + 4); const gid = v.getUint32(p + 8);
      for (let c = a; c <= b; c++) map.set(c, gid + c - a);
    }
  } else {
    const o = fmt4; const seg = v.getUint16(o + 6) / 2;
    const ends = o + 14; const starts = ends + seg * 2 + 2; const deltas = starts + seg * 2; const ranges = deltas + seg * 2;
    for (let s = 0; s < seg; s++) {
      const end = v.getUint16(ends + s * 2); const start = v.getUint16(starts + s * 2);
      const delta = v.getInt16(deltas + s * 2); const ro = v.getUint16(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid;
        if (!ro) gid = (c + delta) & 0xffff;
        else { const p = ranges + s * 2 + ro + (c - start) * 2; gid = v.getUint16(p); if (gid) gid = (gid + delta) & 0xffff; }
        if (gid) map.set(c, gid);
      }
    }
  }
  return map;
}

function subset(file) {
  const buf = fs.readFileSync(file);
  const t = tables(buf);
  const head = Buffer.from(t.head);
  const longLoca = head.readInt16BE(50) === 1;
  const numGlyphs = t.maxp.readUInt16BE(4);
  const loca = (g) => (longLoca ? t.loca.readUInt32BE(g * 4) : t.loca.readUInt16BE(g * 2) * 2);
  const cmap = readCmap(t.cmap);

  const keep = new Set([0]);
  const wanted = new Map();
  for (const [a, b] of RANGES) for (let c = a; c <= b; c++) if (cmap.has(c)) wanted.set(c, cmap.get(c));
  const visit = (g) => {
    if (keep.has(g)) return;
    keep.add(g);
    const s = loca(g); const e = loca(g + 1);
    if (e - s < 10 || t.glyf.readInt16BE(s) >= 0) return;
    let p = s + 10;
    for (;;) { // composite: pull in components
      const flags = t.glyf.readUInt16BE(p); const comp = t.glyf.readUInt16BE(p + 2);
      visit(comp);
      p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
      if (!(flags & 0x20)) break;
    }
  };
  for (const g of wanted.values()) visit(g);

  // glyf + long loca
  const parts = []; const offs = new Uint32Array(numGlyphs + 1); let o = 0;
  for (let g = 0; g < numGlyphs; g++) {
    offs[g] = o;
    if (!keep.has(g)) continue;
    const data = t.glyf.subarray(loca(g), loca(g + 1));
    const pad = (4 - (data.length % 4)) % 4;
    parts.push(data, Buffer.alloc(pad)); o += data.length + pad;
  }
  offs[numGlyphs] = o;
  const glyf = Buffer.concat(parts);
  const locaOut = Buffer.alloc((numGlyphs + 1) * 4);
  offs.forEach((x, i) => locaOut.writeUInt32BE(x, i * 4));
  head.writeInt16BE(1, 50); head.writeUInt32BE(0, 8);

  // cmap format 12 (platform 3, encoding 10)
  const cps = [...wanted.keys()].sort((a, b) => a - b);
  const groups = [];
  for (const c of cps) {
    const g = wanted.get(c); const last = groups[groups.length - 1];
    if (last && c === last[1] + 1 && g === last[2] + (c - last[0])) last[1] = c; else groups.push([c, c, g]);
  }
  const sub = Buffer.alloc(16 + groups.length * 12);
  sub.writeUInt16BE(12, 0); sub.writeUInt32BE(sub.length, 4); sub.writeUInt32BE(groups.length, 12);
  groups.forEach(([a, b, g], i) => { sub.writeUInt32BE(a, 16 + i * 12); sub.writeUInt32BE(b, 20 + i * 12); sub.writeUInt32BE(g, 24 + i * 12); });
  const cmapOut = Buffer.concat([Buffer.from([0, 0, 0, 1, 0, 3, 0, 10, 0, 0, 0, 12]), sub]);

  const out = { cmap: cmapOut, glyf, head, hhea: t.hhea, hmtx: t.hmtx, loca: locaOut, maxp: t.maxp, name: t.name };
  const tags = Object.keys(out).sort();
  const dir = Buffer.alloc(12 + tags.length * 16);
  dir.writeUInt32BE(0x00010000, 0); dir.writeUInt16BE(tags.length, 4);
  const body = []; let off = dir.length;
  const checksum = (b) => { let s = 0; const p = Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]); for (let i = 0; i < p.length; i += 4) s = (s + p.readUInt32BE(i)) >>> 0; return s; };
  tags.forEach((tag, i) => {
    const data = out[tag]; const r = 12 + i * 16;
    dir.write(tag, r, 'latin1'); dir.writeUInt32BE(checksum(data), r + 4); dir.writeUInt32BE(off, r + 8); dir.writeUInt32BE(data.length, r + 12);
    const pad = Buffer.alloc((4 - (data.length % 4)) % 4);
    body.push(data, pad); off += data.length + pad.length;
  });
  return { bytes: Buffer.concat([dir, ...body]), chars: cps.length, glyphs: keep.size };
}

const lines = [
  '/*',
  ' * Generated by tools/subset-fonts.js: CMU Serif (Andrey V. Panov, from Knuth\'s',
  ' * Computer Modern), subset to the characters figure labels use.',
  ' * Licensed under the SIL Open Font License 1.1 (fonts/OFL.txt).',
  ' */',
  'const FONT_DATA = {',
];
for (const [key, name] of [['r', 'regular'], ['i', 'italic'], ['b', 'bold']]) {
  const res = subset(path.join(root, 'fonts', `cm-${name}.ttf`));
  lines.push(`  ${key}: '${res.bytes.toString('base64')}',`);
  console.log(`${name}: ${res.chars} chars, ${res.glyphs} glyphs, ${(res.bytes.length / 1024).toFixed(1)} KB`);
}
lines.push('};', '');
fs.writeFileSync(path.join(root, 'src', 'fontdata.js'), lines.join('\n'));
