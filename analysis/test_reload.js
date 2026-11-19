/**
 * 存档读取测试（DOM 桩）：旧版/残缺档案的兼容、损坏数据兜底
 */
'use strict';
const fs = require('fs');
const htmlPath = 'C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/minesweeper.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\r\n/g, '\n');

const EXPORT = `window.__meta = { get profile(){return profile}, ACH: ACH, openAchPanel: openAchPanel, openRankPanel: openRankPanel };\n`;
const patched = script.replace('/* ---------------- 启动 ---------------- */\n  newGame();', EXPORT + '/* ---------------- 启动 ---------------- */\n  newGame();');
if (patched === script) { console.error('注入失败'); process.exit(1); }

/* ---------------- DOM 桩 ---------------- */
function makeClassList() {
  const s = new Set();
  return { add(...c) { c.forEach(x => s.add(x)); }, remove(...c) { c.forEach(x => s.delete(x)); },
    contains(c) { return s.has(c); }, toggle(c, f) { f ? s.add(c) : s.delete(c); } };
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
    closest(sel) { return null; },
    appendChild(c) { this.children.push(c); return c; },
    focus() {}, select() {}, fire(t, ev) { (this._listeners[t] || []).forEach(fn => fn(ev)); }
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

const KEY = 'win11.minesweeper.profile.v1';
const errors = [];
let total = 0;
function assert(cond, msg) {
  total++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) errors.push(msg);
}

function boot(seed) {
  Object.keys(ids).forEach(k => delete ids[k]);
  global.localStorage._d = {};
  if (seed != null) global.localStorage._d[KEY] = seed;
  eval(patched);
  return global.window.__meta;
}

/* ---- 1. 残缺旧档：只存了段位 ---- */
let m = boot(JSON.stringify({ rank: { ri: 2, tier: 3, stars: 2, wins: 5, losses: 1 }, ach: { first_win: 1700000000000 } }));
let p = m.profile;
assert(p.rank.ri === 2 && p.rank.tier === 3 && p.rank.stars === 2, '旧档：段位字段保留（黄金 Ⅲ 2 星）');
assert(Array.isArray(p.rank.hist) && p.rank.hist.length === 0, '旧档：缺失的战绩补空数组');
assert(p.rank.season === 1, '旧档：缺失赛季号补当前赛季');
assert(p.rank.peak && p.rank.peak.ri === 0, '旧档：缺失最高段位补默认值');
assert(p.stats && p.stats.games === 0, '旧档：缺失统计补默认值');
assert(p.stats.wl && p.stats.wl.expert && p.stats.wl.expert.w === 0, '旧档：缺失各难度战绩可正常读写');
assert(p.stats.day && typeof p.stats.day.n === 'number', '旧档：缺失每日计数补默认值');
assert(Object.keys(p.ach).length === 1, '旧档：成就记录保留');
m.openAchPanel();
assert(String(ids['achPts'].textContent) === '5', '旧档：已解锁成就点数正确计入');
m.openRankPanel();
assert(ids['rkTitle'].textContent === '荣耀黄金 Ⅲ', '旧档：面板显示保存下来的段位');

/* ---- 2. 完全损坏的存档 ---- */
m = boot('{ this is not json');
p = m.profile;
assert(p.rank.ri === 0 && p.rank.stars === 0, '损坏存档：回退到初始段位');
assert(p.stats.games === 0 && Object.keys(p.ach).length === 0, '损坏存档：统计与成就清空');
assert(m.ACH.length === 31, '损坏存档：成就算法仍完整（31 项）');

/* ---- 3. 空存档 ---- */
m = boot(null);
assert(m.profile.rank.ri === 0 && m.profile.rank.tier === 3, '空存档：青铜 Ⅲ 起步');
assert(String(ids['rankStars'].textContent) === '0 ★', '空存档：工具栏显示 0 星');

/* ---- 4. 段位越界（旧版本遗留的异常数据） ---- */
m = boot(JSON.stringify({ rank: { ri: 99, tier: 7, stars: -3 } }));
p = m.profile;
let ok = false;
try { m.openRankPanel(); ok = true; } catch (e) { ok = false; }
assert(ok, '异常段位数据不会导致面板渲染崩溃');

console.log('\n' + (errors.length ? '❌ 失败 ' + errors.length + ' 项' : '✅ 全部通过（' + total + ' 项）'));
process.exit(errors.length ? 1 : 0);
