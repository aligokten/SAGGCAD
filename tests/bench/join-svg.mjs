// L / T / X birleşim örnekleri → docs/b2b/*.svg (ortak geometriden; plan çizimiyle aynı fonksiyon)
// node tests/bench/join-svg.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { wallGeomSvg, structDefs } from '../../js/structure.js';
import { levelWallGeometry, overlapReport, piecesArea } from '../../js/bim/wallgeom.js';

const W = (id, ax, ay, bx, by, t, comp, x = {}) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t, h: 0, ...(comp ? { comp } : {}), ...x });
export const SAMPLES = {
  'L-dis-90': [W('w1', 0, 0, 300, 0, 26.5, 'dis-tugla-eps'), W('w2', 300, 0, 300, 220, 26.5, 'dis-tugla-eps')],
  'L-dar-60': [W('w1', 0, 0, 300, 0, 26.5, 'dis-tugla-eps'), W('w2', 300, 0, 300 - 220 * Math.cos(Math.PI / 3), 220 * Math.sin(Math.PI / 3), 26.5, 'dis-tugla-eps')],
  'L-genis-135': [W('w1', 0, 0, 300, 0, 26.5, 'dis-tugla-eps'), W('w2', 300, 0, 300 + 160 * Math.cos(Math.PI / 4), 160 * Math.sin(Math.PI / 4), 26.5, 'dis-tugla-eps')],
  'L-perde-tugla': [W('w1', 0, 0, 300, 0, 27, 'perde-25', { struct: true }), W('w2', 300, 0, 300, 220, 14, 'ic-tugla')],
  'T-dis-ic': [W('h', 0, 0, 400, 0, 26.5, 'dis-tugla-eps'), W('s', 200, 0, 200, 220, 14, 'ic-tugla')],
  'T-dis-hafif': [W('h', 0, 0, 400, 0, 26.5, 'dis-tugla-eps'), W('s', 200, 13.25, 200, 220, 10, 'alcipan-100')],
  'T-perde-kol': [W('h', 0, 0, 400, 0, 14, 'ic-tugla'), W('s', 200, 0, 200, 220, 27, 'perde-25', { struct: true })],
  'X-perde-tugla': [W('a', 0, 0, 400, 0, 14, 'ic-tugla'), W('b', 200, -150, 200, 150, 27, 'perde-25', { struct: true })],
  'farkli-kalinlik-L': [W('w1', 0, 0, 300, 0, 20, null), W('w2', 300, 0, 300, 220, 35, null)],
};
if (process.argv[1]?.endsWith('join-svg.mjs')) {
  mkdirSync(new URL('../../docs/b2b/', import.meta.url), { recursive: true });
  for (const [name, walls] of Object.entries(SAMPLES)) {
    const P = { walls, openings: [], meta: { wallT: 20, wallH: 280 } }, R = { meta: {} }, s = 1.6, px = n => n / s;
    const xs = walls.flatMap(w => [w.a.x, w.b.x]), ys = walls.flatMap(w => [w.a.y, w.b.y]);
    const x0 = Math.min(...xs) - 40, y0 = Math.min(...ys) - 40, Wd = (Math.max(...xs) - x0 + 40) * s, Hd = (Math.max(...ys) - y0 + 40) * s;
    const { pre, defs } = structDefs(s), g = levelWallGeometry(R, P), ov = overlapReport(g);
    const area = [...g.walls.values()].reduce((q, S) => q + S.layers.reduce((a, l) => a + piecesArea(l.pieces), 0), 0);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd.toFixed(0)}" height="${(Hd + 24).toFixed(0)}" viewBox="0 0 ${Wd.toFixed(1)} ${(Hd + 24).toFixed(1)}"><rect width="100%" height="100%" fill="#fff"/><defs>${defs}</defs>
<g transform="matrix(${s} 0 0 ${s} ${(-x0 * s).toFixed(2)} ${(-y0 * s).toFixed(2)})">${wallGeomSvg(R, P, pre, px)}</g>
<text x="8" y="${(Hd + 16).toFixed(0)}" font-family="Inter,Arial" font-size="12" fill="#24272B">${name} · ${g.joins.joins.map(j => j.kind).join(', ')} · alan ${(area / 1e4).toFixed(4)} m² · çakışma ${ov.length}</text></svg>`;
    writeFileSync(new URL(`../../docs/b2b/${name}.svg`, import.meta.url), svg);
    console.log(name, g.joins.joins.map(j => j.id).join(' '), 'çakışma', ov.length);
  }
}
