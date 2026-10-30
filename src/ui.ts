import Phaser from 'phaser';
import { CharId, GimmickId } from './core/data';

export const GAME_W = 1040;
export const GAME_H = 660;
export const FONT = '"IPAGothic","Noto Sans CJK JP","Noto Color Emoji","Hiragino Sans","Yu Gothic",sans-serif';

/** 画面をまたいで持ち回る情報 */
export const session: {
  charId: CharId;
  seed: number;
  startFloor: number;
  gimmick: GimmickId | null;
  result: { cleared: boolean; floor: number; level: number; turns: number; cause: string; charId: CharId } | null;
} = { charId: 'elwin', seed: 1, startFloor: 1, gimmick: null, result: null };

export function newSeed(): number {
  const q = new URLSearchParams(location.search).get('seed');
  if (q) return Number(q) || 1;
  return Math.floor(Math.random() * 1e9) + 1;
}

export function txt(
  scene: Phaser.Scene, x: number, y: number, s: string, size = 16, color = '#e8eaf2',
  opts: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, padding: { top: 2, bottom: 2 }, ...opts });
}

export function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}
