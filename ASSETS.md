# 素材の差し替え方法

現状は画像・音を使わず、図形・文字・絵文字で表示している。

| 対象 | 今の表示 | 差し替える場所 |
|---|---|---|
| キャラ | 色付きの円+カタカナ1文字 | `src/core/data.ts` の `CHARS`(`glyph`, `color`)。画像にするなら `src/scenes/DungeonScene.ts` の「プレイヤー」描画部で `this.add.image` に置き換える |
| 敵 | 絵文字(`glyph`) | `src/core/data.ts` の `ENEMIES` / `BOSS` の `glyph`。画像にするなら `DungeonScene.render()` の「敵」部分 |
| アイテム・罠 | 絵文字/記号 | `DungeonScene.ts` 先頭の `KIND_GLYPH` / `TRAP_GLYPH` |
| 床・壁・階段 | 色付きの四角 | `DungeonScene.render()` の「マップ」部分(`fillRect` をタイルの `add.image` に) |
| 画面 | Phaser のテキスト・図形 | `src/scenes/*.ts` |
| 音 | なし | `DungeonScene.step()` の後(`Game.fx` の種類ごと)に `this.sound.play` を足す |

画像を使うときは `public/` に置き、`preload()` で読み込む。
