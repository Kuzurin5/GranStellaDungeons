// 絵の読み込み。public/art/ に画像を置くと、同じ名前の図形・絵文字の表示が差し替わる。
// 絵が無いものは、従来の図形・絵文字で表示する(絵が一部だけ揃った状態でも動く)。
import Phaser from 'phaser';

declare global {
  interface Window {
    /** 単一HTML版では、絵をここに data URI で埋め込む */
    __ART__?: Record<string, string>;
  }
}

/** 画像の元サイズ(ピクセル)。表示は 96 → タイル48 の半分に縮める。 */
export const ART_TILE = 96;

/** 'chars/elwin_down.png' → 'chars/elwin_down' */
export function artKey(path: string): string {
  return path.replace(/\.png$/i, '');
}

/** 絵の読み込み(起動時に1回)。一覧は art/manifest.json(npm run art:index で作る)か、単一HTML版の埋め込み。 */
export function loadArt(scene: Phaser.Scene, done: () => void) {
  const embedded = window.__ART__;
  const start = (files: string[], urlOf: (f: string) => string) => {
    for (const f of files) scene.load.image(artKey(f), urlOf(f));
    if (files.length === 0) { done(); return; }
    scene.load.once('complete', done);
    scene.load.start();
  };
  if (embedded) {
    start(Object.keys(embedded), (f) => embedded[f]);
    return;
  }
  fetch('art/manifest.json')
    .then((r) => (r.ok ? r.json() : { files: [] }))
    .catch(() => ({ files: [] }))
    .then((m: { files?: string[] }) => start(m.files ?? [], (f) => `art/${f}`));
}

export function hasArt(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(key);
}

/** 最初に見つかった絵のキーを返す。無ければ null */
export function firstArt(scene: Phaser.Scene, keys: string[]): string | null {
  for (const k of keys) if (scene.textures.exists(k)) return k;
  return null;
}

/** 画面いっぱいの背景絵。絵があれば追加して true を返す */
export function addCoverBg(scene: Phaser.Scene, key: string, w: number, h: number): boolean {
  if (!scene.textures.exists(key)) return false;
  const img = scene.add.image(w / 2, h / 2, key);
  const s = Math.max(w / img.width, h / img.height);
  img.setScale(s);
  return true;
}
