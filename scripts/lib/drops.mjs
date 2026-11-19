// Checagem compartilhada das FONTES DE GOTA d'água (createDrop), usada pelos check-level*.mjs.
//
// Cobre: blocos W socáveis (level.ts → punchTile, gota vertical vx=0/vy=-150) e objetos com onPunch
// que ejetam a gota (cooler/cacto C, vinha V, filtro de barro V, bebedouro; vx=±45/vy=-130), nos DOIS
// sentidos de soco. Usa a física REAL da gota (objects.ts) contra o Level real e exige que ela:
//   - não nasça dentro de tile sólido;
//   - não toque perigo (espinho/água) nem saia do mapa durante a queda;
//   - termine pousada em chão sólido ou one-way.
// Os módulos src/ importam sem extensão (./objects), então registramos um resolve hook antes do import.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx); } catch (e) {
      if (spec.startsWith('.')) return next(spec + '.ts', ctx);
      throw e;
    }
  },
});

const T = 16;
const FONTES = ['cactus_water', 'vine_water', 'clay_filter', 'bebedouro'];

/** Simula uma gota já criada até 6 s e devolve o veredito. */
function simular(lv, mundo, d, getDrop) {
  const dentroDeSolido = [d.x + 0.5, d.x + 7.5].some((X) =>
    [d.y + 0.5, d.y + 9.5].some((Y) => lv.isSolid(Math.floor(X / T), Math.floor(Y / T))));
  let perigo = false, caiu = false;
  for (let i = 0; i < 360 && !d.dead; i++) {
    d.update(1 / 60, mundo);
    if (d.y > lv.heightPx - T) caiu = true;
    const cx = Math.floor((d.x + 4) / T), cy = Math.floor((d.y + 9) / T);
    if (lv.isHazard(cx, cy) || lv.tileAt(cx, cy) === undefined) perigo = true;
  }
  const cx = Math.floor((d.x + 4) / T), cy = Math.floor((d.y + 5) / T);
  const pousada = !d.dead && (lv.isSolid(cx, cy + 1) || lv.isOneWay(cx, cy + 1));
  return { dentroDeSolido, perigo, caiu, pousada, cx, cy, morta: d.dead };
}

/**
 * Valida todas as fontes de gota de uma fase.
 * @param {() => object} fabrica createLevelN de src/game/level.ts (já importado pelo chamador)
 * @returns {{erros: string[], total: number}}
 */
export function checarGotas(fabrica, rotulo = 'fase') {
  const erros = [];
  let total = 0;
  const veredito = (nome, dir, r) => {
    total++;
    const motivos = [];
    if (r.dentroDeSolido) motivos.push('nasce dentro de sólido');
    if (r.perigo) motivos.push('toca perigo/fora do mapa');
    if (r.caiu) motivos.push('cai do mapa');
    if (!r.pousada) motivos.push(r.morta ? 'some antes de pousar' : `não pousa em chão (${r.cx},${r.cy})`);
    if (motivos.length) erros.push(`${rotulo}: gota de ${nome} (soco ${dir < 0 ? '←' : '→'}) insegura: ${motivos.join(', ')}`);
  };

  // 1) objetos-fonte
  let lv = fabrica();
  for (const s of lv.createEntities().filter((e) => FONTES.includes(e.kind))) {
    const nome = `${s.kind}@(${Math.floor((s.x + s.w / 2) / T)},${Math.floor((s.y + s.h - 1) / T)})`;
    for (const dir of [-1, 1]) {
      lv = fabrica(); // nível novo por soco: estado limpo
      const src = lv.createEntities().find((e) => e.kind === s.kind && e.x === s.x && e.y === s.y);
      let d;
      const mundo = { fx() {}, spawn(e) { d = e; }, level: lv };
      if (!src.onPunch(mundo, dir) || !d) { erros.push(`${rotulo}: ${nome} não gerou gota no soco ${dir}`); continue; }
      veredito(nome, dir, simular(lv, mundo, d));
    }
  }

  // 2) blocos W (BlockItem que soltam gota): socar no lugar, o punchTile real instancia a gota
  const base = fabrica();
  const alvos = [];
  for (let y = 0; y < Math.floor(base.heightPx / T); y++)
    for (let x = 0; x < base.widthPx / T; x++) if (base.tileAt(x, y) === 6 /* Tile.BlockItem */) alvos.push([x, y]);
  for (const [x, y] of alvos) {
    const l = fabrica();
    let d;
    const mundo = {
      fx() {}, shake() {}, addScore() {}, audio: { play() {} }, level: l,
      spawn(e) { if (e.kind === 'drop') d = e; },
    };
    if (!l.punchTile(x, y, mundo) || !d) continue; // BlockItem de moeda: não é gota
    veredito(`bloco W@(${x},${y})`, 0, simular(l, mundo, d));
  }
  return { erros, total };
}

/** Atalho para os check-level: importa level.ts e falha (exit 1) se alguma fonte for insegura. */
export async function validarGotas(nomeFabrica, rotulo) {
  const mod = await import('../../src/game/level.ts');
  const { erros, total } = checarGotas(mod[nomeFabrica], rotulo);
  console.log(`gotas (${rotulo}): ${total} ejeções simuladas, ${erros.length} inseguras`);
  if (erros.length) { console.error('\nERROS (gotas):\n' + erros.join('\n')); process.exit(1); }
}
