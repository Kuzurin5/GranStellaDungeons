// ゲームデータ(キャラ・アイテム・敵・罠)。数値の理由は DESIGN.md に記録。

export const MAX_FLOOR = 10;
export const INV_MAX = 20;
export const MAX_FULLNESS = 200;

export type CharId = 'elwin' | 'barrage' | 'sion' | 'fate' | 'clayd';
export const CHAR_IDS: CharId[] = ['elwin', 'barrage', 'sion', 'fate', 'clayd'];

export interface CharDef {
  id: CharId;
  name: string;
  role: string;
  glyph: string;
  color: number;
  hp: number;
  hpUp: number;
  atk: number;
  atkUp: number;
  def: number;
  mp: number;
  mpUp: number;
  abilityName: string;
  abilityDesc: string;
  evasion: number;
}

export const CHARS: Record<CharId, CharDef> = {
  elwin: {
    id: 'elwin', name: 'エルウィン', role: '持久型の近接', glyph: 'エ', color: 0x4da3ff,
    hp: 62, hpUp: 8, atk: 6.5, atkUp: 1.0, def: 1, mp: 0, mpUp: 0, evasion: 0,
    abilityName: '不屈の剣(常時)',
    abilityDesc: '与えたダメージの一部がHPとして回復する。殴り続けるほど崩れにくい。',
  },
  barrage: {
    id: 'barrage', name: 'バラージ', role: 'バランス型・瞬間火力', glyph: 'バ', color: 0xff8a3d,
    hp: 54, hpUp: 7, atk: 7.5, atkUp: 1.1, def: 1, mp: 0, mpUp: 0, evasion: 0,
    abilityName: '変身(Fキー)',
    abilityDesc: '8ターン変身し、攻撃力が上がって2回行動できる。使用後28ターンは再使用不可。',
  },
  sion: {
    id: 'sion', name: 'シオン', role: '魔法の遠距離', glyph: 'シ', color: 0xb36bff,
    hp: 38, hpUp: 5, atk: 5, atkUp: 0.9, def: 0, mp: 15, mpUp: 1, evasion: 0,
    abilityName: '魔法弾(Fキー)',
    abilityDesc: '向いている方向の直線上(7マス)の敵に高威力の魔法を撃つ。MPを3使う。打たれ弱い。',
  },
  fate: {
    id: 'fate', name: 'フェイト', role: 'スピード型の前衛・ハイリスク', glyph: 'フ', color: 0xff4d6d,
    hp: 58, hpUp: 8, atk: 9, atkUp: 1.2, def: 0, mp: 0, mpUp: 0, evasion: 0.2,
    abilityName: '血風(Fキー)',
    abilityDesc: 'HPを最大HPの1割ほど払い、周囲8マスの敵をまとめて斬る。素早く、攻撃を20%かわす。',
  },
  clayd: {
    id: 'clayd', name: 'クレイド', role: '情報・補助', glyph: 'ク', color: 0x4dd6a8,
    hp: 60, hpUp: 8, atk: 7, atkUp: 1.1, def: 1, mp: 0, mpUp: 0, evasion: 0,
    abilityName: '鑑定(Fキー)',
    abilityDesc: '持ち物の未鑑定品を全て鑑定し、周囲の罠を見つけ、敵の能力を40ターン表示する。使用後12ターンは再使用不可。',
  },
};

export const BARRAGE_DURATION = 8;
export const BARRAGE_CD = 28;
export const SION_COST = 3;
export const SION_RANGE = 7;
export const CLAYD_CD = 12;
export const CLAYD_INFO_TURNS = 40;

// ---------------- アイテム ----------------
export type ItemKind = 'herb' | 'food' | 'scroll' | 'wand' | 'weapon' | 'shield';

export interface Effect {
  kind: ItemKind;
  id: string;
  name: string;
  weight: number;
  value: number;
  desc: string;
}

export const EFFECTS: Effect[] = [
  { kind: 'herb', id: 'heal', name: '回復草', weight: 10, value: 30, desc: 'HPを30回復する' },
  { kind: 'herb', id: 'superheal', name: '特効草', weight: 3, value: 0, desc: 'HPが全回復し、最大HPが3増える' },
  { kind: 'herb', id: 'poison', name: '毒草', weight: 4, value: 8, desc: 'HPが8減り、満腹度も下がる' },
  { kind: 'herb', id: 'eye', name: '目薬草', weight: 4, value: 0, desc: 'このフロアの罠が全て見える' },

  { kind: 'food', id: 'onigiri', name: 'おにぎり', weight: 10, value: 80, desc: '満腹度が80回復する' },
  { kind: 'food', id: 'big', name: '大きなおにぎり', weight: 3, value: 160, desc: '満腹度が160回復する' },
  { kind: 'food', id: 'jerky', name: '干し肉', weight: 5, value: 50, desc: '満腹度が50回復する' },

  { kind: 'scroll', id: 'map', name: '地図の巻物', weight: 6, value: 0, desc: 'このフロアの地形が全て分かる' },
  { kind: 'scroll', id: 'warp', name: '瞬間移動の巻物', weight: 5, value: 0, desc: 'フロア内のどこかへ飛ぶ' },
  { kind: 'scroll', id: 'sleep', name: '眠りの巻物', weight: 5, value: 10, desc: '周囲の敵を10ターン眠らせる' },
  { kind: 'scroll', id: 'fire', name: '炎の巻物', weight: 5, value: 18, desc: '周囲3マスの敵に18ダメージ' },

  { kind: 'wand', id: 'bolt', name: '雷の杖', weight: 6, value: 16, desc: '前方の敵に16ダメージ' },
  { kind: 'wand', id: 'sleep', name: '眠りの杖', weight: 5, value: 15, desc: '前方の敵を15ターン眠らせる' },
  { kind: 'wand', id: 'knock', name: '飛ばしの杖', weight: 5, value: 0, desc: '前方の敵をどこかへ飛ばす' },
  { kind: 'wand', id: 'heal', name: '回復の杖', weight: 3, value: 0, desc: '前方の敵のHPを全回復してしまう(ハズレ)' },

  { kind: 'weapon', id: 'wood', name: '木の剣', weight: 6, value: 2, desc: '攻撃力+2' },
  { kind: 'weapon', id: 'iron', name: '鉄の剣', weight: 5, value: 4, desc: '攻撃力+4' },
  { kind: 'weapon', id: 'light', name: '光の剣', weight: 2, value: 7, desc: '攻撃力+7' },
  { kind: 'weapon', id: 'cursed', name: '呪いの剣', weight: 3, value: 0, desc: '攻撃力+0。呪われていて外せない' },

  { kind: 'shield', id: 'wood', name: '木の盾', weight: 6, value: 1, desc: '防御力+1' },
  { kind: 'shield', id: 'iron', name: '鉄の盾', weight: 5, value: 2, desc: '防御力+2' },
  { kind: 'shield', id: 'mithril', name: 'ミスリルの盾', weight: 2, value: 4, desc: '防御力+4' },
  { kind: 'shield', id: 'cursed', name: '呪いの盾', weight: 3, value: 0, desc: '防御力+0。呪われていて外せない' },
];

export function effectOf(kind: ItemKind, id: string): Effect {
  const e = EFFECTS.find((x) => x.kind === kind && x.id === id);
  if (!e) throw new Error(`unknown effect ${kind}:${id}`);
  return e;
}

export const ALIAS_POOL: Record<ItemKind, string[]> = {
  herb: ['青い草', '赤い草', '黄色い草', '白い草', '黒い草'],
  food: [],
  scroll: ['古びた巻物', '金の巻物', '銀の巻物', '赤い巻物', '青い巻物'],
  wand: ['木の杖', '鉄の杖', '骨の杖', '銅の杖', '銀の杖'],
  weapon: ['さびた剣', '黒い剣', '細い剣', '重い剣', '古い剣'],
  shield: ['丸い盾', '四角い盾', '黒い盾', '古い盾', '大きな盾'],
};

export const KIND_WEIGHTS: { kind: ItemKind; weight: number }[] = [
  { kind: 'herb', weight: 26 },
  { kind: 'food', weight: 10 },
  { kind: 'scroll', weight: 18 },
  { kind: 'wand', weight: 10 },
  { kind: 'weapon', weight: 13 },
  { kind: 'shield', weight: 13 },
];

// ---------------- 罠 ----------------
export type TrapKind = 'pit' | 'mine' | 'sleepgas' | 'warp';
export const TRAPS: { id: TrapKind; name: string; weight: number }[] = [
  { id: 'pit', name: '落とし穴', weight: 3 },
  { id: 'mine', name: '地雷', weight: 3 },
  { id: 'sleepgas', name: '眠りガス', weight: 3 },
  { id: 'warp', name: 'ワープ罠', weight: 2 },
];

// ---------------- 敵 ----------------
export type EnemyAi = 'melee' | 'erratic' | 'ranged' | 'mage' | 'thief' | 'moth' | 'slow' | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  glyph: string;
  color: number;
  hp: number;
  atk: number;
  def: number;
  exp: number;
  min: number;
  max: number;
  ai: EnemyAi;
  range: number;
  note: string;
}

export const ENEMIES: EnemyDef[] = [
  { id: 'slime', name: 'スライム', glyph: '🟢', color: 0x4ade80, hp: 8, atk: 4, def: 0, exp: 4, min: 1, max: 4, ai: 'melee', range: 0, note: '単純に追ってくる' },
  { id: 'bat', name: 'コウモリ', glyph: '🦇', color: 0x8b8ba7, hp: 7, atk: 4, def: 0, exp: 5, min: 1, max: 5, ai: 'erratic', range: 0, note: '不規則に飛び回る' },
  { id: 'goblin', name: 'ゴブリン', glyph: '👺', color: 0xe05a47, hp: 16, atk: 6, def: 1, exp: 8, min: 2, max: 7, ai: 'melee', range: 0, note: '丈夫な近接型' },
  { id: 'thief', name: 'どろぼう', glyph: '🦝', color: 0xc9a227, hp: 14, atk: 3, def: 0, exp: 9, min: 3, max: 8, ai: 'thief', range: 0, note: '持ち物を盗んで逃げる' },
  { id: 'archer', name: '弓兵', glyph: '🏹', color: 0xd4a373, hp: 14, atk: 6, def: 0, exp: 10, min: 4, max: 9, ai: 'ranged', range: 5, note: '直線上から矢を撃つ' },
  { id: 'moth', name: '眠り蛾', glyph: '🦋', color: 0x7dd3fc, hp: 16, atk: 5, def: 0, exp: 11, min: 5, max: 10, ai: 'moth', range: 0, note: '攻撃で眠らせてくる' },
  { id: 'mage', name: '魔術師', glyph: '🧙', color: 0xa78bfa, hp: 15, atk: 7, def: 0, exp: 13, min: 6, max: 10, ai: 'mage', range: 4, note: '防御を無視する魔法を撃つ' },
  { id: 'golem', name: 'ゴーレム', glyph: '🗿', color: 0x9ca3af, hp: 40, atk: 11, def: 3, exp: 18, min: 7, max: 10, ai: 'slow', range: 0, note: '2ターンに1回しか動かないが硬い' },
];

export const BOSS: EnemyDef = {
  id: 'boss', name: '試練の竜', glyph: '🐉', color: 0xf43f5e, hp: 170, atk: 15, def: 3, exp: 300,
  min: 10, max: 10, ai: 'boss', range: 5, note: '近づくと殴り、離れると炎を吐く',
};

export function expToNext(level: number): number {
  return 10 + 9 * (level - 1);
}
