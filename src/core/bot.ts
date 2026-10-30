// 簡易ボット。マップ全体を知っていてよい前提で、階段に向かって進む。
import { effectOf, CharId, SION_COST, MAX_FLOOR } from './data';
import { Action, DIRS, Game, Item } from './game';
import { W, H } from './mapgen';

export interface BotState {
  serial: number;
  stairsField: Int16Array | null;
  bossField: Int16Array;
  itemField: Int16Array;
}

export function newBotState(): BotState {
  return { serial: -1, stairsField: null, bossField: new Int16Array(W * H), itemField: new Int16Array(W * H) };
}

function findHeal(g: Game): Item | undefined {
  const inv = g.player.inv;
  return (
    inv.find((i) => i.kind === 'herb' && g.isKnown(i) && (i.effect === 'heal' || i.effect === 'superheal'))
  );
}

function rayHit(g: Game, dx: number, dy: number, range: number) {
  const p = g.player;
  for (let i = 1; i <= range; i++) {
    const x = p.x + dx * i;
    const y = p.y + dy * i;
    if (g.tile(x, y) === 0) return null;
    const m = g.monsterAt(x, y);
    if (m) return m;
  }
  return null;
}

/** 1回分の行動を決める */
export function botAct(g: Game, st: BotState): Action {
  const p = g.player;
  const adj = g.adjacentMonsters();

  // 回復
  if (p.hp < p.maxHp * 0.45) {
    const h = findHeal(g);
    if (h) return { t: 'use', i: p.inv.indexOf(h) };
  }
  if (p.hp < p.maxHp * 0.25) {
    const h = p.inv.find((i) => i.kind === 'herb' && !g.isKnown(i));
    if (h) return { t: 'use', i: p.inv.indexOf(h) };
  }
  // 食事
  if (p.fullness <= 100) {
    const f = p.inv.find((i) => i.kind === 'food');
    if (f) return { t: 'use', i: p.inv.indexOf(f) };
  }
  // 装備(未鑑定の武器・盾は一度試す。木より良さそうなら替える)
  for (const it of p.inv) {
    if (it.kind !== 'weapon' && it.kind !== 'shield') continue;
    const cur = it.kind === 'weapon' ? p.weapon : p.shield;
    if (cur && cur.effect === 'cursed') continue;
    if (!g.isKnown(it)) {
      if (cur && cur.effect === 'wood') return { t: 'use', i: p.inv.indexOf(it) };
      continue;
    }
    const nv = effectOf(it.kind, it.effect).value;
    const cv = cur ? effectOf(cur.kind, cur.effect).value : 0;
    if (nv > cv && it.effect !== 'cursed') return { t: 'use', i: p.inv.indexOf(it) };
  }

  // 固有能力の使用ルール
  const id: CharId = p.charId;
  if (id === 'barrage' && g.abilityReady() && adj.length > 0) {
    const tough = adj.length >= 2 || adj.some((m) => m.hp >= 20 || m.def.id === 'boss');
    if (tough) return { t: 'ability' };
  }
  if (id === 'sion' && p.mp >= SION_COST) {
    for (const [dx, dy] of DIRS) {
      const m = rayHit(g, dx, dy, 7);
      if (m && (adj.length === 0 || m.hp > 8)) return { t: 'ability', dx, dy };
    }
  }
  if (id === 'fate' && adj.length > 0 && g.abilityReady()) {
    const cost = Math.max(3, Math.ceil(p.maxHp * 0.1));
    const need = adj.length >= 3 || (adj.length >= 2 && p.hp > p.maxHp * 0.6) ||
      adj.some((m) => m.def.id === 'boss' || m.hp >= 30);
    if (need && p.hp - cost > p.maxHp * 0.35) return { t: 'ability' };
  }
  if (id === 'clayd' && p.abilityCd === 0) {
    const unknown = p.inv.some((i) => !g.isKnown(i));
    if (unknown) return { t: 'ability' };
  }

  // 隣の敵を攻撃(HPが低いものから)
  if (adj.length > 0) {
    adj.sort((a, b) => a.hp - b.hp);
    const t = adj[0];
    return { t: 'move', dx: t.x - p.x, dy: t.y - p.y };
  }

  // 階段・ボスへ向かう
  if (g.tile(p.x, p.y) === 2) return { t: 'descend' };

  if (st.serial !== g.floorSerial) {
    st.serial = g.floorSerial;
    st.stairsField = g.map.stairs ? g.distField(g.map.stairs.x, g.map.stairs.y, 999) : null;
  }
  let field: Int16Array | null;
  if (g.floor === MAX_FLOOR) {
    const boss = g.monsters.find((m) => m.def.id === 'boss');
    field = boss ? g.distField(boss.x, boss.y, 999, st.bossField) : null;
  } else {
    field = st.stairsField;
  }

  // 近くのアイテムは拾いに行く
  if (p.inv.length < 20 && g.floorItems.length > 0) {
    const pf = g.distField(p.x, p.y, 7, st.itemField);
    let bestD = 99;
    let target: { x: number; y: number } | null = null;
    for (const fi of g.floorItems) {
      const d = pf[fi.y * W + fi.x];
      if (d >= 0 && d < bestD) { bestD = d; target = fi; }
    }
    if (target) {
      const step = stepToward(g, pf, true);
      if (step) return step;
    }
  }
  if (!field) return { t: 'wait' };
  return stepToward(g, field, false) ?? { t: 'wait' };
}

/** field が小さくなる方向へ1歩。reverse=true なら「自分から遠い順の field」(アイテム用)で最寄りへ */
function stepToward(g: Game, field: Int16Array, itemMode: boolean): Action | null {
  const p = g.player;
  if (itemMode) {
    // field はプレイヤー起点の距離。最寄りアイテムまでの経路を辿るため、アイテム起点で再計算する。
    let best: { x: number; y: number } | null = null;
    let bd = 999;
    for (const fi of g.floorItems) {
      const d = field[fi.y * W + fi.x];
      if (d >= 0 && d < bd) { bd = d; best = fi; }
    }
    if (!best) return null;
    field = g.distField(best.x, best.y, 12);
  }
  const cur = field[p.y * W + p.x];
  let best: [number, number] | null = null;
  let bv = cur < 0 ? 9999 : cur;
  let bestRevealed: [number, number] | null = null;
  for (const [dx, dy] of DIRS) {
    if (!g.canStep(p.x, p.y, dx, dy)) continue;
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (g.monsterAt(nx, ny)) continue;
    const v = field[ny * W + nx];
    if (v < 0 || v >= bv) continue;
    const tr = g.trapAt(nx, ny);
    if (tr && tr.revealed) { bestRevealed = [dx, dy]; continue; }
    bv = v;
    best = [dx, dy];
  }
  const pick = best ?? bestRevealed;
  if (!pick) return null;
  return { t: 'move', dx: pick[0], dy: pick[1] };
}

export interface BotResult {
  charId: CharId;
  seed: number;
  cleared: boolean;
  floor: number;
  turns: number;
  timeout: boolean;
  cause: string;
}

export function runBot(charId: CharId, seed: number, maxTurns = 20000): BotResult {
  const g = new Game(charId, seed);
  const st = newBotState();
  let actions = 0;
  let stuck = 0;
  while (g.status === 'playing' && g.turn < maxTurns && actions < maxTurns * 3) {
    actions++;
    const a = botAct(g, st);
    const used = g.act(a);
    if (!used) {
      // 失敗した行動は待機で代用して無限ループを防ぐ
      stuck++;
      g.act({ t: 'wait' });
    }
  }
  void H;
  return {
    charId, seed, cleared: g.status === 'clear', floor: g.floor, turns: g.turn,
    timeout: g.status === 'playing', cause: g.deathCause,
  };
}
