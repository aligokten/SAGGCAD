/* ═══ Ölçü birimi ve çizim ölçeği ═══
 * Model her zaman cm ile saklanır; birim yalnızca gösterim ve giriştir (plan yazıları, ölçüler, özellik paneli, kesit / görünüş).
 * Ölçek (1:N) ölçekli paftada çizginin kağıttaki boyunu belirler; yazı ve sembol boyları kağıtta sabit kalır.
 */
import { fmtNum } from './ui.js';

export const UNITS = [
  { k: 'mm', t: 'Milimetre (mm)', f: 10, d: 0, step: 5 },
  { k: 'cm', t: 'Santimetre (cm)', f: 1, d: 1, step: 0.5 },
  { k: 'm', t: 'Metre (m)', f: 0.01, d: 2, step: 0.01 },
];
export const SCALES = [1, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
export const PAPERS = [
  { k: 'A4', w: 297, h: 210 }, { k: 'A3', w: 420, h: 297 }, { k: 'A2', w: 594, h: 420 }, { k: 'A1', w: 841, h: 594 }, { k: 'A0', w: 1189, h: 841 },
];

export const unitOf = R => UNITS.find(u => u.k === R?.meta?.unit) || UNITS[1];
export const scaleOf = R => +R?.meta?.scale || 50;
/* cm → seçili birim (sayı) / seçili birim → cm */
export const toU = (cm, R) => +((+cm || 0) * unitOf(R).f).toFixed(unitOf(R).d + 2);
export const fromU = (v, R) => (+v || 0) / unitOf(R).f;
/* plan yazısı: birim simgesi olmadan (ör. 350 / 3,50 / 3500) */
export const fmtL = (cm, R, d) => fmtNum((+cm || 0) * unitOf(R).f, d ?? unitOf(R).d);
export const fmtLU = (cm, R, d) => `${fmtL(cm, R, d)} ${unitOf(R).k}`;
/* kot yazımı her zaman metre: +3,15 / ±0,00 */
export const kotM = cm => { const v = (+cm || 0) / 100; return (v > 0.0001 ? '+' : v < -0.0001 ? '−' : '±') + Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

/* model ölçüsü (cm) → kağıtta mm, 1:N ölçekte */
export const paperMm = (cm, N) => cm * 10 / N;
/* çizimi (cm cinsinden w × h) 1:N ölçekte sığdıran en küçük kağıt; kenar boşluğu ve antet payı dahil */
export function fitPaper(wCm, hCm, N, { margin = 15, title = 40 } = {}) {
  const w = paperMm(wCm, N) + margin * 2, h = paperMm(hCm, N) + margin * 2 + title;
  for (const p of PAPERS) {
    if (w <= p.w && h <= p.h) return { ...p, land: true };
    if (w <= p.h && h <= p.w) return { k: p.k, w: p.h, h: p.w, land: false };
  }
  return null;
}
