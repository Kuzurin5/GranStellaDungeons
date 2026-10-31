# 素材の差し替え方法

絵は `public/art/` に画像(PNG)を置くと自動で差し替わる。大きさ・名前・作り方は **ASSET_SPEC.md** を参照。

- 仮の絵(絵文字と図形)の作成: `npm run art:placeholders`(既にあるファイルは上書きしない。`-- --force` で作り直す。キャラの顔アイコンは本物があるので上書きしない)
- 味方キャラは、顔アイコン(`chars/<id>_portrait.png`)から「顔のコマ」を自動で作って表示する
- 絵の一覧の更新: `npm run art:index`(`npm run build` と `npm run dev` が自動で実行する)
- 1ファイルで遊べる版(絵を埋め込む): `npm run single` → `dist-single/play.html`
- 絵が無いものは、従来の図形・絵文字で表示される

絵以外の差し替え口:

| 対象 | 場所 |
|---|---|
| キャラの色・文字(絵が無いとき) | `src/core/data.ts` の `CHARS`(`glyph`, `color`) |
| 敵の絵文字(絵が無いとき) | `src/core/data.ts` の `ENEMIES` / `BOSS` の `glyph` |
| アイテム・罠の絵文字(絵が無いとき) | `src/scenes/DungeonScene.ts` 先頭の `KIND_GLYPH` / `TRAP_GLYPH` |
| 階の雰囲気の切り替え | `src/view.ts` の `THEMES` |
| 音 | なし(`Game.fx` の種類ごとに `this.sound.play` を足す) |
