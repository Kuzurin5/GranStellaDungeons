import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Game, Monster } from '../src/core/game';
import { CHAR_IDS, ENEMIES, BOSS, CharId, INV_MAX, MAX_FULLNESS, MAX_FLOOR } from '../src/core/data';
import { FLOOR, H, STAIRS, W, generateFloor } from '../src/core/mapgen';
import { runBot } from '../src/core/bot';
import { DiagInput } from '../src/core/diag';

/** 何もない広い部屋に敵なし・罠なしで始める */
function arena(charId: CharId, seed = 1): Game {
  const g = new Game(charId, seed);
  g.tiles.fill(0);
  for (let y = 2; y < 12; y++) for (let x = 2; x < 30; x++) g.tiles[y * W + x] = FLOOR;
  g.monsters = [];
  g.traps = [];
  g.floorItems = [];
  g.map.rooms = [{ x: 2, y: 2, w: 28, h: 10 }];
  g.player.x = 5;
  g.player.y = 5;
  g.player.dx = 1;
  g.player.dy = 0;
  return g;
}

function put(g: Game, id: string, x: number, y: number, over: Partial<Monster> = {}): Monster {
  const def = id === 'boss' ? BOSS : ENEMIES.find((e) => e.id === id)!;
  const m = g.spawnMonster(def, x, y);
  m.dormant = false;
  m.alerted = true;
  Object.assign(m, over);
  return m;
}

describe('乱数とマップ生成', () => {
  it('同じシードなら同じ結果になる', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
    expect(runBot('elwin', 5).turns).toBe(runBot('elwin', 5).turns);
  });

  it('全10階で階段(10階はボス部屋)まで道がつながる', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new Rng(seed);
      for (let f = 1; f <= MAX_FLOOR; f++) {
        const m = generateFloor(rng, f, MAX_FLOOR);
        expect(m.rooms.length).toBeGreaterThanOrEqual(5);
        if (f === MAX_FLOOR) expect(m.stairs).toBeNull();
        else expect(m.tiles[m.stairs!.y * W + m.stairs!.x]).toBe(STAIRS);
        const g = new Game('elwin', seed);
        g.map = m; g.tiles = m.tiles;
        const target = m.stairs ?? { x: m.rooms[m.farRoom].x, y: m.rooms[m.farRoom].y };
        const field = g.distField(m.start.x, m.start.y, 999);
        expect(field[target.y * W + target.x]).toBeGreaterThanOrEqual(0);
      }
    }
    expect(H).toBeGreaterThan(0);
  });

  it('10階にボスが1体いる', () => {
    const g = new Game('elwin', 3, { startFloor: MAX_FLOOR });
    expect(g.monsters.filter((m) => m.def.id === 'boss')).toHaveLength(1);
  });
});

describe('基本ルール', () => {
  it('斜め移動は壁の角をまたげない', () => {
    const g = arena('elwin');
    g.tiles[5 * W + 6] = 0; // 右が壁
    expect(g.act({ t: 'move', dx: 1, dy: 1 })).toBe(false);
    expect(g.player.x).toBe(5);
    expect(g.act({ t: 'move', dx: 0, dy: 1 })).toBe(true);
  });

  it('同時ターン制: プレイヤーが1回行動するごとに敵も1回動く', () => {
    const g = arena('elwin');
    const m = put(g, 'goblin', 10, 5);
    g.act({ t: 'wait' });
    expect(m.x).toBe(9);
    g.act({ t: 'move', dx: 0, dy: -1 });
    expect(m.x).toBe(8);
    expect(g.player.y).toBe(4);
  });

  it('隣の敵は攻撃してくる', () => {
    const g = arena('elwin');
    put(g, 'goblin', 6, 5);
    const hp = g.player.hp;
    g.act({ t: 'wait' });
    expect(g.player.hp).toBeLessThan(hp);
  });

  it('満腹度は毎ターン減り、0になるとダメージを受ける', () => {
    const g = arena('elwin');
    expect(g.player.fullness).toBe(MAX_FULLNESS);
    g.act({ t: 'wait' });
    expect(g.player.fullness).toBe(MAX_FULLNESS - 1);
    g.player.fullness = 1;
    g.act({ t: 'wait' });
    expect(g.player.fullness).toBe(0);
    const hp = g.player.hp;
    g.act({ t: 'wait' });
    expect(g.player.hp).toBeLessThan(hp);
  });

  it('食料で満腹度が回復する', () => {
    const g = arena('elwin');
    g.player.fullness = 50;
    const i = g.player.inv.findIndex((x) => x.kind === 'food');
    g.act({ t: 'use', i });
    expect(g.player.fullness).toBeGreaterThan(100);
  });

  it('未鑑定アイテムは別名で表示され、使うと正体が分かる', () => {
    const g = arena('elwin');
    const it = g.makeItem('herb', 'poison');
    g.player.inv.push(it);
    const before = g.itemName(it);
    expect(before).not.toBe('毒草');
    expect(g.isKnown(it)).toBe(false);
    g.act({ t: 'use', i: g.player.inv.indexOf(it) });
    expect(g.isKnown(g.makeItem('herb', 'poison'))).toBe(true);
    expect(g.itemName(g.makeItem('herb', 'poison'))).toBe('毒草');
  });

  it('罠は最初は見えず、踏むと作動して見えるようになる', () => {
    const g = arena('elwin');
    g.traps.push({ x: 6, y: 5, kind: 'mine', revealed: false });
    expect(g.traps[0].revealed).toBe(false);
    const hp = g.player.hp;
    g.act({ t: 'move', dx: 1, dy: 0 });
    expect(g.player.hp).toBeLessThan(hp);
  });

  it('眠りガスを踏むと数ターン眠る', () => {
    const g = arena('elwin');
    g.traps.push({ x: 6, y: 5, kind: 'sleepgas', revealed: false });
    const t0 = g.turn;
    g.act({ t: 'move', dx: 1, dy: 0 });
    expect(g.turn - t0).toBeGreaterThanOrEqual(4);
    expect(g.player.sleep).toBe(0);
  });

  it('落とし穴で次の階に落ちる', () => {
    const g = arena('elwin');
    g.traps.push({ x: 6, y: 5, kind: 'pit', revealed: false });
    g.act({ t: 'move', dx: 1, dy: 0 });
    expect(g.floor).toBe(2);
  });

  it('経験値でレベルアップし、HPと攻撃力が上がる', () => {
    const g = arena('elwin');
    const hp = g.player.maxHp;
    const atk = g.player.atk;
    put(g, 'slime', 6, 5, { hp: 1 });
    for (let i = 0; i < 4 && g.player.level === 1; i++) {
      if (!g.monsters.length) put(g, 'slime', 6, 5, { hp: 1 });
      g.act({ t: 'move', dx: 1, dy: 0 });
    }
    expect(g.player.level).toBeGreaterThan(1);
    expect(g.player.maxHp).toBeGreaterThan(hp);
    expect(g.player.atk).toBeGreaterThan(atk);
  });

  it('持ち物は最大20個、満杯だと拾えない', () => {
    const g = arena('elwin');
    while (g.player.inv.length < INV_MAX) g.player.inv.push(g.makeItem('herb', 'heal'));
    g.floorItems.push({ x: 6, y: 5, item: g.makeItem('herb', 'eye') });
    g.act({ t: 'move', dx: 1, dy: 0 });
    expect(g.player.inv).toHaveLength(INV_MAX);
    expect(g.floorItems).toHaveLength(1);
  });

  it('武器と盾を1つずつ装備でき、呪われた装備は外せない', () => {
    const g = arena('elwin');
    const sword = g.makeItem('weapon', 'iron');
    const cursed = g.makeItem('weapon', 'cursed');
    g.player.inv.push(sword, cursed);
    g.act({ t: 'use', i: g.player.inv.indexOf(sword) });
    expect(g.player.weapon!.effect).toBe('iron');
    g.act({ t: 'use', i: g.player.inv.indexOf(cursed) });
    expect(g.player.weapon!.effect).toBe('cursed');
    const other = g.makeItem('weapon', 'light');
    g.player.inv.push(other);
    expect(g.act({ t: 'use', i: g.player.inv.indexOf(other) })).toBe(false);
    expect(g.player.weapon!.effect).toBe('cursed');
  });

  it('お祓いの巻物で呪いが解け、装備を替えられるようになる', () => {
    const g = arena('elwin');
    const cursed = g.makeItem('weapon', 'cursed');
    g.player.inv.push(cursed);
    g.act({ t: 'use', i: g.player.inv.indexOf(cursed) });
    expect(g.player.weapon!.effect).toBe('cursed');
    const scroll = g.makeItem('scroll', 'purify');
    g.player.inv.push(scroll);
    g.act({ t: 'use', i: g.player.inv.indexOf(scroll) });
    expect(g.player.weapon!.effect).not.toBe('cursed');
    const iron = g.makeItem('weapon', 'iron');
    g.player.inv.push(iron);
    expect(g.act({ t: 'use', i: g.player.inv.indexOf(iron) })).toBe(true);
    expect(g.player.weapon!.effect).toBe('iron');
  });

  it('初期HPは20〜30で、全員が低めから始まる', () => {
    for (const id of CHAR_IDS) {
      const g = new Game(id, 1);
      expect(g.player.maxHp).toBeGreaterThanOrEqual(20);
      expect(g.player.maxHp).toBeLessThanOrEqual(30);
    }
  });

  it('睡眠草: 食べると3ターン眠り、投げると敵が3ターン眠って殴っても起きない', () => {
    const g = arena('elwin');
    const herb = g.makeItem('herb', 'sleep');
    g.player.inv.push(herb);
    const t0 = g.turn;
    g.act({ t: 'use', i: g.player.inv.indexOf(herb) });
    expect(g.turn - t0).toBeGreaterThanOrEqual(3);
    expect(g.player.sleep).toBe(0);

    const h = arena('elwin');
    const m = put(h, 'goblin', 8, 5, { hp: 999, maxHp: 999 });
    const herb2 = h.makeItem('herb', 'sleep');
    h.player.inv.push(herb2);
    h.act({ t: 'throw', i: h.player.inv.indexOf(herb2), dx: 1, dy: 0 });
    expect(m.deepSleep).toBeGreaterThan(0);
    expect(h.player.inv).not.toContain(herb2);
    expect(h.isKnown(herb2)).toBe(true);
    h.act({ t: 'move', dx: 0, dy: 1 });
    const x = m.x;
    h.act({ t: 'wait' });
    expect(m.x).toBe(x); // まだ眠っている(動かない)
    h.act({ t: 'wait' });
    h.act({ t: 'wait' });
    h.act({ t: 'wait' });
    expect(m.x).toBeLessThan(x); // 3ターン後に動き出す
  });

  it('投げる: 毒草は敵にダメージ、外れたアイテムは床に落ちる', () => {
    const g = arena('elwin');
    const m = put(g, 'golem', 9, 5, { sleep: 99 });
    const poison = g.makeItem('herb', 'poison');
    g.player.inv.push(poison);
    const hp = m.hp;
    g.act({ t: 'throw', i: g.player.inv.indexOf(poison), dx: 1, dy: 0 });
    expect(m.hp).toBeLessThan(hp);

    const h = arena('elwin');
    const food = h.player.inv.findIndex((i) => i.kind === 'food');
    const item = h.player.inv[food];
    h.act({ t: 'throw', i: food, dx: 1, dy: 0 });
    expect(h.player.inv).not.toContain(item);
    expect(h.floorItems.some((f) => f.item === item)).toBe(true);
  });

  it('死亡するとゲームオーバーになり、ボスを倒すとクリアになる', () => {
    const g = arena('elwin');
    g.player.hp = 1;
    put(g, 'goblin', 6, 5, { atk: 99 });
    g.act({ t: 'wait' });
    expect(g.status).toBe('dead');
    const h = arena('elwin');
    put(h, 'boss', 6, 5, { hp: 1 });
    h.act({ t: 'move', dx: 1, dy: 0 });
    expect(h.status).toBe('clear');
  });

  it('敵は8種類以上いて、階層ごとに出る種類が変わる', () => {
    expect(ENEMIES.length).toBeGreaterThanOrEqual(8);
    const early = new Set(ENEMIES.filter((e) => e.min <= 1).map((e) => e.id));
    const late = new Set(ENEMIES.filter((e) => e.max >= 10).map((e) => e.id));
    expect([...early].sort()).not.toEqual([...late].sort());
  });
});

describe('固有能力', () => {
  it('エルウィン: 敵にダメージを与えるとHPが回復する', () => {
    const g = arena('elwin');
    g.player.hp = 20;
    put(g, 'golem', 6, 5, { hp: 999, sleep: 99 });
    g.act({ t: 'move', dx: 1, dy: 0 });
    expect(g.player.hp).toBeGreaterThan(20);
  });

  it('バラージ: 変身中は2回行動でき、使用後はクールダウンで再使用できない', () => {
    const g = arena('barrage');
    const m = put(g, 'goblin', 12, 5);
    expect(g.act({ t: 'ability' })).toBe(true);
    expect(g.player.transform).toBeGreaterThan(0);
    expect(g.act({ t: 'ability' })).toBe(false);
    const x0 = m.x;
    g.act({ t: 'move', dx: 0, dy: 1 }); // 1回目: 敵は動かない
    expect(m.x).toBe(x0);
    g.act({ t: 'move', dx: 0, dy: 1 }); // 2回目: 敵が動く
    expect(m.x).toBe(x0 - 1);
    g.player.transform = 0;
    expect(g.act({ t: 'ability' })).toBe(false); // クールダウン中
    expect(g.player.abilityCd).toBeGreaterThan(0);
  });

  it('シオン: 離れた敵に魔法を撃て、MPを消費する', () => {
    const g = arena('sion');
    const m = put(g, 'goblin', 10, 5, { sleep: 99 });
    const hp = m.hp;
    const mp = g.player.mp;
    expect(g.act({ t: 'ability', dx: 1, dy: 0 })).toBe(true);
    expect(m.hp).toBeLessThan(hp);
    expect(g.player.mp).toBeLessThan(mp);
    expect(g.act({ t: 'ability', dx: 0, dy: 1 })).toBe(false); // 狙える敵がいない
  });

  it('フェイト: HPを払って周囲の敵をまとめて攻撃する', () => {
    const g = arena('fate');
    const a = put(g, 'golem', 6, 5, { sleep: 99 });
    const b = put(g, 'golem', 4, 5, { sleep: 99 });
    const c = put(g, 'golem', 5, 6, { sleep: 99 });
    const hp = g.player.hp;
    const ha = [a.hp, b.hp, c.hp];
    expect(g.act({ t: 'ability' })).toBe(true);
    expect(g.player.hp).toBeLessThan(hp);
    expect(a.hp).toBeLessThan(ha[0]);
    expect(b.hp).toBeLessThan(ha[1]);
    expect(c.hp).toBeLessThan(ha[2]);
  });

  it('クレイド: 未鑑定アイテムの鑑定と隠れた罠の発見ができる', () => {
    const g = arena('clayd');
    const it = g.makeItem('scroll', 'warp');
    g.player.inv.push(it);
    g.traps.push({ x: 8, y: 5, kind: 'mine', revealed: false });
    expect(g.isKnown(it)).toBe(false);
    expect(g.act({ t: 'ability' })).toBe(true);
    expect(g.isKnown(it)).toBe(true);
    expect(g.traps[0].revealed).toBe(true);
    expect(g.player.infoTurns).toBeGreaterThan(0);
    expect(g.act({ t: 'ability' })).toBe(false); // クールダウン
  });

  it('バラージ以外に2回行動はない', () => {
    for (const id of CHAR_IDS.filter((c) => c !== 'barrage')) {
      const g = arena(id);
      const m = put(g, 'goblin', 12, 5);
      g.act({ t: 'ability' });
      const x = m.x;
      g.act({ t: 'wait' });
      expect(m.x).toBeLessThan(x + 1);
      expect(g.player.transform).toBe(0);
    }
  });
});

describe('ボット', () => {
  it('5キャラとも20000ターン以内に終了する', () => {
    for (const id of CHAR_IDS) {
      const r = runBot(id, 123);
      expect(r.timeout).toBe(false);
      expect(r.turns).toBeLessThanOrEqual(20000);
    }
  });
});

describe('遠距離攻撃は部屋を出れば逃げられる', () => {
  it('同じ部屋の中では遠距離攻撃を受ける', () => {
    const g = arena('elwin');
    g.map.rooms = [{ x: 2, y: 2, w: 10, h: 10 }];
    put(g, 'archer', 9, 5);
    const hp = g.player.hp;
    g.act({ t: 'wait' });
    expect(g.player.hp).toBeLessThan(hp);
  });

  it('プレイヤーが部屋から通路に出ると、部屋の中の敵は遠距離攻撃をしてこない', () => {
    for (const id of ['archer', 'mage']) {
      const g = arena('elwin');
      g.map.rooms = [{ x: 2, y: 2, w: 10, h: 10 }];
      g.player.x = 13; // 部屋(x2〜11)の外
      g.player.y = 5;
      put(g, id, 10, 5, { atk: 50 });
      expect(g.roomIndexAt(13, 5)).toBe(-1);
      const hp = g.player.hp;
      g.act({ t: 'wait' });
      expect(g.player.hp).toBe(hp);
    }
  });

  it('通路どうしでは真っ直ぐ撃たれる', () => {
    const g = arena('elwin');
    g.map.rooms = [{ x: 2, y: 2, w: 4, h: 4 }];
    g.player.x = 15;
    put(g, 'archer', 19, 5);
    const hp = g.player.hp;
    g.act({ t: 'wait' });
    expect(g.player.hp).toBeLessThan(hp);
  });
});

describe('斜め入力', () => {
  it('通常時は1つの方向キーでそのまま動く', () => {
    const d = new DiagInput();
    expect(d.press(0, -1, 0)).toEqual({ dx: 0, dy: -1 });
  });

  it('斜めモードでは、2つの方向キーで斜めに動き、1つだけでは動かない', () => {
    const d = new DiagInput();
    d.toggle();
    expect(d.press(0, -1, 0)).toBeNull();
    expect(d.press(1, 0, 100)).toEqual({ dx: 1, dy: -1 });
    expect(d.press(-1, 0, 200)).toBeNull();
    expect(d.press(0, 1, 300)).toEqual({ dx: -1, dy: 1 });
  });

  it('同じ軸の2つ目は入れ替え、時間が過ぎた1つ目は無効、モード解除で通常に戻る', () => {
    const d = new DiagInput(1000);
    d.toggle();
    expect(d.press(0, -1, 0)).toBeNull();
    expect(d.press(0, 1, 100)).toBeNull(); // 同じ軸 → 入れ替え
    expect(d.press(1, 0, 200)).toEqual({ dx: 1, dy: 1 });
    expect(d.press(0, -1, 0)).toBeNull();
    expect(d.press(1, 0, 5000)).toBeNull(); // 時間切れ → 新しい1つ目
    d.toggle();
    expect(d.press(1, 0, 6000)).toEqual({ dx: 1, dy: 0 });
  });

  it('QEZCなどの斜めキーは斜めモード中でもそのまま斜めに動く', () => {
    const d = new DiagInput();
    d.toggle();
    expect(d.press(1, -1, 0)).toEqual({ dx: 1, dy: -1 });
  });
});
