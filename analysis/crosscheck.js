/**
 * 求解器交叉验证：用「暴力穷举所有布雷方案」对照精确约束求解器
 * 检查：1) 推断是否永远与真实雷区一致（soundness）
 *       2) 判定逻辑死角时，暴力侧是否也确实无解（completeness）
 */
'use strict';
const { makeBoard, analyze } = require('./solver.js');

const CAP = 250000;

function C(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return r;
}

/* 暴力：枚举所有与已翻开数字相容的布雷方案 */
function bruteForce(st) {
  const { rows, cols, adj, mines, revealed, flagged, nn } = st;
  const n = rows * cols;
  let flagCount = 0;
  for (let i = 0; i < n; i++) if (flagged[i]) flagCount++;
  const R = mines - flagCount;
  const unknown = [];
  for (let i = 0; i < n; i++) if (!revealed[i] && !flagged[i]) unknown.push(i);
  if (C(unknown.length, R) > CAP) return null;

  const pos = new Map();
  unknown.forEach((c, i) => pos.set(c, i));
  const cons = [];
  for (let i = 0; i < n; i++) {
    if (!revealed[i] || adj[i] < 0) continue;
    let fl = 0;
    const unk = [];
    for (const k of nn[i]) {
      if (flagged[k]) fl++;
      else if (!revealed[k]) unk.push(k);
    }
    cons.push({ v: unk.map(x => pos.get(x)), need: adj[i] - fl });
  }
  // 只保留涉及未知格的约束
  const use = cons.filter(c => c.v.length > 0);

  const pick = new Uint8Array(unknown.length);
  const cnt = new Int32Array(unknown.length);
  let total = 0;

  const need = use.map(c => c.need);
  const rem = use.map(c => c.v.length);
  const vCons = unknown.map(() => []);
  use.forEach((c, ci) => c.v.forEach(v => vCons[v].push(ci)));

  function rec(i, used) {
    if (used > R) return;
    if (used + (unknown.length - i) < R) return;
    if (i === unknown.length) {
      for (let j = 0; j < use.length; j++) if (need[j] !== 0) return;
      total++;
      for (let j = 0; j < unknown.length; j++) if (pick[j]) cnt[j]++;
      return;
    }
    for (let t = 0; t < 2; t++) {
      const val = t; // 0 = 安全, 1 = 雷
      pick[i] = val;
      let ok = true, k = 0;
      for (; k < vCons[i].length; k++) {
        const ci = vCons[i][k];
        rem[ci]--;
        if (val) need[ci]--;
        if (need[ci] < 0 || need[ci] > rem[ci] || (rem[ci] === 0 && need[ci] !== 0)) { ok = false; break; }
      }
      if (ok) rec(i + 1, used + val);
      const lim = ok ? vCons[i].length : k + 1;
      for (let u = 0; u < lim; u++) { rem[vCons[i][u]]++; if (val) need[vCons[i][u]]++; }
    }
    pick[i] = 0;
  }
  rec(0, 0);

  const sureMine = new Set(), sureSafe = new Set();
  for (let i = 0; i < unknown.length; i++) {
    if (cnt[i] === total) sureMine.add(unknown[i]);
    else if (cnt[i] === 0) sureSafe.add(unknown[i]);
  }
  return { sureMine, sureSafe, total, unknown };
}

function flood(st, B, start) {
  const { revealed, flagged } = st;
  if (revealed[start] || flagged[start]) return;
  const stack = [start];
  while (stack.length) {
    const k = stack.pop();
    if (revealed[k] || flagged[k]) continue;
    revealed[k] = 1;
    if (B.adj[k] === 0) for (const x of B.nn[k]) if (!revealed[x] && !flagged[x] && !B.mine[x]) stack.push(x);
  }
}

function trial(rows, cols, mines, report) {
  const first = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
  const B = makeBoard(rows, cols, mines, first);
  const n = rows * cols;
  const st = {
    rows, cols, adj: B.adj, mines: B.mines,
    revealed: new Uint8Array(n), flagged: new Uint8Array(n), nn: B.nn
  };
  flood(st, B, first);

  let comparisons = 0, skipped = 0;
  for (let step = 0; step < 4000; step++) {
    let rc = 0;
    for (let i = 0; i < n; i++) if (st.revealed[i]) rc++;
    if (rc >= n - mines) return { won: true, comparisons, skipped };

    const info = analyze(st);

    // soundness：任何推断不得与真实雷区矛盾
    for (const i of info.sureMine) {
      if (!B.mine[i]) { report.unsound++; if (report.unsound < 3) console.log('   ✗ 反例(sureMine 错):', i); }
      if (st.revealed[i]) report.unsound++;
    }
    for (const i of info.sureSafe) {
      if (B.mine[i]) { report.unsound++; if (report.unsound < 3) console.log('   ✗ 反例(sureSafe 错):', i); }
      if (st.revealed[i]) report.unsound++;
    }

    if (info.sureMine.size || info.sureSafe.size) {
      info.sureMine.forEach(i => { st.flagged[i] = 1; });
      info.sureSafe.forEach(i => { if (!st.revealed[i]) flood(st, B, i); });
      continue;
    }

    // 逻辑死角 —— 用暴力穷举核对
    const bf = bruteForce(st);
    if (!bf) { skipped++; }
    else {
      comparisons++;
      if (bf.sureMine.size || bf.sureSafe.size) {
        report.incomplete++;
        if (report.incomplete < 4) {
          console.log('   ✗ 反例(求解器漏判): 暴力确定雷', bf.sureMine.size, '安全', bf.sureSafe.size, '方案数', bf.total);
        }
      }
      if (bf.total < 2) report.degenerate++;
    }
    return { won: false, stuckAt: st, comparisons, skipped, bf };
  }
  return { won: false, timeout: true, comparisons, skipped };
}

const report = { unsound: 0, incomplete: 0, degenerate: 0, stuckBoards: 0, boards: 0, skipped: 0, comparisons: 0 };
const SIZES = [[5, 5, 4], [6, 6, 6], [7, 7, 8], [8, 8, 10], [9, 9, 10]];
const PER = 120;

for (const [r, c, m] of SIZES) {
  let logic = 0, stuck = 0, skipped = 0, cmp = 0;
  for (let t = 0; t < PER; t++) {
    report.boards++;
    const res = trial(r, c, m, report);
    cmp += res.comparisons;
    skipped += res.skipped;
    if (res.won) logic++;
    else { stuck++; report.stuckBoards++; }
  }
  report.comparisons += cmp;
  report.skipped += skipped;
  console.log(
    `${r}×${c}/${m}`.padEnd(10),
    '局数', String(PER).padStart(3),
    '| 纯逻辑通关', (logic / PER * 100).toFixed(0).padStart(3) + '%',
    '| 死角', String(stuck).padStart(3),
    '| 暴力核对', String(cmp).padStart(4), '次',
    '| 超算力跳过', String(skipped).padStart(3)
  );
}

console.log('\n--- 交叉验证结论 ---');
console.log('推断与真实雷区矛盾次数 :', report.unsound, report.unsound === 0 ? '（可靠 ✔）' : '（有 bug ✘）');
console.log('死角存在漏判次数       :', report.incomplete, report.incomplete === 0 ? '（完备 ✔）' : '（不够完备）');
console.log('死角但方案数<2 的异常  :', report.degenerate);
console.log('总核对次数             :', report.comparisons, '| 跳过', report.skipped);
console.log('总死角局数             :', report.stuckBoards, '/', report.boards);
