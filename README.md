# GranStellaDungeons 指示書セット(Claude Code用)

不思議のダンジョン風ローグライク「GranStellaDungeons」のモックを、Claude Codeに放置で作らせるための指示書です。

## 使い方(Windows)

1. このzipを解凍し、できたフォルダ「GranStellaDungeons」を作業したい場所に置く
2. そのフォルダでターミナルを開く(エクスプローラーのアドレスバーに `cmd` と入力してEnter)
3. `claude` と入力してClaude Codeを起動する
4. GOAL.txt の中身(1行)をそのままコピーして貼り付け、Enterを押す
5. あとは放置。止まったら、DESIGN.md と CHECKLIST.md を見て状況を確認する

## 事前に必要なもの

- Node.js(入っていなければ公式サイトのLTS版をインストール)
- Claude Code

## ファイルの役割

| ファイル | 内容 |
|---|---|
| CLAUDE.md | Claude Codeが毎回読む共通ルール |
| SPEC.md | ゲーム仕様と「完了条件」(これがゴール) |
| characters.md | 5人のキャラ設定(口調・見た目は後から追記可) |
| CHECKLIST.md | AIが達成状況を書き込む表 |
| GOAL.txt | /goal に貼る1行 |

## 注意

- 完了条件は「動く・数値目標が通る・証拠が残る」までです。面白さは、できあがったものを遊んで確認し、直したい点を追加で指示してください
- 数値目標(クリア率など)は仮置きです。結果を見て変えて構いません


## ブラウザで遊ぶ
- すぐ遊ぶ: `npm install` のあと `npm run single` を実行し、できた `dist-single/play.html` をブラウザで開く(1ファイルで動く)
- 開発サーバ: `npm run dev` を実行し、表示されたURL(通常 http://127.0.0.1:5173)を開く
- 操作: 矢印 / QWEADZXC で8方向、S 待機、Space 攻撃、F 固有能力、I 持ち物、Enter 階段

## 絵を入れる
- 絵の大きさ・ファイル名・作り方(画像生成向けの指示文つき)は ASSET_SPEC.md
- `public/art/` に PNG を置くと自動で差し替わる。今は仮の絵(`npm run art:placeholders`)
