/**
 * 无猜模式验证：
 * 1) 从 minesweeper.html 抽出浏览器版求解器
 * 2) 与 analysis/solver.js（已用暴力穷举校验过的参考实现）逐局比对结论
 * 3) 测 generateBoard 的重试次数与耗时
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ref = require('./solver.js');

const htmlPath = 'C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/minesweeper.html';
const html = fs.readFileSync(htmlPath, 'utf8');

const m = html.match(/\/\* SOLVER-START \*\/([\s\S]*?)\/\* SOLVER-END \*\//);
if (!m) { console.error('未找到求解器代码块'); process.exit(1); }
const solverSrc = m[1];

/* ---------- 统一布雷（与游戏 placeMines 一致） ---------- */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function neighborsOf(i, rows, cols) {
  const r = Math.floor(i / cols), c = i % cols, out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
    }
  }
  return out;
}

function newBoard(rows, cols, mines, rng) {
  const n = rows * cols;
  const G = {
    rows, cols, mines, cells: [], nn: []
  };
  for (let i = 0; i < n; i++) G.cells.push({ mine: false, adj: 0 });
  for (let i = 0; i < n; i++) G.nn.push(neighborsOf(i, rows, cols));

  G.placeMines = function (safeIdx) {
    for (let i = 0; i < n; i++) { G.cells[i].mine = false; G.cells[i].adj = 0; }
    const sr = Math.floor(safeIdx / cols), sc = safeIdx % cols;
    const forbidden = new Set();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = sr + dr, c = sc + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) forbidden.add(r * cols + c);
      }
    }
    const pool = [];
    for (let i = 0; i < n; i++) if (!forbidden.has(i)) pool.push(i);
    const count = Math.min(G.mines, pool.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      G.cells[pool[i]].mine = true;
    }
    G.mines = count;
    for (let i = 0; i < n; i++) {
      if (G.cells[i].mine) continue;
      let a = 0;
      for (const k of G.nn[i]) if (G.cells[k].mine) a++;
      G.cells[i].adj = a;
    }
  };
  return G;
}

/* ---------- 参考实现的可解性判定 ---------- */
function refSolvable(G, firstIdx) {
  const { rows, cols } = G;
  const n = rows * cols;
  const adj = new Int16Array(n);
  for (let i = 0; i < n; i++) adj[i] = G.cells[i].mine ? -1 : G.cells[i].adj;
  const revealed = new Uint8Array(n), flagged = new Uint8Array(n);
  const st = { rows, cols, adj, mines: G.mines, revealed, flagged, nn: G.nn };

  function flood(start) {
    if (revealed[start] || flagged[start]) return;
    const stack = [start];
    while (stack.length) {
      const k = stack.pop();
      if (revealed[k] || flagged[k]) continue;
      revealed[k] = 1;
      if (adj[k] === 0) for (const x of G.nn[k]) if (!revealed[x] && !flagged[x] && adj[x] >= 0) stack.push(x);
    }
  }
  flood(firstIdx);
  for (let step = 0; step < 500; step++) {
    let rc = 0;
    for (let i = 0; i < n; i++) if (revealed[i]) rc++;
    if (rc >= n - G.mines) return true;
    const info = ref.analyze(st);
    if (info.aborted) return false;
    if (!info.sureMine.size && !info.sureSafe.size) return false;
    info.sureMine.forEach(i => { flagged[i] = 1; });
    info.sureSafe.forEach(i => { if (!revealed[i]) flood(i); });
  }
  return false;
}

/* ---------- 载入浏览器版求解器 ---------- */
const factory = new Function(
  'G', 'placeMines', 'performance', 'noGuess',
  solverSrc + '\nreturn { canSolveByLogic: canSolveByLogic, generateBoard: generateBoard };'
);

/* ---------- 比对 + 计时 ---------- */
const LEVELS = [
  ['初级', 9, 9, 10, 200],
  ['中级', 16, 16, 40, 120],
  ['高级', 16, 30, 99, 60]
];

let mismatches = 0, checked = 0;

for (const [name, rows, cols, mines, N] of LEVELS) {
  let agree = 0, solvable = 0;
  const times = [], tries = [];
  const first = Math.floor(rows / 2) * cols + Math.floor(cols / 2);

  for (let t = 0; t < N; t++) {
    // ---- 同一副棋盘，两个求解器各判一次 ----
    const G1 = newBoard(rows, cols, mines, makeRng(1234567 + t * 7919));
    G1.placeMines(first);
    const G2 = newBoard(rows, cols, mines, makeRng(1234567 + t * 7919));
    G2.placeMines(first);
    if (JSON.stringify(G1.cells) !== JSON.stringify(G2.cells)) {
      console.error('棋盘不一致（随机源问题）'); process.exit(1);
    }
    const api = factory(G1, G1.placeMines, performance, true);
    const mine = api.canSolveByLogic(first);
    const mineRef = refSolvable(G2, first);
    checked++;
    if (mine === mineRef) agree++;
    else { mismatches++; if (mismatches <= 3) console.log('  ✗ 结论不一致', name, t, '浏览器版', mine, '参考版', mineRef); }
    if (mine) solvable++;

    // ---- 计时：实际生成一副无猜棋盘 ----
    const G3 = newBoard(rows, cols, mines, makeRng(987654321 + t * 104729));
    const api3 = factory(G3, G3.placeMines, performance, true);
    const t0 = performance.now();
    const res = api3.generateBoard(first);
    const dt = performance.now() - t0;
    times.push(dt);
    tries.push(res.tries);
    if (res.failed) console.log('  ! 生成未在预算内完成', name);
  }

  times.sort((a, b) => a - b);
  const avgT = times.reduce((a, b) => a + b, 0) / times.length;
  const avgTr = tries.reduce((a, b) => a + b, 0) / tries.length;
  console.log(
    `${name} ${rows}×${cols}/${mines}` +
    ` | 判定一致 ${agree}/${N}` +
    ` | 可解率 ${(solvable / N * 100).toFixed(1)}%` +
    ` | 平均重试 ${avgTr.toFixed(1)} 次` +
    ` | 生成耗时 平均 ${avgT.toFixed(1)}ms  p95 ${times[Math.floor(times.length * 0.95)].toFixed(1)}ms  最慢 ${times[times.length - 1].toFixed(1)}ms`
  );
}

console.log('\n总计比对', checked, '局，结论不一致', mismatches, mismatches === 0 ? '✔' : '✘');
