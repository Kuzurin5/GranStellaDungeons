import Phaser from 'phaser';
import { BARRAGE_CD, BOSS, CHARS, CLAYD_CD, ENEMIES, GIMMICKS, INV_MAX, MAX_FLOOR, MAX_FULLNESS, effectOf } from '../core/data';
import { Action, Fx, Game, Item } from '../core/game';
import { DiagInput } from '../core/diag';
import { DOOR, STAIRS, W, H, WALL } from '../core/mapgen';
import { GAME_H, GAME_W, hex, session, txt } from '../ui';

const T = 20;
const MAP_Y = 48;
const PANEL_X = 810;
const LOG_Y = MAP_Y + H * T + 8;

const KIND_GLYPH: Record<string, string> = {
  herb: '🌿', food: '🍙', scroll: '📜', wand: '🪄', weapon: '🗡️', shield: '🛡️', key: '🗝️',
};
const TRAP_GLYPH: Record<string, string> = { pit: '⬇', mine: '✹', sleepgas: '☁', warp: '✦' };

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyX: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  KeyQ: [-1, -1], KeyE: [1, -1], KeyZ: [-1, 1], KeyC: [1, 1],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
  Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
};

export class DungeonScene extends Phaser.Scene {
  dg!: Game;
  private gfx!: Phaser.GameObjects.Graphics;
  private dyn!: Phaser.GameObjects.Container;
  private hud!: Phaser.GameObjects.Container;
  private gfx2!: Phaser.GameObjects.Graphics;
  private menu!: Phaser.GameObjects.Container;
  private menuOpen = false;
  private menuIdx = 0;
  private vis = new Uint8Array(W * H);
  private ending = false;
  private throwIdx: number | null = null;
  private diag = new DiagInput();
  private shiftDownAt = 0;

  constructor() { super('Dungeon'); }

  create() {
    this.dg = new Game(session.charId, session.seed, { trackSeen: true, startFloor: session.startFloor, gimmick: session.gimmick ?? undefined });
    this.ending = false;
    this.menuOpen = false;
    this.menuIdx = 0;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0d14);
    this.gfx = this.add.graphics();
    this.dyn = this.add.container(0, 0);
    this.hud = this.add.container(0, 0);
    this.gfx2 = this.add.graphics();
    this.menu = this.add.container(0, 0);
    this.input.keyboard!.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    this.input.keyboard!.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));
    this.input.keyboard!.on('keyup', (ev: KeyboardEvent) => {
      // Shiftを長押ししていたときは、離したら元のモードに戻す(押している間だけ斜め)
      if ((ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') && performance.now() - this.shiftDownAt > 400) {
        this.diag.toggle();
        this.render();
      }
    });
    this.diag = new DiagInput();
    this.render();
    const w = window as unknown as { __app?: unknown };
    w.__app = {
      scene: this,
      get game() { return (this as { scene: DungeonScene }).scene.dg; },
      act: (a: Action) => this.step(a),
      refresh: () => this.render(),
      data: { ENEMIES, BOSS },
      openMenu: () => { this.menuOpen = true; this.render(); },
    };
  }

  // ---------------- 入力 ----------------
  private onKey(ev: KeyboardEvent) {
    if (this.ending || this.dg.status !== 'playing') return;
    const g = this.dg;
    if (this.throwIdx !== null) {
      const idx = this.throwIdx;
      const d = KEYS[ev.code];
      if (d) { this.throwIdx = null; this.step({ t: 'throw', i: idx, dx: d[0], dy: d[1] }); return; }
      if (ev.code === 'Escape' || ev.code === 'KeyT' || ev.code === 'Backspace') { this.throwIdx = null; this.render(); }
      return;
    }
    if (this.menuOpen) {
      const n = g.player.inv.length;
      if (ev.code === 'ArrowUp') this.menuIdx = (this.menuIdx + n - 1) % Math.max(1, n);
      else if (ev.code === 'ArrowDown') this.menuIdx = (this.menuIdx + 1) % Math.max(1, n);
      else if (ev.code === 'Enter' || ev.code === 'Space') {
        if (n > 0) {
          this.menuOpen = false;
          this.step({ t: 'use', i: this.menuIdx });
          return;
        }
      } else if (ev.code === 'KeyT') {
        if (n > 0) { this.menuOpen = false; this.throwIdx = this.menuIdx; this.render(); return; }
      } else if (ev.code === 'KeyD') {
        if (n > 0) { this.step({ t: 'drop', i: this.menuIdx }); this.menuIdx = Math.min(this.menuIdx, Math.max(0, g.player.inv.length - 1)); return; }
      } else if (ev.code === 'KeyI' || ev.code === 'Escape' || ev.code === 'Backspace') this.menuOpen = false;
      this.render();
      return;
    }
    if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') {
      if (!ev.repeat) { this.shiftDownAt = performance.now(); this.diag.toggle(); this.render(); }
      return;
    }
    const dir = KEYS[ev.code];
    if (dir) {
      const mv = this.diag.press(dir[0], dir[1], performance.now());
      if (mv) this.step({ t: 'move', dx: mv.dx, dy: mv.dy });
      else this.render();
      return;
    }
    if (ev.code === 'Escape' && this.diag.pending) { this.diag.clear(); this.render(); return; }
    switch (ev.code) {
      case 'KeyS': case 'Numpad5': this.step({ t: 'wait' }); break;
      case 'Space': this.step({ t: 'attack' }); break;
      case 'KeyF': this.step({ t: 'ability' }); break;
      case 'KeyI': this.menuOpen = true; this.menuIdx = Math.min(this.menuIdx, Math.max(0, g.player.inv.length - 1)); this.render(); break;
      case 'Enter': case 'Period': this.step({ t: 'descend' }); break;
    }
  }

  step(a: Action) {
    this.diag.clear();
    this.dg.act(a);
    this.render();
    const g = this.dg;
    if (g.status !== 'playing' && !this.ending) {
      this.ending = true;
      session.result = {
        cleared: g.status === 'clear', floor: g.floor, level: g.player.level, turns: g.turn,
        cause: g.deathCause || '不明', charId: g.charId,
      };
      this.time.delayedCall(1400, () => this.scene.start(g.status === 'clear' ? 'Clear' : 'GameOver'));
    }
  }

  // ---------------- 描画 ----------------
  private computeVis() {
    const g = this.dg;
    const p = g.player;
    this.vis.fill(0);
    for (let y = Math.max(0, p.y - 12); y <= Math.min(H - 1, p.y + 12); y++) {
      for (let x = Math.max(0, p.x - 12); x <= Math.min(W - 1, p.x + 12); x++) {
        if (g.canSee(x, y)) this.vis[y * W + x] = 1;
      }
    }
  }

  private render() {
    const g = this.dg;
    const p = g.player;
    this.computeVis();
    this.gfx.clear();
    this.dyn.removeAll(true);
    this.hud.removeAll(true);
    this.menu.removeAll(true);
    this.gfx2.clear();

    // マップ
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!g.seen[i]) continue;
        const v = this.vis[i] === 1;
        const t = g.tiles[i];
        let col: number;
        if (t === WALL) col = v ? 0x3a4160 : 0x232842;
        else if (t === DOOR) col = v ? 0x8a5a2b : 0x5a3b1c;
        else if (t === STAIRS) col = v ? 0xb89b2e : 0x6b5a1c;
        else col = v ? 0x2e3552 : 0x1a1f33;
        this.gfx.fillStyle(col, 1);
        this.gfx.fillRect(x * T, MAP_Y + y * T, T - 1, T - 1);
      }
    }
    // 鍵のかかった扉
    for (const d of g.vault && !g.vault.opened ? g.vault.doors : []) {
      if (!g.seen[d.y * W + d.x]) continue;
      this.dyn.add(txt(this, d.x * T + T / 2, MAP_Y + d.y * T + T / 2, '🔒', 13).setOrigin(0.5));
    }
    // モンスターハウス(鑑定で気配が分かったとき)
    if (g.house && g.house.revealed && !g.house.triggered) {
      const r = g.map.rooms[g.house.room];
      this.gfx.fillStyle(0xff3355, 0.22).fillRect(r.x * T, MAP_Y + r.y * T, r.w * T, r.h * T);
      this.gfx.lineStyle(2, 0xff3355, 0.9).strokeRect(r.x * T, MAP_Y + r.y * T, r.w * T, r.h * T);
      this.dyn.add(txt(this, (r.x + r.w / 2) * T, MAP_Y + (r.y + r.h / 2) * T, '!!', 22, '#ff5577', { fontStyle: 'bold' }).setOrigin(0.5));
    }
    // 噴火の予告マス
    for (const e of g.eruptions) {
      if (!this.vis[e.y * W + e.x]) continue;
      this.gfx.fillStyle(0xff3b1f, 0.55).fillRect(e.x * T, MAP_Y + e.y * T, T - 1, T - 1);
      this.dyn.add(txt(this, e.x * T + T / 2, MAP_Y + e.y * T + T / 2, '!', 15, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    }
    // 階段
    if (g.map.stairs && g.seen[g.map.stairs.y * W + g.map.stairs.x]) {
      this.dyn.add(txt(this, g.map.stairs.x * T + T / 2, MAP_Y + g.map.stairs.y * T + T / 2, '階', 14, '#fff3b0').setOrigin(0.5));
    }
    // 罠(見つけたもの)
    for (const t of g.traps) {
      if (!t.revealed) continue;
      this.dyn.add(txt(this, t.x * T + T / 2, MAP_Y + t.y * T + T / 2, TRAP_GLYPH[t.kind], 15, '#ff7a7a').setOrigin(0.5));
    }
    // アイテム
    for (const fi of g.floorItems) {
      if (!this.vis[fi.y * W + fi.x] && !g.seen[fi.y * W + fi.x]) continue;
      if (!this.vis[fi.y * W + fi.x]) continue;
      this.dyn.add(txt(this, fi.x * T + T / 2, MAP_Y + fi.y * T + T / 2, KIND_GLYPH[fi.item.kind], 14).setOrigin(0.5));
    }
    // 敵
    for (const m of g.monsters) {
      if (!this.vis[m.y * W + m.x]) continue;
      const cx = m.x * T + T / 2;
      const cy = MAP_Y + m.y * T + T / 2;
      if (m.def.id === 'boss') this.gfx.fillStyle(0x7a1d33, 0.7).fillRect(m.x * T - 2, MAP_Y + m.y * T - 2, T + 3, T + 3);
      this.dyn.add(txt(this, cx, cy, m.def.glyph, m.def.id === 'boss' ? 20 : 15).setOrigin(0.5));
      if (m.sleep > 0 || m.deepSleep > 0 || m.dormant) this.dyn.add(txt(this, cx + 8, cy - 10, 'z', 11, '#9db4ff').setOrigin(0.5));
      if (p.infoTurns > 0) {
        this.dyn.add(txt(this, cx, cy + 13, `${m.hp}/${m.maxHp} 攻${m.atk}`, 10, '#ffe08a', { backgroundColor: '#000000aa' }).setOrigin(0.5));
      }
    }
    // プレイヤー
    const c = CHARS[p.charId];
    const px = p.x * T + T / 2;
    const py = MAP_Y + p.y * T + T / 2;
    if (p.transform > 0) this.gfx.fillStyle(0xffd24d, 0.45).fillCircle(px, py, T * 0.85);
    this.gfx.fillStyle(c.color, 1).fillCircle(px, py, T * 0.48);
    this.gfx.fillStyle(0xffffff, 1).fillCircle(px + p.dx * 7, py + p.dy * 7, 2.5);
    this.dyn.add(txt(this, px, py, c.glyph, 12, '#0b0d14', { fontStyle: 'bold' }).setOrigin(0.5));
    if (p.sleep > 0) this.dyn.add(txt(this, px + 8, py - 12, 'Zzz', 11, '#9db4ff').setOrigin(0.5));

    this.drawFx(g.fx);
    this.drawHud();
    this.drawLog();
    if (this.menuOpen) this.drawMenu();
  }

  private drawFx(list: Fx[]) {
    for (const f of list) {
      const cx = f.x * T + T / 2;
      const cy = MAP_Y + f.y * T + T / 2;
      if ((f.type === 'bolt' || f.type === 'breath') && f.x2 !== undefined && f.y2 !== undefined) {
        const col = f.type === 'breath' ? 0xff7a3d : 0xc9a0ff;
        this.gfx.lineStyle(f.type === 'breath' ? 6 : 4, col, 0.9);
        this.gfx.lineBetween(cx, cy, f.x2 * T + T / 2, MAP_Y + f.y2 * T + T / 2);
      } else if (f.type === 'throw' && f.x2 !== undefined && f.y2 !== undefined) {
        this.gfx.lineStyle(3, 0xffe08a, 0.9);
        this.gfx.lineBetween(cx, cy, f.x2 * T + T / 2, MAP_Y + f.y2 * T + T / 2);
        this.gfx.fillStyle(0xffe08a, 1).fillCircle(f.x2 * T + T / 2, MAP_Y + f.y2 * T + T / 2, 4);
      } else if (f.type === 'eruption') {
        this.gfx.fillStyle(0xffa03d, 0.85).fillCircle(cx, cy, T * 0.8);
        this.gfx.lineStyle(3, 0xff3b1f, 1).strokeCircle(cx, cy, T * 1.1);
      } else if (f.type === 'sweep') {
        this.gfx.lineStyle(4, 0xff4d6d, 0.9).strokeCircle(cx, cy, T * 1.6);
      } else if (f.type === 'fire') {
        this.gfx.lineStyle(4, 0xff9f43, 0.9).strokeCircle(cx, cy, T * 3.4);
      } else if (f.type === 'transform') {
        this.gfx.lineStyle(4, 0xffd24d, 0.9).strokeCircle(cx, cy, T * 1.3);
        this.dyn.add(txt(this, cx, cy - 34, '変身!', 20, '#ffd24d', { fontStyle: 'bold' }).setOrigin(0.5));
      } else if (f.type === 'identify') {
        this.gfx.lineStyle(3, 0x4dd6a8, 0.9).strokeCircle(cx, cy, T * 3);
        this.dyn.add(txt(this, cx, cy - 34, '鑑定!', 20, '#4dd6a8', { fontStyle: 'bold' }).setOrigin(0.5));
      }
      if (f.text) {
        const color = f.type === 'heal' ? '#7dffa8' : '#ffffff';
        const t = txt(this, cx, cy - 10, f.text, 16, color, { fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
        this.dyn.add(t);
        this.tweens.add({ targets: t, y: t.y - 22, alpha: 0.2, duration: 900 });
      }
    }
  }

  private bar(x: number, y: number, w: number, h: number, ratio: number, col: number) {
    this.gfx.fillStyle(0x000000, 0.6).fillRect(x, y, w, h);
    this.gfx.fillStyle(col, 1).fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, h);
    this.gfx.lineStyle(1, 0x555d80, 1).strokeRect(x, y, w, h);
  }

  private drawHud() {
    const g = this.dg;
    const p = g.player;
    const c = CHARS[p.charId];
    const add = (o: Phaser.GameObjects.GameObject) => this.hud.add(o);
    // 上部バー
    add(txt(this, 10, 10, `${g.floor}階`, 22, '#ffe08a', { fontStyle: 'bold' }));
    add(txt(this, 92, 14, `Lv.${p.level}`, 16));
    add(txt(this, 160, 14, 'HP', 16, '#ff9aa8'));
    this.bar(188, 16, 150, 14, p.hp / p.maxHp, p.hp / p.maxHp < 0.3 ? 0xff4d4d : 0x4ade80);
    add(txt(this, 346, 14, `${p.hp}/${p.maxHp}`, 16));
    add(txt(this, 440, 14, '満腹度', 16, '#ffd29a'));
    this.bar(500, 16, 130, 14, p.fullness / MAX_FULLNESS, p.fullness < 200 ? 0xff7a3d : 0xe0b341);
    add(txt(this, 638, 14, `${p.fullness}/${MAX_FULLNESS}`, 16));
    const now = performance.now();
    if (this.diag.mode) {
      add(txt(this, GAME_W - 10, 4, '斜めモード ON(Shiftで解除)', 14, '#ffb86b', { fontStyle: 'bold' }).setOrigin(1, 0));
      const hint = this.diag.pendingLabel(now);
      add(txt(this, GAME_W - 10, 24, hint ?? '方向キーを2つ押すと斜めに進む', 13, hint ? '#ffffff' : '#c9a36b').setOrigin(1, 0));
    }
    if (p.maxMp > 0) {
      add(txt(this, 760, 14, 'MP', 16, '#c9a0ff'));
      this.bar(790, 16, 70, 14, p.mp / p.maxMp, 0xa78bfa);
    }

    // 右パネル
    this.gfx.fillStyle(0x121626, 1).fillRect(PANEL_X - 6, MAP_Y, GAME_W - PANEL_X + 6, GAME_H - MAP_Y);
    this.gfx.fillStyle(c.color, 1).fillCircle(PANEL_X + 24, MAP_Y + 28, 18);
    add(txt(this, PANEL_X + 24, MAP_Y + 28, c.glyph, 20, '#0b0d14', { fontStyle: 'bold' }).setOrigin(0.5));
    add(txt(this, PANEL_X + 52, MAP_Y + 8, c.name, 20, hex(c.color)));
    add(txt(this, PANEL_X + 52, MAP_Y + 32, c.role, 12, '#8b95bd'));
    const wp = p.weapon ? effectOf('weapon', p.weapon.effect).name : 'なし';
    const sh = p.shield ? effectOf('shield', p.shield.effect).name : 'なし';
    add(txt(this, PANEL_X, MAP_Y + 64,
      `攻撃 ${(g.attackPower()).toFixed(1)}   防御 ${g.armor()}\n武器: ${wp}\n盾: ${sh}\nターン ${g.turn}   経験値 ${p.exp}`, 14, '#e8eaf2'));
    // 能力の状態
    let ab = `【${c.abilityName}】`;
    let st = '';
    if (p.charId === 'barrage') st = p.transform > 0 ? `変身中(あと${p.transform}ターン・2回行動)` : p.abilityCd > 0 ? `再使用まであと${p.abilityCd}ターン` : '使用可能';
    else if (p.charId === 'sion') st = `MP ${p.mp}/${p.maxMp}(1発3消費)`;
    else if (p.charId === 'fate') st = `使用で最大HPの1割を消費`;
    else if (p.charId === 'clayd') st = p.abilityCd > 0 ? `再使用まであと${p.abilityCd}ターン` : (p.infoTurns > 0 ? `敵の能力を表示中(${p.infoTurns})` : '使用可能');
    else st = '与ダメージの一部でHP回復';
    add(txt(this, PANEL_X, MAP_Y + 170, `${ab}\n${st}`, 13, '#ffe08a', { wordWrap: { width: GAME_W - PANEL_X - 8, useAdvancedWrap: true } }));
    // 操作説明
    const gm = GIMMICKS.find((x) => x.id === g.gimmick);
    if (gm) add(txt(this, PANEL_X, MAP_Y + 222, `【この階のギミック】\n${gm.name}: ${gm.desc}`, 12, '#ffb86b', { wordWrap: { width: GAME_W - PANEL_X - 8, useAdvancedWrap: true } }));
    add(txt(this, PANEL_X, MAP_Y + 300,
      '【操作】\n移動 矢印 / Q W E\n          A   D / Z X C\n斜め Shift で切替→2方向キー\n待機 S   攻撃 Space\n能力 F   持ち物 I\n階段 Enter か .\n\n持ち物 ↑↓ 選択\nEnter 使う/装備  T 投げる\nD 置く  I か Esc で閉じる', 13, '#8b95bd'));
    add(txt(this, PANEL_X, MAP_Y + 520, `持ち物 ${p.inv.length}/${INV_MAX}`, 14, '#e8eaf2'));
    void BARRAGE_CD; void CLAYD_CD; void MAX_FLOOR;
  }

  private drawLog() {
    const g = this.dg;
    this.gfx.fillStyle(0x0f1220, 1).fillRect(0, LOG_Y - 4, PANEL_X - 6, GAME_H - LOG_Y + 4);
    const lines = g.logs.slice(-6);
    lines.forEach((l, i) => {
      const a = 0.45 + 0.55 * ((i + 1) / lines.length);
      this.hud.add(txt(this, 10, LOG_Y + i * 20, l, 15, '#dfe4ff').setAlpha(a));
    });
    if (this.throwIdx !== null) {
      const it = g.player.inv[this.throwIdx];
      const by = MAP_Y + H * T - 34;
      this.gfx2.fillStyle(0x1a2145, 0.95).fillRect(0, by, PANEL_X - 6, 34);
      this.gfx2.lineStyle(2, 0xffe08a, 1).strokeRect(0, by, PANEL_X - 6, 34);
      this.menu.add(txt(this, 10, by + 6, `${it ? g.itemName(it) : ''}を投げる方向を選んでください(矢印 / QWEADZXC)   Escでやめる`, 16, '#ffe08a', { fontStyle: 'bold' }));
    }
  }

  private drawMenu() {
    const g = this.dg;
    const p = g.player;
    const x = PANEL_X - 6;
    const y = MAP_Y;
    this.gfx2.fillStyle(0x0b0d14, 1).fillRect(x - 330, y, GAME_W - x + 330, GAME_H - y);
    this.gfx2.lineStyle(2, 0x6c7bd9, 1).strokeRect(x - 330, y, GAME_W - x + 330, GAME_H - y);
    const mx = x - 320;
    const add = (o: Phaser.GameObjects.GameObject) => this.menu.add(o);
    add(txt(this, mx, y + 6, `持ち物 (${p.inv.length}/${INV_MAX})`, 20, '#ffe08a'));
    const close = txt(this, GAME_W - 12, y + 6, '✕ 閉じる [I / Esc]', 18, '#ffffff', { backgroundColor: '#3a4a9a', padding: { x: 8, y: 3 } }).setOrigin(1, 0);
    close.setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => { this.menuOpen = false; this.render(); });
    add(close);
    if (p.inv.length === 0) add(txt(this, mx, y + 44, '何も持っていない。', 16, '#8b95bd'));
    p.inv.forEach((it: Item, i: number) => {
      const sel = i === this.menuIdx;
      const known = g.isKnown(it);
      if (sel) this.gfx2.fillStyle(0x2a3366, 1).fillRect(mx - 4, y + 40 + i * 22, 600, 22);
      add(txt(this, mx, y + 40 + i * 22,
        `${sel ? '▶' : '　'} ${KIND_GLYPH[it.kind]} ${g.itemName(it)}${known ? '' : '  (未鑑定)'}`, 16, sel ? '#ffffff' : '#c7d0f5'));
    });
    const cur = p.inv[this.menuIdx];
    if (cur) add(txt(this, mx, y + 40 + INV_MAX * 22 + 6, g.itemDesc(cur), 14, '#ffe08a', { wordWrap: { width: 560, useAdvancedWrap: true } }));
    this.gfx2.fillStyle(0x1a2145, 1).fillRect(x - 330 + 2, GAME_H - 58, GAME_W - x + 330 - 4, 56);
    add(txt(this, mx, GAME_H - 54, '↑↓ 選ぶ   Enter 使う・装備   T 投げる   D 置く', 16, '#c7d0f5'));
    add(txt(this, mx, GAME_H - 30, 'I キー か Esc キー で持ち物を閉じる', 18, '#ffe08a', { fontStyle: 'bold' }));
  }
}
