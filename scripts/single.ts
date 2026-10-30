// ブラウザで遊べる単一HTMLを作る: dist-single/play.html(ダブルクリックで遊べる)と artifact.html(公開用の本文のみ)
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

execSync('npm run build', { stdio: 'inherit' });
const assets = join('dist', 'assets');
const jsName = readdirSync(assets).find((f) => f.endsWith('.js'))!;
const js = readFileSync(join(assets, jsName), 'utf8').replace(/<\/script/gi, '<\\/script');

const body = `<meta name="claude:viewport-fit-sides" content="cover">
<title>GranStellaDungeons</title>
<style>
  :root {
    --bg: #0b0d14; --panel: #121626; --fg: #e8eaf2; --muted: #8b95bd; --accent: #ffe08a; --line: #2a3150;
    color-scheme: dark;
  }
  html, body { margin: 0; }
  body {
    background: var(--bg); color: var(--fg);
    font-family: "IPAGothic", "Noto Sans CJK JP", "Hiragino Sans", "Yu Gothic", sans-serif;
    padding-block: 16px;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
  .wrap { max-width: 1040px; margin: 0 auto; display: grid; gap: 12px; }
  h1 { margin: 0; font-size: 1.1rem; color: var(--accent); letter-spacing: .04em; }
  #game { width: 100%; aspect-ratio: 1040 / 660; background: var(--bg); outline: 1px solid var(--line); }
  #game canvas { display: block; }
  .help { display: flex; flex-wrap: wrap; gap: 8px 20px; color: var(--muted); font-size: .85rem; margin: 0; }
  .help b { color: var(--fg); font-weight: 600; }
</style>
<div class="wrap">
  <h1>GranStellaDungeons</h1>
  <div id="game" tabindex="0"></div>
  <p class="help">
    <span>ゲーム画面をクリックしてから操作してください(キーボード操作です)</span>
    <span><b>移動</b> 矢印 / QWE・AD・ZXC</span>
    <span><b>斜め</b> Shiftで斜めモード切替(2方向キーで斜め)</span>
    <span><b>待機</b> S</span>
    <span><b>攻撃</b> Space</span>
    <span><b>固有能力</b> F</span>
    <span><b>持ち物</b> I(閉じるのも I か Esc)</span>
    <span><b>階段</b> Enter</span>
  </p>
</div>
<script type="module">
${js}
</script>
`;
mkdirSync('dist-single', { recursive: true });
writeFileSync(join('dist-single', 'artifact.html'), body);
writeFileSync(join('dist-single', 'play.html'),
  `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n</head>\n<body>\n${body}</body>\n</html>\n`);
console.log('作成: dist-single/play.html, dist-single/artifact.html');
