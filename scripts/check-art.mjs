// Valida a arte procedural contra SPRITE_SPEC/PALETTE e gera um PNG de pré-visualização (4x).
// Uso: [S=4] node scripts/check-art.mjs [saida.png] [prefixos,separados,por,vírgula]
// S = pixels de tela por pixel lógico (S=4 → arte 2x aparece ampliada 2x; use S=8 para ver detalhes).
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { SPRITE_SPEC } from '../src/gfx/spec.ts';
import { PALETTE } from '../src/gfx/palette.ts';
import { PARDO } from '../src/gfx/art/pardo.ts';
import { ENEMIES } from '../src/gfx/art/enemies.ts';
import { WORLD } from '../src/gfx/art/world.ts';
import { DECOR } from '../src/gfx/art/decor.ts';
import { ENEMIES2 } from '../src/gfx/art/enemies2.ts';
import { AMAZON } from '../src/gfx/art/amazon.ts';
import { PARDO_SWIM } from '../src/gfx/art/pardoSwim.ts';
import { JANDIRA } from '../src/gfx/art/jandira.ts';
import { SEA } from '../src/gfx/art/sea.ts';
import { BAHIA } from '../src/gfx/art/bahia.ts';
import { AMARO } from '../src/gfx/art/amaro.ts';
import { ENEMIES4 } from '../src/gfx/art/enemies4.ts';
import { RIO } from '../src/gfx/art/rio.ts';

const out = process.argv[2] ?? 'art-preview.png';
const filter = process.argv[3] ?? '';
const art = { ...PARDO, ...ENEMIES, ...WORLD, ...DECOR, ...ENEMIES2, ...AMAZON, ...PARDO_SWIM, ...JANDIRA, ...SEA, ...BAHIA, ...AMARO, ...ENEMIES4, ...RIO };
const D = 2; // arte em alta resolução = D× o tamanho lógico do spec
const lowres = [];
const errors = [];
const missing = [];

for (const name of Object.keys(art)) if (!(name in SPRITE_SPEC)) errors.push(`${name}: não existe em SPRITE_SPEC`);
for (const [name, [w, h, frames]] of Object.entries(SPRITE_SPEC)) {
  const data = art[name];
  if (!data) { missing.push(name); continue; }
  if (data.length !== frames) errors.push(`${name}: ${data.length} frames, esperado ${frames}`);
  const k = data[0]?.length === h ? 1 : D;
  if (k === 1) lowres.push(name);
  data.forEach((rows, f) => {
    if (rows.length !== h * k) errors.push(`${name}[${f}]: ${rows.length} linhas, esperado ${h * D} (alta resolução)`);
    rows.forEach((row, y) => {
      if (row.length !== w * k) errors.push(`${name}[${f}] linha ${y}: ${row.length} colunas, esperado ${w * k} → "${row}"`);
      for (const ch of row) if (ch !== '.' && !(ch in PALETTE)) errors.push(`${name}[${f}] linha ${y}: caractere '${ch}' fora da paleta`);
    });
  });
}

// ── PNG de pré-visualização
const S = Number(process.env.S ?? 4), PAD = 6, MAXW = 1500; // S = pixels de tela por pixel LÓGICO
const names = Object.keys(SPRITE_SPEC).filter((n) => art[n] && filter.split(',').some((p) => n.startsWith(p)));
const boxes = [];
let cx = PAD, cy = PAD, rowH = 0, W = 0;
for (const n of names) {
  const [w, h, frames] = SPRITE_SPEC[n];
  const bw = (w * S + PAD) * frames, bh = h * S;
  if (cx + bw > MAXW) { cx = PAD; cy += rowH + PAD; rowH = 0; }
  boxes.push({ n, x: cx, y: cy });
  cx += bw + PAD; rowH = Math.max(rowH, bh); W = Math.max(W, cx);
}
const H = cy + rowH + PAD;
const px = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4, dark = ((x >> 4) + (y >> 4)) & 1;
  px[i] = dark ? 110 : 125; px[i + 1] = dark ? 170 : 185; px[i + 2] = dark ? 215 : 228; px[i + 3] = 255;
}
const rgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
for (const b of boxes) {
  const [w, h] = SPRITE_SPEC[b.n];
  art[b.n].forEach((rows, f) => {
    const ox = b.x + f * (w * S + PAD);
    const k = rows.length === h ? 1 : D, s = S / k; // tamanho de cada célula da grade na tela
    for (let y = 0; y < Math.min(h * k, rows.length); y++) for (let x = 0; x < w * k; x++) {
      const ch = rows[y][x];
      if (!ch || ch === '.' || !(ch in PALETTE)) continue;
      const [r, g, bl] = rgb(PALETTE[ch]);
      for (let sy = 0; sy < s; sy++) for (let sx = 0; sx < s; sx++) {
        const X = ox + x * s + sx, Y = b.y + y * s + sy;
        if (X >= W || Y >= H) continue;
        const i = (Y * W + X) * 4;
        px[i] = r; px[i + 1] = g; px[i + 2] = bl;
      }
    }
  });
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};
if (W > 0 && H > 0 && names.length) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log(`preview: ${out} (${W}x${H}) — ordem: ${names.join(', ')}`);
}
if (lowres.length) console.log(`BAIXA RESOLUÇÃO (legado 1x, ${lowres.length}): ${lowres.join(', ')}`);
if (missing.length) console.log(`AUSENTES (${missing.length}): ${missing.join(', ')}`);
if (errors.length) { console.error(`ERROS (${errors.length}):\n` + errors.slice(0, 80).join('\n')); process.exit(1); }
console.log('arte OK');
