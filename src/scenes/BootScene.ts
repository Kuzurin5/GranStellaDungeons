import Phaser from 'phaser';
import { loadArt, makeTokens } from '../art';
import { CHARS } from '../core/data';
import { GAME_H, GAME_W, txt } from '../ui';

/** 起動時に絵を読み込む。絵が無くても、そのままタイトルへ進む。 */
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0d14);
    txt(this, GAME_W / 2, GAME_H / 2, '読み込み中…', 20, '#8b95bd').setOrigin(0.5);
    loadArt(this, () => {
      const colors: Record<string, number> = {};
      for (const c of Object.values(CHARS)) colors[c.id] = c.color;
      makeTokens(this, colors);
      this.scene.start('Title');
    });
  }
}
