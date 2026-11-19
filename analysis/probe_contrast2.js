'use strict';
// 全界面文字对比度扫描（亮/暗）
const B = require('C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/analysis/browser.js');
const URL = 'file:///C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/minesweeper.html';

const lum = rgb => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
const parse = s => { const m = String(s).match(/(\d+(?:\.\d+)?)/g); if (!m || m.length < 3) return null; if (m.length > 3 && Number(m[3]) < 0.5) return null; return m.slice(0, 3).map(Number); };
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

const sample = sel => `(()=>{
  const out=[];
  document.querySelectorAll(${JSON.stringify(sel + ', ' + sel + ' *')}).forEach(el=>{
    if(el.children.length) return;
    if(el.offsetParent===null && getComputedStyle(el).position!=='fixed') return;
    const txt=(el.textContent||'').trim(); if(!txt||txt.length>26) return;
    const cs=getComputedStyle(el);
    if(cs.visibility==='hidden'||cs.display==='none') return;
    let n=el,d=0,found=null;
    while(n&&d<10){
      const c=getComputedStyle(n).backgroundColor;
      const m=String(c).match(/(\\d+(?:\\.\\d+)?)/g);
      if(m&&m.length>=3&&(m.length<4||Number(m[3])>0.6)){found=c;break}
      n=n.parentElement;d++;
    }
    if(!found) return;
    out.push({txt,cls:String(el.className||''),color:cs.color,size:parseFloat(cs.fontSize),weight:cs.fontWeight,op:cs.opacity,bg:found});
  });
  return out;
})()`;

(async () => {
  await B.openPage(URL);
  for (const theme of ['light', 'dark']) {
    await B.evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);
    await B.sleep(400); // 等样式重算，否则读到上一套主题的计算值
    console.log('\n########## ' + theme + ' ##########');
    const seen = new Set();
    const scan = async (sel) => {
      const rows = await B.evaluate(sample(sel));
      for (const r of rows) {
        const c = parse(r.color), b = parse(r.bg);
        if (!c || !b) continue;
        const cr = ratio(c, b);
        const key = r.cls + '|' + r.color + '|' + r.bg + '|' + r.size;
        if (seen.has(key)) continue; seen.add(key);
        const need = (r.size >= 18.66 || (r.size >= 14 && Number(r.weight) >= 700)) ? 3.0 : 4.5;
        if (cr < need) console.log('LOW ' + cr.toFixed(2).padStart(5) + '/' + need + ' ' + String(r.size).padStart(5) + 'px ' + r.cls.slice(0, 20).padEnd(20) + JSON.stringify(r.txt).slice(0, 18).padEnd(20) + r.color + ' on ' + r.bg + (r.op !== '1' ? ' op=' + r.op : ''));
      }
    };
    // 主界面
    await scan('.window');
    // 各面板
    for (const [btn, panel] of [['achBtn', '#achPanel'], ['statsBtn', '#statsPanel'], ['rankBtn', '#rankPanel'], ['campBtn', '#campPanel'], ['dailyBtn', '#dailyPanel']]) {
      await B.evaluate(`document.getElementById('${btn}').click()`);
      await B.sleep(180);
      await scan(panel);
    }
    await B.evaluate(`document.getElementById('statsBtn').click()`); // 关掉
    // 结算卡（用调试入口直接造一局胜利）
    await B.evaluate(`document.getElementById('rankBtn').click()`);
    await B.sleep(100);
  }
  await B.close();
})().catch(e => { console.error(e); process.exit(1); });
