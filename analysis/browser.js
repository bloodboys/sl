/**
 * 真实浏览器驱动器（Chrome DevTools Protocol，无第三方依赖）
 * 用途：加载 minesweeper.html，模拟真实鼠标/键盘，收集异常与控制台错误
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;

let proc = null, ws = null, msgId = 0;
const pending = new Map();
const events = [];
const listeners = [];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function httpJson(p) {
  const r = await fetch('http://127.0.0.1:' + PORT + p);
  return r.json();
}

async function openPage(fileUrl) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-chrome-'));
  proc = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userDir,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1400,1000',
    'about:blank'
  ], { stdio: 'ignore' });

  for (let i = 0; i < 100; i++) {
    try { await httpJson('/json/version'); break; } catch (e) { await sleep(100); }
  }
  const list = await httpJson('/json');
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');

  await new Promise((res, rej) => {
    ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
    } else if (m.method) {
      events.push(m);
      listeners.forEach(fn => fn(m));
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');

  const loaded = waitEvent('Page.loadEventFired', 15000);
  await send('Page.navigate', { url: fileUrl });
  await loaded.catch(() => {});
  await sleep(300);
}

function send(method, params) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); }
    }, 20000);
  });
}

function waitEvent(name, ms) {
  return new Promise((resolve, reject) => {
    const fn = m => {
      if (m.method === name) {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
        resolve(m.params);
      }
    };
    listeners.push(fn);
    setTimeout(() => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
      reject(new Error('event timeout ' + name));
    }, ms || 10000);
  });
}

async function evaluate(expr, awaitPromise) {
  const r = await send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: !!awaitPromise,
    userGesture: true
  });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error('EVAL: ' + (d.exception && d.exception.description || d.text));
  }
  return r.result.value;
}

async function rect(sel) {
  return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,cx:r.x,cy:r.y,cw:r.width,ch:r.height}})()`);
}

async function mouseClick(x, y, button, count) {
  button = button || 'left';
  const common = { button, clickCount: count || 1, x, y };
  await send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseMoved' }, common, { buttons: 0 }));
  await send('Input.dispatchMouseEvent', Object.assign({ type: 'mousePressed' }, common, { buttons: button === 'left' ? 1 : 2 }));
  await send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseReleased' }, common, { buttons: 0 }));
  await sleep(40);
}

async function clickSel(sel, button) {
  const r = await rect(sel);
  if (!r) throw new Error('no element ' + sel);
  await mouseClick(r.x, r.y, button);
}

const SPECIAL_KEYS = {
  escape: { key: 'Escape', code: 'Escape', vk: 27 },
  enter: { key: 'Enter', code: 'Enter', vk: 13 },
  ' ': { key: ' ', code: 'Space', vk: 32 },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  tab: { key: 'Tab', code: 'Tab', vk: 9 },
  backspace: { key: 'Backspace', code: 'Backspace', vk: 8 }
};

async function key(k, opts) {
  opts = opts || {};
  const sp = SPECIAL_KEYS[String(k).toLowerCase()];
  const info = sp || { key: k, code: 'Key' + String(k).toUpperCase(), vk: String(k).toUpperCase().charCodeAt(0) };
  const base = {
    key: info.key, code: info.code,
    windowsVirtualKeyCode: opts.vk || info.vk,
    nativeVirtualKeyCode: opts.vk || info.vk
  };
  const text = opts.text !== undefined ? opts.text : (sp ? undefined : String(info.key));
  await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, base, text ? { text } : {}));
  await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
  await sleep(30);
}

async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  return file;
}

function collectProblems() {
  const out = [];
  events.forEach(m => {
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      out.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text) + ' @' + d.lineNumber + ':' + d.columnNumber);
    }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      out.push('CONSOLE.' + m.params.type + ': ' + m.params.args.map(a => a.value !== undefined ? a.value : a.description).join(' '));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      out.push('LOG: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    }
  });
  return out;
}

async function close() {
  try { await send('Browser.close'); } catch (e) {}
  if (proc) { try { proc.kill(); } catch (e) {} }
}

module.exports = { openPage, send, evaluate, rect, mouseClick, clickSel, key, shot, sleep, collectProblems, close, events };
