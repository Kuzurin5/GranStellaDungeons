import Phaser from 'phaser';
import { CHARS } from '../core/data';
import { addCoverBg } from '../art';
import { GAME_H, GAME_W, session, txt } from '../ui';

function summary(): string {
  const r = session.result!;
  return `${CHARS[r.charId].name}  /  到達: ${r.floor}階  /  Lv.${r.level}  /  ${r.turns}ターン`;
}

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create() {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x140a0e);
    addCoverBg(this, 'ui/gameover_bg', GAME_W, GAME_H);
    txt(this, GAME_W / 2, 190, '力尽きた…', 64, '#ff6b81').setOrigin(0.5);
    txt(this, GAME_W / 2, 280, summary(), 24, '#e8eaf2').setOrigin(0.5);
    txt(this, GAME_W / 2, 325, `原因: ${session.result!.cause}`, 20, '#c7a0a8').setOrigin(0.5);
    txt(this, GAME_W / 2, 400, '持ち物も成長も失われた。もう一度、最初から。', 20, '#aab3d6').setOrigin(0.5);
    const t = txt(this, GAME_W / 2, 500, 'Enterキーでキャラ選択へ', 28, '#ffe08a').setOrigin(0.5);
    this.tweens.add({ targets: t, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('CharSelect'));
  }
}

export class ClearScene extends Phaser.Scene {
  constructor() { super('Clear'); }

  create() {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0a1418);
    const hasBg = addCoverBg(this, 'ui/clear_bg', GAME_W, GAME_H);
    for (let i = 0; i < (hasBg ? 0 : 60); i++) {
      this.add.circle(Phaser.Math.Between(0, GAME_W), Phaser.Math.Between(0, GAME_H), Phaser.Math.Between(1, 3), 0xffe08a, Phaser.Math.FloatBetween(0.2, 0.9));
    }
    txt(this, GAME_W / 2, 190, '試練を踏破した!', 64, '#ffe08a').setOrigin(0.5);
    txt(this, GAME_W / 2, 280, summary(), 24, '#e8eaf2').setOrigin(0.5);
    txt(this, GAME_W / 2, 360, '最深部の竜を倒し、グランステラの名を高めた。', 20, '#aab3d6').setOrigin(0.5);
    const t = txt(this, GAME_W / 2, 500, 'Enterキーでタイトルへ', 28, '#9db4ff').setOrigin(0.5);
    this.tweens.add({ targets: t, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('Title'));
  }
}
