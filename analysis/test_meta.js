/**
 * 排位 & 成就 回归测试（DOM 桩）
 * 覆盖：星级阶梯（晋级/升段/掉段/保底/王者）、奖励系数、成就解锁与去重、
 *       排位流程（强制无猜/结算/连胜）、面板渲染、localStorage 持久化
 */
'use strict';
const fs = require('fs');
const htmlPath = 'C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/minesweeper.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\r\n/g, '\n');

const EXPORT = `window.__meta = {
  get profile(){return profile}, get ranked(){return ranked}, get level(){return level},
  get noGuess(){return noGuess}, get G(){return G}, get achFilter(){return achFilter},
  custom: custom,
  RANKS: RANKS, LAST_RI: LAST_RI, applyStars: applyStars, rankReward: rankReward,
  rankScore: rankScore, rankLabel: rankLabel, ACH: ACH,
  finishGame: finishGame, startRankedMatch: startRankedMatch, leaveRanked: leaveRanked,
  openRankPanel: openRankPanel, openAchPanel: openAchPanel,
  setLevel: function(l){ level = l; }, setPerf: function(p){ G.perf = p; }
};
`;
const patched = script.replace('/* ---------------- 启动 ---------------- */\n  newGame();', EXPORT + '/* ---------------- 启动 ---------------- */\n  newGame();');
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
  _d: {}, getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = v; }
};

/* ---------------- 执行 ---------------- */
// 固定时钟：否则「深夜扫雷（0–5 点）」成就会随跑测试的时间随机解锁，断言不稳
const RealDate = Date;
const FIXED_NOW = new RealDate(2026, 10, 19, 12, 0, 0).getTime();
class MockDate extends RealDate {
  constructor(...args) { if (args.length === 0) super(FIXED_NOW); else super(...args); }
  static now() { return FIXED_NOW; }
}
global.Date = MockDate;

try { eval(patched); } catch (e) { console.error('加载失败\n' + e.stack); process.exit(1); }
const m = global.window.__meta;

let total = 0;
const errors = [];
function assert(cond, msg) {
  total++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) errors.push(msg);
}
const rs = (ri, tier, stars) => ({ ri, tier, stars });
const REAL_KEY = 'win11.minesweeper.profile.v1';

/* ===== 1. 星级阶梯 ===== */
let r = rs(0, 3, 0);
assert(m.rankLabel(r) === '倔强青铜 Ⅲ', '段位标签：倔强青铜 Ⅲ');
m.applyStars(r, 1);
assert(r.stars === 1, '+1 星：青铜 Ⅲ 1 星');
m.applyStars(r, 2);
assert(r.stars === 3, '+2 星：青铜 Ⅲ 满 3 星');
m.applyStars(r, 1);
assert(r.tier === 2 && r.stars === 0, '满星再赢 → 晋级 青铜 Ⅱ（0 星起）');

let r2 = rs(0, 1, 0);
m.applyStars(r2, 3);
const evUp = m.applyStars(r2, 1);
assert(r2.ri === 1 && r2.tier === 3 && r2.stars === 0 && evUp.rankUp === 1, '青铜 Ⅰ 满星再赢 → 升段 白银 Ⅲ');

let r3 = rs(0, 3, 0);
const evFloor = m.applyStars(r3, -1);
assert(r3.ri === 0 && r3.tier === 3 && r3.stars === 0 && evFloor.floor === 1, '青铜 Ⅲ 0 星失败 → 保底不掉星');

let r4a = rs(1, 1, 0);
const evTier = m.applyStars(r4a, -1);
assert(r4a.ri === 1 && r4a.tier === 2 && r4a.stars === 2 && evTier.demote === 1, '白银 Ⅰ 0 星失败 → 先降小段 白银 Ⅱ（满星-1）');

let r4 = rs(1, 3, 0);
const evDown = m.applyStars(r4, -1);
assert(r4.ri === 0 && r4.tier === 1 && r4.stars === 2 && evDown.rankDown === 1, '白银 Ⅲ 0 星失败 → 才掉大段 青铜 Ⅰ（满星-1）');

const r5 = rs(6, 3, 5);
m.applyStars(r5, -1);
assert(r5.stars === 4 && r5.ri === 6, '王者输一局：只掉星不封顶');
const r6 = rs(6, 3, 0);
m.applyStars(r6, -1);
assert(r6.ri === 5 && r6.tier === 1 && r6.stars === 4, '王者 0 星失败 → 掉回 星耀 Ⅰ');
const r7 = rs(6, 3, 10);
m.applyStars(r7, 3);
assert(r7.stars === 13, '王者加星无上限');

assert(m.rankScore(rs(0, 1, 0)) < m.rankScore(rs(1, 3, 0)), '段位比较：白银 Ⅲ > 青铜 Ⅰ');
assert(m.rankScore(rs(0, 1, 0)) < m.rankScore(rs(0, 1, 1)), '段位比较：同段星多更高');

/* ===== 2. 奖励系数 ===== */
assert(m.rankReward(true, 'beginner', false, 1).delta === 1, '奖励：初级首胜 +1 星');
assert(m.rankReward(true, 'expert', false, 1).delta === 2, '奖励：高级首胜 +2 星');
assert(m.rankReward(true, 'beginner', false, 3).delta === 2, '奖励：3 连胜额外 +1 星');
assert(m.rankReward(true, 'beginner', true, 3).delta === 3, '奖励：连胜 + 破纪录 = +3 星');
assert(m.rankReward(true, 'expert', true, 10).delta === 4, '奖励：高级 + 连胜 + 纪录 = 封顶 4 星');
assert(m.rankReward(false, 'expert', false, 0).delta === -1, '奖励：任何难度失败 -1 星');

/* ===== 3. 排位流程 ===== */
const ACH_N = m.ACH.length;
assert(ACH_N === 31, '成就总数 31 项（含 3 项战役成就）');
m.startRankedMatch('beginner');
assert(m.ranked === true, '进入排位模式');
assert(m.noGuess === true, '排位强制无猜');
assert(ids['ngToggle'].disabled === true, '排位中无猜开关被锁定');
assert(m.level === 'beginner', '排位难度按面板选择');

ids['ngToggle'].checked = false;
ids['ngToggle'].fire('change', {});
assert(ids['ngToggle'].checked === true && m.noGuess === true, '排位中关闭无猜无效（被弹回）');

/* g1：9 秒、破纪录、单次开 60 格、0 旗 */
m.setPerf({ maxBlank: 60, chords: 2, flags: 0 });
m.finishGame(true, 9, true);
const p = m.profile;
assert(p.rank.stars === 2, 'g1 胜利：+2 星（基础 1 + 破纪录 1）');
assert(p.rank.hist.length === 1 && p.rank.wins === 1, '战绩写入 1 条');
assert(ids['settle'].hidden === false, '排位结束弹出结算面板');
assert(ids['stGain'].textContent === '+2 ★', '结算显示 +2 ★');
assert(p.stats.games === 1 && p.stats.wins === 1, '统计：1 局 1 胜');
assert(p.stats.noguessWins === 1, '统计：无猜 1 胜');
assert(p.stats.maxBlank === 60, '统计：单次最大开路 60');
assert(Object.keys(p.ach).length === 3, 'g1 解锁 3 项成就（首胜/10 秒/开天窗）');

/* g2：普通胜利 */
m.setPerf({ maxBlank: 12, chords: 0, flags: 3 });
m.finishGame(true, 14, false);
assert(p.rank.stars === 3, 'g2 胜利：+1 星 → 满 3 星');

/* g3：3 连胜，触发晋级 */
m.setPerf({ maxBlank: 8, chords: 0, flags: 2 });
m.finishGame(true, 16, false);
assert(p.rank.streak === 3, '排位连胜计数 3');
assert(p.rank.tier === 2 && p.rank.stars === 1, '满星后 +2 星 → 晋级 青铜 Ⅱ 并带 1 星');
assert(p.stats.bestStreak === 3, '统计最佳连胜 3');
assert(!!p.ach['streak3'], '成就：手感来了（3 连胜）已解锁');

/* g4：失败 */
m.setPerf({ maxBlank: 3, chords: 0, flags: 1 });
m.finishGame(false, 20, false);
assert(p.rank.tier === 2 && p.rank.stars === 0, 'g4 失败：青铜 Ⅱ 1 星 → 0 星');
assert(p.rank.streak === 0 && p.stats.booms === 1, '失败清零连胜并记一次踩雷');
assert(ids['stGain'].textContent === '-1 ★', '结算显示 -1 ★');

/* g5：再赢一局 */
m.setPerf({ maxBlank: 5, chords: 0, flags: 0 });
m.finishGame(true, 22, false);
assert(p.rank.stars === 1, 'g5 胜利：回到 青铜 Ⅱ 1 星');
assert(Object.keys(p.ach).length === 4, '累计解锁 4 项成就');

/* ===== 4. 成就面板 ===== */
const pts = m.ACH.filter(a => p.ach[a.id]).reduce((s, a) => s + a.pts, 0);
m.openAchPanel();
assert(String(ids['achPts'].textContent) === String(pts), '成就面板：总点数 ' + pts);
assert(pts === 55, '点数 5+25+15+10 = 55');
assert(ids['achSub'].textContent.indexOf('已解锁 4 / ' + ACH_N) === 0, '成就面板：已解锁 4 / ' + ACH_N);
const listHtml = ids['achList'].innerHTML;
assert((listHtml.match(/ach-item q-/g) || []).length === ACH_N, '成就列表渲染 ' + ACH_N + ' 条');
assert(listHtml.indexOf('???') >= 0, '隐藏成就未解锁时显示 ???');
assert(listHtml.indexOf('achie-progress') < 0, '无残留占位内容');

const tabU = El('button'); tabU.tagName = 'BUTTON'; tabU.dataset.f = 'unlocked';
ids['achTabs'].fire('click', { target: tabU });
assert((ids['achList'].innerHTML.match(/ach-item q-/g) || []).length === 4, '筛选「已解锁」= 4 条');
assert(m.achFilter === 'unlocked', '筛选状态记录为 unlocked');

/* ===== 5. 段位面板 ===== */
m.openRankPanel();
assert(ids['rkTitle'].textContent === m.rankLabel(m.profile.rank), '段位面板标题与当前段位一致');
assert(ids['rkBar'].style.width === '33%', '段位进度条 1/3 = 33%');
assert(ids['rkStats'].innerHTML.indexOf('排位场次') >= 0, '段位面板渲染统计格');
assert(ids['rkHist'].innerHTML.indexOf('rh-dot') >= 0, '段位面板渲染战绩点');
assert((ids['rkHist'].innerHTML.match(/rh-dot/g) || []).length === 5, '战绩点 5 个');
assert(ids['rkPick'].innerHTML.indexOf('data-lv="expert"') >= 0, '段位面板渲染难度选择');

/* ===== 6. 持久化 ===== */
const raw = global.localStorage.getItem(REAL_KEY);
assert(!!raw, '档案已写入 localStorage');
const saved = JSON.parse(raw || '{}');
assert(saved.rank && saved.rank.stars === 1, '持久化：段位星数 1');
assert(saved.stats && saved.stats.games === 5, '持久化：总局数 5');
assert(saved.ach && Object.keys(saved.ach).length === 4, '持久化：成就 4 项');
assert(saved.rank.season === 1, '持久化：当前赛季 S1');

/* ===== 7. 退出排位 ===== */
m.leaveRanked();
assert(m.ranked === false, '退出排位模式');
assert(m.noGuess === false, '退出后无猜恢复为用户原设置');
assert(ids['ngToggle'].disabled === false, '退出后开关解锁');
assert(ids['settle'].hidden === true, '退出排位时结算面板被收起');

/* ===== 8. 非排位局不影响段位，且成就不重复解锁 ===== */
const starBefore = p.rank.stars;
const rankGamesBefore = p.rank.wins + p.rank.losses;
m.setPerf({ maxBlank: 30, chords: 0, flags: 0 });
m.finishGame(true, 9, true);
assert(p.rank.stars === starBefore, '非排位局不加星');
assert(p.rank.wins + p.rank.losses === rankGamesBefore, '非排位局不计排位场次');
assert(p.stats.games === 6, '非排位局仍计入总统计');
assert(Object.keys(p.ach).length === 4, '重复达成不会二次解锁');

/* ===== 9. 自定义大棋盘 ===== */
m.custom.rows = 32; m.custom.cols = 32; m.custom.mines = 150;
m.setLevel('custom');
m.setPerf({ maxBlank: 40, chords: 0, flags: 0 });
m.finishGame(true, 400, false);
assert(!!p.ach['big'], '成就：版图扩张（自定义 ≥30×30 获胜）');

/* ===== 10. 赛季软重置 ===== */
p.rank.season = 0; p.rank.ri = 3; p.rank.tier = 1; p.rank.stars = 4;
m.openRankPanel();
assert(p.rank.season === 1, '赛季切换：赛季号更新');
assert(p.rank.ri === 2 && p.rank.tier === 3 && p.rank.stars === 0, '赛季切换：软重置掉一个大段并清零星数');

console.log('\n' + (errors.length ? '❌ 失败 ' + errors.length + ' 项' : '✅ 全部通过（' + total + ' 项）'));
process.exit(errors.length ? 1 : 0);
