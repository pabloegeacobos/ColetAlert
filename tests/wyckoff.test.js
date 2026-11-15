// node tests/wyckoff.test.js — estructuras sintéticas de Wyckoff
const W = require('../wyckoff.js');
let t = 0, out = [];
const bar = (o, h, l, c, v) => out.push({ t: (t += 3600e3), o, h, l, c, v });
const path = (from, to, nb, v, wig = 0.6) => { for (let i = 1; i <= nb; i++) { const p0 = from + (to - from) * (i - 1) / nb, p1 = from + (to - from) * i / nb; bar(p0, Math.max(p0, p1) + wig, Math.min(p0, p1) - wig, p1, v); } };
function acc() {
  t = 0; out = [];
  path(100, 62, 120, 100);                 // caída
  bar(62, 62.5, 55, 58.5, 450);             // SC
  path(58.5, 66, 8, 160);                   // AR
  path(66, 57.5, 10, 110);                  // ST
  for (let k = 0; k < 4; k++) { path(57.5, 63.5, 6, 80); path(63.5, 57.5, 6, 80); } // fase B
  bar(57.5, 57.8, 53.8, 54.6, 220);         // spring
  bar(54.6, 56.8, 54.4, 56.6, 140);         // vuelve dentro
  path(56.6, 60, 5, 90); path(60, 56.2, 5, 60); // test con poco volumen
  path(56.2, 65, 6, 120); bar(65, 67.8, 64.8, 67.5, 230); // SOS
  path(67.5, 65.2, 4, 70);                  // LPS
  path(65.2, 74, 12, 130);
  return out.slice();
}
function markdown() { t = 0; out = []; for (let k = 0; k < 6; k++) { path(100 - k * 8, 92 - k * 8, 20, 100); path(92 - k * 8, 95 - k * 8, 6, 60); } return out.slice(); }
function failed() { t = 0; out = []; path(100, 62, 120, 100); bar(62, 62.5, 55, 58.5, 450); path(58.5, 66, 8, 160); path(66, 57.5, 10, 110); path(57.5, 63.5, 6, 80); path(63.5, 50, 12, 150); path(50, 46, 6, 120); return out.slice(); }

let ok = 0, fail = 0; const chk = (name, cond, info) => { if (cond) { ok++; console.log('✓', name); } else { fail++; console.log('✗', name, info || ''); } };
const a = W.analyze(acc()), ks = a.cur.events.map(e => e.k).join(' ');
chk('Acumulación: detecta SC, AR, ST, Spring, SOS', ['SC', 'AR', 'ST', 'Spring', 'SOS'].every(k => a.cur.events.some(e => e.k === k)), ks);
chk('Acumulación: rango 55–66', Math.abs(a.cur.lo - 55) < 0.6 && Math.abs(a.cur.hi - 66.6) < 1, a.cur.lo + '–' + a.cur.hi);
chk('Acumulación: spring en ~53,8', Math.abs(a.cur.events.find(e => e.k === 'Spring').p - 53.8) < 0.7);
chk('Acumulación: fase D/E y sesgo alcista', ['D', 'E'].includes(a.fase) && a.sesgo === 1, a.fase + ' ' + a.sesgo);
chk('Acumulación: test con poco volumen y LPS', a.cur.events.some(e => e.k === 'Test') && a.cur.events.some(e => e.k === 'LPS'), ks);
const md = W.analyze(markdown());
chk('Markdown sin clímax: no inventa acumulación', md.fase === 'Markdown' && md.sesgo === -1, md.fase + ' / ' + md.nombre);
const f = W.analyze(failed());
chk('Rango roto a la baja: marca ruptura y markdown', f.structs.some(s => s.broken) && f.sesgo === -1, f.fase + ' ' + f.structs.map(s => s.events.map(e => e.k).join(',')).join(' | '));
const inv = acc().map(x => ({ t: x.t, o: 200 - x.o, h: 200 - x.l, l: 200 - x.h, c: 200 - x.c, v: x.v })), d = W.analyze(inv);
chk('Distribución (espejo): BC, AR, UTAD, SOW y sesgo bajista', ['BC', 'AR', 'UTAD', 'SOW'].every(k => d.cur.events.some(e => e.k === k)) && d.sesgo === -1, d.cur.events.map(e => e.k).join(' ') + ' ' + d.fase);
console.log(`\n${ok} ok, ${fail} fallos`); process.exit(fail ? 1 : 0);
