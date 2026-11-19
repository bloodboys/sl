'use strict';
/**
 * 真实浏览器审计：验证计时器、生成中重开、模式互斥、面板互斥、窗口按钮、键盘可达性
 */
const B = require('./browser');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'minesweeper.html').replace(/\\/g, '/');

let fails = 0;
function check(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) fails++;
}
const $ = s => `document.querySelector(${JSON.stringify(s)})`;

async function reload() {
  await B.send('Page.navigate', { url: FILE });
  await B.sleep(600);
  // 统一用浅色主题截图/校验
  await B.evaluate(`localStorage.setItem('win11.minesweeper.theme.v1','light')`);
  await B.evaluate(`localStorage.setItem('win11.minesweeper.profile.v1','')`);
  await B.send('Page.reload', {});
  await B.sleep(700);
}

async function cellPoint(i) {
  return B.evaluate(`(()=>{const c=document.querySelectorAll('#board .cell')[${i}];if(!c)return null;const r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
}

async function firstClick(i) {
  const p = await cellPoint(i);
  await B.mouseClick(p.x, p.y);
  await B.sleep(500);
}

(async () => {
  await B.openPage(FILE);
  await reload();

  /* ---------- 1. 基础 ---------- */
  check(await B.evaluate(`${$('#board')}.children.length`) === 81, '初始 9×9 棋盘渲染 81 格');
  check(await B.evaluate(`document.documentElement.getAttribute('data-theme')`) === 'light', '浅色主题生效');

  /* ---------- 2. 计时器在重开后归零（旧 bug：显示页面运行时长） ---------- */
  await firstClick(40);
  await B.sleep(1100);
  const t1 = await B.evaluate(`${$('#timer')}.textContent`);
  check(Number(t1) >= 1, '首点后开始计时（' + t1 + 's）');
  await B.key('r');
  await B.sleep(700);
  const t2 = await B.evaluate(`${$('#timer')}.textContent`);
  await B.sleep(900);
  const t3 = await B.evaluate(`${$('#timer')}.textContent`);
  check(t2 === '000' && t3 === '000', '重开后计时器归零并保持（' + t1 + ' → ' + t2 + ' → ' + t3 + '）');
  check(await B.evaluate(`document.querySelectorAll('#board .cell.open').length`) === 0, '重开后棋盘清空');
  check(await B.evaluate(`document.querySelectorAll('#board .cell.flag').length`) === 0, '重开后旗帜清空');

  /* ---------- 3. 插旗 / 剩余雷数 ---------- */
  await firstClick(40);
  const closed = await B.evaluate(`(()=>{const c=[...document.querySelectorAll('#board .cell')].findIndex(x=>!x.classList.contains('open'));const r=document.querySelectorAll('#board .cell')[c].getBoundingClientRect();return {i:c,x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await B.mouseClick(closed.x, closed.y, 'right');
  await B.sleep(120);
  check(await B.evaluate(`${$('#mineCount')}.textContent`) === '009', '插旗后剩余雷数 -1');
  await B.mouseClick(closed.x, closed.y, 'right');
  await B.sleep(120);
  check(await B.evaluate(`${$('#mineCount')}.textContent`) === '010', '取消插旗后剩余雷数恢复');

  /* ---------- 4. 无猜模式 + 生成 ---------- */
  await B.clickSel('#ngToggle', 'left');
  await B.sleep(300);
  check(await B.evaluate(`${$('#ngToggle')}.checked`) === true, '无猜开关可开启');
  await firstClick(40);
  check(await B.evaluate(`${$('#gen')}.classList.contains('show')`) === false, '生成结束后遮罩收起');
  check(await B.evaluate(`document.querySelectorAll('#board .cell.open').length`) > 0, '无猜棋盘首点成功翻开');
  check(await B.evaluate(`${$('#modeNote')}.textContent.indexOf('无猜')`) >= 0, '页脚提示无猜模式');

  /* ---------- 5. 面板互斥 ---------- */
  await B.key('p', { vk: 80, text: 'p' });
  await B.sleep(250);
  check(await B.evaluate(`${$('#rankPanel')}.hidden`) === false, 'P 打开排位面板');
  await B.evaluate(`document.getElementById('statsBtn').click()`);
  await B.sleep(250);
  const openPanels = await B.evaluate(`['rankPanel','achPanel','campPanel','statsPanel','dailyPanel'].filter(id=>!document.getElementById(id).hidden)`);
  check(openPanels.length === 1 && openPanels[0] === 'statsPanel', '切换面板时旧面板自动关闭（当前：' + openPanels.join(',') + '）');
  await B.key('escape');
  await B.sleep(200);
  check(await B.evaluate(`document.getElementById('statsPanel').hidden`) === true, 'Esc 关闭面板');

  /* ---------- 6. 面板打开时棋盘快捷键失效 ---------- */
  await B.evaluate(`document.getElementById('achBtn').click()`);
  await B.sleep(200);
  const openBeforeKey = await B.evaluate(`document.querySelectorAll('#board .cell.open').length`);
  await B.key('r', { vk: 82, text: 'r' });
  await B.sleep(200);
  check(await B.evaluate(`document.querySelectorAll('#board .cell.open').length`) === openBeforeKey, '面板打开时 R 不会偷偷重开棋局');
  await B.key('escape');
  await B.sleep(200);

  /* ---------- 7. 战役 → 每日：模式不能串 ---------- */
  await reload();
  await B.evaluate(`document.getElementById('campBtn').click()`);
  await B.sleep(300);
  await B.evaluate(`document.querySelector('#campList .lv-card').click()`);
  await B.sleep(500);
  const campNote = await B.evaluate(`${$('#modeNote')}.textContent`);
  check(campNote.indexOf('战役') >= 0, '战役关卡启动（' + campNote.slice(0, 18) + '…）');
  await B.key('d', { vk: 68, text: 'd' });
  await B.sleep(250);
  await B.evaluate(`document.getElementById('dailyStart').click()`);
  await B.sleep(500);
  const dailyNote = await B.evaluate(`${$('#modeNote')}.textContent`);
  check(dailyNote.indexOf('每日挑战') >= 0, '从战役进入每日后模式正确（' + dailyNote + '）');

  /* ---------- 8. 战役 → 排位 ---------- */
  await reload();
  await B.evaluate(`document.getElementById('campBtn').click()`);
  await B.sleep(250);
  await B.evaluate(`document.querySelector('#campList .lv-card').click()`);
  await B.sleep(400);
  await B.evaluate(`document.getElementById('rankBtn').click()`);
  await B.sleep(250);
  await B.evaluate(`document.getElementById('rkStart').click()`);
  await B.sleep(500);
  const rankNote = await B.evaluate(`${$('#modeNote')}.textContent`);
  check(rankNote.indexOf('排位赛') >= 0, '从战役进入排位后模式正确（' + rankNote + '）');
  check(await B.evaluate(`document.getElementById('rankBtn').classList.contains('ranked-on')`) === true, '排位状态已高亮');

  /* ---------- 9. 排位中开自定义：必须退出排位 ---------- */
  await B.evaluate(`document.querySelector('#seg button[data-level="custom"]').click()`);
  await B.sleep(200);
  await B.evaluate(`document.getElementById('inRows').value='8';document.getElementById('inCols').value='8';document.getElementById('inMines').value='5';`);
  await B.evaluate(`document.getElementById('okCustom').click()`);
  await B.sleep(500);
  check(await B.evaluate(`document.getElementById('rankBtn').classList.contains('ranked-on')`) === false, '自定义开局会退出排位');
  check(await B.evaluate(`document.querySelectorAll('#board .cell').length`) === 64, '自定义 8×8 棋盘生效（64 格）');

  /* ---------- 10. 窗口按钮 ---------- */
  await reload();
  await B.evaluate(`document.getElementById('winMin').click()`);
  await B.sleep(200);
  check(await B.evaluate(`document.getElementById('win').classList.contains('min')`) === true, '最小化收起内容');
  await B.evaluate(`document.getElementById('winMin').click()`);
  await B.sleep(200);
  check(await B.evaluate(`document.getElementById('win').classList.contains('min')`) === false, '再次点击还原');

  await B.evaluate(`document.getElementById('winMax').click()`);
  await B.sleep(300);
  const box = await B.evaluate(`(()=>{const r=document.getElementById('win').getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),left:Math.round(r.left)}})()`);
  check(box.left === 16 || box.left === 15, '最大化贴边铺开（left=' + box.left + '）');
  await B.evaluate(`document.getElementById('winMax').click()`);
  await B.sleep(300);
  check(await B.evaluate(`document.getElementById('win').classList.contains('max')`) === false, '最大化可还原');

  await B.evaluate(`document.getElementById('winClose').click()`);
  await B.sleep(200);
  check(await B.evaluate(`document.getElementById('win').hidden`) === true, '关闭后窗口隐藏');
  check(await B.evaluate(`document.getElementById('reopen').hidden`) === false, '出现重新打开按钮');
  await B.evaluate(`document.getElementById('reopen').click()`);
  await B.sleep(300);
  check(await B.evaluate(`document.getElementById('win').hidden`) === false, '可重新打开');

  // 面板打开时关窗口：面板不能孤零零留在桌面上
  await B.evaluate(`document.getElementById('achBtn').click()`);
  await B.sleep(200);
  check(await B.evaluate(`document.getElementById('achPanel').hidden`) === false, '成就面板已打开');
  await B.evaluate(`document.getElementById('winClose').click()`);
  await B.sleep(200);
  check(await B.evaluate(`document.getElementById('achPanel').hidden`) === true, '关窗口时面板一并收起');
  await B.evaluate(`document.getElementById('reopen').click()`);
  await B.sleep(250);

  /* ---------- 11. 极端自定义盘不溢出 ---------- */
  await B.evaluate(`(()=>{document.querySelector('#seg button[data-level="custom"]').click();})()`);
  await B.sleep(150);
  await B.evaluate(`document.getElementById('inRows').value='40';document.getElementById('inCols').value='40';document.getElementById('inMines').value='300';`);
  await B.evaluate(`document.getElementById('okCustom').click()`);
  await B.sleep(700);
  const fit = await B.evaluate(`(()=>{const w=document.getElementById('win').getBoundingClientRect();const b=document.getElementById('board').getBoundingClientRect();return {winW:Math.round(w.width),winH:Math.round(w.height),boardW:Math.round(b.width),boardH:Math.round(b.height),vw:innerWidth,vh:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight}})()`);
  check(fit.boardW <= fit.vw && fit.boardH <= fit.vh, '40×40 棋盘不超出视口（' + fit.boardW + '×' + fit.boardH + ' / ' + fit.vw + '×' + fit.vh + '）');
  console.log('     布局数据', JSON.stringify(fit));

  /* ---------- 12. 生成未完成时重开：不能串局 / 卡死 ---------- */
  await reload();
  await B.evaluate(`(()=>{
    const ng=document.getElementById('ngToggle');
    if(!ng.checked) ng.click();                                        // 打开无猜，生成更慢
    const c=document.querySelectorAll('#board .cell')[40];
    c.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    document.getElementById('reset').click();                          // 同一 tick 立刻重开
  })()`);
  await B.sleep(1200);
  check(await B.evaluate(`document.querySelectorAll('#board .cell.open').length`) === 0, '生成途中重开：不会留下野生成棋盘');
  check(await B.evaluate(`${$('#timer')}.textContent`) === '000', '生成途中重开：计时器仍为 000');
  check(await B.evaluate(`${$('#gen')}.classList.contains('show')`) === false, '生成途中重开：遮罩已收起');
  await firstClick(40);
  check(await B.evaluate(`document.querySelectorAll('#board .cell.open').length`) > 0, '生成途中重开后仍可正常开局');

  /* ---------- 13. 确定性通关：5×5 / 16 雷（只剩 3×3 安全区） ---------- */
  await B.evaluate(`document.querySelector('#seg button[data-level="custom"]').click()`);
  await B.sleep(150);
  await B.evaluate(`document.getElementById('inRows').value='5';document.getElementById('inCols').value='5';document.getElementById('inMines').value='16';`);
  await B.evaluate(`document.getElementById('okCustom').click()`);
  await B.sleep(500);
  check(await B.evaluate(`document.querySelectorAll('#board .cell').length`) === 25, '5×5 棋盘生效（25 格）');
  await firstClick(12);
  await B.sleep(700);
  check(await B.evaluate(`document.querySelectorAll('#board .cell.open').length`) === 9, '首点翻开 3×3 安全区（9 格）');
  check(await B.evaluate(`document.getElementById('toast').classList.contains('show')`) === true, '通关后弹出胜利提示');
  check((await B.evaluate(`${$('#toastTitle')}.textContent`)).indexOf('成功') >= 0, '提示文案为通关（' + (await B.evaluate(`${$('#toastTitle')}.textContent`)) + '）');
  check(await B.evaluate(`document.querySelectorAll('#board .cell.flag').length`) === 16, '通关后自动补满 16 面旗');
  check(await B.evaluate(`${$('#mineCount')}.textContent`) === '000', '通关后剩余雷数归零');
  check(await B.evaluate(`${$('#reset')}.textContent`) === '😎', '通关后表情切换为 😎');

  /* ---------- 14. 键盘玩法 ---------- */
  await reload();
  await B.key('arrowright');
  await B.sleep(150);
  check(await B.evaluate(`document.querySelectorAll('#board .cell.cursor').length`) === 1, '方向键出现键盘光标');
  const curIdx = await B.evaluate(`[...document.querySelectorAll('#board .cell')].findIndex(c=>c.classList.contains('cursor'))`);
  check(curIdx === 41, '光标从中心向右移动一格（index=' + curIdx + '）');
  await B.key('f');
  await B.sleep(150);
  check(await B.evaluate(`document.querySelectorAll('#board .cell.flag').length`) === 1, 'F 键插旗');
  check(await B.evaluate(`${$('#mineCount')}.textContent`) === '009', '键盘插旗后剩余雷数 -1');
  await B.key('arrowdown');
  await B.sleep(120);
  check(await B.evaluate(`[...document.querySelectorAll('#board .cell')].findIndex(c=>c.classList.contains('cursor'))`) === 50, '光标下移一行（41 → 50）');
  await B.key(' ');
  await B.sleep(500);
  check(await B.evaluate(`document.querySelectorAll('#board .cell.open').length`) > 0, '空格键翻开当前格');
  const hintTitle0 = await B.evaluate(`${$('#hintBtn')}.title`);
  await B.key('h');
  await B.sleep(300);
  check((await B.evaluate(`${$('#modeNote')}.textContent`)).indexOf('提示：第') === 0, 'H 键给出可确定格提示');
  check((await B.evaluate(`${$('#hintBtn')}.title`)).indexOf('剩 2 次') >= 0, '提示次数递减（' + hintTitle0.slice(0, 8) + '…）');

  /* ---------- 15. 主题 / 音效键盘切换 ---------- */
  const themeBefore = await B.evaluate(`document.documentElement.getAttribute('data-theme')`);
  await B.key('t');
  await B.sleep(150);
  check(await B.evaluate(`document.documentElement.getAttribute('data-theme')`) !== themeBefore, 'T 键切换主题');
  await B.key('t');
  await B.sleep(150);
  const soundOff = await B.evaluate(`${$('#soundBtn')}.classList.contains('off')`);
  await B.key('s');
  await B.sleep(120);
  check(await B.evaluate(`${$('#soundBtn')}.classList.contains('off')`) !== soundOff, 'S 键切换音效');
  await B.key('s');
  await B.sleep(120);

  /* ---------- 16. 每日挑战真实开局 ---------- */
  await B.key('d');
  await B.sleep(250);
  check(await B.evaluate(`${$('#dailyPanel')}.hidden`) === false, 'D 键打开每日挑战');
  await B.evaluate(`document.getElementById('dailyStart').click()`);
  await B.sleep(400);
  check(await B.evaluate(`document.querySelectorAll('#board .cell').length`) === 256, '每日棋盘 16×16 = 256 格');
  check(await B.evaluate(`${$('#modeNote')}.textContent.indexOf('每日挑战')`) === 0, '页脚进入每日挑战模式');
  check(await B.evaluate(`${$('#ngToggle')}.disabled`) === true, '每日挑战锁定无猜开关');
  await firstClick(40);
  check(await B.evaluate(`document.querySelectorAll('#board .cell.open').length`) > 9, '每日首点至少开出 3×3');

  /* ---------- 17. 截图 ---------- */
  await reload();
  await firstClick(40);
  await B.shot(path.resolve(__dirname, 'shot-beginner-light.png'));

  await B.evaluate(`document.getElementById('campBtn').click()`);
  await B.sleep(300);
  await B.shot(path.resolve(__dirname, 'shot-camp-light.png'));
  await B.key('escape');
  await B.evaluate(`document.getElementById('achBtn').click()`);
  await B.sleep(300);
  await B.shot(path.resolve(__dirname, 'shot-ach-light.png'));
  await B.key('escape');
  await B.evaluate(`document.getElementById('statsBtn').click()`);
  await B.sleep(300);
  await B.shot(path.resolve(__dirname, 'shot-stats-light.png'));
  await B.key('escape');
  await B.evaluate(`document.getElementById('rankBtn').click()`);
  await B.sleep(300);
  await B.shot(path.resolve(__dirname, 'shot-rank-light.png'));
  await B.key('escape');
  await B.key('d', { vk: 68, text: 'd' });
  await B.sleep(300);
  await B.shot(path.resolve(__dirname, 'shot-daily-light.png'));

  /* ---------- 13. 深色主题 ---------- */
  await B.key('escape');
  await B.key('t', { vk: 84, text: 't' });
  await B.sleep(300);
  await B.evaluate(`document.getElementById('campBtn').click()`);
  await B.sleep(300);
  await B.shot(path.resolve(__dirname, 'shot-camp-dark.png'));
  await B.key('escape');

  const probs = B.collectProblems();
  console.log('\n控制台问题 ' + probs.length + ' 个');
  probs.slice(0, 12).forEach(p => console.log('  ' + p));
  if (probs.length) fails += probs.length;

  console.log('\n' + (fails ? '❌ 失败 ' + fails + ' 项' : '✅ 全部通过'));
  await B.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
