/**
 * 游戏整体回归测试（DOM 桩）：普通模式 + 无猜模式
 */
'use strict';
const fs = require('fs');
const htmlPath = 'C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/minesweeper.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\r\n/g, '\n');

const patched = script.replace(
  '/* ---------------- 启动 ---------------- */\n  newGame();',
  'window.__ms = { get G(){return G}, newGame, reveal, chord, toggleFlag, canSolveByLogic, get noGuess(){return noGuess} };\n  newGame();'
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

global.document = {
  getElementById(id) {
    if (!ids[id]) ids[id] = (id === 'seg' ? seg : El('div', id));
    return ids[id];
  },
  createElement: t => El(t),
  addEventListener() {},
  createDocumentFragment: () => El('div'),
  body: El('body'),
  documentElement: (function () {
    const r = El('html');
    r._attrs = {};
    r.setAttribute = function (k, v) { this._attrs[k] = String(v); };
    r.getAttribute = function (k) { return this._attrs[k] === undefined ? null : this._attrs[k]; };
    return r;
  })()
};
global.window = {
  innerWidth: 1440, innerHeight: 900,
  addEventListener() {},
  matchMedia() { return { matches: false, addEventListener() {} }; }
};
Object.defineProperty(global, 'navigator', { value: {}, configurable: true });
global.localStorage = { _d: {}, getItem(k) { return this._d[k] === undefined ? null : this._d[k]; }, setItem(k, v) { this._d[k] = v; } };

/* ---------------- 执行 ---------------- */
try { eval(patched); } catch (e) { console.error('加载失败\n' + e.stack); process.exit(1); }
const ms = global.window.__ms;
const boardEl = ids['board'];
const ngToggle = ids['ngToggle'];

const errors = [];
function assert(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) errors.push(msg);
}
function click(i) { boardEl.fire('click', { target: boardEl.children[i] }); }
function setNoGuess(on) { ngToggle.checked = on; ngToggle.fire('change'); }
function finish() {
  console.log('\n' + (errors.length ? '❌ 失败 ' + errors.length + ' 项' : '✅ 全部通过'));
  process.exit(errors.length ? 1 : 0);
}

setTimeout(() => {
  assert(ms.G.cells.length === 81, '初始 81 格');
  assert(ids['modeNote'].textContent === '', '普通模式无模式标记');

  click(40);
  setTimeout(() => {
    assert(ms.G.started, '普通模式：首点后开局');
    assert(ms.G.cells.filter(c => c.mine).length === 10, '普通模式：10 颗雷');

    setNoGuess(true);
    assert(ms.noGuess === true, '无猜开关生效');
    assert(ids['modeNote'].textContent.indexOf('无猜') >= 0, '页脚显示无猜标记');

    click(40);
    setTimeout(() => {
      assert(ms.G.started, '无猜模式：首点后开局');
      assert(ms.G.cells.filter(c => c.mine).length === 10, '无猜模式：10 颗雷');
      assert(ms.canSolveByLogic(40) === true, '无猜模式：生成结果确实可纯逻辑通关');
      assert(ids['gen'].classList.contains('show') === false, '生成遮罩已隐藏');

      seg.fire('click', { target: segButtons[2] });
      assert(ms.G.cells.length === 480, '切到高级：480 格');
      const mid = 240;
      click(mid);
      setTimeout(() => {
        assert(ms.G.started, '高级+无猜：开局');
        assert(ms.G.cells.filter(c => c.mine).length === 99, '高级：99 颗雷');
        assert(ms.canSolveByLogic(mid) === true, '高级无猜：可纯逻辑通关');

        setNoGuess(false);
        let tries = 0, unsolvableSeen = false;
        (function round() {
          click(mid);
          setTimeout(() => {
            if (!ms.canSolveByLogic(mid)) unsolvableSeen = true;
            tries++;
            if (tries < 25 && !unsolvableSeen) {
              setNoGuess(false);
              round();
            } else {
              assert(unsolvableSeen, '关闭无猜后高级会生成不可纯逻辑通关的棋盘（对照组，' + tries + ' 局内出现）');
              finish();
            }
          }, 26);
        })();
      }, 60);
    }, 60);
  }, 40);
}, 30);
