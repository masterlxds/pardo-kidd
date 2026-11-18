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
import { MAIA } from './art/maia';
import { ENEMIES5 } from './art/enemies5';
import { SAMPA } from './art/sampa';
import { BONUS_ART } from './art/bonus';

/** `pad` = margem (px reais) em volta de cada quadro na tira, usada pelo halo de contorno. */
interface Entry { w: number; h: number; frames: number; pad: number; sheet: HTMLCanvasElement; flipped: HTMLCanvasElement }

/**
 * Halo de 1px real em volta da silhueta: destaca do casario colorido do fundo os sprites que ficam
 * soltos sobre ele na Fase 4 (inimigos, projéteis e plataformas finas).
 */
const HALO_COLOR = '#fff7d6';
const HALO_SPRITES = new Set<string>([...Object.keys(ENEMIES4), 'platform_scaffold', 'platform_zinc']);

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
  const art: SpriteArt = { ...PARDO, ...ENEMIES, ...WORLD, ...DECOR, ...ENEMIES2, ...AMAZON, ...PARDO_SWIM, ...JANDIRA, ...SEA, ...BAHIA, ...AMARO, ...ENEMIES4, ...RIO, ...MAIA, ...ENEMIES5, ...SAMPA, ...BONUS_ART };
  const D = RENDER_SCALE;
  const entries = new Map<string, Entry>();
  const rgb = new Map<string, [number, number, number]>();
  for (const [ch, hex] of Object.entries(PALETTE)) rgb.set(ch, hexToRgb(hex));

  for (const [name, spec] of Object.entries(SPRITE_SPEC)) {
    const [w, h, frames] = spec;
    // Texturas em resolução real (D× o tamanho lógico). Arte autorada em D× é usada direto;
    // arte legada em 1× é ampliada por vizinho mais próximo.
    const W = w * D, H = h * D;
    const pad = HALO_SPRITES.has(name) ? 1 : 0;
    const FW = W + pad * 2, FH = H + pad * 2; // quadro na tira, com a margem do halo
    const [sheet, sctx] = makeCanvas(FW * frames, FH);
    const img = sctx.createImageData(FW * frames, FH);
    const data = art[name];
    for (let f = 0; f < frames; f++) {
      const rows = data?.[f] ?? data?.[0];
      const k = rows && rows.length === H ? 1 : D; // pixels reais por célula da grade
      for (let y = 0; y < H; y++) {
        const row = rows?.[Math.floor(y / k)] ?? '';
        for (let x = 0; x < W; x++) {
          const i = ((y + pad) * FW * frames + f * FW + pad + x) * 4;
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
    if (pad) {
      const [hr, hg, hb] = hexToRgb(HALO_COLOR);
      const SW = FW * frames, px = img.data;
      const solid = new Uint8Array(SW * FH);
      for (let i = 0; i < solid.length; i++) solid[i] = px[i * 4 + 3] ? 1 : 0;
      for (let y = 0; y < FH; y++) {
        for (let x = 0; x < SW; x++) {
          const i = y * SW + x, fx = x % FW;
          if (solid[i]) continue;
          // vizinhança-4, sem vazar para o quadro ao lado na tira
          if ((fx > 0 && solid[i - 1]) || (fx < FW - 1 && solid[i + 1]) || (y > 0 && solid[i - SW]) || (y < FH - 1 && solid[i + SW])) {
            px[i * 4] = hr; px[i * 4 + 1] = hg; px[i * 4 + 2] = hb; px[i * 4 + 3] = 255;
          }
        }
      }
    }
    if (!data && import.meta.env.DEV) console.warn(`[atlas] sprite sem arte: ${name}`);
    sctx.putImageData(img, 0, 0);
    const [flipped, fctx] = makeCanvas(FW * frames, FH);
    for (let f = 0; f < frames; f++) {
      fctx.save();
      fctx.translate(f * FW + FW, 0);
      fctx.scale(-1, 1);
      fctx.drawImage(sheet, f * FW, 0, FW, FH, 0, 0, FW, FH);
      fctx.restore();
    }
    entries.set(name, { w, h, frames, pad, sheet, flipped });
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
      const fw = e.w * D + e.pad * 2, fh = e.h * D + e.pad * 2, m = e.pad / D;
      ctx.drawImage(flipX ? e.flipped : e.sheet, f * fw, 0, fw, fh, Math.round(x * D) / D - m, Math.round(y * D) / D - m, fw / D, fh / D);
    },
    has: (name) => entries.has(name),
    size(name) {
      const e = get(name);
      return { w: e.w, h: e.h, frames: e.frames };
    },
  };
}
