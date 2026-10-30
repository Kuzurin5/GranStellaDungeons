// 斜め移動の入力処理(描画に依存しない)。
// 斜めモードをONにすると、方向キー2つ(例: ↑と→)を押したときだけ斜めに進む。
export interface Move {
  dx: number;
  dy: number;
}

export class DiagInput {
  mode = false;
  pending: (Move & { t: number }) | null = null;

  constructor(private timeoutMs = 2000) {}

  toggle(): boolean {
    this.mode = !this.mode;
    this.pending = null;
    return this.mode;
  }

  clear() {
    this.pending = null;
  }

  /** 1つの方向入力を渡す。移動が決まれば Move を返し、2つ目待ちなら null を返す。 */
  press(dx: number, dy: number, now: number): Move | null {
    if (!this.mode || (dx !== 0 && dy !== 0)) {
      this.pending = null;
      return { dx, dy };
    }
    const p = this.pending;
    if (p && now - p.t <= this.timeoutMs && (p.dx !== 0) !== (dx !== 0)) {
      this.pending = null;
      return { dx: p.dx + dx, dy: p.dy + dy };
    }
    this.pending = { dx, dy, t: now };
    return null;
  }

  /** 画面に出す案内。2つ目待ちのときは押した方向を出す。 */
  pendingLabel(now: number): string | null {
    const p = this.pending;
    if (!p || now - p.t > this.timeoutMs) return null;
    const name = p.dy < 0 ? '↑' : p.dy > 0 ? '↓' : p.dx < 0 ? '←' : '→';
    const next = p.dx !== 0 ? '↑ か ↓' : '← か →';
    return `${name} を押した。次に ${next}`;
  }
}
