// public/art/ 以下の画像(.png)の一覧を public/art/manifest.json に書き出す。ゲームはこの一覧にある絵だけ読み込む。
import { mkdirSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join('public', 'art');
mkdirSync(ROOT, { recursive: true });

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.toLowerCase().endsWith('.png')) out.push(relative(ROOT, p).split('\\').join('/'));
  }
  return out.sort();
}

const files = existsSync(ROOT) ? walk(ROOT) : [];
writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify({ files }, null, 2) + '\n');
console.log(`絵の一覧を作成: ${files.length}枚 → public/art/manifest.json`);
