'use strict';
const B = require('./browser');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'minesweeper.html').replace(/\\/g, '/');

(async () => {
  await B.openPage(FILE);
  console.log('loaded:', await B.evaluate('document.title'));
  console.log('board cells:', await B.evaluate('document.querySelectorAll("#board .cell").length'));

  // 第一次点击中心
  const cells = await B.evaluate(`(()=>{const c=document.querySelectorAll('#board .cell');const r=c[40].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await B.mouseClick(cells.x, cells.y);
  await B.sleep(700);
  console.log('after first click:', await B.evaluate(`JSON.stringify({
    timer: document.getElementById('timer').textContent,
    open: document.querySelectorAll('#board .cell.open').length,
    mine: document.getElementById('mineCount').textContent
  })`));

  // 右键插旗
  const c2 = await B.evaluate(`(()=>{const c=document.querySelectorAll('#board .cell');const r=c[0].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await B.mouseClick(c2.x, c2.y, 'right');
  await B.sleep(120);
  console.log('after flag:', await B.evaluate(`JSON.stringify({mine: document.getElementById('mineCount').textContent, flags: document.querySelectorAll('#board .cell.flag').length})`));

  // 重开
  await B.key('r', { vk: 82, text: 'r' });
  await B.sleep(300);
  console.log('after restart:', await B.evaluate(`JSON.stringify({cellCount: document.querySelectorAll('#board .cell').length, timer: document.getElementById('timer').textContent, open: document.querySelectorAll('#board .cell.open').length})`));

  // 切高级
  await B.clickSel('#seg button[data-level="expert"]');
  await B.sleep(400);
  console.log('expert:', await B.evaluate(`JSON.stringify({cellCount: document.querySelectorAll('#board .cell').length, winW: document.getElementById('win').getBoundingClientRect().width, winH: document.getElementById('win').getBoundingClientRect().height, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight})`));

  console.log('problems:', B.collectProblems());
  await B.shot(path.resolve(__dirname, 'shot-expert.png'));
  await B.close();
})().catch(e => { console.error(e); process.exit(1); });
