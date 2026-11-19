/**
 * 大规模统计（可复现）+ 死局样本抓取
 * 用法: node stats.js [N1 N2 N3]
 */
'use strict';
const fs = require('fs');
const { makeBoard, analyze } = require('./solver.js');

function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function simGame(rows, cols, mines, firstIdx, seed, snapOpts) {
  const B = makeBoard(rows, cols, mines, firstIdx, makeRng(seed));
  const n = rows * cols;
  const revealed = new Uint8Array(n), flagged = new Uint8Array(n);
  const st = { rows, cols, adj: B.adj, mines: B.mines, revealed, flagged, nn: B.nn };
  const rnd = makeRng((seed ^ 0x9e3779b9) >>> 0);

  function flood(start) {
    if (revealed[start] || flagged[start]) return;
    const stack = [start];
    while (stack.length) {
      const k = stack.pop();
      if (revealed[k] || flagged[k]) continue;
      revealed[k] = 1;
      if (B.adj[k] === 0) for (const x of B.nn[k]) if (!revealed[x] && !flagged[x] && !B.mine[x]) stack.push(x);
    }
  }

  flood(firstIdx);
  let guesses = 0, coinFlips = 0, lost = false, snap = null;
  const target = n - B.mines;

  for (;;) {
    let rc = 0;
    for (let i = 0; i < n; i++) if (revealed[i]) rc++;
    if (rc >= target) break;

    const info = analyze(st);
    if (info.aborted) return null;

    if (info.sureMine.size || info.sureSafe.size) {
      info.sureMine.forEach(i => { flagged[i] = 1; });
      info.sureSafe.forEach(i => { if (!revealed[i]) flood(i); });
      continue;
    }

    guesses++;
    const isCoin = info.maxSafe <= 0.5 + 1e-9;
    if (isCoin) coinFlips++;

    if (snapOpts && isCoin && !snap && info.prob.size >= snapOpts.minUnknown) {
      const cells = [];
      let amb = 0, fl = 0;
      for (let i = 0; i < n; i++) {
        if (revealed[i]) cells.push({ s: 'n', a: B.adj[i] });
        else if (flagged[i]) { cells.push({ s: 'f' }); fl++; }
        else {
          const p = info.prob.has(i) ? info.prob.get(i) : null;
          if (p !== null && p > 1e-9 && p < 1 - 1e-9) amb++;
          cells.push({ s: 'h', p: p });
        }
      }
      snap = {
        level: snapOpts.name, rows, cols, mines, R: info.R,
        maxSafe: info.maxSafe, ways: info.totalWays, ambiguous: amb,
        revealedCount: n - info.prob.size - fl,
        cells
      };
    }

    let best = [], bestP = -1;
    for (const [i, p] of info.prob) {
      const safe = 1 - p;
      if (safe > bestP + 1e-12) { bestP = safe; best = [i]; }
      else if (Math.abs(safe - bestP) <= 1e-12) best.push(i);
    }
    const pick = best[Math.floor(rnd() * best.length)];
    if (B.mine[pick]) { lost = true; break; }
    flood(pick);
  }
  return { guesses, lost, coinFlips, won: !lost, snap };
}

function batch(name, rows, cols, mines, N, wantSnapMin) {
  const first = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
  const dist = { 0: 0, 1: 0, 2: 0, 3: 0, more: 0 };
  let guessBoards = 0, coinBoards = 0, lost = 0, won = 0, totalG = 0, done = 0, aborted = 0;
  let example = null;
  const examples = [];

  for (let t = 0; t < N; t++) {
    const r = simGame(rows, cols, mines, first, 700001 + t * 2654435761, { name, minUnknown: wantSnapMin });
    if (!r) { aborted++; continue; }
    done++;
    totalG += r.guesses;
    if (r.guesses === 0) dist[0]++;
    else {
      guessBoards++;
      if (r.guesses === 1) dist[1]++;
      else if (r.guesses === 2) dist[2]++;
      else if (r.guesses === 3) dist[3]++;
      else dist.more++;
      if (r.coinFlips > 0) coinBoards++;
      if (!r.won) lost++;
    }
    if (r.won) won++;
    if (r.snap) {
      if (!example) example = r.snap;
      if (examples.length < 3) examples.push(r.snap);
    }
  }

  return {
    name, N, done, aborted, rows, cols, mines,
    logicRate: dist[0] / done,
    guessRate: guessBoards / done,
    coinRate: coinBoards / done,
    lostByGuessRate: lost / done,
    winRate: won / done,
    avgGuesses: totalG / done,
    dist, example, examples
  };
}

const N1 = parseInt(process.argv[2] || '3000', 10);
const N2 = parseInt(process.argv[3] || '1500', 10);
const N3 = parseInt(process.argv[4] || '500', 10);

const out = [
  batch('初级', 9, 9, 10, N1, 4),
  batch('中级', 16, 16, 40, N2, 5),
  batch('高级', 16, 30, 99, N3, 6)
];

for (const r of out) {
  console.log(
    `\n${r.name} ${r.rows}×${r.cols}/${r.mines}  有效样本 ${r.done}/${r.N}` + (r.aborted ? `（超算力跳过 ${r.aborted}）` : '') +
    `\n  纯逻辑通关      ${(r.logicRate * 100).toFixed(1)}%` +
    `\n  需要猜          ${(r.guessRate * 100).toFixed(1)}%` +
    `\n  ├ 遇抛硬币(≤50%) ${(r.coinRate * 100).toFixed(1)}%` +
    `\n  └ 被猜死        ${(r.lostByGuessRate * 100).toFixed(1)}%` +
    `\n  猜次分布 0:${r.dist[0]} 1:${r.dist[1]} 2:${r.dist[2]} 3:${r.dist[3]} 4+:${r.dist.more}` +
    `\n  平均猜次        ${r.avgGuesses.toFixed(2)}` +
    `\n  完美玩家胜率    ${(r.winRate * 100).toFixed(1)}%`
  );
}

fs.writeFileSync(__dirname + '/result.json', JSON.stringify(out.map(r => ({
  name: r.name, done: r.done, aborted: r.aborted,
  logicRate: r.logicRate, guessRate: r.guessRate, coinRate: r.coinRate,
  lostByGuessRate: r.lostByGuessRate, winRate: r.winRate,
  avgGuesses: r.avgGuesses, dist: r.dist,
  sample: r.example
})), null, 1));

const ex = out.find(r => r.example && r.example.ambiguous >= 4);
if (ex) fs.writeFileSync(__dirname + '/deadend.json', JSON.stringify(ex.example));
console.log('\n样本已写入 result.json / deadend.json');
