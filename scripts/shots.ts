// スクショ撮影: ビルドしたゲームを静的サーバで配信し、Playwright(Chromium)で各画面を撮る。
import { chromium, Page } from 'playwright';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'screenshots');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
};

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

async function main() {
  execSync('npm run build', { stdio: 'inherit' });
  mkdirSync(OUT, { recursive: true });
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    let f = join(DIST, url === '/' ? 'index.html' : url);
    if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) f = join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/`;

  const exe = findChromium();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1040, height: 660 } });
  const saved: string[] = [];
  const shot = async (name: string) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    saved.push(`${name}.png`);
  };
  const key = async (k: string) => { await page.keyboard.press(k); await page.waitForTimeout(120); };

  /** タイトル→キャラ選択→ダンジョン開始まで進める */
  async function startRun(charNo: number, query = '') {
    await page.goto(`${base}?seed=${100 + charNo}${query}`);
    await page.waitForTimeout(600);
    await key('Enter');
    await key(String(charNo));
    await key('Enter');
    await page.waitForFunction(() => !!(window as any).__app, null, { timeout: 5000 });
    await page.waitForTimeout(300);
  }

  /** 周囲に空きを作り、指定の敵を配置する(撮影用の状況づくり) */
  const stage = (script: string) => page.evaluate(`(() => { const a = window.__app; const g = a.game; const p = g.player;
    const carve = (x, y) => { if (x > 0 && y > 0 && x < 39 && y < 23) g.tiles[y * 40 + x] = 1; };
    const spawn = (id, x, y, over) => { const d = a.data.ENEMIES.find(e => e.id === id) || a.data.BOSS; const m = g.spawnMonster(d, x, y); m.dormant = false; m.alerted = true; Object.assign(m, over || {}); return m; };
    ${script}
    g.updateSeen(); a.refresh(); })()`);

  // 1. タイトル
  await page.goto(`${base}?seed=101`);
  await page.waitForTimeout(700);
  await shot('01_title');
  // 2. キャラ選択
  await key('Enter');
  await page.waitForTimeout(300);
  await shot('02_charselect');

  // 3. 1階の探索中(エルウィン)
  await key('Enter');
  await page.waitForFunction(() => !!(window as any).__app);
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight', 'KeyE', 'ArrowRight']) await key(k);
  await shot('03_exploring_floor1');

  // 3b. 斜めモード(Shiftで切替。方向キー2つで斜め移動)
  await startRun(1);
  await stage(`g.monsters = []; carve(p.x + 1, p.y - 1); carve(p.x + 1, p.y); carve(p.x, p.y - 1);`);
  const before = await page.evaluate(`({ x: window.__app.game.player.x, y: window.__app.game.player.y })`) as { x: number; y: number };
  await key('Shift');
  await key('ArrowUp');
  await shot('03b_diagonal_mode');
  await key('ArrowRight');
  const after = await page.evaluate(`({ x: window.__app.game.player.x, y: window.__app.game.player.y })`) as { x: number; y: number };
  if (after.x !== before.x + 1 || after.y !== before.y - 1) throw new Error(`斜め移動に失敗: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  await shot('03c_diagonal_moved');

  // 4. 戦闘中
  await stage(`g.monsters = []; carve(p.x + 1, p.y); carve(p.x + 2, p.y); carve(p.x - 1, p.y);
    spawn('goblin', p.x + 1, p.y, { hp: 40, maxHp: 40, sleep: 0 }); spawn('slime', p.x - 1, p.y);
    p.dx = 1; p.dy = 0;`);
  await page.evaluate(`window.__app.act({ t: 'attack' })`);
  await shot('04_battle');

  // 5. エルウィン: 殴ってHPが回復する瞬間
  await startRun(1);
  await stage(`g.monsters = []; carve(p.x + 1, p.y); p.hp = Math.floor(p.maxHp * 0.5);
    spawn('golem', p.x + 1, p.y, { hp: 80, maxHp: 80, sleep: 99 }); p.dx = 1; p.dy = 0;`);
  await page.evaluate(`window.__app.act({ t: 'attack' })`);
  await shot('05_ability_elwin');

  // 6. バラージ: 変身
  await startRun(2);
  await stage(`g.monsters = []; carve(p.x + 1, p.y); carve(p.x - 1, p.y); carve(p.x, p.y + 1);
    spawn('goblin', p.x + 1, p.y, { sleep: 99 }); spawn('goblin', p.x - 1, p.y, { sleep: 99 });`);
  await page.evaluate(`window.__app.act({ t: 'ability' })`);
  await shot('06_ability_barrage');

  // 7. シオン: 魔法弾
  await startRun(3);
  await stage(`g.monsters = []; const d = p.x < 20 ? 1 : -1; for (let i = 1; i <= 8; i++) carve(p.x + d * i, p.y);
    spawn('goblin', p.x + d * 5, p.y, { sleep: 99, hp: 40, maxHp: 40 }); p.dx = d; p.dy = 0;`);
  await page.evaluate(`window.__app.act({ t: 'ability' })`);
  await shot('07_ability_sion');

  // 8. フェイト: 周囲まとめて攻撃
  await startRun(4);
  await stage(`g.monsters = []; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]) carve(p.x + dx, p.y + dy); carve(p.x + 1, p.y + 1);
    spawn('goblin', p.x + 1, p.y, { sleep: 99 }); spawn('goblin', p.x - 1, p.y, { sleep: 99 });
    spawn('slime', p.x, p.y + 1, { sleep: 99 }); spawn('bat', p.x + 1, p.y + 1, { sleep: 99 });`);
  await page.evaluate(`window.__app.act({ t: 'ability' })`);
  await shot('08_ability_fate');

  // 9. クレイド: 鑑定(未鑑定品・罠・敵の能力)
  await startRun(5);
  await stage(`g.monsters = []; carve(p.x + 3, p.y); carve(p.x + 2, p.y); carve(p.x + 1, p.y); carve(p.x + 4, p.y);
    p.inv.push(g.makeItem('scroll', 'fire'), g.makeItem('wand', 'bolt'), g.makeItem('herb', 'superheal'), g.makeItem('weapon', 'light'));
    g.traps.push({ x: p.x + 2, y: p.y, kind: 'mine', revealed: false });
    spawn('mage', p.x + 4, p.y, { sleep: 99 });`);
  await shot('09a_clayd_before');
  await page.evaluate(`window.__app.act({ t: 'ability' })`);
  await shot('09_ability_clayd');
  await key('KeyI');
  await page.evaluate(`window.__app.scene.menuIdx = 4; window.__app.refresh()`);
  await shot('10_identify_items');

  // 10b. アイテムを投げる(睡眠草で敵を眠らせる)
  await startRun(1);
  await stage(`g.monsters = []; for (let i = 1; i <= 6; i++) carve(p.x + i, p.y);
    spawn('goblin', p.x + 4, p.y, { sleep: 0 }); p.dx = 1; p.dy = 0;
    p.inv.push(g.makeItem('herb', 'sleep')); g.known.add('herb:sleep');`);
  await key('KeyI');
  await page.evaluate(`window.__app.scene.menuIdx = window.__app.game.player.inv.length - 1; window.__app.refresh()`);
  await key('KeyT');
  await shot('10b_throw_prompt');
  await key('ArrowRight');
  await shot('10c_throw_sleep');

  // 11. ボス戦
  await startRun(1, '&floor=10');
  await stage(`const b = g.monsters.find(m => m.def.id === 'boss'); g.monsters = [b]; b.alerted = true;
    for (let i = 1; i <= 6; i++) carve(b.x - i, b.y);
    p.x = b.x - 4; p.y = b.y; p.dx = 1; p.dy = 0; carve(p.x, p.y);`);
  await page.evaluate(`window.__app.act({ t: 'wait' })`);
  await shot('11_boss');

  // 12. ゲームオーバー
  await startRun(2);
  await stage(`g.monsters = []; carve(p.x + 1, p.y); p.hp = 1; spawn('goblin', p.x + 1, p.y, { atk: 99 });`);
  await page.evaluate(`window.__app.act({ t: 'wait' })`);
  await page.waitForTimeout(2200);
  await shot('12_gameover');

  // 13. クリア
  await startRun(3, '&floor=10');
  await stage(`const b = g.monsters.find(m => m.def.id === 'boss'); g.monsters = [b];
    carve(b.x - 1, b.y); p.x = b.x - 1; p.y = b.y; p.dx = 1; p.dy = 0; b.hp = 1; b.sleep = 99;`);
  await page.evaluate(`window.__app.act({ t: 'move', dx: 1, dy: 0 })`);
  await page.waitForTimeout(2200);
  await shot('13_clear');

  await browser.close();
  server.close();
  console.log(`保存したスクショ(${saved.length}枚): screenshots/`);
  for (const s of saved) console.log('  - ' + s);
}

main().catch((e) => { console.error(e); process.exit(1); });
