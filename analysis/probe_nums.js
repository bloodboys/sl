'use strict';
// 数字配色可读性矩阵：主题 × 数字配色方案
const B = require('C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/analysis/browser.js');
const URL = 'file:///C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/minesweeper.html';

const lum = rgb => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
const parse = s => { const m = String(s).match(/(\d+(?:\.\d+)?)/g); return m ? m.slice(0, 3).map(Number) : null; };
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

(async () => {
  await B.openPage(URL);
  for (const theme of ['light', 'dark']) {
    for (const ns of ['', 'cb', 'dark']) {
      await B.evaluate(`(()=>{
        document.documentElement.setAttribute('data-theme','${theme}');
        ${ns ? `document.documentElement.setAttribute('data-numstyle','${ns}');` : `document.documentElement.removeAttribute('data-numstyle');`}
        const b=document.getElementById('board');
        b.innerHTML='';
        for(let i=1;i<=8;i++){
          const d=document.createElement('div');
          d.className='cell open n'+i; d.textContent=String(i);
          d.style.width='40px'; d.style.height='40px';
          b.appendChild(d);
        }
      })()`);
      await B.sleep(60);
      const rows = await B.evaluate(`Array.from(document.querySelectorAll('#board .cell')).map(e=>{
        const cs=getComputedStyle(e);
        return {n:e.textContent, color:cs.color, bg:cs.backgroundColor, fw:cs.fontWeight, fs:cs.fontSize};
      })`);
      const out = rows.map(r => {
        const c = parse(r.color), b = parse(r.bg);
        const cr = ratio(c, b);
        return r.n + ':' + cr.toFixed(1) + (cr < 3.0 ? '!!' : '');
      });
      const bad = rows.filter(r => ratio(parse(r.color), parse(r.bg)) < 3.0).map(r => r.n);
      console.log((theme + '/' + (ns || 'std')).padEnd(12), out.join('  '), bad.length ? '  <= LOW: ' + bad.join(',') : '');
    }
  }
  await B.close();
})().catch(e => { console.error(e); process.exit(1); });
