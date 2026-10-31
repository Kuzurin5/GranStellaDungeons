// 画面まわりの計算(Phaser に依存しない。テストできる)。

/** マップがビューより大きいとき、プレイヤーが中央に来るカメラの左上タイルを返す(マップの端では止まる)。 */
export function cameraOrigin(px: number, py: number, viewW: number, viewH: number, mapW: number, mapH: number) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    x: clamp(px - Math.floor(viewW / 2), 0, Math.max(0, mapW - viewW)),
    y: clamp(py - Math.floor(viewH / 2), 0, Math.max(0, mapH - viewH)),
  };
}

export type Facing = 'down' | 'up' | 'side';

/** 向き(dx,dy)から使う絵を決める。横に動くなら side(左向きは左右反転)、上は up、それ以外は down。 */
export function facingOf(dx: number, dy: number): { facing: Facing; flip: boolean } {
  if (dx !== 0) return { facing: 'side', flip: dx < 0 };
  if (dy < 0) return { facing: 'up', flip: false };
  return { facing: 'down', flip: false };
}

export interface Theme {
  id: string;
  name: string;
  from: number;
}

/** 階の雰囲気(背景の絵のセット)。5階ごとに変わる。 */
export const THEMES: Theme[] = [
  { id: 'cave', name: '洞窟', from: 1 },
  { id: 'ruins', name: '古代遺跡', from: 6 },
  { id: 'abyss', name: '深淵', from: 11 },
  { id: 'sanctum', name: '聖域', from: 16 },
];

export function themeOf(floor: number): Theme {
  let t = THEMES[0];
  for (const th of THEMES) if (floor >= th.from) t = th;
  return t;
}
