/**
 * 扩展功能测试：每日挑战 / 3BV / 提示 / 键盘光标 / 主题 / 分享 / 音效
 */
'use strict';
const fs = require('fs');
const htmlPath = 'C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/minesweeper.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\r\n/g, '\n');

const EXPORT = `
window.__f = {
  get G(){return G}, get profile(){return profile},
  newGame, primaryAction, toggleFlag, reveal, clearMines, compute3BV,
  placeMinesDaily, mulberry32, dailySeed, keyOfStamp, stampOf, todayStamp,
  ensureDaily, recordDaily, dailyEntry, findHint, giveHint, moveCursor,
  buildShareText, setSound, applyTheme, startDaily, checkAchievements,
  get dailyMode(){return dailyMode}, set dailyMode(v){dailyMode = v;},
  get dailyStamp(){return dailyStamp}, set dailyStamp(v){dailyStamp = v;},
  get hintsLeft(){return hintsLeft},
  get cursorIdx(){return cursorIdx}, set cursorIdx(v){cursorIdx = v;},
  get level(){return level}, set level(v){level = v;},
  get noGuess(){return noGuess}, set noGuess(v){noGuess = v;},
  get soundOn(){return soundOn},
  get ranked(){return ranked}
};
`;

const patched = script.replace(
  '/* ---------------- 启动 ---------------- */\n  newGame();',
  EXPORT + '/* ---------------- 启动 ---------------- */\n  newGame();'
);
if (patched === script) { console.error('注入失败'); process.exit(1); }

/* ---------------- DOM 桩 ---------------- */
function makeClassList() {
  const s = new Set();
  return {
    add(...c) { c.forEach(x => s.add(x)); },
    remove(...c) { c.forEach(x => s.delete(x)); },
    contains(c) { return s.has(c); },
    toggle(c, f) { f ? s.add(c) : s.delete(c); }
  };
}
const ids = {};
function El(tag, id) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), id: id || '', children: [], dataset: {},
    _listeners: {}, _html: '', textContent: '', value: '', hidden: false, checked: false,
    className: '', classList: makeClassList(),
    style: { _p: {}, setProperty(k, v) { this._p[k] = v; }, getPropertyValue(k) { return this._p[k] || ''; } },
    offsetWidth: 0,
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    querySelectorAll() { return []; }, querySelector() { return null; },
    closest(sel) {
      if (sel === '.cell' && this.dataset.i !== undefined) return this;
      if (sel === 'button' && this.tagName === 'BUTTON') return this;
      return null;
    },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    focus() {}, select() {},
    fire(t, ev) { (this._listeners[t] || []).forEach(fn => fn(ev)); }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) {
      this._html = v;
      if (typeof v === 'string' && v.indexOf('data-i=') >= 0) {
        this.children = [];
        const re = /data-i="(\d+)"/g;
        let m2;
        while ((m2 = re.exec(v))) { const c = El('div'); c.dataset.i = m2[1]; this.children.push(c); }
      }
    }
  });
  return el;
}
const segButtons = ['beginner', 'intermediate', 'expert', 'custom'].map(lv => { const b = El('button'); b.dataset.level = lv; return b; });
const seg = El('div', 'seg');
seg.querySelectorAll = sel => (sel === 'button' ? segButtons : []);

const rootEl = El('html');
rootEl._attrs = {};
rootEl.setAttribute = function (k, v) { this._attrs[k] = String(v); };
rootEl.getAttribute = function (k) { return this._attrs[k] === undefined ? null : this._attrs[k]; };

global.document = {
  getElementById(id) {
    if (!ids[id]) ids[id] = (id === 'seg' ? seg : El('div', id));
    return ids[id];
  },
  createElement: t => El(t),
  addEventListener() {},
  createDocumentFragment: () => El('div'),
  body: El('body'),
  documentElement: rootEl
};
global.window = {
  innerWidth: 1440, innerHeight: 900,
  addEventListener() {},
  matchMedia() { return { matches: false, addEventListener() {} }; }
};
Object.defineProperty(global, 'navigator', { value: {}, configurable: true });
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); }
};

try { eval(patched); } catch (e) { console.error('加载失败\n' + e.stack); process.exit(1); }

const f = global.window.__f;
const errors = [];
function assert(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) errors.push(msg);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

function setMinesAt(list) {
  f.clearMines();
  for (const i of list) f.G.cells[i].mine = true;
  for (let i = 0; i < f.G.cells.length; i++) {
    if (f.G.cells[i].mine) { f.G.cells[i].adj = 0; continue; }
    let a = 0;
    for (const nb of f.G.nn[i]) if (f.G.cells[nb].mine) a++;
    f.G.cells[i].adj = a;
  }
}

(async function run() {
  /* ===== 1. 3BV ===== */
  // 定义：3BV = 空区域个数 + 「没有任何空邻居」的数字格个数。
  // 空区泛洪时边界数字格已被一并翻开，不能再重复计数。
  f.level = 'beginner'; f.dailyMode = false; f.newGame();
  setMinesAt([0]);
  assert(f.compute3BV() === 1, '3BV：角落单雷 → 一次点击带走整盘 = 1');

  setMinesAt([40]);
  assert(f.compute3BV() === 1, '3BV：中心单雷 → 边界数字已被空区带走 = 1');

  setMinesAt([0, 1, 2]);
  assert(f.compute3BV() === 1, '3BV：顶行三雷 → 其余空区连通 = 1');

  // 全盘只有两个互不相邻的安全格：都是孤立数字格，没有空区
  setMinesAt(Array.from({ length: 81 }, (_, i) => i).filter(i => i !== 0 && i !== 80));
  assert(f.compute3BV() === 2, '3BV：两个孤立安全格 = 2（不重复计边界数字）');

  // 独立实现交叉校验（不同算法，随机盘比对）
  function ref3BV() {
    const g = f.G, n = g.rows * g.cols;
    const empty = i => !g.cells[i].mine && g.cells[i].adj === 0;
    const seen = new Set();
    let regions = 0;
    for (let i = 0; i < n; i++) {
      if (!empty(i) || seen.has(i)) continue;
      regions++;
      const st = [i]; seen.add(i);
      while (st.length) {
        const k = st.pop();
        for (const nb of g.nn[k]) {
          if (g.cells[nb].mine) continue;
          if (seen.has(nb)) continue;
          seen.add(nb);
          if (empty(nb)) st.push(nb);
        }
      }
    }
    let lonely = 0;
    for (let i = 0; i < n; i++) {
      if (g.cells[i].mine || g.cells[i].adj === 0) continue;
      if (!g.nn[i].some(empty)) lonely++;
    }
    return regions + lonely;
  }
  let same = true, samples = 0;
  for (let t = 0; t < 40; t++) {
    f.newGame();
    for (let i = 0; i < f.G.cells.length; i++) f.G.cells[i].mine = Math.random() < 0.18;
    for (let i = 0; i < f.G.cells.length; i++) {
      if (f.G.cells[i].mine) { f.G.cells[i].adj = 0; continue; }
      f.G.cells[i].adj = f.G.nn[i].filter(nb => f.G.cells[nb].mine).length;
    }
    const a = f.compute3BV(), b = ref3BV();
    samples++;
    if (a !== b) same = false;
  }
  assert(same, '3BV：与独立实现交叉校验一致（' + samples + ' 张随机盘）');

  f.newGame();
  const bv0 = f.compute3BV();
  assert(bv0 > 0 && bv0 <= 81 - f.G.mines, '3BV：常规盘落在合理区间 0 < ' + bv0 + ' ≤ 非雷格数');

  /* ===== 2. 每日棋盘确定性 ===== */
  f.level = 'intermediate'; f.dailyMode = true; f.dailyStamp = 20261116;
  f.newGame();
  f.placeMinesDaily(40);
  const A = f.G.cells.map(c => (c.mine ? 1 : 0));
  assert(A.filter(x => x).length === 40, '每日棋盘：40 颗雷');

  f.placeMinesDaily(40);
  const A2 = f.G.cells.map(c => (c.mine ? 1 : 0));
  assert(A.join('') === A2.join(''), '每日棋盘：同种子同首点 → 完全相同的雷区');

  let ring = true;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (f.G.cells[(2 + dr) * 16 + (8 + dc)].mine) ring = false;
  }
  assert(ring, '每日棋盘：首点 3×3 无雷');

  f.dailyStamp = 20261117;
  f.placeMinesDaily(40);
  const B = f.G.cells.map(c => (c.mine ? 1 : 0));
  assert(A.join('') !== B.join(''), '每日棋盘：换日期 → 不同雷区');

  f.dailyStamp = 20261116;
  f.placeMinesDaily(200);
  const C = f.G.cells.map(c => (c.mine ? 1 : 0));
  let diff = 0;
  for (let i = 0; i < A.length; i++) if (A[i] !== C[i]) diff++;
  assert(diff <= 9, '每日棋盘：换首点只影响首点附近（差异 ' + diff + ' 格 ≤ 9）');

  /* ===== 3. 打卡与连续天数 ===== */
  const d = f.ensureDaily();
  d.last = ''; d.streak = 0; d.best = 0; d.hist = {};
  const today = f.todayStamp();
  const todayKey = f.keyOfStamp(today);
  const yKey = f.keyOfStamp(f.stampOf(new Date(Date.now() - 86400000)));
  const oldKey = f.keyOfStamp(f.stampOf(new Date(Date.now() - 3 * 86400000)));

  f.dailyStamp = today;
  f.recordDaily(true, 55);
  assert(f.profile.daily.streak === 1, '打卡：首次完成 → 连续 1 天');

  f.recordDaily(true, 40);
  assert(f.profile.daily.streak === 1, '打卡：同日重玩不重复累计');
  assert(f.profile.daily.hist[todayKey].s === 40, '打卡：同日保留更好成绩');
  assert(f.profile.daily.best === 40, '打卡：个人最佳更新为 40');

  delete f.profile.daily.hist[todayKey];
  f.profile.daily.last = oldKey; f.profile.daily.streak = 7;
  f.recordDaily(true, 66);
  assert(f.profile.daily.streak === 1, '打卡：断签（3 天前）→ 连续数重置为 1');

  delete f.profile.daily.hist[todayKey];
  f.profile.daily.last = yKey; f.profile.daily.streak = 3;
  f.recordDaily(true, 70);
  assert(f.profile.daily.streak === 4, '打卡：昨天完成 → 连续递增到 4');

  f.dailyStamp = today;
  f.profile.daily.hist[todayKey] = { w: 0, s: 12 };
  f.recordDaily(false, 12);
  assert(f.profile.daily.hist[todayKey].w === 0, '打卡：失败记为未通过');

  /* ===== 4. 提示 ===== */
  f.dailyMode = false; f.level = 'beginner'; f.noGuess = true; f.newGame();
  f.primaryAction(40);
  await wait(40);
  assert(f.G.started, '提示场景：开局成功');
  const h = f.findHint();
  assert(h.idx >= 0, '提示：开局后存在可确定格');
  assert(h.isMine ? f.G.cells[h.idx].mine : !f.G.cells[h.idx].mine,
    '提示：给出的结论与实际雷区一致（' + (h.isMine ? '必是雷' : '必安全') + '）');
  assert(f.hintsLeft === 3, '提示：每局 3 次');

  const before = f.hintsLeft;
  f.giveHint();
  assert(f.hintsLeft === before - 1, '提示：使用一次后次数 -1');

  /* ===== 5. 键盘光标 ===== */
  f.cursorIdx = -1;
  f.moveCursor(0, 0);
  assert(f.cursorIdx === 40, '光标：从棋盘中心开始');
  f.moveCursor(-1, 0);
  assert(f.cursorIdx === 31, '光标：上移一行');
  f.moveCursor(0, -1);
  assert(f.cursorIdx === 30, '光标：左移一格');
  for (let i = 0; i < 20; i++) f.moveCursor(-1, -1);
  assert(f.cursorIdx === 0, '光标：越界后钳制在左上角');

  /* ===== 6. 主题 ===== */
  f.applyTheme('dark');
  assert(global.document.documentElement.getAttribute('data-theme') === 'dark', '主题：切到深色');
  f.applyTheme('light');
  assert(global.document.documentElement.getAttribute('data-theme') === 'light', '主题：切回浅色');

  /* ===== 7. 分享文案 ===== */
  f.level = 'expert'; f.newGame();
  f.G.bv = 60;
  const txt = f.buildShareText(true, 50);
  assert(txt.indexOf('高级') >= 0, '分享：包含难度名');
  assert(txt.indexOf('3BV 60') >= 0, '分享：包含 3BV');
  assert(txt.indexOf('1.20') >= 0, '分享：效率 = 60/50 = 1.20');

  /* ===== 8. 音效开关持久化 ===== */
  f.setSound(false);
  assert(global.localStorage.getItem('win11.minesweeper.sound.v1') === '0', '音效：关闭状态写入存档');
  f.setSound(true);
  assert(global.localStorage.getItem('win11.minesweeper.sound.v1') === '1', '音效：开启状态写入存档');

  /* ===== 9. 每日模式不影响中级最佳成绩 ===== */
  const bestKey = 'intermediate';
  const saved = global.localStorage.getItem('win11.minesweeper.best.v1');
  global.localStorage.setItem('win11.minesweeper.best.v1', JSON.stringify({ intermediate: 99 }));
  f.profile.daily.streak = 0; f.profile.daily.last = '';
  f.dailyMode = true; f.dailyStamp = today; f.level = 'intermediate'; f.newGame();
  f.primaryAction(40);
  await wait(40);
  assert(f.G.bv > 0, '每日挑战：开局后计算了 3BV（' + f.G.bv + '）');

  // 除最后一格外全部翻开，再 reveal 触发 checkWin
  const N = f.G.cells.length;
  let lastSafe = -1;
  for (let i = 0; i < N; i++) if (!f.G.cells[i].mine) lastSafe = i;
  for (let i = 0; i < N; i++) {
    if (!f.G.cells[i].mine && i !== lastSafe) {
      if (!f.G.cells[i].open) f.G.revealed++;
      f.G.cells[i].open = true;
    }
  }
  f.reveal(lastSafe);
  assert(f.G.won === true, '每日挑战：全部安全格翻开后判定胜利');
  assert(f.profile.daily.streak === 1, '每日挑战：胜利后连续天数 +1');
  assert(f.profile.daily.hist[todayKey] && f.profile.daily.hist[todayKey].w === 1, '每日挑战：今日记录为通过');
  assert(String(ids['dailyMini'].textContent).indexOf('已完成') === 0, '每日挑战：工具栏显示已完成');

  const bestsAfter = JSON.parse(global.localStorage.getItem('win11.minesweeper.best.v1') || '{}');
  assert(bestsAfter.intermediate === 99, '每日挑战不会覆盖中级个人最佳');
  global.localStorage.setItem('win11.minesweeper.best.v1', saved || '{}');

  const share = f.buildShareText(true, 30);
  assert(share.indexOf('每日挑战') >= 0 && share.indexOf('连续') >= 0, '每日挑战分享：包含日期与连续天数');

  f.profile.daily.streak = 7;
  f.checkAchievements({ win: true, level: 'intermediate', secs: 60, isBest: false });
  assert(!!f.profile.ach.daily7, '成就：连续打卡 7 天解锁「每日一练」');
  f.profile.daily.streak = 30;
  f.checkAchievements({ win: true, level: 'intermediate', secs: 60, isBest: false });
  assert(!!f.profile.ach.daily30, '成就：连续打卡 30 天解锁「风雨无阻」');

  console.log('\n' + (errors.length ? '❌ 失败 ' + errors.length + ' 项' : '✅ 全部通过'));
  process.exit(errors.length ? 1 : 0);
})();
