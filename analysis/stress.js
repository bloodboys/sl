/**
 * 无猜生成压力测试：随机首点（含四角），统计失败率与耗时分布
 */
'use strict';
const fs = require('fs');
const html = fs.readFileSync('C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/minesweeper.html', 'utf8');
const solverSrc = html.match(/\/\* SOLVER-START \*\/([\s\S]*?)\/\* SOLVER-END \*\//)[1];

function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function neighborsOf(i, rows, cols) {
  const r = Math.floor(i / cols), c = i % cols, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
  }
  return out;
}
function newBoard(rows, cols, mines, rng) {
  const n = rows * cols;
  const G = { rows, cols, mines, cells: [], nn: [] };
  for (let i = 0; i < n; i++) G.cells.push({ mine: false, adj: 0 });
  for (let i = 0; i < n; i++) G.nn.push(neighborsOf(i, rows, cols));
  G.placeMines = function (safeIdx) {
    for (let i = 0; i < n; i++) { G.cells[i].mine = false; G.cells[i].adj = 0; }
    const sr = Math.floor(safeIdx / cols), sc = safeIdx % cols;
    const forbidden = new Set();
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = sr + dr, c = sc + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) forbidden.add(r * cols + c);
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
const factory = new Function('G', 'placeMines', 'performance', 'noGuess',
  solverSrc + '\nreturn { canSolveByLogic: canSolveByLogic, generateBoard: generateBoard };');

function stress(name, rows, cols, mines, N) {
  const times = [], tries = [];
  let failed = 0, corner = 0, cornerFail = 0;
  const rnd = makeRng(424242);
  for (let t = 0; t < N; t++) {
    const isCorner = t % 4 === 0;
    const first = isCorner ? 0 : Math.floor(rnd() * rows * cols);
    if (isCorner) corner++;
    const G = newBoard(rows, cols, mines, makeRng(1000 + t * 7717));
    const api = factory(G, G.placeMines, performance, true);
    const t0 = performance.now();
    const r = api.generateBoard(first);
    const dt = performance.now() - t0;
    times.push(dt); tries.push(r.tries);
    if (r.failed) { failed++; if (isCorner) cornerFail++; }
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(
    `${name} ${rows}×${cols}/${mines} | ${N} 次生成 | 失败 ${failed}` +
    ` | 平均 ${avg.toFixed(1)}ms | p50 ${times[Math.floor(N * .5)].toFixed(1)}ms` +
    ` | p99 ${times[Math.floor(N * .99)].toFixed(1)}ms | 最慢 ${times[N - 1].toFixed(1)}ms` +
    ` | 平均重试 ${(tries.reduce((a, b) => a + b, 0) / N).toFixed(1)}` +
    (corner ? ` | 角落首点失败 ${cornerFail}/${corner}` : '')
  );
}

stress('初级', 9, 9, 10, 400);
stress('中级', 16, 16, 40, 300);
stress('高级', 16, 30, 99, 200);
stress('自定义 30×30', 30, 30, 180, 60);
