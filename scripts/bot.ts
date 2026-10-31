import { runBot } from '../src/core/bot';
import { CHARS, CHAR_IDS } from '../src/core/data';

const RUNS = 100;
const rows: string[] = [];
let ok = true;
const rates: number[] = [];
const causes: Record<string, Record<string, number>> = {};
let crashes = 0;
let timeouts = 0;

for (const id of CHAR_IDS) {
  let clear = 0;
  let floorSum = 0;
  let turnSum = 0;
  causes[id] = {};
  for (let s = 1; s <= RUNS; s++) {
    try {
      const r = runBot(id, s * 7919 + 13);
      if (r.cleared) clear++;
      if (r.timeout) timeouts++;
      floorSum += r.floor;
      turnSum += r.turns;
      if (!r.cleared) causes[id][r.cause || '(時間切れ)'] = (causes[id][r.cause || '(時間切れ)'] ?? 0) + 1;
    } catch (e) {
      crashes++;
      console.error(`CRASH ${id} seed=${s}:`, e);
    }
  }
  const rate = (clear / RUNS) * 100;
  rates.push(rate);
  const avgFloor = floorSum / RUNS;
  rows.push(`| ${CHARS[id].name} | ${rate.toFixed(0)}% | ${avgFloor.toFixed(2)} | ${(turnSum / RUNS).toFixed(0)} |`);
  if (rate < 5 || rate > 70) ok = false;
  if (avgFloor < 4) ok = false;
}

console.log('| キャラ | 20階クリア率 | 平均到達階 | 平均ターン数 |');
console.log('|---|---|---|---|');
for (const r of rows) console.log(r);
console.log('');
const diff = Math.max(...rates) - Math.min(...rates);
console.log(`クリア率の最大差: ${diff.toFixed(0)}ポイント / クラッシュ: ${crashes}件 / 20000ターン超過: ${timeouts}件`);
for (const id of CHAR_IDS) console.log(`  敗因 ${CHARS[id].name}: ${JSON.stringify(causes[id])}`);
if (diff > 40 || crashes > 0 || timeouts > 0) ok = false;
console.log(ok ? '判定: 合格' : '判定: 不合格');
process.exit(ok ? 0 : 1);
