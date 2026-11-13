// Pruebas del contador de Elliott con patrones de libro generados sintéticamente.
// node tests/elliott.test.js
const E = require('../engine.js'), W = require('../elliott.js');
function series(piv, seed = 7) {
  let x = seed; const r = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const c = []; let t = 0;
  for (let k = 1; k < piv.length; k++) {
    const a = piv[k - 1], b = piv[k], bars = Math.max(8, Math.round(Math.abs(b - a) / 0.4));
    for (let j = 1; j <= bars; j++) {
      const o = a + (b - a) * (j - 1) / bars, cl = a + (b - a) * j / bars;
      const hi = Math.max(o, cl) + 0.05 * r(), lo = Math.min(o, cl) - 0.05 * r();
      c.push({ t: t++ * 3600e3, o, h: j === bars && b > a ? b : hi, l: j === bars && b < a ? b : lo, c: cl, v: 100 + 50 * r() });
    }
  }
  return c;
}
const CASES = [
  { n: 'Impulso común alcista', piv: [130, 100, 120, 108, 150, 138, 160], exp: /Impulso común/, pts: 6 },
  { n: 'Impulso 3 extendida', piv: [130, 100, 112, 105, 145, 136, 149], exp: /Impulso común/, pts: 6 },
  { n: 'Impulso en onda 4 (falta 5)', piv: [130, 100, 120, 108, 150, 138], exp: /Impulso común/, pts: 5 },
  { n: 'Diagonal contractiva', piv: [130, 100, 120, 108, 122.5, 113, 122], exp: /Diagonal contractiva/, pts: 6 },
  { n: 'Zigzag bajista', piv: [80, 100, 90, 95, 84], exp: /Zigzag/, pts: 4 },
  { n: 'Flat regular', piv: [80, 100, 90, 99.5, 89], exp: /Flat regular/, pts: 4 },
  { n: 'Flat expandido', piv: [70, 100, 90, 103.8, 81.5], exp: /Flat expandido/, pts: 4 },
  { n: 'Triángulo contractivo', piv: [70, 100, 90, 97, 91.5, 95.5, 92.8], exp: /Triángulo contractivo/, pts: 6 },
  { n: 'Triángulo expansivo', piv: [80, 100, 97, 101, 95.5, 102.5, 94], exp: /Triángulo expansivo/, pts: 6 },
  { n: 'Triángulo de barrera', piv: [70, 100, 90, 97, 92, 97, 94], exp: /barrera/, pts: 6 },
  { n: 'Doble zigzag W-X-Y', piv: [80, 100, 94, 97, 90, 94, 88, 91, 80], exp: /Doble zigzag/, pts: 8 },
  { n: 'Doble zigzag en formación (X)', piv: [80, 100, 94, 97, 90, 94], exp: /zigzag|Combinación/i, pts: 5 },
  { n: 'Triple zigzag W-X-Y-X-Z', piv: [60, 100, 94, 97, 90, 94, 88, 91, 81, 85, 79, 82, 72], exp: /Triple zigzag/, pts: 12 },
  { n: 'Combinación con triángulo final', piv: [80, 100, 94, 97, 90, 94, 91, 93.5, 91.6, 93, 92.2], exp: /triángulo/i, pts: 10 },
];
let ok = 0;
for (const cs of CASES) {
  const c = series(cs.piv), atr = E.computeIndicators(c).atr;
  const res = W.countWaves(c, atr);
  const hit = res.findIndex(o => cs.exp.test(o.nombre) && o.points.length === cs.pts);
  const pass = hit >= 0 && hit <= 2;
  if (pass) ok++;
  console.log(`${pass ? '✓' : '✗'} ${cs.n.padEnd(34)} posición ${hit < 0 ? '—' : hit + 1}  · 1º: ${res[0] ? res[0].nombre + ' (' + res[0].points.map(p => p.lab).join('-') + ') ' + res[0].total.toFixed(2) : 'nada'}`);
  if (!pass) res.slice(0, 4).forEach(o => console.log('      ', o.nombre, o.points.map(p => p.lab + ':' + p.p.toFixed(1)).join(' '), o.total.toFixed(2)));
}
console.log(`\n${ok}/${CASES.length} patrones reconocidos entre los 3 primeros`);
process.exitCode = ok === CASES.length ? 0 : 1;

// Reglas que nunca se pueden romper: estos casos NO deben aparecer como el patrón indicado
const NEG = [
  { n: 'La 4 entra en la 1 → no es impulso común', piv: [130, 100, 120, 108, 150, 118, 160], bad: o => o.nombre === 'Impulso común' && o.points.length === 6 && Math.abs(o.points[0].p - 100) < 1 },
  { n: 'La 2 supera el inicio de la 1 → no hay impulso', piv: [130, 100, 120, 98, 150, 138, 160], bad: o => o.kind === 'impulso' && Math.abs(o.points[0].p - 100) < 1 },
  { n: 'La 3 es la más corta → no es impulso común', piv: [130, 100, 125, 112, 128, 122, 150], bad: o => o.nombre === 'Impulso común' && o.points.length === 6 && Math.abs(o.points[0].p - 100) < 1 },
  { n: 'B supera el inicio de A → no es zigzag', piv: [80, 100, 90, 101, 84], bad: o => /Zigzag/.test(o.nombre) && o.points.length === 4 && Math.abs(o.points[0].p - 100) < 1 },
  { n: 'X supera el inicio de W → no es doble zigzag', piv: [80, 100, 94, 97, 90, 101, 95, 98, 89], bad: o => /Doble zigzag/.test(o.nombre) && Math.abs(o.points[0].p - 100) < 1 },
];
let nok = 0;
for (const cs of NEG) {
  const c = series(cs.piv), res = W.countWaves(c, E.computeIndicators(c).atr);
  const fail = res.some(cs.bad); if (!fail) nok++;
  console.log(`${fail ? '✗' : '✓'} ${cs.n}`);
}
console.log(`${nok}/${NEG.length} reglas respetadas`);
if (nok !== NEG.length) process.exitCode = 1;

// Recuento histórico: una secuencia larga (impulso → zigzag → impulso → flat) debe encadenarse entera
{
  const piv = [130, 100, 120, 108, 150, 138, 160, 140, 148, 125, 145, 137, 175, 163, 190, 178, 189.5, 177.5];
  const c = series(piv), atr = E.computeIndicators(c).atr;
  const h = W.countHistory(c, atr, 3);
  const names = h.segs.map(s => s.nombre.split(' (')[0]);
  const exp = ['Impulso común', 'Zigzag', 'Impulso común'];
  const okH = exp.every((n, k) => names[k] === n) && /Flat regular|Impulso/.test(names[3] || '');
  console.log(`${okH ? '✓' : '✗'} Recuento histórico encadenado: ${names.join(' → ')}`);
  if (!okH) process.exitCode = 1;
}

// Subdivisión: un impulso construido con subondas debe devolver i-ii-iii-iv-v dentro de la onda 3
{
  const piv = [130, 100, 120, 108, 118, 114, 135, 128, 150, 138, 160]; // onda 3 de 108 a 150 con 5 subondas
  const c = series(piv), atr = E.computeIndicators(c).atr;
  // índices de inicio y fin de la onda 3 (108 → 150)
  let i0 = 0, i1 = 0; c.forEach((x, k) => { if (Math.abs(x.l - 108) < 0.06 && !i0) i0 = k; if (i0 && !i1 && k > i0 && Math.abs(x.h - 150) < 0.06) i1 = k; });
  const sd = W.subdivide(c, atr, i0, i1, 1, 5, false);
  const ok = sd && sd.points.length === 6 && sd.points.map(p => p.lab).join('') === 'iiiiiiivv';
  console.log(`${ok ? '✓' : '✗'} Subdivisión de la onda 3 en i-ii-iii-iv-v: ${sd ? sd.points.map(p => p.lab + ':' + p.p.toFixed(0)).join(' ') : 'nada'}`);
  if (!ok) process.exitCode = 1;
}

// Onda larga con mucho detalle interno (5 ondas, cada una con sus subondas): debe verse i-ii-iii-iv-v
{
  const sub5 = (a, b) => { const d = b - a; return [a, a + d * 0.6, a + d * 0.45, a + d * 0.85, a + d * 0.72, b]; };
  const sub3 = (a, b) => { const d = b - a; return [a, a + d * 0.6, a + d * 0.35, b]; };
  const W5 = [100, 140, 125, 200, 180, 230]; // 1-2-3-4-5 del grado mayor
  let piv = [120];
  for (let k = 1; k < W5.length; k++) { const seg = (k % 2 ? sub5 : sub3)(W5[k - 1], W5[k]); piv = piv.concat(seg); }
  piv = piv.filter((v, k) => k === 0 || v !== piv[k - 1]);
  const c = series(piv), atr = E.computeIndicators(c).atr;
  let i0 = -1, i1 = -1; c.forEach((x, k) => { if (i0 < 0 && Math.abs(x.l - 100) < 0.06) i0 = k; if (Math.abs(x.h - 230) < 0.06) i1 = k; });
  const sd = W.subdivide(c, atr, i0, i1, 1, 5, false);
  const ok = sd && !sd.aprox && sd.points.length === 6 && [140, 125, 200, 180].every((v, k) => Math.abs(sd.points[k + 1].p - v) < 1.5);
  console.log(`${ok ? '✓' : '✗'} Onda larga con subondas: ${sd ? (sd.aprox ? 'aprox ' : '') + sd.points.map(p => p.lab + ':' + p.p.toFixed(0)).join(' ') : 'nada'}`);
  if (!ok) process.exitCode = 1;
}
