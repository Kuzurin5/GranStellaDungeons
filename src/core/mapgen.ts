import { Rng } from './rng';

export const W = 40;
export const H = 24;
export const WALL = 0;
export const FLOOR = 1;
export const STAIRS = 2;

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorMap {
  w: number;
  h: number;
  tiles: Uint8Array;
  rooms: Room[];
  start: { x: number; y: number };
  stairs: { x: number; y: number } | null;
  startRoom: number;
  farRoom: number;
}

function center(r: Room) {
  return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) };
}

function overlaps(a: Room, b: Room, margin: number) {
  return !(
    a.x + a.w + margin <= b.x || b.x + b.w + margin <= a.x ||
    a.y + a.h + margin <= b.y || b.y + b.h + margin <= a.y
  );
}

function carveCorridor(tiles: Uint8Array, a: { x: number; y: number }, b: { x: number; y: number }, horizFirst: boolean) {
  let { x, y } = a;
  const setF = () => {
    if (tiles[y * W + x] === WALL) tiles[y * W + x] = FLOOR;
  };
  setF();
  const moveH = () => {
    while (x !== b.x) {
      x += Math.sign(b.x - x);
      setF();
    }
  };
  const moveV = () => {
    while (y !== b.y) {
      y += Math.sign(b.y - y);
      setF();
    }
  };
  if (horizFirst) {
    moveH();
    moveV();
  } else {
    moveV();
    moveH();
  }
}

/** 部屋+通路のランダム生成。floor が最終階なら階段なし。 */
export function generateFloor(rng: Rng, floor: number, lastFloor: number): FloorMap {
  for (let attempt = 0; attempt < 50; attempt++) {
    const tiles = new Uint8Array(W * H);
    const rooms: Room[] = [];
    const target = rng.int(6, 8);
    for (let i = 0; i < 80 && rooms.length < target; i++) {
      const w = rng.int(4, 9);
      const h = rng.int(3, 6);
      const x = rng.int(1, W - w - 2);
      const y = rng.int(1, H - h - 2);
      const room = { x, y, w, h };
      if (rooms.some((r) => overlaps(r, room, 2))) continue;
      rooms.push(room);
    }
    if (rooms.length < 5) continue;
    for (const r of rooms) {
      for (let yy = r.y; yy < r.y + r.h; yy++) {
        for (let xx = r.x; xx < r.x + r.w; xx++) tiles[yy * W + xx] = FLOOR;
      }
    }
    // x座標順に並べて順番に接続(必ず全部屋がつながる)。さらに数本の近道を足す。
    const order = rooms.map((_, i) => i).sort((i, j) => center(rooms[i]).x - center(rooms[j]).x);
    for (let k = 0; k + 1 < order.length; k++) {
      carveCorridor(tiles, center(rooms[order[k]]), center(rooms[order[k + 1]]), rng.chance(0.5));
    }
    const extra = rng.int(1, 3);
    for (let k = 0; k < extra; k++) {
      const a = rng.int(0, rooms.length - 1);
      const b = rng.int(0, rooms.length - 1);
      if (a !== b) carveCorridor(tiles, center(rooms[a]), center(rooms[b]), rng.chance(0.5));
    }
    const startRoom = rng.int(0, rooms.length - 1);
    const sc = center(rooms[startRoom]);
    // 開始部屋から遠い部屋(上位半分)のどれかを階段/ボスの部屋にする
    const byDist = rooms
      .map((r, i) => ({ i, d: Math.abs(center(r).x - sc.x) + Math.abs(center(r).y - sc.y) }))
      .filter((o) => o.i !== startRoom)
      .sort((a, b) => b.d - a.d);
    const far = byDist[rng.int(0, Math.max(0, Math.floor(byDist.length / 2) - 1))].i;
    const sr = rooms[startRoom];
    const start = { x: rng.int(sr.x, sr.x + sr.w - 1), y: rng.int(sr.y, sr.y + sr.h - 1) };
    let stairs: { x: number; y: number } | null = null;
    if (floor < lastFloor) {
      const fr = rooms[far];
      stairs = { x: rng.int(fr.x, fr.x + fr.w - 1), y: rng.int(fr.y, fr.y + fr.h - 1) };
      tiles[stairs.y * W + stairs.x] = STAIRS;
    }
    return { w: W, h: H, tiles, rooms, start, stairs, startRoom, farRoom: far };
  }
  throw new Error('map generation failed');
}
