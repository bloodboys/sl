/**
 * 扫雷「纯逻辑可解性」验证器
 * ------------------------------------------------------------
 * 完全复刻游戏内的布雷规则（首点 3x3 安全），然后用精确约束枚举
 * 模拟一个「完美逻辑玩家」：
 *   1. 穷举与所有已翻开数字相容的布雷方案（按约束连通分量独立枚举）
 *   2. 某格在所有相容方案中都是雷 => 必是雷；都不是雷 => 必安全
 *   3. 结合全局剩余雷数（含非边界格）做进一步推断
 *   4. 若推出无可确定格 => 此局面「逻辑死角」，只能猜
 * 并继续以最优概率猜下去，统计强制猜测次数与被运气淘汰的比例。
 */
'use strict';

const LEVELS = {
  beginner:     { rows: 9,  cols: 9,  mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert:       { rows: 16, cols: 30, mines: 99 }
};

/* ============ 棋盘生成（与游戏一致） ============ */
function makeBoard(rows, cols, mines, safeIdx, rng) {
  const rand = rng || Math.random;
  const n = rows * cols;
  const mine = new Uint8Array(n);
  const forbidden = new Set();
  const sr = Math.floor(safeIdx / cols), sc = safeIdx % cols;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = sr + dr, c = sc + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) forbidden.add(r * cols + c);
    }
  }
  const pool = [];
  for (let i = 0; i < n; i++) if (!forbidden.has(i)) pool.push(i);
  for (let i = 0; i < mines; i++) {
    const j = i + Math.floor(rand() * (pool.length - i));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    mine[pool[i]] = 1;
  }
  return buildView(rows, cols, mines, mine);
}

function buildView(rows, cols, mines, mine) {
  const n = rows * cols;
  const nn = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols, list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) list.push(nr * cols + nc);
      }
    }
    nn.push(list);
  }
  const adj = new Int16Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (mine[i]) continue;
    let a = 0;
    for (const k of nn[i]) if (mine[k]) a++;
    adj[i] = a;
  }
  return { rows, cols, mines, mine, adj, nn };
}

/* ============ 多项式乘法（用于连通分量加权） ============ */
function polyMul(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue;
    for (let j = 0; j < b.length; j++) {
      if (!b[j]) continue;
      out[i + j] += a[i] * b[j];
    }
  }
  return out;
}

/* ============ 单个连通分量精确枚举 ============ */
function enumComponent(cells, cons, cap) {
  const n = cells.length;
  const map = new Map();
  cells.forEach((c, i) => map.set(c, i));

  const cst = cons.map(c => ({
    v: c.cells.map(x => map.get(x)),
    need: c.need,
    rem: c.cells.length
  }));
  const vCons = cells.map(() => []);
  cst.forEach((c, ci) => c.v.forEach(v => vCons[v].push(ci)));

  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  order.sort((a, b) => vCons[b].length - vCons[a].length);

  const state = new Int8Array(n).fill(-1);
  const byK = [];          // byK[k] = Int32Array(n) 每格在该雷数方案下为雷的次数
  const hist = [];         // hist[k] = 用 k 颗雷的方案数
  let total = 0, nodes = 0, aborted = false;

  function rec(pos, used) {
    if (aborted) return;
    if (++nodes > cap) { aborted = true; return; }
    if (pos === n) {
      for (let i = 0; i < cst.length; i++) if (cst[i].need !== 0) return;
      total++;
      hist[used] = (hist[used] || 0) + 1;
      if (!byK[used]) byK[used] = new Int32Array(n);
      const arr = byK[used];
      for (let i = 0; i < n; i++) if (state[i] === 1) arr[i]++;
      return;
    }
    const v = order[pos];
    const cs = vCons[v];
    for (let t = 0; t < 2; t++) {
      const val = t === 0 ? 1 : 0; // 先试「是雷」剪枝更强
      state[v] = val;
      let ok = true, k = 0;
      for (; k < cs.length; k++) {
        const c = cst[cs[k]];
        c.rem--;
        if (val === 1) c.need--;
        if (c.need < 0 || c.need > c.rem || (c.rem === 0 && c.need !== 0)) { ok = false; break; }
      }
      if (ok) rec(pos + 1, used + (val === 1 ? 1 : 0));
      const lim = ok ? cs.length : k + 1;
      for (let u = 0; u < lim; u++) {
        const c = cst[cs[u]];
        c.rem++;
        if (val === 1) c.need++;
      }
      state[v] = -1;
      if (aborted) return;
    }
  }
  rec(0, 0);

  const mineCnt = new Int32Array(n);
  let minM = Infinity, maxM = -1;
  for (let k = 0; k < hist.length; k++) {
    if (!hist[k]) continue;
    if (k < minM) minM = k;
    if (k > maxM) maxM = k;
    const arr = byK[k];
    for (let i = 0; i < n; i++) mineCnt[i] += arr[i];
  }
  return { cells, n, hist, byK, total, mineCnt, minM, maxM, aborted, nodes };
}

/* ============ 求解一个局面 ============ */
const NODE_CAP = 2000000;

function analyze(st) {
  const { rows, cols, adj, mines, revealed, flagged, nn } = st;
  const n = rows * cols;
  const unknown = i => !revealed[i] && !flagged[i];
  let flagCount = 0;
  for (let i = 0; i < n; i++) if (flagged[i]) flagCount++;
  const R = mines - flagCount;               // 还没确定的雷数

  // 1) 直接约束
  const cons = [];
  const sureSafe = new Set(), sureMine = new Set();
  for (let i = 0; i < n; i++) {
    if (!revealed[i] || adj[i] <= 0) continue;
    const unk = [];
    let fl = 0;
    for (const k of nn[i]) {
      if (flagged[k]) fl++;
      else if (!revealed[k]) unk.push(k);
    }
    if (!unk.length) continue;
    const need = adj[i] - fl;
    if (need === 0) { unk.forEach(u => sureSafe.add(u)); continue; }
    if (need === unk.length) { unk.forEach(u => sureMine.add(u)); continue; }
    if (need < 0 || need > unk.length) continue; // 不会发生
    cons.push({ cells: unk, need });
  }
  if (sureSafe.size || sureMine.size) {
    sureMine.forEach(u => sureSafe.delete(u));
    return { sureSafe, sureMine, stuck: false };
  }

  // 2) 全局雷数极值规则
  const unknownAll = [];
  for (let i = 0; i < n; i++) if (unknown(i)) unknownAll.push(i);
  if (R === 0) { unknownAll.forEach(u => sureSafe.add(u)); return { sureSafe, sureMine, stuck: false }; }
  if (R === unknownAll.length) { unknownAll.forEach(u => sureMine.add(u)); return { sureSafe, sureMine, stuck: false }; }

  // 3) 拆分连通分量
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const allCells = new Set();
  cons.forEach(c => c.cells.forEach(x => { allCells.add(x); if (!parent.has(x)) parent.set(x, x); }));
  cons.forEach(c => {
    for (let i = 1; i < c.cells.length; i++) {
      const a = find(c.cells[0]), b = find(c.cells[i]);
      if (a !== b) parent.set(a, b);
    }
  });
  const groups = new Map();
  cons.forEach(c => {
    const root = find(c.cells[0]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(c);
  });
  const comps = [];
  for (const [root, cs] of groups) {
    const cells = [...allCells].filter(x => find(x) === root);
    comps.push(enumComponent(cells, cs, NODE_CAP));
  }
  // 完全被约束覆盖之外的格子（远离数字的区域）
  const far = unknownAll.filter(i => !allCells.has(i));

  let aborted = comps.some(c => c.aborted);
  if (aborted) return { sureSafe, sureMine, stuck: true, aborted: true, R, comps, far };

  // 4) 各分量可行雷数区间（受全局 R 与其它分量夹逼）
  const F = far.length;
  let sumMin = 0, sumMax = 0;
  comps.forEach(c => { sumMin += c.minM; sumMax += c.maxM; });
  const feasible = comps.map(c => {
    const kmin = Math.max(c.minM, R - (sumMax - c.maxM) - F);
    const kmax = Math.min(c.maxM, R - (sumMin - c.minM));
    return { kmin, kmax };
  });

  // 5) 精确概率（跨分量加权）
  const prefix = [new Array(1).fill(1)];
  for (let i = 0; i < comps.length; i++) prefix.push(polyMul(prefix[i], pad(comps[i].hist)));
  const suffix = new Array(comps.length + 1);
  suffix[comps.length] = new Array(1).fill(1);
  for (let i = comps.length - 1; i >= 0; i--) suffix[i] = polyMul(pad(comps[i].hist), suffix[i + 1]);
  function pad(h) { const out = h.slice(); for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = 0; return out; }

  const totalWaysArr = polyMul(prefix[comps.length], suffix[comps.length]);
  const totalWays = R < totalWaysArr.length ? totalWaysArr[R] : 0;

  const prob = new Map(); // 每格为雷概率
  let expFrontierMines = 0;
  comps.forEach((c, ci) => {
    const others = polyMul(prefix[ci], suffix[ci + 1]);
    const w = new Array(c.hist.length).fill(0);
    let tw = 0;
    for (let k = 0; k < c.hist.length; k++) {
      if (!c.hist[k]) continue;
      const idx = R - k;
      const weight = (idx >= 0 && idx < others.length) ? others[idx] : 0;
      w[k] = weight;
      tw += weight * c.hist[k];
      expFrontierMines += weight * c.hist[k] * k;
    }
    if (!tw) return;
    for (let i = 0; i < c.n; i++) {
      let mineWays = 0;
      for (let k = 0; k < c.hist.length; k++) {
        if (!c.hist[k] || !w[k]) continue;
        mineWays += w[k] * c.byK[k][i];
      }
      prob.set(c.cells[i], mineWays / tw);
    }
  });
  if (totalWays > 0) expFrontierMines /= totalWays;
  const farProb = F > 0 ? Math.max(0, Math.min(1, (R - expFrontierMines) / F)) : 0;
  far.forEach(i => prob.set(i, farProb));

  // 6) 确定性判定（只依赖可行 k）
  comps.forEach((c, ci) => {
    const { kmin, kmax } = feasible[ci];
    let any = false;
    for (let k = kmin; k <= kmax; k++) if (c.hist[k]) any = true;
    if (!any) return;
    for (let i = 0; i < c.n; i++) {
      let allMine = true, allSafe = true;
      for (let k = kmin; k <= kmax; k++) {
        if (!c.hist[k]) continue;
        const m = c.byK[k][i];
        if (m !== c.hist[k]) allMine = false;
        if (m !== 0) allSafe = false;
      }
      if (allMine) sureMine.add(c.cells[i]);
      else if (allSafe) sureSafe.add(c.cells[i]);
    }
  });

  // 全局规则：剩余雷数恰好等于各分量最大值之和 => 外围格全是雷 / 全是安全
  if (F > 0) {
    let maxReach = 0, minReach = 0;
    comps.forEach((c, ci) => { maxReach += feasible[ci].kmax; minReach += feasible[ci].kmin; });
    if (R === maxReach + F) far.forEach(i => sureMine.add(i));
    if (R === minReach) far.forEach(i => sureSafe.add(i));
  }

  sureMine.forEach(u => sureSafe.delete(u));

  let maxSafe = -1, bestCell = -1;
  for (const [i, p] of prob) if (1 - p > maxSafe) { maxSafe = 1 - p; bestCell = i; }

  return {
    sureSafe, sureMine, stuck: false,
    prob, far, comps, R,
    maxSafe, bestCell,
    totalWays, aborted: false
  };
}

/* ============ 完美逻辑玩家对局模拟 ============ */
function simulate(rows, cols, mines, seedSafe, guessSeed) {
  const B = makeBoard(rows, cols, mines, seedSafe);
  const n = rows * cols;
  const revealed = new Uint8Array(n);
  const flagged = new Uint8Array(n);
  const st = {
    rows, cols, adj: B.adj, mines: B.mines, revealed, flagged, nn: B.nn
  };
  let rngState = guessSeed >>> 0;
  const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

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

  flood(seedSafe);

  let guesses = 0, stuckEvents = [], coinFlips = 0, lost = false, steps = 0;
  const target = n - B.mines;

  for (;;) {
    if (++steps > 5000) break;
    let revealedCount = 0;
    for (let i = 0; i < n; i++) if (revealed[i]) revealedCount++;
    if (revealedCount >= target) break;

    const info = analyze(st);
    if (info.aborted) { return { error: 'solver-abort', rows, cols, mines }; }

    if (info.sureMine.size || info.sureSafe.size) {
      info.sureMine.forEach(i => { flagged[i] = 1; });
      info.sureSafe.forEach(i => { if (!revealed[i]) flood(i); });
      continue;
    }

    // 逻辑死角：只能猜
    stuckEvents.push({
      maxSafe: info.maxSafe,
      candidates: info.prob.size,
      R: info.R
    });
    if (info.maxSafe <= 0.5 + 1e-9) coinFlips++;
    guesses++;

    // 最优概率猜（同概率随机）
    let best = [], bestP = -1;
    for (const [i, p] of info.prob) {
      const safe = 1 - p;
      if (safe > bestP + 1e-12) { bestP = safe; best = [i]; }
      else if (Math.abs(safe - bestP) <= 1e-12) best.push(i);
    }
    if (!best.length) { return { error: 'no-candidate', rows, cols, mines }; }
    const pick = best[Math.floor(rnd() * best.length)];
    if (B.mine[pick]) { lost = true; break; }
    flood(pick);
  }

  return {
    rows, cols, mines, guesses, lost, coinFlips,
    stuckEvents, solvedByLogic: guesses === 0, steps
  };
}

/* ============ 批量跑分数 ============ */
function run(label, spec, N, guessSeedBase) {
  const t0 = Date.now();
  let logic = 0, needGuess = 0, coin = 0, lost = 0, totalGuesses = 0, errors = 0;
  let example = null;
  const firstClick = Math.floor(spec.rows / 2) * spec.cols + Math.floor(spec.cols / 2);

  for (let t = 0; t < N; t++) {
    const r = simulate(spec.rows, spec.cols, spec.mines, firstClick, guessSeedBase + t * 7919);
    if (r.error) { errors++; continue; }
    totalGuesses += r.guesses;
    if (r.guesses === 0) logic++;
    else {
      needGuess++;
      if (r.coinFlips > 0) coin++;
      if (r.lost) lost++;
      if (!example && r.stuckEvents.some(e => e.maxSafe <= 0.5000001)) {
        example = { level: label, guesses: r.guesses, lost: r.lost, stuck: r.stuckEvents };
      }
    }
  }
  const ms = Date.now() - t0;
  return {
    label, N, errors, ms,
    logicRate: logic / N,
    guessRate: needGuess / N,
    coinRate: coin / N,
    lostRate: lost / N,
    avgGuesses: totalGuesses / N,
    example
  };
}

if (require.main === module) {
  const RUNS = [
    ['初级 9×9 / 10', LEVELS.beginner, 300],
    ['中级 16×16 / 40', LEVELS.intermediate, 150],
    ['高级 16×30 / 99', LEVELS.expert, 60]
  ];

  console.log('=== 纯逻辑可解性验证（每局首点为棋盘中心） ===');
  const results = [];
  for (const [label, spec, N] of RUNS) {
    const r = run(label, spec, N, 20261116);
    results.push(r);
    console.log(
      label.padEnd(16),
      '总局数 ' + String(r.N).padStart(4),
      '| 纯逻辑通关 ' + (r.logicRate * 100).toFixed(1).padStart(5) + '%',
      '| 必须猜 ' + (r.guessRate * 100).toFixed(1).padStart(5) + '%',
      '| 遇抛硬币 ' + (r.coinRate * 100).toFixed(1).padStart(5) + '%',
      '| 猜死 ' + (r.lostRate * 100).toFixed(1).padStart(5) + '%',
      '| 均猜 ' + r.avgGuesses.toFixed(2),
      '| ' + r.ms + 'ms',
      r.errors ? '| err ' + r.errors : ''
    );
  }
  require('fs').writeFileSync(
    'C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/_verify_result.json',
    JSON.stringify(results, null, 2)
  );
}

module.exports = { LEVELS, makeBoard, buildView, analyze, simulate };
