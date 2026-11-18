import type { SpriteAtlas } from '../core/types';
import type { SpriteArt } from './artTypes';
import { PALETTE } from './palette';
import { SPRITE_SPEC } from './spec';
import { RENDER_SCALE } from '../core/constants';
import { PARDO } from './art/pardo';
import { ENEMIES } from './art/enemies';
import { WORLD } from './art/world';
import { DECOR } from './art/decor';
import { ENEMIES2 } from './art/enemies2';
import { AMAZON } from './art/amazon';
import { PARDO_SWIM } from './art/pardoSwim';
import { JANDIRA } from './art/jandira';
import { SEA } from './art/sea';
import { BAHIA } from './art/bahia';
import { AMARO } from './art/amaro';
import { ENEMIES4 } from './art/enemies4';
import { RIO } from './art/rio';

interface Entry { w: number; h: number; frames: number; sheet: HTMLCanvasElement; flipped: HTMLCanvasElement }

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** Rasteriza toda a arte em texturas offscreen (uma tira horizontal por sprite + versão espelhada). */
export function createAtlas(): SpriteAtlas {
  const art: SpriteArt = { ...PARDO, ...ENEMIES, ...WORLD, ...DECOR, ...ENEMIES2, ...AMAZON, ...PARDO_SWIM, ...JANDIRA, ...SEA, ...BAHIA, ...AMARO, ...ENEMIES4, ...RIO };
  const D = RENDER_SCALE;
  const entries = new Map<string, Entry>();
  const rgb = new Map<string, [number, number, number]>();
  for (const [ch, hex] of Object.entries(PALETTE)) rgb.set(ch, hexToRgb(hex));

  for (const [name, spec] of Object.entries(SPRITE_SPEC)) {
    const [w, h, frames] = spec;
    // Texturas em resolução real (D× o tamanho lógico). Arte autorada em D× é usada direto;
    // arte legada em 1× é ampliada por vizinho mais próximo.
    const W = w * D, H = h * D;
    const [sheet, sctx] = makeCanvas(W * frames, H);
    const img = sctx.createImageData(W * frames, H);
    const data = art[name];
    for (let f = 0; f < frames; f++) {
      const rows = data?.[f] ?? data?.[0];
      const k = rows && rows.length === H ? 1 : D; // pixels reais por célula da grade
      for (let y = 0; y < H; y++) {
        const row = rows?.[Math.floor(y / k)] ?? '';
        for (let x = 0; x < W; x++) {
          const i = (y * W * frames + f * W + x) * 4;
          if (!rows) {
            const on = ((x >> 3) + (y >> 3)) % 2 === 0;
            img.data[i] = on ? 255 : 60; img.data[i + 1] = 0; img.data[i + 2] = on ? 255 : 60; img.data[i + 3] = 255;
            continue;
          }
          const c = rgb.get(row[Math.floor(x / k)] ?? '.');
          if (!c) continue;
          img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
        }
      }
    }
    if (!data && import.meta.env.DEV) console.warn(`[atlas] sprite sem arte: ${name}`);
    sctx.putImageData(img, 0, 0);
    const [flipped, fctx] = makeCanvas(W * frames, H);
    for (let f = 0; f < frames; f++) {
      fctx.save();
      fctx.translate(f * W + W, 0);
      fctx.scale(-1, 1);
      fctx.drawImage(sheet, f * W, 0, W, H, 0, 0, W, H);
      fctx.restore();
    }
    entries.set(name, { w, h, frames, sheet, flipped });
  }

  const get = (name: string): Entry => {
    const e = entries.get(name);
    if (!e) throw new Error(`[atlas] sprite desconhecido: ${name}`);
    return e;
  };

  return {
    draw(ctx, name, frame, x, y, flipX) {
      const e = get(name);
      const f = ((Math.floor(frame) % e.frames) + e.frames) % e.frames;
      // posição alinhada à grade de pixels reais (meio pixel lógico)
      ctx.drawImage(flipX ? e.flipped : e.sheet, f * e.w * D, 0, e.w * D, e.h * D, Math.round(x * D) / D, Math.round(y * D) / D, e.w, e.h);
    },
    has: (name) => entries.has(name),
    size(name) {
      const e = get(name);
      return { w: e.w, h: e.h, frames: e.frames };
    },
  };
}
