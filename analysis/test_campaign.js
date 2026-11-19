/**
 * 战役模式 / 数据统计 / 无障碍配色 测试
 * 运行：node analysis/test_campaign.js
 */
'use strict';
const fs = require('fs');
const htmlPath = 'C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/minesweeper.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\r\n/g, '\n');

const EXPORT = `
window.__c = {
  get G(){return G}, get profile(){return profile},
  newGame, primaryAction, toggleFlag, reveal, clearMines, finishGame, checkAchievements,
  get campaignMode(){return campaignMode}, set campaignMode(v){campaignMode = v;},
  get campaignIdx(){return campaignIdx},
  get level(){return level}, set level(v){level = v;},
  get noGuess(){return noGuess}, set noGuess(v){noGuess = v;},
  get custom(){return custom}, set custom(v){custom = v;},
  get bests(){return bests}, get lastCampStars(){return lastCampStars},
  LV_FLAT, LV_TOTAL, CAMPAIGN, ACH,
  campStarsArr, campTotalStars, campClearedCount, campUnlocked,
  starsFor, levelLimit, recordCampaign, startCampaign, leaveCampaign,
  campTimeout, showLevelSettle, hideLevelSettle,
  renderCampPanel, openCampPanel, renderStatsPanel, openStatsPanel,
  pushRecentStat, chartHtml, wrHtml, bestTableHtml, fmtDur,
  applyNumStyle, get numStyle(){return numStyle},
  saveProfile
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

const f = global.window.__c;
const errors = [];
let total = 0;
function assert(cond, msg) {
  total++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) errors.push(msg);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

/* 把棋盘铺到只差一格，然后 reveal 最后一格触发 checkWin */
function forceNearWin() {
  const G = f.G;
  const N = G.cells.length;
  // 必须挑一个「还没翻开」的安全格，否则首点泛洪恰好开掉了它，
  // 再 reveal 会直接 return，checkWin 就永远不会被触发
  let lastSafe = -1;
  for (let i = 0; i < N; i++) if (!G.cells[i].mine && !G.cells[i].open) lastSafe = i;
  for (let i = 0; i < N; i++) {
    if (!G.cells[i].mine && i !== lastSafe) {
      if (!G.cells[i].open) G.revealed++;
      G.cells[i].open = true;
    }
  }
  return lastSafe;
}

(async function run() {
  /* ===== 1. 关卡数据完整性 ===== */
  assert(f.LV_TOTAL === 30, '战役共 30 关');
  assert(f.CAMPAIGN.length === 5, '战役分 5 章');
  let dataOK = true, nameSet = {};
  f.CAMPAIGN.forEach(function (ch) {
    if (ch.lvs.length !== 6) dataOK = false;
    ch.lvs.forEach(function (lv) {
      if (nameSet[lv.name]) dataOK = false;
      nameSet[lv.name] = 1;
      if (lv.rows < 5 || lv.cols < 5 || lv.rows > 40 || lv.cols > 40) dataOK = false;
      if (lv.mines < 1 || lv.mines > lv.rows * lv.cols - 9) dataOK = false;
      if (!(lv.time > 0)) dataOK = false;
    });
  });
  assert(dataOK, '关卡参数合法：5×6 结构、名称唯一、雷数不超限、目标时间有效');

  /* ===== 2. 星级与时限 ===== */
  const fake = { time: 100 };
  assert(f.starsFor(fake, 60) === 3, '星级：用时 60s ≤ 目标 100s → 3 星');
  assert(f.starsFor(fake, 100) === 3, '星级：刚好卡在目标时间 → 3 星');
  assert(f.starsFor(fake, 101) === 2, '星级：超目标 1s → 2 星');
  assert(f.starsFor(fake, 150) === 2, '星级：1.5 倍目标 → 2 星');
  assert(f.starsFor(fake, 151) === 1, '星级：超 1.5 倍 → 1 星');
  assert(f.levelLimit({ time: 100, timed: false }) === 260, '时限：普通关卡 = 目标 × 2.6');
  assert(f.levelLimit({ time: 100, timed: true }) === 135, '时限：限时关卡 = 目标 × 1.35（更紧）');

  /* ===== 3. 解锁链 ===== */
  const st = f.campStarsArr();
  assert(st.length >= 30 && st.every(s => s === 0), '初始星图：30 关全部 0 星');
  assert(f.campUnlocked(0) === true, '解锁：第 1 关默认开放');
  assert(f.campUnlocked(1) === false, '解锁：第 2 关初始锁定');
  assert(f.campTotalStars() === 0 && f.campClearedCount() === 0, '初始统计：0 星 0 通关');

  f.recordCampaign(0, 2);
  assert(f.campStarsArr()[0] === 2, '记录：第 1 关记为 2 星');
  assert(f.campUnlocked(1) === true, '解锁：通关第 1 关后第 2 关开放');
  assert(f.campUnlocked(2) === false, '解锁：第 3 关仍锁定');
  assert(f.campTotalStars() === 2 && f.campClearedCount() === 1, '记录：总星数 2、通关 1 关');

  f.recordCampaign(0, 1);
  assert(f.campStarsArr()[0] === 2, '记录：重打成绩更差不会覆盖最佳星数');
  f.recordCampaign(0, 3);
  assert(f.campStarsArr()[0] === 3, '记录：重打成绩更好会刷新星数');

  /* ===== 4. 启动关卡 ===== */
  f.startCampaign(1);
  assert(f.campaignMode === true, '启动：进入战役模式');
  assert(f.level === 'custom', '启动：棋盘走自定义规格通道');
  assert(f.G.rows === f.LV_FLAT[1].rows && f.G.cols === f.LV_FLAT[1].cols, '启动：棋盘尺寸与关卡一致（' + f.G.rows + '×' + f.G.cols + '）');
  assert(f.G.mines === f.LV_FLAT[1].mines, '启动：雷数与关卡一致');
  assert(f.G.limit === f.levelLimit(f.LV_FLAT[1]), '启动：时限已注入本局（' + f.G.limit + 's）');
  assert(f.G.cells.length === f.G.rows * f.G.cols, '启动：格子数量正确');

  /* 锁定关卡不能启动 */
  f.startCampaign(5);
  assert(f.campaignIdx === 1, '启动：未解锁的关卡会被拒绝');

  /* ===== 5. 特殊规则 ===== */
  let noflagIdx = f.LV_FLAT.findIndex(lv => lv.noflag);
  let noguessIdx = f.LV_FLAT.findIndex(lv => lv.noguess);
  assert(noflagIdx > 0 && noguessIdx > 0, '关卡表包含「禁旗」与「无猜」两类特殊关卡');

  // 强制解锁以便直接启动
  for (let i = 0; i < noflagIdx; i++) f.campStarsArr()[i] = 3;
  f.startCampaign(noflagIdx);
  f.primaryAction(Math.floor(f.G.cells.length / 2));
  await wait(30);
  const before = f.G.flags;
  f.toggleFlag(0);
  assert(f.G.flags === before && !f.G.cells[0].flag, '禁旗关卡：插旗操作无效');
  assert(!!f.G.noflagWarned, '禁旗关卡：会给出一次提示');

  for (let i = 0; i < noguessIdx; i++) f.campStarsArr()[i] = 3;
  const wasNoGuess = f.noGuess;
  f.startCampaign(noguessIdx);
  assert(f.noGuess === true, '无猜关卡：强制开启无猜模式');
  f.leaveCampaign();
  assert(f.noGuess === wasNoGuess, '退出战役：无猜开关恢复原值');

  // 连续闯关：无猜关卡 → 普通关卡，状态不应残留
  for (let i = 0; i < noguessIdx; i++) f.campStarsArr()[i] = 3;
  f.startCampaign(noguessIdx);
  assert(f.noGuess === true, '连续闯关：无猜关卡开启无猜');
  f.campStarsArr()[noguessIdx] = 3;
  f.startCampaign(noguessIdx + 1);
  const nextLv = f.LV_FLAT[noguessIdx + 1];
  assert(f.noGuess === (nextLv.noguess === true), '连续闯关：下一关按自身规则重置无猜状态');
  f.leaveCampaign();

  /* ===== 6. 超时判负 ===== */
  f.startCampaign(1);
  f.primaryAction(40);
  await wait(30);
  f.G.limit = 1;
  f.campTimeout();
  assert(f.G.over === true && f.G.won === false, '超时：本局判定失败');
  assert(f.profile.stats.wl.campaign.l > 0, '超时：计入战役败场');

  /* ===== 7. 通关结算 ===== */
  const gamesBefore = f.profile.stats.games;
  const starsBefore = f.campStarsArr()[2] || 0;
  for (let i = 0; i < 2; i++) f.campStarsArr()[i] = 3;
  f.startCampaign(2); // 目标 44 秒 → 造一个 50 秒的成绩 = 2 星
  f.primaryAction(40);
  await wait(40);
  f.G.t0 = performance.now() - 50000;
  const lastSafe = forceNearWin();
  f.reveal(lastSafe);
  await wait(80);
  assert(f.G.won === true, '通关：安全格全开即判定胜利');
  assert(f.lastCampStars === 2, '通关：用时 50s / 目标 44s → 2 星');
  assert(f.campStarsArr()[2] === Math.max(starsBefore, 2), '通关：星数写入存档');
  assert(f.campUnlocked(3) === true, '通关：解锁下一关');
  assert(f.profile.stats.games === gamesBefore + 1, '通关：计入总场次');
  assert(f.profile.stats.wl.campaign.w > 0, '通关：胜场记在「战役」分类');
  assert(f.profile.ach.camp_first !== undefined, '通关：解锁成就「远征开始」');
  assert(f.G.limit === null || f.G.limit === undefined || !f.G.over === false, '通关：本局状态已结束');

  /* ===== 8. 统计 ===== */
  const s = f.profile.stats;
  assert(Array.isArray(s.recent) && s.recent.length > 0, '统计：最近对局已记录（' + s.recent.length + ' 条）');
  const r0 = s.recent[0];
  assert(r0.w === 1 && r0.lv === 'campaign', '统计：最新一条是战役胜利');
  assert(s.recent.length <= 30, '统计：最近记录上限 30 条');
  assert(s.totalSecs > 0, '统计：累计时长已累加');
  assert(s.bestBvps > 0, '统计：3BV/s 最佳已记录（' + s.bestBvps + '）');

  for (let i = 0; i < 40; i++) f.pushRecentStat(false, 'beginner', 12);
  assert(s.recent.length === 30, '统计：超过 30 条会裁掉最旧的');

  /* ===== 9. 面板渲染 ===== */
  f.campStarsArr()[0] = 3;
  f.renderCampPanel();
  const campHtml = ids['campList'].innerHTML;
  assert((campHtml.match(/data-lv="/g) || []).length === 30, '战役面板：渲染 30 个关卡卡片');
  assert(campHtml.indexOf('lv-card done') >= 0, '战役面板：已通关关卡带 done 标记');
  assert(campHtml.indexOf('lv-card locked') >= 0, '战役面板：未解锁关卡带 locked 标记');
  assert(campHtml.indexOf('lv-tag') >= 0, '战役面板：特殊规则显示标签');
  assert(String(ids['campSub'].textContent).indexOf('/ 90 ★') > 0, '战役面板：进度显示 x / 90 ★');

  f.renderStatsPanel();
  const chartHtml = ids['statChart'].innerHTML;
  assert(chartHtml.indexOf('<svg') === 0, '统计面板：图表以内联 SVG 渲染');
  assert(chartHtml.indexOf('<rect') > 0, '统计面板：柱状图有数据条');
  assert(ids['statBig'].innerHTML.indexOf('总场次') > 0, '统计面板：概览卡片渲染');
  assert(ids['statWr'].innerHTML.indexOf('战役') > 0, '统计面板：胜率行包含战役分类');
  assert(ids['statBest'].innerHTML.indexOf('--:--') >= 0 || ids['statBest'].innerHTML.indexOf(':') > 0, '统计面板：个人最佳表渲染');

  /* 图表刻度：最大值必须出现在 Y 轴标签上 */
  f.profile.stats.recent = [
    { w: 1, lv: 'expert', t: 356, bv: 100 },
    { w: 1, lv: 'beginner', t: 18, bv: 40 }
  ];
  const ch = f.chartHtml();
  assert(ch.indexOf('356s') > 0, '图表：Y 轴顶部刻度等于最大值（356s）');
  assert(ch.indexOf('178s') > 0, '图表：Y 轴中间刻度为最大值一半（178s）');

  /* 空数据也能渲染不报错 */
  s.recent = [];
  f.renderStatsPanel();
  assert(ids['statChart'].innerHTML.indexOf('还没有对局记录') > 0, '统计面板：无记录时显示空态');
  f.pushRecentStat(true, 'beginner', 20);

  /* ===== 10. 数字配色 ===== */
  f.applyNumStyle('cb');
  assert(f.numStyle === 'cb', '配色：切换为色盲友好');
  assert(rootEl.getAttribute('data-numstyle') === 'cb', '配色：写入根元素属性');
  assert(localStorage.getItem('win11.minesweeper.numstyle.v1') === 'cb', '配色：偏好已持久化');
  f.applyNumStyle('classic');
  assert(rootEl.getAttribute('data-numstyle') === 'classic', '配色：可切回经典');

  /* ===== 11. 退出战役恢复原状 ===== */
  f.startCampaign(0);
  const campCustom = Object.assign({}, f.custom);
  f.leaveCampaign();
  assert(f.campaignMode === false, '退出：战役模式关闭');
  assert(f.custom.rows !== campCustom.rows || f.custom.mines !== campCustom.mines, '退出：自定义棋盘参数已还原');

  console.log('\n' + (errors.length ? '❌ 失败 ' + errors.length + ' 项' : '✅ 全部通过（' + total + ' 项）'));
  process.exit(errors.length ? 1 : 0);
})();
