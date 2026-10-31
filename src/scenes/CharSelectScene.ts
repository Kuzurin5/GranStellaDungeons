import Phaser from 'phaser';
import { CHARS, CHAR_IDS } from '../core/data';
import { addCoverBg } from '../art';
import { GAME_H, GAME_W, hex, newSeed, session, txt } from '../ui';

export class CharSelectScene extends Phaser.Scene {
  private idx = 0;
  private layer!: Phaser.GameObjects.Container;

  constructor() { super('CharSelect'); }

  create() {
    this.idx = Math.max(0, CHAR_IDS.indexOf(session.charId));
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0d14);
    addCoverBg(this, 'ui/charselect_bg', GAME_W, GAME_H);
    txt(this, GAME_W / 2, 36, '挑戦するキャラクターを選ぶ', 30, '#9db4ff').setOrigin(0.5);
    txt(this, GAME_W / 2, 626, '← → で選択   Enterで決定   (1〜5キーでも選べる)', 18, '#8b95bd').setOrigin(0.5);
    this.layer = this.add.container(0, 0);
    this.draw();
    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => this.move(-1));
    kb.on('keydown-RIGHT', () => this.move(1));
    kb.on('keydown-ENTER', () => this.go());
    kb.on('keydown-SPACE', () => this.go());
    kb.on('keydown', (ev: KeyboardEvent) => {
      const m = /^(?:Digit|Numpad)([1-5])$/.exec(ev.code);
      if (m) { this.idx = Number(m[1]) - 1; this.draw(); }
    });
  }

  private move(d: number) {
    this.idx = (this.idx + d + CHAR_IDS.length) % CHAR_IDS.length;
    this.draw();
  }

  private go() {
    session.charId = CHAR_IDS[this.idx];
    session.seed = newSeed();
    const q = new URLSearchParams(location.search);
    session.startFloor = Number(q.get('floor')) || 1;
    const gm = q.get('gimmick');
    session.gimmick = gm === 'dark' || gm === 'eruption' || gm === 'house' || gm === 'vault' ? gm : null;
    this.scene.start('Dungeon');
  }

  private draw() {
    this.layer.removeAll(true);
    const cw = 196;
    const gap = 10;
    const x0 = (GAME_W - (cw * 5 + gap * 4)) / 2;
    CHAR_IDS.forEach((id, i) => {
      const c = CHARS[id];
      const x = x0 + i * (cw + gap);
      const sel = i === this.idx;
      const bg = this.add.rectangle(x, 80, cw, 530, sel ? 0x1c2340 : 0x121626).setOrigin(0, 0);
      bg.setStrokeStyle(sel ? 3 : 1, sel ? c.color : 0x2a3150);
      const hasPortrait = this.textures.exists(`token/${id}`);
      const badge = hasPortrait ? this.add.image(x + cw / 2, 140, `token/${id}`).setDisplaySize(112, 112) : this.add.circle(x + cw / 2, 140, 40, c.color);
      const g = hasPortrait ? this.add.container(0, 0) : txt(this, x + cw / 2, 140, c.glyph, 40, '#0b0d14', { fontStyle: 'bold' }).setOrigin(0.5);
      const name = txt(this, x + cw / 2, 205, c.name, 26, hex(c.color)).setOrigin(0.5);
      const role = txt(this, x + cw / 2, 240, c.role, 15, '#c7d0f5', { wordWrap: { width: cw - 16, useAdvancedWrap: true }, align: 'center' }).setOrigin(0.5, 0);
      const stats = txt(this, x + 14, 290,
        `HP ${c.hp}\n攻撃 ${c.atk}\n防御 ${c.def}${c.mp ? `\nMP ${c.mp}` : ''}`, 16, '#e8eaf2');
      const ab = txt(this, x + 14, 392, `【${c.abilityName}】`, 15, '#ffe08a', { wordWrap: { width: cw - 24, useAdvancedWrap: true } });
      const desc = txt(this, x + 14, 416, c.abilityDesc, 14, '#aab3d6', { wordWrap: { width: cw - 24, useAdvancedWrap: true } });
      this.layer.add([bg, badge, g, name, role, stats, ab, desc]);
    });
  }
}
