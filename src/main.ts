import Phaser from 'phaser';
import { GAME_H, GAME_W } from './ui';
import { TitleScene } from './scenes/TitleScene';
import { CharSelectScene } from './scenes/CharSelectScene';
import { DungeonScene } from './scenes/DungeonScene';
import { GameOverScene, ClearScene } from './scenes/EndScenes';

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0b0d14',
  parent: document.getElementById('game') ?? undefined,
  scene: [TitleScene, CharSelectScene, DungeonScene, GameOverScene, ClearScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});

// スクショ撮影・デバッグ用の入口(?debug=1 のときだけ使う)
(window as unknown as { __phaser: Phaser.Game }).__phaser = game;
