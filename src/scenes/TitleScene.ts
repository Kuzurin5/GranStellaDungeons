import Phaser from 'phaser';
import { GAME_H, GAME_W, txt } from '../ui';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0d14);
    for (let i = 0; i < 40; i++) {
      this.add.circle(Phaser.Math.Between(0, GAME_W), Phaser.Math.Between(0, GAME_H), Phaser.Math.Between(1, 2), 0x6c7bd9, Phaser.Math.FloatBetween(0.2, 0.8));
    }
    txt(this, GAME_W / 2, 150, 'GranStellaDungeons', 64, '#9db4ff').setOrigin(0.5);
    txt(this, GAME_W / 2, 225, '— 試練のダンジョン —', 26, '#c7d0f5').setOrigin(0.5);
    txt(this, GAME_W / 2, 300, '5人の中から1人を選び、全20階の最深部を目指せ。', 20, '#aab3d6').setOrigin(0.5);
    txt(this, GAME_W / 2, 332, 'やられたら持ち物も成長も失い、最初からやり直し。', 20, '#aab3d6').setOrigin(0.5);
    const start = txt(this, GAME_W / 2, 440, 'Enterキーではじめる', 32, '#ffe08a').setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
    txt(this, GAME_W / 2, 560, '移動: 矢印キー / Q W E A D Z X C(8方向)   待機: S   攻撃: Space\n能力: F   持ち物: I   階段: Enter または >', 16, '#8b95bd', { align: 'center' }).setOrigin(0.5);
    const go = () => this.scene.start('CharSelect');
    this.input.keyboard!.once('keydown-ENTER', go);
    this.input.keyboard!.once('keydown-SPACE', go);
    this.input.once('pointerdown', go);
  }
}
