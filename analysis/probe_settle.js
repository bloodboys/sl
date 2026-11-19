'use strict';
// 结算卡片 / toast / 成就弹窗 文字对比度
const B = require('C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/analysis/browser.js');
const FILE = 'file:///C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/minesweeper.html';

const lum = rgb => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
const parse = s => { const m = String(s).match(/(\d+(?:\.\d+)?)/g); if (!m || m.length < 3) return null; if (m.length > 3 && Number(m[3]) < 0.6) return null; return m.slice(0, 3).map(Number); };
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

const sample = sel => `(()=>{
  const out=[];
  document.querySelectorAll(${JSON.stringify(sel + ', ' + sel + ' *')}).forEach(el=>{
    if(el.children.length) return;
    const txt=(el.textContent||'').trim(); if(!txt||txt.length>30) return;
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden') return;
    let n=el,d=0,found=null;
    while(n&&d<12){
      const c=getComputedStyle(n).backgroundColor;
      const m=String(c).match(/(\\d+(?:\\.\\d+)?)/g);
      if(m&&m.length>=3&&(m.length<4||Number(m[3])>0.6)){found=c;break}
      n=n.parentElement;d++;
    }
    if(!found) return;
    out.push({txt,cls:String(el.className||''),color:cs.color,size:parseFloat(cs.fontSize),weight:cs.fontWeight,bg:found});
  });
  return out;
})()`;

async function cellPoint(i) {
  return B.evaluate(`(()=>{const c=document.querySelectorAll('#board .cell')[${i}];const r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
}

async function winOnce() {
  await B.evaluate(`document.querySelector('#seg button[data-level="custom"]').click()`);
  await B.sleep(150);
  await B.evaluate(`document.getElementById('inRows').value='5';document.getElementById('inCols').value='5';document.getElementById('inMines').value='16';`);
  await B.evaluate(`document.getElementById('okCustom').click()`);
  await B.sleep(450);
  const p = await cellPoint(12);
  await B.mouseClick(p.x, p.y);
  await B.sleep(900);
}

(async () => {
  await B.openPage(FILE);
  for (const theme of ['light', 'dark']) {
    await B.evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);
    await winOnce();
    console.log('\n##### ' + theme + ' #####');
    for (const sel of ['#toast', '#settle', '.settle-card', '.ls-card', '#achToast']) {
      const rows = await B.evaluate(sample(sel));
      const seen = new Set();
      for (const r of rows) {
        const c = parse(r.color), b = parse(r.bg);
        if (!c || !b) continue;
        const cr = ratio(c, b);
        const key = r.color + r.bg + r.size;
        if (seen.has(key)) continue; seen.add(key);
        const need = (r.size >= 18.66 || (r.size >= 14 && Number(r.weight) >= 700)) ? 3.0 : 4.5;
        console.log((cr < need ? 'LOW ' : 'ok  ') + cr.toFixed(2).padStart(5) + '/' + need + ' ' + String(r.size).padStart(5) + 'px ' + String(r.cls).slice(0, 16).padEnd(16) + JSON.stringify(r.txt).slice(0, 16).padEnd(18) + r.color + ' on ' + r.bg);
      }
    }
    await B.evaluate(`document.querySelectorAll('.toast button, .settle button').forEach(b=>{if(/再来|继续/.test(b.textContent))b.click()})`);
    await B.sleep(300);
  }
  await B.close();
})().catch(e => { console.error(e); process.exit(1); });
