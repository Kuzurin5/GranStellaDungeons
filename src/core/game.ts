// ゲームロジック本体。描画(Phaser)には一切依存しない。Node上でも動く。
import { Rng } from './rng';
import {
  ALIAS_POOL, BARRAGE_CD, BARRAGE_DURATION, BOSS, CHARS, CLAYD_CD, CLAYD_INFO_TURNS, EFFECTS, ENEMIES,
  INV_MAX, ItemKind, KIND_WEIGHTS, MAX_FLOOR, MAX_FULLNESS, SION_COST, SION_RANGE, TRAPS, TrapKind,
  CharId, EnemyDef, effectOf, expToNext,
} from './data';
import { FLOOR, FloorMap, H, STAIRS, W, WALL, generateFloor } from './mapgen';

export interface Item {
  id: number;
  kind: ItemKind;
  effect: string;
  charges?: number;
}

export interface Monster {
  id: number;
  def: EnemyDef;
  hp: number;
  maxHp: number;
  atk: number;
  armor: number;
  x: number;
  y: number;
  sleep: number;
  dormant: boolean;
  alerted: boolean;
  fleeing: boolean;
  phase: number;
  cd: number;
  stolen: Item | null;
  deepSleep: number;
}

export interface Trap {
  x: number;
  y: number;
  kind: TrapKind;
  revealed: boolean;
}

export interface FloorItem {
  x: number;
  y: number;
  item: Item;
}

export interface Player {
  charId: CharId;
  x: number;
  y: number;
  dx: number;
  dy: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  level: number;
  exp: number;
  fullness: number;
  mp: number;
  maxMp: number;
  inv: Item[];
  weapon: Item | null;
  shield: Item | null;
  sleep: number;
  transform: number;
  tempoSkipped: boolean;
  abilityCd: number;
  infoTurns: number;
}

export type Action =
  | { t: 'move'; dx: number; dy: number }
  | { t: 'attack' }
  | { t: 'wait' }
  | { t: 'use'; i: number; dx?: number; dy?: number }
  | { t: 'drop'; i: number }
  | { t: 'ability'; dx?: number; dy?: number }
  | { t: 'throw'; i: number; dx?: number; dy?: number }
  | { t: 'descend' };

export interface Fx {
  type: 'hit' | 'throw' | 'bolt' | 'sweep' | 'transform' | 'identify' | 'heal' | 'fire' | 'breath';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  text?: string;
}

export type Status = 'playing' | 'dead' | 'clear';

const DIRS: [number, number][] = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

export class Game {
  rng: Rng;
  charId: CharId;
  player!: Player;
  floor = 0;
  map!: FloorMap;
  tiles!: Uint8Array;
  w = W;
  h = H;
  monsters: Monster[] = [];
  traps: Trap[] = [];
  floorItems: FloorItem[] = [];
  seen = new Uint8Array(W * H);
  trackSeen: boolean;
  turn = 0;
  floorTurn = 0;
  status: Status = 'playing';
  deathCause = '';
  logs: string[] = [];
  fx: Fx[] = [];
  known = new Set<string>();
  alias: Record<string, string> = {};
  floorSerial = 0;
  private nextId = 1;
  private spawnTimer = 70;
  private monField = new Int16Array(W * H);
  private queue = new Int32Array(W * H);

  constructor(charId: CharId, seed: number, opts: { trackSeen?: boolean; startFloor?: number } = {}) {
    this.rng = new Rng(seed);
    this.charId = charId;
    this.trackSeen = opts.trackSeen ?? false;
    this.setupAliases();
    this.setupPlayer();
    this.newFloor(opts.startFloor ?? 1);
  }

  // ---------------- 初期化 ----------------
  private setupAliases() {
    const kinds: ItemKind[] = ['herb', 'scroll', 'wand', 'weapon', 'shield'];
    for (const kind of kinds) {
      const effects = EFFECTS.filter((e) => e.kind === kind);
      const names = this.rng.shuffle([...ALIAS_POOL[kind]]);
      effects.forEach((e, i) => {
        this.alias[`${kind}:${e.id}`] = names[i % names.length];
      });
    }
    for (const e of EFFECTS) if (e.kind === 'food') this.known.add(`food:${e.id}`);
    this.known.add('herb:heal');
    this.known.add('weapon:wood');
    this.known.add('shield:wood');
  }

  private setupPlayer() {
    const c = CHARS[this.charId];
    this.player = {
      charId: this.charId, x: 0, y: 0, dx: 0, dy: 1,
      hp: c.hp, maxHp: c.hp, atk: c.atk, def: c.def, level: 1, exp: 0,
      fullness: MAX_FULLNESS, mp: c.mp, maxMp: c.mp, inv: [],
      weapon: this.makeItem('weapon', 'wood'), shield: this.makeItem('shield', 'wood'),
      sleep: 0, transform: 0, tempoSkipped: false, abilityCd: 0, infoTurns: 0,
    };
    this.player.inv.push(this.makeItem('food', 'onigiri'), this.makeItem('food', 'onigiri'));
    this.player.inv.push(this.makeItem('herb', 'heal'), this.makeItem('herb', 'heal'));
  }

  makeItem(kind: ItemKind, effect: string): Item {
    const it: Item = { id: this.nextId++, kind, effect };
    if (kind === 'wand') it.charges = this.rng.int(3, 5);
    return it;
  }

  newFloor(f: number) {
    this.floor = f;
    this.floorSerial++;
    this.floorTurn = 0;
    this.map = generateFloor(this.rng, f, MAX_FLOOR);
    this.tiles = this.map.tiles;
    this.seen.fill(0);
    this.monsters = [];
    this.traps = [];
    this.floorItems = [];
    this.spawnTimer = 70;
    const p = this.player;
    p.x = this.map.start.x;
    p.y = this.map.start.y;
    this.populate();
    this.updateSeen();
    this.log(f === MAX_FLOOR ? '最深部に着いた。奥に何かの気配がする…' : `${f}階に着いた。`);
  }

  private populate() {
    const f = this.floor;
    const p = this.player;
    // 敵
    if (f === MAX_FLOOR) {
      const room = this.map.rooms[this.map.farRoom];
      const bx = room.x + Math.floor(room.w / 2);
      const by = room.y + Math.floor(room.h / 2);
      this.spawnMonster(BOSS, bx, by);
    }
    const count = (f === MAX_FLOOR ? 4 : 4 + Math.floor(f / 2)) + this.rng.int(0, 2);
    for (let i = 0; i < count; i++) {
      const pos = this.randomFreeTile(6);
      if (!pos) continue;
      const m = this.spawnMonster(this.pickEnemy(), pos.x, pos.y);
      m.dormant = this.rng.chance(0.4);
    }
    // アイテム(食料は各階1個を保証)
    const nItems = this.rng.int(4, 6);
    const pos0 = this.randomFreeTile(0);
    if (pos0) this.floorItems.push({ x: pos0.x, y: pos0.y, item: this.randomItem('food') });
    for (let i = 0; i < nItems; i++) {
      const pos = this.randomFreeTile(0);
      if (pos) this.floorItems.push({ x: pos.x, y: pos.y, item: this.randomItem() });
    }
    // 罠
    const nTraps = 3 + Math.floor(f / 3) + this.rng.int(0, 1);
    for (let i = 0; i < nTraps; i++) {
      const pos = this.randomFreeTile(3);
      if (!pos) continue;
      const kinds = TRAPS.filter((t) => t.id !== 'pit' || f < MAX_FLOOR);
      const kind = this.rng.weighted(kinds).id;
      this.traps.push({ x: pos.x, y: pos.y, kind, revealed: false });
    }
    void p;
  }

  private pickEnemy(): EnemyDef {
    const f = this.floor;
    const pool = ENEMIES.filter((e) => f >= e.min && f <= e.max).map((e) => ({
      e, weight: 1 + (f - e.min) * 0.3,
    }));
    return this.rng.weighted(pool).e;
  }

  spawnMonster(def: EnemyDef, x: number, y: number): Monster {
    const f = this.floor;
    const hp = Math.round(def.hp * (def.id === 'boss' ? 1 : 1 + 0.12 * (f - 1)));
    const atk = Math.round(def.atk * (def.id === 'boss' ? 1 : 1 + 0.09 * (f - 1)));
    const m: Monster = {
      id: this.nextId++, def, hp, maxHp: hp, atk, armor: def.def + (def.id === 'boss' ? 0 : Math.floor(f / 5)),
      x, y, sleep: 0, dormant: false, alerted: def.id === 'boss', fleeing: false, phase: 0, cd: 3, stolen: null, deepSleep: 0,
    };
    this.monsters.push(m);
    return m;
  }

  randomItem(kind?: ItemKind): Item {
    const k = kind ?? this.rng.weighted(KIND_WEIGHTS).kind;
    const eff = this.rng.weighted(EFFECTS.filter((e) => e.kind === k));
    return this.makeItem(k, eff.id);
  }

  /** 空いている床を探す。minDist はプレイヤーからの最小距離。 */
  randomFreeTile(minDist: number): { x: number; y: number } | null {
    const p = this.player;
    for (let i = 0; i < 200; i++) {
      const x = this.rng.int(1, W - 2);
      const y = this.rng.int(1, H - 2);
      if (this.tiles[y * W + x] !== FLOOR) continue;
      if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) < minDist) continue;
      if (this.monsterAt(x, y) || this.itemAt(x, y) || this.trapAt(x, y)) continue;
      if (x === p.x && y === p.y) continue;
      return { x, y };
    }
    return null;
  }

  // ---------------- 基本ヘルパー ----------------
  log(msg: string) {
    this.logs.push(msg);
    if (this.logs.length > 200) this.logs.splice(0, this.logs.length - 200);
  }

  tile(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= W || y >= H) return WALL;
    return this.tiles[y * W + x];
  }

  monsterAt(x: number, y: number): Monster | undefined {
    return this.monsters.find((m) => m.x === x && m.y === y && m.hp > 0);
  }

  itemAt(x: number, y: number): FloorItem | undefined {
    return this.floorItems.find((i) => i.x === x && i.y === y);
  }

  trapAt(x: number, y: number): Trap | undefined {
    return this.traps.find((t) => t.x === x && t.y === y);
  }

  /** 斜め移動・斜め攻撃は壁の角をまたげない */
  canStep(x: number, y: number, dx: number, dy: number): boolean {
    if (this.tile(x + dx, y + dy) === WALL) return false;
    if (dx !== 0 && dy !== 0) {
      if (this.tile(x + dx, y) === WALL || this.tile(x, y + dy) === WALL) return false;
    }
    return true;
  }

  los(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    for (let guard = 0; guard < 100; guard++) {
      if (x === x1 && y === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === x1 && y === y1) return true;
      if (this.tile(x, y) === WALL) return false;
    }
    return false;
  }

  distField(sx: number, sy: number, radius: number, buf?: Int16Array): Int16Array {
    const f = buf ?? new Int16Array(W * H);
    f.fill(-1);
    const q = this.queue;
    let head = 0;
    let tail = 0;
    f[sy * W + sx] = 0;
    q[tail++] = sy * W + sx;
    while (head < tail) {
      const idx = q[head++];
      const d = f[idx];
      if (d >= radius) continue;
      const x = idx % W;
      const y = (idx / W) | 0;
      for (const [dx, dy] of DIRS) {
        if (!this.canStep(x, y, dx, dy)) continue;
        const n = (y + dy) * W + (x + dx);
        if (f[n] >= 0) continue;
        f[n] = d + 1;
        q[tail++] = n;
      }
    }
    return f;
  }

  /** その座標がある部屋の番号。通路(部屋の外)なら -1 */
  roomIndexAt(x: number, y: number): number {
    const rooms = this.map.rooms;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
    }
    return -1;
  }

  canSee(x: number, y: number): boolean {
    const p = this.player;
    if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) > 9) return false;
    return this.los(p.x, p.y, x, y);
  }

  updateSeen() {
    if (!this.trackSeen) return;
    const p = this.player;
    for (let y = Math.max(0, p.y - 9); y <= Math.min(H - 1, p.y + 9); y++) {
      for (let x = Math.max(0, p.x - 9); x <= Math.min(W - 1, p.x + 9); x++) {
        if (this.seen[y * W + x]) continue;
        if (this.los(p.x, p.y, x, y)) this.seen[y * W + x] = 1;
      }
    }
  }

  // ---------------- アイテム名 ----------------
  isKnown(it: Item): boolean {
    return this.known.has(`${it.kind}:${it.effect}`);
  }

  itemName(it: Item): string {
    const known = this.isKnown(it);
    const name = known ? effectOf(it.kind, it.effect).name : this.alias[`${it.kind}:${it.effect}`];
    if (it.kind === 'wand' && known) return `${name}[${it.charges}]`;
    return name;
  }

  itemDesc(it: Item): string {
    return this.isKnown(it) ? effectOf(it.kind, it.effect).desc : '正体不明。使うか装備すると分かる。';
  }

  private identify(it: Item): boolean {
    const key = `${it.kind}:${it.effect}`;
    if (this.known.has(key)) return false;
    this.known.add(key);
    return true;
  }

  weaponBonus(): number {
    const w = this.player.weapon;
    return w ? effectOf('weapon', w.effect).value : 0;
  }

  armor(): number {
    const s = this.player.shield;
    return this.player.def + (s ? effectOf('shield', s.effect).value : 0);
  }

  attackPower(): number {
    const p = this.player;
    const base = p.atk + this.weaponBonus();
    return p.transform > 0 ? base * 1.3 : base;
  }

  private variance(): number {
    return 0.85 + 0.3 * this.rng.next();
  }

  // ---------------- 行動の入口 ----------------
  act(a: Action): boolean {
    if (this.status !== 'playing') return false;
    this.fx = [];
    let used = false;
    switch (a.t) {
      case 'move': used = this.doMove(a.dx, a.dy); break;
      case 'attack': used = this.doAttackFacing(); break;
      case 'wait': used = true; break;
      case 'use': used = this.doUse(a.i, a.dx, a.dy); break;
      case 'drop': used = this.doDrop(a.i); break;
      case 'ability': used = this.doAbility(a.dx, a.dy); break;
      case 'throw': used = this.doThrow(a.i, a.dx, a.dy); break;
      case 'descend': used = this.doDescend(); break;
    }
    if (used && this.status === 'playing') this.endTurn();
    this.updateSeen();
    return used;
  }

  private doMove(dx: number, dy: number): boolean {
    const p = this.player;
    if (dx === 0 && dy === 0) return false;
    p.dx = Math.sign(dx);
    p.dy = Math.sign(dy);
    if (!this.canStep(p.x, p.y, p.dx, p.dy)) return false;
    const nx = p.x + p.dx;
    const ny = p.y + p.dy;
    const m = this.monsterAt(nx, ny);
    if (m) {
      this.playerAttack(m);
      return true;
    }
    p.x = nx;
    p.y = ny;
    this.onArrive();
    return true;
  }

  private doAttackFacing(): boolean {
    const p = this.player;
    if (!this.canStep(p.x, p.y, p.dx, p.dy)) {
      this.log('そこには何もない。');
      return true;
    }
    const m = this.monsterAt(p.x + p.dx, p.y + p.dy);
    if (m) this.playerAttack(m);
    else this.log('空を切った。');
    return true;
  }

  private onArrive() {
    const p = this.player;
    const fi = this.itemAt(p.x, p.y);
    if (fi) {
      if (p.inv.length >= INV_MAX) {
        this.log(`持ち物がいっぱいで ${this.itemName(fi.item)} を拾えない。`);
      } else {
        p.inv.push(fi.item);
        this.floorItems.splice(this.floorItems.indexOf(fi), 1);
        this.log(`${this.itemName(fi.item)} を拾った。`);
      }
    }
    const tr = this.trapAt(p.x, p.y);
    if (tr) this.triggerTrap(tr);
    if (this.tile(p.x, p.y) === STAIRS) this.log('階段がある。(>キーで降りる)');
  }

  private triggerTrap(tr: Trap) {
    const p = this.player;
    tr.revealed = true;
    switch (tr.kind) {
      case 'pit':
        this.log('落とし穴に落ちた!');
        this.damagePlayer(3, '落とし穴');
        if (this.status === 'playing') this.newFloor(this.floor + 1);
        break;
      case 'mine': {
        const d = 12 + this.floor * 2;
        this.log(`地雷が爆発した! ${d}のダメージ!`);
        this.traps.splice(this.traps.indexOf(tr), 1);
        this.damagePlayer(d, '地雷');
        break;
      }
      case 'sleepgas':
        this.log('眠りガスだ! 眠ってしまう…');
        p.sleep = 4;
        break;
      case 'warp': {
        this.log('ワープ罠だ! どこかへ飛ばされた。');
        this.teleportPlayer();
        break;
      }
    }
  }

  private teleportPlayer() {
    const pos = this.randomFreeTile(0);
    if (!pos) return;
    this.player.x = pos.x;
    this.player.y = pos.y;
  }

  private doDescend(): boolean {
    const p = this.player;
    if (this.tile(p.x, p.y) !== STAIRS) {
      this.log('ここに階段はない。');
      return false;
    }
    this.newFloor(this.floor + 1);
    return true;
  }

  /** アイテムを向いた方向へ投げる。当たった敵に効果が出る。 */
  private doThrow(i: number, dx?: number, dy?: number): boolean {
    const p = this.player;
    const it = p.inv[i];
    if (!it) return false;
    if (dx || dy) { p.dx = Math.sign(dx ?? 0); p.dy = Math.sign(dy ?? 0); }
    if (p.dx === 0 && p.dy === 0) return false;
    p.inv.splice(i, 1);
    let lx = p.x;
    let ly = p.y;
    let target: Monster | null = null;
    for (let k = 1; k <= 8; k++) {
      const x = p.x + p.dx * k;
      const y = p.y + p.dy * k;
      if (this.tile(x, y) === WALL) break;
      lx = x;
      ly = y;
      const m = this.monsterAt(x, y);
      if (m) { target = m; break; }
    }
    this.fx.push({ type: 'throw', x: p.x, y: p.y, x2: lx, y2: ly });
    const name = this.itemName(it);
    if (!target) {
      this.log(`${name}を投げた。`);
      this.placeItem(it, lx, ly);
      return true;
    }
    this.log(`${name}を投げて、${target.def.name}に当たった!`);
    const eff = effectOf(it.kind, it.effect);
    if (it.kind === 'herb') {
      this.identify(it);
      this.thrownHerb(it.effect, target);
      return true; // 草は砕けて消える
    }
    if (it.kind === 'weapon') {
      const d = Math.max(1, 3 + eff.value - target.armor);
      this.hitMonster(target, d, `${target.def.name}に${d}のダメージ!`);
    } else if (it.kind === 'shield') {
      const d = Math.max(1, 2 - target.armor);
      this.hitMonster(target, d, `${target.def.name}に${d}のダメージ!`);
    } else {
      this.log('しかし、何も起こらなかった。');
    }
    this.placeItem(it, target.x, target.y);
    return true;
  }

  private thrownHerb(id: string, m: Monster) {
    switch (id) {
      case 'heal':
        m.hp = Math.min(m.maxHp, m.hp + 30);
        this.log(`${m.def.name}のHPが回復してしまった!`);
        break;
      case 'superheal':
        m.hp = m.maxHp;
        this.log(`${m.def.name}のHPが全回復してしまった!`);
        break;
      case 'poison':
        this.hitMonster(m, 12, `${m.def.name}は毒を浴びて12のダメージ!`);
        break;
      case 'sleep':
        m.deepSleep = 3;
        this.log(`${m.def.name}は眠り込んだ!(3ターン、殴っても起きない)`);
        break;
      default:
        this.log('しかし、何も起こらなかった。');
    }
  }

  /** 床にアイテムを置く。同じ場所に先客がいれば近くの空きマスへ */
  private placeItem(it: Item, x: number, y: number) {
    if (!this.itemAt(x, y) && this.tile(x, y) !== WALL) {
      this.floorItems.push({ x, y, item: it });
      return;
    }
    for (const [dx, dy] of DIRS) {
      if (!this.canStep(x, y, dx, dy)) continue;
      if (this.itemAt(x + dx, y + dy)) continue;
      this.floorItems.push({ x: x + dx, y: y + dy, item: it });
      return;
    }
    this.log(`${this.itemName(it)}は見えなくなった。`);
  }

  private doDrop(i: number): boolean {
    const p = this.player;
    const it = p.inv[i];
    if (!it) return false;
    if (this.itemAt(p.x, p.y)) {
      this.log('足元にはもう物がある。');
      return false;
    }
    p.inv.splice(i, 1);
    this.floorItems.push({ x: p.x, y: p.y, item: it });
    this.log(`${this.itemName(it)} を置いた。`);
    return true;
  }

  // ---------------- 戦闘 ----------------
  private playerAttack(m: Monster) {
    const p = this.player;
    const dmg = Math.max(1, Math.round(this.attackPower() * this.variance()) - m.armor);
    this.hitMonster(m, dmg, `${m.def.name}に${dmg}のダメージ!`);
    if (p.charId === 'elwin' && dmg > 0) {
      const heal = Math.max(1, Math.ceil(dmg * 0.3));
      if (p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + heal);
        this.fx.push({ type: 'heal', x: p.x, y: p.y, text: `+${heal}` });
      }
    }
  }

  /** ダメージを与えて、死んだら倒した処理まで行う */
  private hitMonster(m: Monster, dmg: number, msg: string) {
    m.hp -= dmg;
    m.dormant = false;
    m.sleep = 0;
    m.alerted = true;
    this.log(msg);
    this.fx.push({ type: 'hit', x: m.x, y: m.y, text: String(dmg) });
    if (m.hp <= 0) this.killMonster(m);
  }

  private killMonster(m: Monster) {
    this.log(`${m.def.name}を倒した!`);
    this.monsters.splice(this.monsters.indexOf(m), 1);
    if (m.stolen) {
      this.floorItems.push({ x: m.x, y: m.y, item: m.stolen });
      this.log(`${this.itemName(m.stolen)} を取り返した!`);
    } else if (m.def.id !== 'boss' && !this.itemAt(m.x, m.y) && this.rng.chance(0.12)) {
      this.floorItems.push({ x: m.x, y: m.y, item: this.randomItem() });
    }
    this.gainExp(m.def.exp + Math.floor(this.floor / 2));
    if (m.def.id === 'boss') {
      this.status = 'clear';
      this.log('試練の竜を倒した! ダンジョンを踏破した!');
    }
  }

  private gainExp(n: number) {
    const p = this.player;
    const c = CHARS[this.charId];
    p.exp += n;
    while (p.level < 30 && p.exp >= expToNext(p.level)) {
      p.exp -= expToNext(p.level);
      p.level++;
      p.maxHp += c.hpUp;
      p.hp = Math.min(p.maxHp, p.hp + c.hpUp);
      p.atk += c.atkUp;
      if (c.mp > 0) {
        p.maxMp += c.mpUp;
        p.mp = Math.min(p.maxMp, p.mp + c.mpUp);
      }
      this.log(`レベルが${p.level}に上がった!`);
    }
  }

  damagePlayer(d: number, cause: string) {
    const p = this.player;
    p.hp -= d;
    this.fx.push({ type: 'hit', x: p.x, y: p.y, text: String(d) });
    if (p.hp <= 0 && this.status === 'playing') {
      p.hp = 0;
      this.status = 'dead';
      this.deathCause = cause;
      this.log(`${CHARS[this.charId].name}は倒れた…(${cause})`);
    }
  }

  // ---------------- アイテム使用 ----------------
  private doUse(i: number, dx?: number, dy?: number): boolean {
    const p = this.player;
    const it = p.inv[i];
    if (!it) return false;
    const eff = effectOf(it.kind, it.effect);
    switch (it.kind) {
      case 'food': {
        p.fullness = Math.min(MAX_FULLNESS, p.fullness + eff.value);
        this.log(`${eff.name}を食べた。満腹度が回復した。`);
        this.removeItem(it);
        return true;
      }
      case 'herb': {
        const newly = this.identify(it);
        this.removeItem(it);
        this.useHerb(it.effect, eff.value, newly);
        return true;
      }
      case 'scroll': {
        const newly = this.identify(it);
        this.removeItem(it);
        this.log(`${eff.name}を読んだ。${newly ? '(正体が分かった)' : ''}`);
        this.useScroll(it.effect, eff.value);
        return true;
      }
      case 'wand': {
        if (dx || dy) { p.dx = Math.sign(dx ?? 0); p.dy = Math.sign(dy ?? 0); }
        if ((it.charges ?? 0) <= 0) {
          this.log('杖を振ったが何も起こらなかった。');
          return true;
        }
        it.charges = (it.charges ?? 0) - 1;
        const newly = this.identify(it);
        this.log(`${eff.name}を振った。${newly ? '(正体が分かった)' : ''}`);
        this.useWand(it.effect, eff.value);
        return true;
      }
      case 'weapon':
      case 'shield':
        return this.equip(it);
    }
  }

  private removeItem(it: Item) {
    const inv = this.player.inv;
    const idx = inv.indexOf(it);
    if (idx >= 0) inv.splice(idx, 1);
  }

  private equip(it: Item): boolean {
    const p = this.player;
    const slot = it.kind === 'weapon' ? 'weapon' : 'shield';
    const cur = p[slot];
    if (cur && cur.effect === 'cursed') {
      this.log('呪われていて、装備を外せない! お祓いの巻物で解ける。');
      return false;
    }
    this.removeItem(it);
    if (cur) p.inv.push(cur);
    p[slot] = it;
    this.identify(it);
    const eff = effectOf(it.kind, it.effect);
    this.log(`${eff.name}を装備した。`);
    if (it.effect === 'cursed') this.log('しまった、呪われていた! お祓いの巻物で解ける。');
    return true;
  }

  private useHerb(id: string, value: number, newly: boolean) {
    const p = this.player;
    const tag = newly ? '(正体が分かった)' : '';
    switch (id) {
      case 'heal':
        p.hp = Math.min(p.maxHp, p.hp + value);
        this.log(`回復草だ。HPが回復した。${tag}`);
        this.fx.push({ type: 'heal', x: p.x, y: p.y, text: `+${value}` });
        break;
      case 'superheal':
        p.maxHp += 3;
        p.hp = p.maxHp;
        this.log(`特効草だ! HPが全回復し、最大HPが増えた。${tag}`);
        break;
      case 'poison':
        p.hp = Math.max(1, p.hp - value);
        p.fullness = Math.max(0, p.fullness - 100);
        this.log(`毒草だ! 体がしびれる…。${tag}`);
        break;
      case 'sleep':
        p.sleep = 3;
        this.log(`睡眠草だ! 眠ってしまう…${tag}`);
        break;
      case 'eye':
        for (const t of this.traps) t.revealed = true;
        this.log(`目薬草だ。罠が見えるようになった。${tag}`);
        break;
    }
  }

  private useScroll(id: string, value: number) {
    const p = this.player;
    switch (id) {
      case 'map':
        this.seen.fill(1);
        this.log('このフロアの地形が頭に入った。');
        break;
      case 'warp':
        this.teleportPlayer();
        this.log('どこかへ飛ばされた。');
        this.onArrive();
        break;
      case 'sleep':
        for (const m of this.monsters) {
          if (Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) <= 8 && this.los(p.x, p.y, m.x, m.y)) {
            m.sleep = value;
          }
        }
        this.log('周囲の敵が眠りに落ちた。');
        break;
      case 'purify': {
        let n = 0;
        for (const it of [p.weapon, p.shield, ...p.inv]) {
          if (it && it.effect === 'cursed') { it.effect = 'wood'; n++; }
        }
        this.log(n > 0 ? `呪いが解けた!(${n}個)呪われた装備は普通の木の装備になった。` : '呪われた物は何もなかった。');
        break;
      }
      case 'fire': {
        this.fx.push({ type: 'fire', x: p.x, y: p.y });
        for (const m of this.monsters.slice()) {
          if (Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) <= 3 && this.los(p.x, p.y, m.x, m.y)) {
            this.hitMonster(m, value, `${m.def.name}は炎に包まれ${value}のダメージ!`);
          }
        }
        break;
      }
    }
  }

  /** プレイヤーの向きに直線を伸ばして最初に当たる敵を返す */
  private rayTarget(range: number): Monster | null {
    const p = this.player;
    for (let i = 1; i <= range; i++) {
      const x = p.x + p.dx * i;
      const y = p.y + p.dy * i;
      if (this.tile(x, y) === WALL) return null;
      const m = this.monsterAt(x, y);
      if (m) return m;
    }
    return null;
  }

  private useWand(id: string, value: number) {
    const p = this.player;
    const m = this.rayTarget(8);
    if (!m) {
      this.log('しかし、何も起こらなかった。');
      return;
    }
    this.fx.push({ type: 'bolt', x: p.x, y: p.y, x2: m.x, y2: m.y });
    switch (id) {
      case 'bolt':
        this.hitMonster(m, value, `${m.def.name}に雷が落ち${value}のダメージ!`);
        break;
      case 'sleep':
        m.sleep = value;
        this.log(`${m.def.name}は眠り込んだ。`);
        break;
      case 'knock': {
        const pos = this.randomFreeTile(0);
        if (pos) { m.x = pos.x; m.y = pos.y; m.alerted = false; }
        this.log(`${m.def.name}はどこかへ飛ばされた。`);
        break;
      }
      case 'heal':
        m.hp = m.maxHp;
        this.log(`${m.def.name}のHPが全回復してしまった!`);
        break;
    }
  }

  // ---------------- 固有能力 ----------------
  private doAbility(dx?: number, dy?: number): boolean {
    const p = this.player;
    if (dx || dy) { p.dx = Math.sign(dx ?? 0); p.dy = Math.sign(dy ?? 0); }
    switch (p.charId) {
      case 'elwin':
        this.log('エルウィンの能力は常時発動。敵を殴るほどHPが回復する。');
        return false;
      case 'barrage':
        if (p.transform > 0) { this.log('すでに変身している。'); return false; }
        if (p.abilityCd > 0) { this.log(`まだ変身できない。(あと${p.abilityCd}ターン)`); return false; }
        p.transform = BARRAGE_DURATION;
        p.abilityCd = BARRAGE_CD;
        p.tempoSkipped = true; // 変身した行動そのものは通常どおり1ターン消費する
        this.log('バラージは変身した! 攻撃力アップ、2回行動できる!');
        this.fx.push({ type: 'transform', x: p.x, y: p.y });
        return true;
      case 'sion': {
        if (p.mp < SION_COST) { this.log('MPが足りない。'); return false; }
        const m = this.rayTarget(SION_RANGE);
        if (!m) { this.log('その方向に狙える敵がいない。'); return false; }
        p.mp -= SION_COST;
        const raw = (p.atk * 1.6 + 4 + p.level + this.weaponBonus() * 0.5) * this.variance();
        const dmg = Math.max(1, Math.round(raw) - Math.floor(m.armor / 2));
        this.fx.push({ type: 'bolt', x: p.x, y: p.y, x2: m.x, y2: m.y });
        this.hitMonster(m, dmg, `魔法弾が${m.def.name}に命中! ${dmg}のダメージ!`);
        return true;
      }
      case 'fate': {
        const cost = Math.max(3, Math.ceil(p.maxHp * 0.1));
        const targets = this.adjacentMonsters();
        if (targets.length === 0) { this.log('周りに敵がいない。'); return false; }
        if (p.hp <= cost) { this.log('HPが足りなくて使えない。'); return false; }
        this.damagePlayer(cost, '血風の反動');
        this.fx.push({ type: 'sweep', x: p.x, y: p.y });
        this.log(`フェイトはHPを${cost}払い、周囲を薙ぎ払った!`);
        for (const m of targets) {
          if (m.hp <= 0) continue;
          const dmg = Math.max(1, Math.round(this.attackPower() * 1.5 * this.variance()) - m.armor);
          this.hitMonster(m, dmg, `${m.def.name}に${dmg}のダメージ!`);
        }
        return true;
      }
      case 'clayd': {
        if (p.abilityCd > 0) { this.log(`まだ鑑定できない。(あと${p.abilityCd}ターン)`); return false; }
        let n = 0;
        for (const it of p.inv) if (this.identify(it)) n++;
        if (p.weapon && this.identify(p.weapon)) n++;
        if (p.shield && this.identify(p.shield)) n++;
        let t = 0;
        for (const tr of this.traps) {
          if (!tr.revealed && Math.max(Math.abs(tr.x - p.x), Math.abs(tr.y - p.y)) <= 8) {
            tr.revealed = true;
            t++;
          }
        }
        p.infoTurns = CLAYD_INFO_TURNS;
        p.abilityCd = CLAYD_CD;
        p.fullness = Math.max(0, p.fullness - 30);
        this.fx.push({ type: 'identify', x: p.x, y: p.y });
        this.log(`鑑定した。正体が分かった物:${n}個、見つけた罠:${t}個。敵の能力も見える。`);
        return true;
      }
    }
  }

  adjacentMonsters(): Monster[] {
    const p = this.player;
    const out: Monster[] = [];
    for (const [dx, dy] of DIRS) {
      if (!this.canStep(p.x, p.y, dx, dy)) continue;
      const m = this.monsterAt(p.x + dx, p.y + dy);
      if (m) out.push(m);
    }
    return out;
  }

  abilityReady(): boolean {
    const p = this.player;
    switch (p.charId) {
      case 'barrage': return p.transform === 0 && p.abilityCd === 0;
      case 'clayd': return p.abilityCd === 0;
      case 'sion': return p.mp >= SION_COST;
      case 'fate': return p.hp > Math.max(3, Math.ceil(p.maxHp * 0.1));
      default: return false;
    }
  }

  // ---------------- ターン進行 ----------------
  private endTurn() {
    const p = this.player;
    // バラージの変身中は、プレイヤー2行動につき世界が1ターン進む(2回行動)
    if (p.sleep === 0 && p.transform > 0 && !p.tempoSkipped) {
      p.tempoSkipped = true;
      return;
    }
    p.tempoSkipped = false;
    this.tickWorld();
    let guard = 0;
    while (p.sleep > 0 && this.status === 'playing' && guard++ < 50) {
      p.sleep--;
      this.log('ぐーぐー…眠っている。');
      this.tickWorld();
    }
  }

  private tickWorld() {
    const p = this.player;
    this.turn++;
    this.floorTurn++;
    this.monstersAct();
    if (this.status !== 'playing') return;
    // 満腹度
    p.fullness = Math.max(0, p.fullness - 1);
    if (p.fullness === 200) this.log('お腹がすいてきた…');
    if (p.fullness === 100) this.log('お腹がぺこぺこだ!');
    if (p.fullness === 0) {
      this.damagePlayer(1, '空腹');
      if (this.turn % 5 === 0 && this.status === 'playing') this.log('空腹で体力が減っていく…');
    } else if (this.turn % 6 === 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp / 30));
    }
    if (p.maxMp > 0 && this.turn % 4 === 0) p.mp = Math.min(p.maxMp, p.mp + 1);
    if (p.transform > 0) {
      p.transform--;
      if (p.transform === 0) { this.log('変身が解けた。'); p.tempoSkipped = false; }
    }
    if (p.abilityCd > 0) p.abilityCd--;
    if (p.infoTurns > 0) p.infoTurns--;
    // 新しい敵の出現(居座り防止)
    if (--this.spawnTimer <= 0) {
      this.spawnTimer = 70;
      if (this.monsters.length < 14) {
        const pos = this.randomFreeTile(9);
        if (pos) this.spawnMonster(this.pickEnemy(), pos.x, pos.y);
      }
    }
  }

  private monstersAct() {
    const p = this.player;
    let field: Int16Array | null = null;
    for (const m of this.monsters.slice()) {
      if (this.status !== 'playing') return;
      if (m.hp <= 0) continue;
      if (m.deepSleep > 0) { m.deepSleep--; continue; }
      if (m.sleep > 0) { m.sleep--; continue; }
      const d = Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y));
      if (m.dormant) {
        if (d <= 3 && this.los(m.x, m.y, p.x, p.y)) m.dormant = false;
        else continue;
      }
      if (m.def.ai === 'slow') {
        m.phase ^= 1;
        if (m.phase === 1) continue;
      }
      if (d > 16) continue;
      if (!field) field = this.distField(p.x, p.y, 16, this.monField);
      const fv = field[m.y * W + m.x];
      if (fv >= 0 && fv <= 9 && this.los(m.x, m.y, p.x, p.y)) m.alerted = true;
      else if (fv < 0 || fv > 14) m.alerted = false;
      if (!m.alerted) {
        if (this.rng.chance(0.4)) this.randomStep(m);
        continue;
      }
      if (m.fleeing) { this.fleeStep(m, field); continue; }
      this.monsterTurn(m, d, field);
    }
  }

  private isAligned(m: Monster): boolean {
    const p = this.player;
    const dx = Math.abs(p.x - m.x);
    const dy = Math.abs(p.y - m.y);
    return dx === 0 || dy === 0 || dx === dy;
  }

  private monsterTurn(m: Monster, d: number, field: Int16Array) {
    const p = this.player;
    const ai = m.def.ai;
    const adj = d === 1 && this.canStep(m.x, m.y, Math.sign(p.x - m.x), Math.sign(p.y - m.y));
    if (adj) { this.monsterMelee(m); return; }
    // 遠距離攻撃は、同じ部屋にいる間(通路どうしの場合も)だけ撃てる。部屋を出れば逃げられる。
    const lineOk = d >= 2 && this.isAligned(m) && this.los(m.x, m.y, p.x, p.y) && this.canSee(m.x, m.y) &&
      this.roomIndexAt(m.x, m.y) === this.roomIndexAt(p.x, p.y);
    if ((ai === 'ranged' || ai === 'mage') && lineOk && d <= m.def.range) {
      this.fx.push({ type: 'bolt', x: m.x, y: m.y, x2: p.x, y2: p.y });
      if (ai === 'ranged') this.hitPlayer(m, 1, false, `${m.def.name}の矢が飛んできた!`);
      else this.hitPlayer(m, 1, true, `${m.def.name}の魔法が飛んできた!`);
      return;
    }
    if (ai === 'boss') {
      m.cd--;
      if (m.cd <= 0 && lineOk && d <= m.def.range) {
        m.cd = 5;
        this.fx.push({ type: 'breath', x: m.x, y: m.y, x2: p.x, y2: p.y });
        this.hitPlayer(m, 0.8, true, '竜が炎を吐いた!');
        return;
      }
    }
    if (ai === 'erratic' && this.rng.chance(0.4)) { this.randomStep(m); return; }
    this.chaseStep(m, field);
  }

  private monsterMelee(m: Monster) {
    const p = this.player;
    if (m.def.ai === 'thief' && p.inv.length > 0 && !m.stolen) {
      const it = p.inv[this.rng.int(0, p.inv.length - 1)];
      p.inv.splice(p.inv.indexOf(it), 1);
      m.stolen = it;
      m.fleeing = true;
      this.log(`${m.def.name}に ${this.itemName(it)} を盗まれた!`);
      return;
    }
    const hit = this.hitPlayer(m, 1, false, `${m.def.name}の攻撃!`);
    if (hit && m.def.ai === 'moth' && p.sleep === 0 && this.status === 'playing' && this.rng.chance(0.2)) {
      p.sleep = 3;
      this.log('鱗粉を浴びて眠ってしまった…');
    }
  }

  /** プレイヤーへの攻撃。命中したら true */
  private hitPlayer(m: Monster, mult: number, ignoreArmor: boolean, msg: string): boolean {
    const p = this.player;
    const ev = CHARS[p.charId].evasion;
    if (ev > 0 && this.rng.chance(ev)) {
      this.log(`${msg} …しかしかわした!`);
      return false;
    }
    const armor = ignoreArmor ? Math.floor(this.armor() / 2) : this.armor();
    const dmg = Math.max(1, Math.round(m.atk * mult * this.variance()) - armor);
    this.log(`${msg} ${dmg}のダメージ!`);
    this.damagePlayer(dmg, m.def.name);
    return true;
  }

  private occupied(x: number, y: number): boolean {
    const p = this.player;
    return (p.x === x && p.y === y) || !!this.monsterAt(x, y);
  }

  private chaseStep(m: Monster, field: Int16Array) {
    const cur = field[m.y * W + m.x];
    let best = -1;
    let bx = m.x;
    let by = m.y;
    let bv = cur < 0 ? 9999 : cur;
    for (const [dx, dy] of DIRS) {
      if (!this.canStep(m.x, m.y, dx, dy)) continue;
      const nx = m.x + dx;
      const ny = m.y + dy;
      if (this.occupied(nx, ny)) continue;
      const v = field[ny * W + nx];
      if (v >= 0 && v < bv) { bv = v; bx = nx; by = ny; best = v; }
    }
    if (best >= 0) { m.x = bx; m.y = by; }
  }

  private fleeStep(m: Monster, field: Int16Array) {
    let bx = m.x;
    let by = m.y;
    let bv = field[m.y * W + m.x];
    if (bv < 0) bv = 0;
    for (const [dx, dy] of DIRS) {
      if (!this.canStep(m.x, m.y, dx, dy)) continue;
      const nx = m.x + dx;
      const ny = m.y + dy;
      if (this.occupied(nx, ny)) continue;
      const v = field[ny * W + nx];
      const vv = v < 0 ? 99 : v;
      if (vv > bv) { bv = vv; bx = nx; by = ny; }
    }
    m.x = bx;
    m.y = by;
  }

  private randomStep(m: Monster) {
    const [dx, dy] = this.rng.pick(DIRS);
    if (!this.canStep(m.x, m.y, dx, dy)) return;
    const nx = m.x + dx;
    const ny = m.y + dy;
    if (this.occupied(nx, ny)) return;
    m.x = nx;
    m.y = ny;
  }
}

export { DIRS };
