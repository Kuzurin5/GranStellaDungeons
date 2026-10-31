// 仮の絵(絵文字・図形)を public/art/ に書き出す。本物の絵ができたら、同じファイル名で上書きする。
// 使い方: npm run art:placeholders   (既にあるファイルは上書きしない。--force で全部作り直す)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CHARS, CHAR_IDS, ENEMIES, BOSS, EFFECTS, TRAPS } from '../src/core/data';

const OUT = join('public', 'art');
const force = process.argv.includes('--force');

function findChromium(): string | undefined {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean) as string[];
  for (const b of bases) {
    if (!existsSync(b)) continue;
    for (const d of readdirSync(b)) {
      const exe = join(b, d, 'chrome-linux64', 'chrome');
      if (d.startsWith('chromium-') && existsSync(exe)) return exe;
    }
  }
  return undefined;
}

interface Job { path: string; w: number; h: number; draw: string }
const jobs: Job[] = [];
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

// 味方: 色付きの人形 + 名前の1文字。向きで顔・後ろ姿・横顔を変える
for (const id of CHAR_IDS) {
  const c = CHARS[id];
  for (const f of ['down', 'up', 'side']) {
    jobs.push({ path: `chars/${id}_${f}.png`, w: 96, h: 96, draw: `unit(ctx, '${hex(c.color)}', '${c.glyph}', '${f}')` });
  }
  jobs.push({ path: `chars/${id}_portrait.png`, w: 256, h: 256, draw: `portrait(ctx, '${hex(c.color)}', '${c.glyph}')` });
}
// 敵: 絵文字
for (const e of [...ENEMIES, BOSS]) {
  const size = e.id === 'boss' ? 192 : 96;
  jobs.push({ path: `enemies/${e.id}_down.png`, w: size, h: size, draw: `emoji(ctx, '${e.glyph}', ${size})` });
}
// アイテム: 種類ごとの絵文字
const KIND_GLYPH: Record<string, string> = { herb: '🌿', food: '🍙', scroll: '📜', wand: '🪄', weapon: '🗡️', shield: '🛡️', key: '🗝️' };
for (const k of Object.keys(KIND_GLYPH)) {
  jobs.push({ path: `items/${k}.png`, w: 64, h: 64, draw: `emoji(ctx, '${KIND_GLYPH[k]}', 64)` });
}
void EFFECTS;
// 罠
const TRAP_GLYPH: Record<string, string> = { pit: '⬇', mine: '✹', sleepgas: '☁', warp: '✦' };
for (const t of TRAPS) jobs.push({ path: `traps/${t.id}.png`, w: 96, h: 96, draw: `trap(ctx, '${TRAP_GLYPH[t.id]}')` });
// 地形
for (let i = 0; i < 4; i++) jobs.push({ path: `tiles/floor_${i}.png`, w: 96, h: 96, draw: `floor(ctx, ${i})` });
jobs.push({ path: 'tiles/wall_top.png', w: 96, h: 96, draw: 'wallTop(ctx)' });
jobs.push({ path: 'tiles/wall_front.png', w: 96, h: 96, draw: 'wallFront(ctx)' });
jobs.push({ path: 'tiles/stairs.png', w: 96, h: 96, draw: 'stairs(ctx)' });
jobs.push({ path: 'tiles/door.png', w: 96, h: 96, draw: 'door(ctx)' });

const PAGE_JS = `
const FONT = '"Noto Color Emoji","IPAGothic","Noto Sans CJK JP",sans-serif';
function rnd(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function unit(ctx, color, glyph, f) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(48, 86, 26, 7, 0, 0, 7); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(48, 62, 24, 26, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#f2d7b6'; ctx.beginPath(); ctx.arc(48, 32, 20, 0, 7); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(48, f === 'up' ? 32 : 24, f === 'up' ? 21 : 17, Math.PI, 0); ctx.fill();
  if (f === 'up') { ctx.beginPath(); ctx.arc(48, 32, 20, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#222';
  if (f === 'down') { ctx.beginPath(); ctx.arc(41, 34, 3, 0, 7); ctx.arc(55, 34, 3, 0, 7); ctx.fill(); }
  if (f === 'side') { ctx.beginPath(); ctx.arc(58, 34, 3, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(68, 54, 14, 5); }
  ctx.fillStyle = '#0b0d14'; ctx.font = 'bold 28px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (f !== 'up') ctx.fillText(glyph, 48, 64);
}
function portrait(ctx, color, glyph) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(128, 128, 120, 0, 7); ctx.fill();
  ctx.fillStyle = '#0b0d14'; ctx.font = 'bold 140px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, 128, 136);
}
function emoji(ctx, g, size) {
  ctx.font = Math.floor(size * 0.78) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g, size / 2, size / 2 + size * 0.04);
}
function trap(ctx, g) {
  ctx.fillStyle = 'rgba(255,60,60,0.35)'; ctx.beginPath(); ctx.arc(48, 48, 40, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff7a7a'; ctx.font = 'bold 56px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g, 48, 50);
}
function floor(ctx, i) {
  ctx.fillStyle = '#3a4160'; ctx.fillRect(0, 0, 96, 96);
  const r = rnd(100 + i); for (let k = 0; k < 90; k++) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)'; ctx.fillRect(r() * 96, r() * 96, 3 + r() * 6, 3 + r() * 6); }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.strokeRect(0.5, 0.5, 95, 95);
}
function wallTop(ctx) {
  ctx.fillStyle = '#1b2036'; ctx.fillRect(0, 0, 96, 96);
  const r = rnd(7); for (let k = 0; k < 40; k++) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(r() * 96, r() * 96, 8, 8); }
}
function wallFront(ctx) {
  ctx.fillStyle = '#4a5275'; ctx.fillRect(0, 0, 96, 96); ctx.fillStyle = '#2c3350'; ctx.fillRect(0, 0, 96, 10);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
  for (let y = 10; y < 96; y += 21) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(96, y); ctx.stroke(); const o = ((y / 21) | 0) % 2 ? 24 : 0; for (let x = o; x < 96; x += 48) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 21); ctx.stroke(); } }
}
function stairs(ctx) {
  floor(ctx, 0); for (let i = 0; i < 5; i++) { ctx.fillStyle = 'hsl(45,60%,' + (30 + i * 9) + '%)'; ctx.fillRect(10 + i * 4, 14 + i * 15, 76 - i * 8, 13); }
  ctx.fillStyle = '#fff3b0'; ctx.font = 'bold 22px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('階', 48, 88);
}
function door(ctx) {
  floor(ctx, 1); ctx.fillStyle = '#8a5a2b'; ctx.fillRect(18, 6, 60, 86); ctx.strokeStyle = '#4a2e12'; ctx.lineWidth = 4; ctx.strokeRect(18, 6, 60, 86);
  ctx.font = '30px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🔒', 48, 50);
}
window.__draw = (job) => { const c = document.createElement('canvas'); c.width = job.w; c.height = job.h; const ctx = c.getContext('2d'); eval(job.draw); return c.toDataURL('image/png').split(',')[1]; };
`;

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: PAGE_JS });
let made = 0;
for (const job of jobs) {
  const dest = join(OUT, job.path);
  if (existsSync(dest) && !force) continue;
  mkdirSync(dirname(dest), { recursive: true });
  const b64 = await page.evaluate((j) => (window as unknown as { __draw: (j: Job) => string }).__draw(j), job);
  writeFileSync(dest, Buffer.from(b64, 'base64'));
  made++;
}
await browser.close();
console.log(`仮の絵を作成: ${made}枚(スキップ ${jobs.length - made}枚) → public/art/`);
