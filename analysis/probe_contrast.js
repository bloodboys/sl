'use strict';
// 对比度扫描：亮/暗两套主题下的次级文字
const B = require('C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/analysis/browser.js');
const URL = 'file:///C:/Users/Administrator/WorkBuddy/2026-11-16-19-47-44/minesweeper.html';

function lum(rgb) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
function parse(s) {
  const m = String(s).match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) return null;
  if (m.length > 3 && Number(m[3]) === 0) return null;
  return m.slice(0, 3).map(Number);
}
function ratio(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const sample = sel => `(()=>{
  const out=[];
  const push=(el)=>{
    if(el.children.length) return;
    const txt=(el.textContent||'').trim(); if(!txt||txt.length>26) return;
    const cs=getComputedStyle(el);
    let bg='rgba(0, 0, 0, 0)', n=el, d=0, found=null;
    while(n && d<8){
      const c=getComputedStyle(n).backgroundColor;
      const m=String(c).match(/(\\d+(?:\\.\\d+)?)/g);
      if(m && m.length>=3 && (m.length<4 || Number(m[3])>0.5)){ found=c; break; }
      n=n.parentElement; d++;
    }
    out.push({txt, cls:String(el.className||''), color:cs.color, size:parseFloat(cs.fontSize), weight:cs.fontWeight, bg:found||bg});
  };
  document.querySelectorAll(${JSON.stringify(sel + ', ' + sel + ' *')}).forEach(push);
  return out;
})()`;

(async () => {
  await B.openPage(URL);
  for (const theme of ['light', 'dark']) {
    await B.evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);
    const groups = [['achBtn', '#achPanel'], ['statsBtn', '#statsPanel']];
    console.log('\n########## ' + theme + ' ##########');
    const seen = new Set();
    for (const [btn, panel] of groups) {
      await B.evaluate(`document.getElementById('${btn}').click()`);
      await B.sleep(150);
      const rows = await B.evaluate(sample(panel));
      for (const r of rows) {
        const c = parse(r.color), b = parse(r.bg);
        if (!c || !b) continue;
        const cr = ratio(c, b);
        const key = r.cls + '|' + r.color + '|' + r.bg + '|' + r.size;
        if (seen.has(key)) continue; seen.add(key);
        const need = (r.size >= 18.66 || (r.size >= 14 && Number(r.weight) >= 700)) ? 3.0 : 4.5;
        console.log((cr < need ? 'LOW ' : 'ok  ') + cr.toFixed(2).padStart(5) + '/' + need + ' ' + String(r.size).padStart(5) + 'px ' + r.cls.slice(0, 22).padEnd(22) + JSON.stringify(r.txt).slice(0, 20).padEnd(22) + r.color + ' on ' + r.bg);
      }
    }
  }
  await B.close();
})().catch(e => { console.error(e); process.exit(1); });
