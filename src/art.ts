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

/**
 * キャラの顔アイコン(chars/<id>_portrait)から、マップに出す「コマ」の絵(token/<id>)を作る。
 * 丸く切り抜いて、イメージカラーの枠で囲む。キャラ専用の全身絵(chars/<id>_down など)があればそちらが優先される。
 */
export function makeTokens(scene: Phaser.Scene, colors: Record<string, number>) {
  const SIZE = ART_TILE;
  for (const id of Object.keys(colors)) {
    const src = `chars/${id}_portrait`;
    const key = `token/${id}`;
    if (!scene.textures.exists(src) || scene.textures.exists(key)) continue;
    const img = scene.textures.get(src).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const tex = scene.textures.createCanvas(key, SIZE, SIZE);
    if (!tex) continue;
    const ctx = tex.getContext();
    const hex = '#' + colors[id].toString(16).padStart(6, '0');
    const c = SIZE / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(c, SIZE - 8, 36, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c - 2, c - 8, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#20263d';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const sw = img.width * 0.94;
    ctx.drawImage(img, img.width * 0.03, 0, sw, sw, 6, 4, SIZE - 12, SIZE - 12);
    ctx.restore();
    ctx.lineWidth = 7;
    ctx.strokeStyle = hex;
    ctx.beginPath(); ctx.arc(c, c - 2, c - 11, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath(); ctx.arc(c, c - 2, c - 7, 0, Math.PI * 2); ctx.stroke();
    tex.refresh();
  }
}
