/** Uzunlukları gösterim için biçimlendirir (metre, 2 ondalık). */
export const fmtLen = (m: number): string => m.toFixed(2);
export const fmtArea = (m2: number): string => `${Math.abs(m2).toFixed(2)} m²`;
export const fmtAngle = (deg: number): string => `${deg.toFixed(1)}°`;
