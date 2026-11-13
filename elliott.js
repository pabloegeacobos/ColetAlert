/* Elliott + Fibonacci — pivotes (zigzag por ATR), recuento automático de ondas, niveles y objetivos.
   Requiere BTCEngine (engine.js). Navegador: window.BTCElliott · Node: module.exports */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.BTCEngine;

  const RET = [0.236, 0.382, 0.5, 0.618, 0.786];
  const EXT = [1, 1.272, 1.618, 2.618];
  const fmt = x => Math.round(x).toLocaleString('es-ES');

  // ---------- Pivotes ----------
  // Un pivote se confirma cuando el precio se aleja del extremo al menos mult×ATR.
  // Cada pivote guarda en qué vela se confirmó (conf) para no mirar al futuro en el backtest.
  function zigzag(c, atrA, mult) {
    const piv = [];
    let trend = 0, hiI = 0, loI = 0;
    for (let i = 1; i < c.length; i++) {
      const A = atrA[i]; if (isNaN(A)) { if (c[i].h > c[hiI].h) hiI = i; if (c[i].l < c[loI].l) loI = i; continue; }
      if (trend === 0) {
        if (c[i].h > c[hiI].h) hiI = i;
        if (c[i].l < c[loI].l) loI = i;
        if (c[hiI].h - c[i].l >= mult * atrA[hiI] && hiI < i && hiI > loI) { piv.push({ i: loI, p: c[loI].l, t: 'L', conf: hiI }); piv.push({ i: hiI, p: c[hiI].h, t: 'H', conf: i }); trend = -1; loI = i; }
        else if (c[i].h - c[loI].l >= mult * atrA[loI] && loI < i && loI > hiI) { piv.push({ i: hiI, p: c[hiI].h, t: 'H', conf: loI }); piv.push({ i: loI, p: c[loI].l, t: 'L', conf: i }); trend = 1; hiI = i; }
        continue;
      }
      if (trend === 1) { // buscando máximo
        if (c[i].h >= c[hiI].h) hiI = i;
        else if (c[hiI].h - c[i].l >= mult * (atrA[hiI] || A)) { piv.push({ i: hiI, p: c[hiI].h, t: 'H', conf: i }); trend = -1; loI = i; }
      } else { // buscando mínimo
        if (c[i].l <= c[loI].l) loI = i;
        else if (c[i].h - c[loI].l >= mult * (atrA[loI] || A)) { piv.push({ i: loI, p: c[loI].l, t: 'L', conf: i }); trend = 1; hiI = i; }
      }
    }
    // extremo en curso (sin confirmar)
    let prov = null;
    if (trend === 1) prov = { i: hiI, p: c[hiI].h, t: 'H', conf: -1, prov: true };
    if (trend === -1) prov = { i: loI, p: c[loI].l, t: 'L', conf: -1, prov: true };
    return { piv, prov };
  }

  // ---------- Fibonacci ----------
  function retracements(a, b) { // tramo de a a b; niveles de retroceso hacia a
    return RET.map(r => ({ r, p: b - (b - a) * r }));
  }
  function extensions(a, b, from) { // proyecta el tramo a→b desde 'from'
    return EXT.map(r => ({ r, p: from + (b - a) * r }));
  }

  // ---------- Recuento de Elliott (reglas y proporciones del curso, Módulo 3) ----------
  // Puntuación de una proporción: 1 dentro del rango del curso, decae fuera de él.
  const inR = (x, lo, hi, tol) => x >= lo && x <= hi ? 1 : Math.max(0, 1 - Math.min(Math.abs(x - lo), Math.abs(x - hi)) / tol);
  const pc = x => (x * 100).toFixed(1).replace('.', ',') + ' %';
  const rx = x => x.toFixed(3).replace('.', ',');

  function segVol(c, i0, i1) { let s = 0, n = 0; for (let k = Math.min(i0, i1) + 1; k <= Math.max(i0, i1); k++) { s += c[k].v; n++; } return n ? s / n : 0; }

  // ---------- Estructura interna (subdivisión de cada onda en el grado inferior) ----------
  // Cuenta los tramos de un segmento con un zigzag más fino. 1 = monoonda (no se puede saber),
  // 3 / 7 = correctiva, 5 / 9 = motriz. Elliott: las ondas motrices se dividen en 5 y las correctivas en 3.
  function legsIn(c, atrA, i0, i1, mult) {
    if (i1 - i0 < 6) return 1;
    const sub = c.slice(i0, i1 + 1), sa = atrA.slice(i0, i1 + 1);
    const zz = zigzag(sub, sa, Math.max(0.6, mult / 3));
    const inner = zz.piv.filter(p => p.i > 0 && p.i < sub.length - 1).length;
    return inner + 1;
  }
  const ESTR = { imp: ['5', '3', '5', '3', '5'], diag: ['3/5', '3', '3/5', '3', '3/5'], zz: ['5', '3', '5'], flat: ['3', '3', '5'], tri: ['3', '3', '3', '3', '3'], wxy: ['3', '3', '3', '3', '3'] };
  function structureCheck(c, atrA, o) {
    const P = o.points; if (!atrA) return;
    const key = o.kind === 'impulso' ? (o.tipo === 'comun' ? 'imp' : 'diag') : o.kind === 'triangulo' ? 'tri' : o.kind === 'compleja' ? null : (o.tipo.startsWith('Zigzag') ? 'zz' : 'flat');
    const segs = o.kind === 'compleja' ? o.segs : P.slice(1).map((p, k) => ({ a: P[k].i, b: p.i, exp: ESTR[key][k] || '3', lab: p.lab }));
    let sc = 0, nn = 0; const det = [];
    for (const sg of segs) {
      if (P[P.length - 1].prov && sg.b === P[P.length - 1].i) continue; // la onda en curso aún no tiene estructura
      const L = legsIn(c, atrA, Math.min(sg.a, sg.b), Math.max(sg.a, sg.b), o.mult);
      if (L <= 1) continue;
      const got = L % 2 === 1 ? (L === 3 || L === 7 || L === 11 ? '3' : '5') : null;
      if (!got) continue;
      const ok = sg.exp.includes(got);
      det.push(`${sg.lab}:${got}${ok ? '' : '✗'}`); sc += ok ? 1 : 0; nn++;
    }
    if (!nn) return;
    const r = sc / nn;
    o.chk.push({ ok: r >= 0.6, txt: `Estructura interna (ondas del grado inferior): ${det.join(' · ')} ${r >= 0.6 ? 'encaja' : 'no encaja del todo'} con ${segs.map(s => s.exp).join('-')}` });
    o.score = o.score * 0.8 + r * 0.2;
  }

  // Impulso de 3 a 6 puntos (0..5). tipo: 'comun' | 'contractiva' | 'expansiva'
  function evalImpulse(c, P, dir, tipo) {
    const v = P.map(x => x.p * dir), n = v.length;
    for (let k = 1; k < n; k++) if ((k % 2 === 1) !== (v[k] > v[k - 1])) return null;
    const w = [], t = [];
    for (let k = 1; k < n; k++) { w.push(Math.abs(v[k] - v[k - 1])); t.push(Math.max(1, P[k].i - P[k - 1].i)); }
    const chk = []; let s = 0, cnt = 0;
    const add = (ok, txt, sc, peso = 1) => { chk.push({ ok, txt }); s += sc * peso; cnt += peso; };
    // reglas comunes a toda la familia de impulsos
    if (n >= 3 && v[2] <= v[0]) return null; // la 2 no retrocede el 100 % de la 1
    if (n >= 4 && v[3] <= v[1]) return null; // la 3 supera el final de la 1
    // proporciones imposibles en la práctica: el recuento está mezclando grados distintos
    if (n >= 3 && w[1] / w[0] < 0.2) return null;
    if (n >= 4 && (w[2] / w[0] > 5 || w[2] / w[0] < 0.3)) return null;
    if (n >= 5 && w[3] / w[2] < 0.1) return null;
    if (n >= 6 && (w[4] / w[0] > 4 || w[4] / w[0] < 0.2)) return null;
    if (tipo === 'comun') {
      if (n >= 5 && v[4] <= v[1]) return null;                                   // la 4 no solapa la 1
      if (n >= 6 && w[2] < w[0] && w[2] < w[4]) return null;                     // la 3 nunca la más corta
      if (n >= 3) { const r = w[1] / w[0]; add(r >= 0.5 && r <= 0.786, `Onda 2 retrocede ${pc(r)} de la 1 (curso: 50–78,6 %)`, inR(r, 0.5, 0.786, 0.3)); }
      if (n >= 4) { const x = w[2] / w[0]; add(x >= 1.272 && x <= 2.618, `Onda 3 = ${rx(x)}× la 1 (referencia: 1,618)`, inR(x, 1.382, 2.618, 0.6)); }
      if (n >= 5) { const r = w[3] / w[2]; add(r >= 0.236 && r <= 0.5, `Onda 4 retrocede ${pc(r)} de la 3 (corrección mínima 38,2 %)`, inR(r, 0.236, 0.5, 0.2));
        // Alternancia (Frost y Prechter): si la 2 fue profunda/rápida, la 4 suele ser poco profunda/lateral, y al revés
        const r2 = w[1] / w[0], tr = t[3] / t[1], alt = Math.abs(r2 - r) >= 0.15 || tr >= 1.5 || tr <= 0.67;
        add(alt, `Alternancia 2–4: ${alt ? 'sí' : 'no'} (la 2 retrocede ${pc(r2)} en ${t[1]} velas, la 4 ${pc(r)} en ${t[3]} velas)`, alt ? 1 : 0.3, 0.5);
        // Onda 4 en el terreno de la onda 4 de grado menor dentro de la 3: aproximado por la mitad superior/inferior de la 3
        const in4 = r <= 0.5; add(in4, `La 4 termina ${in4 ? 'dentro' : 'fuera'} de la primera mitad de la 3 (zona de la 4 de grado menor)`, in4 ? 1 : 0.4, 0.5); }
      if (n >= 6) {
        // Extensión: una de las tres ondas motrices suele ser mucho más larga (≥1,618× las otras)
        const ext = w[2] >= 1.618 * Math.max(w[0], w[4]) ? 3 : w[4] >= 1.618 * Math.max(w[0], w[2]) ? 5 : w[0] >= 1.618 * Math.max(w[2], w[4]) ? 1 : 0;
        add(ext > 0, ext ? `Onda ${ext} extendida (guía de extensión: solo una de 1, 3 y 5 se extiende)` : 'Ninguna onda claramente extendida (lo habitual es que se extienda una)', ext ? 1 : 0.5, 0.5);
        if (ext === 3) { const e15 = w[4] / w[0]; const eq = Math.abs(e15 - 1) <= 0.15 || Math.abs(e15 - 0.618) <= 0.1 || Math.abs(e15 - 1.618) <= 0.15;
          add(eq, `Con la 3 extendida, 1 y 5 tienden a la igualdad: 5 = ${rx(e15)}× la 1 (ideal 1; si no, 0,618 o 1,618)`, eq ? 1 : 0.4, 0.5); }
        if (ext === 5) { const r = w[4] / Math.abs(v[3] - v[0]); add(true, `Quinta extendida: 5 = ${rx(r)}× (inicio 1 → final 3) (referencia 1,618). Tras una 5 extendida, la corrección suele volver al final de la 2 de esa 5`, inR(r, 1, 1.9, 0.5), 0.5); }
        if (v[5] < v[3]) chk.push({ ok: false, txt: 'Quinta truncada: la 5 no supera el final de la 3. Solo es válida tras una 3 muy fuerte y avisa de debilidad' });
        const x = w[4] / w[0]; add(x >= 0.618 && x <= 1.618, `Onda 5 = ${rx(x)}× la 1 (normal 1:1; de 0,618 a 1,618)`, inR(x, 0.618, 1.618, 0.4));
        const vol = [segVol(c, P[0].i, P[1].i), segVol(c, P[2].i, P[3].i), segVol(c, P[4].i, P[5].i)];
        add(vol[1] >= vol[0] && vol[1] >= vol[2], `Volumen: la onda 3 ${vol[1] >= Math.max(vol[0], vol[2]) ? 'tiene' : 'no tiene'} el mayor volumen`, vol[1] >= Math.max(vol[0], vol[2]) ? 1 : 0, 0.5);
      } else if (n >= 4) {
        const vol = [segVol(c, P[0].i, P[1].i), segVol(c, P[2].i, P[3].i)];
        add(vol[1] >= vol[0], `Volumen en la 3 ${vol[1] >= vol[0] ? 'mayor' : 'menor'} que en la 1`, vol[1] >= vol[0] ? 1 : 0.3, 0.5);
      }
    } else if (tipo === 'contractiva') {
      if (n < 5) return null; // una diagonal solo se distingue cuando hay solape 4-1
      if (!(v[4] <= v[1])) return null;                 // si no hay solape es un impulso común
      if (v[4] <= v[2]) return null;                    // la 4 no retrocede el 100 % de la 2
      if (!(w[2] < w[0])) return null;                  // contractiva: 1 > 3
      if (!(w[3] < w[1])) return null;                  // 2 > 4
      if (n >= 6 && !(w[4] < w[2])) return null;         // 3 > 5
      { const r = w[1] / w[0]; add(r >= 0.5 && r <= 0.786, `Onda 2 retrocede ${pc(r)} de la 1 (curso: 50–78,6 %)`, inR(r, 0.5, 0.786, 0.3)); }
      { const x = w[2] / w[0]; add(x >= 0.618 && x <= 0.786, `Onda 3 = ${rx(x)}× la 1 (curso: 0,618–0,786)`, inR(x, 0.618, 0.786, 0.25)); }
      { const r = w[3] / w[2]; add(r >= 0.382 && r <= 0.618, `Onda 4 retrocede ${pc(r)} de la 3 (curso: 38,2–61,8 %)`, inR(r, 0.382, 0.618, 0.25)); }
      add(t[2] <= t[0] * 1.1, `Tiempo de la 3 ${t[2] <= t[0] * 1.1 ? '≤' : '>'} tiempo de la 1`, t[2] <= t[0] * 1.1 ? 1 : 0, 0.5);
      add(t[3] <= t[1] * 1.1, `Tiempo de la 4 ${t[3] <= t[1] * 1.1 ? '≤' : '>'} tiempo de la 2`, t[3] <= t[1] * 1.1 ? 1 : 0, 0.5);
      if (n >= 6) { const x = w[4] / w[2]; add(x >= 0.618 && x <= 0.786, `Onda 5 = ${rx(x)}× la 3 (curso: 0,618–0,786)`, inR(x, 0.618, 0.786, 0.25));
        const vol = [segVol(c, P[2].i, P[3].i), segVol(c, P[4].i, P[5].i)]; add(vol[1] < vol[0], `Volumen decreciente en la 5 ${vol[1] < vol[0] ? 'sí' : 'no'}`, vol[1] < vol[0] ? 1 : 0, 0.5); }
    } else { // expansiva
      if (n < 5) return null;
      if (!(v[4] <= v[1])) return null;
      if (v[4] <= v[2]) return null;
      if (!(w[2] > w[0])) return null;                  // expansiva: 3 > 1
      if (!(w[3] > w[1])) return null;                  // 4 > 2
      if (n >= 6 && !(w[4] > w[2])) return null;         // 5 > 3
      { const r = w[1] / w[0]; add(r >= 0.618 && r <= 0.886, `Onda 2 retrocede ${pc(r)} de la 1 (curso: 61,8–88,6 %)`, inR(r, 0.618, 0.886, 0.25)); }
      { const x = w[2] / w[0]; add(x >= 1.236 && x <= 1.618, `Onda 3 = ${rx(x)}× la 1 (curso: 1,236–1,382, hasta 1,618)`, inR(x, 1.236, 1.382, 0.3)); }
      { const r = w[3] / w[2]; add(r >= 0.618 && r <= 0.886, `Onda 4 retrocede ${pc(r)} de la 3 (curso: 61,8–88,6 %)`, inR(r, 0.618, 0.886, 0.25)); }
      add(t[2] >= t[0] * 0.9, `Tiempo de la 3 ${t[2] >= t[0] * 0.9 ? '>' : '<'} tiempo de la 1`, t[2] >= t[0] * 0.9 ? 1 : 0, 0.5);
      if (n >= 6) { const x = w[4] / w[2]; add(x >= 1.236 && x <= 1.618, `Onda 5 = ${rx(x)}× la 3 (curso: 1,236–1,382)`, inR(x, 1.236, 1.382, 0.3));
        const vol = [segVol(c, P[2].i, P[3].i), segVol(c, P[4].i, P[5].i)]; add(vol[1] > vol[0], `Volumen creciente hasta la 5 ${vol[1] > vol[0] ? 'sí' : 'no'}`, vol[1] > vol[0] ? 1 : 0, 0.5); }
    }
    return { score: cnt ? s / cnt : 0, chk, w, t };
  }

  // Corrección A-B-C (3 o 4 puntos) en contra de 'dir' (dir = sentido del tramo anterior)
  function evalCorrection(c, P, dir) {
    const v = P.map(x => -x.p * dir), n = v.length; // normalizado: la corrección "sube"
    for (let k = 1; k < n; k++) if ((k % 2 === 1) !== (v[k] > v[k - 1])) return null;
    const A = Math.abs(v[1] - v[0]); const chk = []; let s = 0, cnt = 0, tipo = 'Zigzag o flat';
    const add = (ok, txt, sc, peso = 1) => { chk.push({ ok, txt }); s += sc * peso; cnt += peso; };
    let B = null, C = null;
    if (n >= 3) {
      B = Math.abs(v[2] - v[1]); const rb = B / A;
      if (rb < 0.2 || rb > 3) return null;
      if (rb < 0.9) {
        tipo = 'Zigzag (5-3-5)';
        add(true, `B retrocede ${pc(rb)} de A (en zigzag nunca el 100 %)`, inR(rb, 0.382, 0.786, 0.25));
      } else if (rb <= 1.05) { tipo = 'Flat regular (3-3-5)'; add(true, `B = ${rx(rb)}× A (flat regular: 0,9–1,05)`, 1); }
      else if (rb <= 1.236) { tipo = 'Flat running o expandido'; add(true, `B = ${rx(rb)}× A: supera el inicio de A (running < 1,236)`, 0.8); }
      else { tipo = 'Flat expandido (3-3-5)'; add(rb >= 1.382, `B = ${rx(rb)}× A (expandido: 1,382 o más)`, inR(rb, 1.382, 2, 0.4)); }
    }
    if (n >= 4) {
      C = Math.abs(v[3] - v[2]); const xc = C / A, cb = C / B;
      if (xc > 4 || xc < 0.3) return null;
      if (tipo.startsWith('Zigzag')) {
        if (v[3] <= v[1]) add(false, 'C no supera el final de A (en zigzag casi siempre lo hace)', 0.2);
        add(xc >= 0.618 && xc <= 1.618, `C = ${rx(xc)}× A (normal 1–1,236; de 0,618 a 1,618)`, inR(xc, 1, 1.236, 0.6));
        if (xc >= 1.5) chk.push({ ok: false, txt: 'C ≥ 1,618 de A: si vino con mucho volumen, puede ser una onda 3 y no una C' });
        const t = [Math.max(1, P[1].i - P[0].i), Math.max(1, P[3].i - P[2].i)]; const rt = t[1] / t[0];
        add(rt >= 0.618 && rt <= 1.618, `Tiempo de C = ${rx(rt)}× el de A (curso: 0,618–1,618)`, inR(rt, 0.618, 1.618, 0.6), 0.5);
      } else if (tipo.startsWith('Flat regular')) {
        add(cb >= 0.9 && cb <= 1.05, `C = ${rx(cb)}× B (flat regular: 0,9–1,05)`, inR(cb, 0.9, 1.05, 0.3));
      } else {
        if (cb < 1) { tipo = 'Flat running (3-3-5)'; add(cb >= 0.5 && cb <= 0.786, `C = ${pc(cb)} de B (running: 50–78,6 %, nunca el 100 %)`, inR(cb, 0.5, 0.786, 0.25)); }
        else { tipo = 'Flat expandido (3-3-5)'; add(cb >= 1.382 && cb <= 1.9, `C = ${rx(cb)}× B (expandido: 1,618)`, inR(cb, 1.5, 1.75, 0.4)); if (xc > 2.618) chk.push({ ok: false, txt: 'C > 2,618 de A: valorar que haya empezado un impulso' }); }
      }
      const vc = segVol(c, P[2].i, P[3].i), va = segVol(c, P[0].i, P[1].i);
      const k0 = Math.max(P[2].i + 1, P[3].i - Math.ceil((P[3].i - P[2].i) / 3)); const vEnd = segVol(c, k0 - 1, P[3].i);
      add(vEnd >= vc, `Volumen ${vEnd >= vc ? 'concentrado' : 'no concentrado'} en el final de C (clímax esperado)`, vEnd >= vc ? 1 : 0.3, 0.5);
    }
    return { score: cnt ? s / cnt : 0.4, chk, tipo, A, B, C };
  }

  // Triángulo A-B-C-D-E (6 puntos), contractivo: cada onda más corta que la anterior
  function evalTriangle(c, P) {
    const v = P.map(x => x.p), n = v.length; if (n !== 6) return null;
    const w = []; for (let k = 1; k < n; k++) w.push(Math.abs(v[k] - v[k - 1]));
    for (let k = 2; k < n; k++) if (Math.sign(v[k] - v[k - 1]) === Math.sign(v[k - 1] - v[k - 2])) return null;
    const chk = []; let s = 0, cnt = 0, tipo;
    const add = (ok, txt, sc) => { chk.push({ ok, txt }); s += sc; cnt++; };
    const rb = w[1] / w[0], contr = w[2] < w[1] && w[3] < w[2] && w[4] < w[3], expa = w[1] > w[0] && w[2] > w[1] && w[3] > w[2] && w[4] > w[3];
    const barrera = Math.abs(v[4] - v[2]) <= 0.05 * w[1] && w[2] < w[1] && w[4] < w[3]; // B y D al mismo nivel
    if (expa) {
      tipo = 'Triángulo expansivo';
      for (let k = 1; k < 5; k++) { const r = w[k] / w[k - 1]; add(r >= 1.05 && r <= 1.618, `${'ABCDE'[k]} = ${rx(r)}× ${'ABCDE'[k - 1]} (expansivo: cada onda mayor, hasta 1,618)`, inR(r, 1.1, 1.618, 0.4)); }
    } else if (barrera) {
      tipo = 'Triángulo de barrera';
      add(true, `B y D al mismo nivel (${fmt(v[2])} / ${fmt(v[4])}): línea B–D horizontal`, 1);
      for (const k of [2, 4]) { const r = w[k] / w[k - 1]; add(r >= 0.5 && r <= 0.95, `${'ABCDE'[k]} = ${pc(r)} de ${'ABCDE'[k - 1]}`, inR(r, 0.5, 0.95, 0.3)); }
    } else {
      if (rb > 1 && !(rb >= 1.236 && rb <= 1.45)) return null;
      if (!(w[2] < w[1] || rb > 1) || !(w[3] < w[2]) || !(w[4] < w[3])) return null;
      if (rb > 1 && !(w[2] < w[0])) return null;
      tipo = rb > 1 ? 'Triángulo running' : 'Triángulo contractivo';
      if (rb > 1) chk.push({ ok: true, txt: `Running: B = ${rx(rb)}× A (supera el inicio de A, 1,236–1,382)` });
      for (let k = 1; k < 5; k++) { if (rb > 1 && k <= 2) continue; const r = w[k] / w[k - 1]; add(r >= 0.618 && r <= 0.786, `${'ABCDE'[k]} = ${pc(r)} de ${'ABCDE'[k - 1]} (curso: 61,8–78,6 %)`, inR(r, 0.618, 0.786, 0.25)); }
      // la E no supera el final de la C y las líneas A–C y B–D convergen
      const eIn = Math.sign(v[5] - v[4]) === Math.sign(v[3] - v[2]) ? Math.abs(v[5] - v[4]) <= Math.abs(v[3] - v[4]) : true;
      add(eIn, `La E ${eIn ? 'no supera' : 'supera'} el final de la C (regla del triángulo contractivo)`, eIn ? 1 : 0);
    }
    const vols = []; for (let k = 1; k < n; k++) vols.push(segVol(c, P[k - 1].i, P[k].i));
    if (tipo !== 'Triángulo expansivo') { const dec = vols[4] < vols[0]; add(dec, `Volumen ${dec ? 'decreciente' : 'no decreciente'} dentro del triángulo`, dec ? 1 : 0.2); }
    const tt = []; for (let k = 1; k < n; k++) tt.push(Math.max(1, P[k].i - P[k - 1].i));
    const tOk = Math.max(...tt) / Math.min(...tt) <= 3; add(tOk, `Duración de las 5 ondas ${tOk ? 'parecida' : 'muy desigual'} (en un triángulo suelen durar parecido)`, tOk ? 1 : 0.4);
    return { score: cnt ? s / cnt : 0, chk, running: tipo === 'Triángulo running', tipo, w };
  }

  // ---------- Correcciones complejas: W-X-Y y W-X-Y-X-Z (dobles y triples zigzags y combinaciones) ----------
  // P va en el sentido de la corrección (normalizado como en evalCorrection). Cada W, Y, Z es un zigzag, flat o
  // (solo el último) un triángulo; cada X es una onda de enlace que no supera el inicio del grupo anterior.
  function evalComplex(c, P, dir, plan) {
    const v = P.map(x => -x.p * dir);
    const chk = []; let s = 0, cnt = 0;
    const add = (ok, txt, sc, peso = 1) => { chk.push({ ok, txt }); s += sc * peso; cnt += peso; };
    const groups = [], segs = [];
    let k = 0;
    for (let g = 0; g < plan.length; g++) {
      const part = plan[g];
      if (part === 'X') { // enlace: un tramo contra la corrección
        if (!(v[k + 1] < v[k])) return null;
        const prev = groups[groups.length - 1], r = (v[k] - v[k + 1]) / Math.abs(prev.end - prev.start);
        if (r >= 1) return null; // la X no supera el inicio del grupo anterior
        groups.push({ x: true, r }); segs.push({ a: P[k].i, b: P[k + 1].i, exp: '3', lab: 'X' }); k += 1; continue;
      }
      const len = part === 'T' ? 5 : part === 'P' ? 2 : 3, sub = P.slice(k, k + len + 1);
      if (sub.length < len + 1) return null;
      let ev;
      if (part === 'T') { ev = evalTriangle(c, sub); if (!ev) return null; }
      else { ev = evalCorrection(c, sub, dir); if (!ev) return null; }
      const nm = part === 'T' ? ev.tipo : ev.tipo.split(' (')[0];
      groups.push({ nm, start: v[k], end: v[k + len], amp: Math.abs(v[k + len] - v[k]), t: Math.max(1, P[k + len].i - P[k].i), zz: part !== 'T' && ev.tipo.startsWith('Zigzag'), tri: part === 'T', partial: part === 'P', sc: ev.score });
      segs.push({ a: P[k].i, b: P[k + len].i, exp: part === 'T' ? '3' : '3', lab: ['W', 'Y', 'Z'][groups.filter(x => !x.x).length - 1] });
      k += len;
    }
    const main = groups.filter(x => !x.x), xs = groups.filter(x => x.x);
    const allZZ = main.every(x => x.zz || x.partial);
    // reglas
    if (main.slice(0, -1).some(x => x.tri)) return null; // el triángulo solo puede ir al final
    for (let g = 1; g < main.length; g++) if (allZZ && !main[g].partial && !(main[g].end > main[g - 1].end)) return null; // en dobles/triples zigzags cada grupo avanza
    // guías
    main.forEach((x, g) => add(true, `${['W', 'Y', 'Z'][g]} = ${x.partial ? 'en curso (a-b hechas)' : x.nm}`, x.sc, 0.5));
    xs.forEach((x, g) => add(x.r >= 0.382 && x.r <= 0.786, `X${xs.length > 1 ? g + 1 : ''} retrocede ${pc(x.r)} del grupo anterior (habitual 38,2–78,6 %; nunca el 100 %)`, inR(x.r, 0.382, 0.786, 0.3)));
    for (let g = 1; g < main.length; g++) {
      if (main[g].tri || main[g].partial) continue;
      const r = main[g].amp / main[0].amp, eq = [0.618, 1, 1.618].some(f => Math.abs(r - f) <= 0.12 * f);
      add(eq, `${['W', 'Y', 'Z'][g]} = ${rx(r)}× W (habitual 1:1, si no 0,618 o 1,618)`, eq ? 1 : inR(r, 0.618, 1.618, 0.4));
      const rt = main[g].t / main[0].t; add(rt >= 0.5 && rt <= 2, `Duración de ${['W', 'Y', 'Z'][g]} = ${rx(rt)}× la de W`, inR(rt, 0.618, 1.618, 0.6), 0.5);
    }
    if (!allZZ && !main.some(x => x.tri)) { const lat = main[main.length - 1].end - main[0].end; add(true, `Combinación: avance neto ${lat > 0 ? 'positivo' : 'nulo o negativo'} (las combinaciones son laterales)`, 1, 0.3); }
    const nombre = main.length === 3 ? (allZZ ? 'Triple zigzag (W-X-Y-X-Z)' : 'Triple combinación (W-X-Y-X-Z)') : (allZZ ? 'Doble zigzag (W-X-Y)' : main.some(x => x.tri) ? 'Combinación W-X-Y con triángulo' : 'Combinación (W-X-Y)');
    return { score: cnt ? s / cnt : 0, chk, nombre, groups, segs, W: main[0].amp };
  }

  const COMPLEX = [['C', 'X'], ['C', 'X', 'P'], ['C', 'X', 'C'], ['C', 'X', 'T'], ['C', 'X', 'C', 'X', 'C'], ['C', 'X', 'C', 'X', 'T']];
  const LAB = { imp: ['0', '1', '2', '3', '4', '5'], abc: ['0', 'A', 'B', 'C'], tri: ['0', 'A', 'B', 'C', 'D', 'E'] };
  const NOMBRE = { comun: 'Impulso común', contractiva: 'Diagonal contractiva', expansiva: 'Diagonal expansiva' };

  // Todos los patrones que terminan en el pivote pts[L-1]
  function candidatesAt(c, pts, L, mult) {
    const out = [];
    // impulsos (3–6 puntos)
    for (let n = 3; n <= 6; n++) {
      if (L < n) continue;
      const P = pts.slice(L - n, L), dir = P[1].p > P[0].p ? 1 : -1;
      // el inicio del impulso debe ser el extremo del tramo anterior (no superado justo antes)
      if (L > n) { const prev = pts[L - n - 1]; if (dir === 1 ? prev.p < P[0].p : prev.p > P[0].p) continue; }
      for (const tipo of ['comun', 'contractiva', 'expansiva']) {
        const ev = evalImpulse(c, P, dir, tipo); if (!ev) continue;
        out.push(planImpulse(c, P, dir, tipo, ev, mult));
      }
    }
    // correcciones A-B-C (3–4 puntos) tras un tramo previo
    for (let n = 3; n <= 4; n++) {
      if (L < n + 1) continue;
      const P = pts.slice(L - n, L), dir = P[1].p > P[0].p ? -1 : 1; // dir = sentido del tramo corregido
      const A = Math.abs(P[1].p - P[0].p), look = Math.max(20, 2 * (P[n - 1].i - P[0].i));
      let ext = P[0].p; for (let k = Math.max(0, P[0].i - look); k < P[0].i; k++) ext = dir === 1 ? Math.min(ext, c[k].l) : Math.max(ext, c[k].h);
      if (Math.abs(P[0].p - ext) < 0.8 * A) continue; // A corrige un tramo de su mismo grado o mayor
      const ev = evalCorrection(c, P, dir); if (!ev) continue;
      out.push(planCorrection(c, P, dir, ev, mult));
    }
    // triángulo (6 puntos)
    if (L >= 7) {
      const P = pts.slice(L - 6, L); const ev = evalTriangle(c, P);
      if (ev) out.push(planTriangle(c, P, ev, mult, pts[L - 7]));
    }
    // correcciones complejas W-X-Y(-X-Z), terminadas o en formación
    for (const plan of COMPLEX) {
      const N = 1 + plan.reduce((a, x) => a + (x === 'X' ? 1 : x === 'T' ? 5 : x === 'P' ? 2 : 3), 0);
      if (L < N + 1) continue;
      const P = pts.slice(L - N, L), dir = P[1].p > P[0].p ? -1 : 1;
      const W = Math.abs(P[3].p - P[0].p), look = Math.max(20, P[N - 1].i - P[0].i);
      let ext = P[0].p; for (let k = Math.max(0, P[0].i - look); k < P[0].i; k++) ext = dir === 1 ? Math.min(ext, c[k].l) : Math.max(ext, c[k].h);
      if (Math.abs(P[0].p - ext) < 0.8 * W) continue;
      const ev = evalComplex(c, P, dir, plan); if (!ev) continue;
      out.push(planComplex(c, P, dir, ev, mult, plan));
    }
    return out;
  }
  function scoreAll(c, out) {
    for (const o of out) {
      const span = o.points[o.points.length - 1].i - o.points[0].i;
      const nChk = o.chk.length; // pocas comprobaciones = menos evidencia
      // las proporciones mandan; el tamaño solo desempata. Simplicidad (Prechter/Neely): a igual encaje, gana el más sencillo
      o.total = Math.pow(o.score, 1.5) * Math.min(1, (nChk + 1) / 5) + 0.02 * Math.min(o.points.length, 6) + Math.min(0.08, span / c.length * 0.15) - (o.kind === 'compleja' ? 0.03 * Math.max(0, o.points.length - 6) / 2 : 0);
      const fallos = o.chk.filter(x => !x.ok).length;
      o.confianza = o.total >= 0.75 && fallos === 0 ? 'Alta' : o.total >= 0.5 && fallos <= 1 ? 'Media' : 'Baja';
    }
  }
  const complete = o => (o.kind === 'impulso' && o.points.length === 6) || (o.kind === 'correccion' && o.points.length === 4) || o.kind === 'triangulo' || (o.kind === 'compleja' && /[WYZ]/.test(o.points[o.points.length - 1].lab));

  function countWaves(c, atrA, opts) {
    opts = opts || {};
    const mults = opts.mults || [2, 2.5, 3, 4, 5];
    const out = [];
    for (const mult of mults) {
      const zz = zigzag(c, atrA, mult);
      const pts = zz.piv.slice(); if (zz.prov) pts.push(zz.prov);
      if (pts.length < 4) continue;
      out.push(...candidatesAt(c, pts, pts.length, mult));
    }
    if (atrA) for (const o of out) structureCheck(c, atrA, o);
    // descarta recuentos que el precio ya ha invalidado después del último punto
    const valid = out.filter(o => {
      if (!o.invalida || !o.invalida.hard) return true;
      const lp = o.points[o.points.length - 1], up = o.invalida.p > lp.p;
      for (let k = lp.i + 1; k < c.length; k++) if (up ? c[k].h >= o.invalida.p : c[k].l <= o.invalida.p) return false;
      return true;
    });
    scoreAll(c, valid);
    valid.sort((a, b) => b.total - a.total);
    const seen = new Set(), uniq = [];
    for (const o of valid) { const k = o.nombre + o.points.map(p => p.i).join(','); if (!seen.has(k)) { seen.add(k); uniq.push(o); } }
    return uniq;
  }

  // ---------- Subdivisión: ondas internas de una onda del grado mayor ----------
  // Dada una onda (de i0 a i1, en sentido dirSeg) busca en el grado inferior la estructura esperada:
  // 5 ondas (i-ii-iii-iv-v) si es motriz o 3 (a-b-c) si es correctiva, obligando a que empiece y termine
  // exactamente en los extremos de la onda mayor. Si la onda está en curso, admite subdivisiones parciales.
  function subdivide(c, atrA, i0, i1, dirSeg, expLegs, inProgress) {
    if (i1 - i0 < 4) return null;
    if (!expLegs) { const a = subdivide(c, atrA, i0, i1, dirSeg, 5, inProgress), b = subdivide(c, atrA, i0, i1, dirSeg, 3, inProgress); return !a ? b : !b ? a : (a.aprox && !b.aprox ? b : !a.aprox && b.aprox ? a : (a.sc >= b.sc ? a : b)); }
    const sub = c.slice(i0, i1 + 1), sa = atrA.slice(i0, i1 + 1);
    let best = null;
    const tryPick = (P, legs) => {
      let ev = null, nombre = '', lab;
      if (legs === 5 || (inProgress && expLegs === 5)) {
        for (const tipo of ['comun', 'contractiva', 'expansiva']) {
          const e = evalImpulse(sub, P, dirSeg, tipo); if (e && (!ev || e.score > ev.score)) { ev = e; nombre = NOMBRE[tipo]; }
        }
        lab = ['', 'i', 'ii', 'iii', 'iv', 'v'];
      } else {
        const e = evalCorrection(sub, P, -dirSeg); if (e) { ev = e; nombre = e.tipo; }
        lab = ['', 'a', 'b', 'c'];
      }
      if (!ev) return;
      const sc = ev.score + (P.length - 1 === expLegs ? 0.15 : 0); // preferir la estructura completa
      if (!best || sc > best.sc) best = { sc, nombre, points: P.map((p, k) => ({ i: p.i + i0, p: p.p, t: p.t, lab: lab[k] || '' })) };
    };
    // de grueso a fino: las ondas largas necesitan un zigzag más grueso para ver sus 5 o 3 ondas internas
    for (const m of [12, 9, 7, 5, 4, 3, 2, 1.5, 1, 0.75]) {
      const zz = zigzag(sub, sa, m);
      let piv = zz.piv.filter(p => p.i > 0 && p.i < sub.length - 1);
      if (inProgress && zz.prov && zz.prov.i > 0) piv = piv.concat([zz.prov]);
      // alternancia empezando por el extremo contrario al inicio
      const first = dirSeg === 1 ? 'H' : 'L';
      while (piv.length && piv[0].t !== first) piv.shift();
      if (piv.length > 14) continue;
      const start = { i: 0, p: dirSeg === 1 ? sub[0].l : sub[0].h, t: dirSeg === 1 ? 'L' : 'H' };
      const end = { i: sub.length - 1, p: dirSeg === 1 ? sub[sub.length - 1].h : sub[sub.length - 1].l, t: first };
      const sizes = inProgress ? [expLegs, expLegs - 1, expLegs - 2].filter(x => x >= 2) : [expLegs];
      for (const legs of sizes) {
        const need = legs - 1; // pivotes internos
        if (inProgress) { // la onda en curso termina en el último pivote encontrado, no en el borde
          const pool = piv; if (pool.length < legs) continue;
          // combinaciones que acaban en el último pivote y alternan
          const lastP = pool[pool.length - 1];
          const idx = pool.map((p, k) => k).slice(0, -1);
          const comb = (from, chosen) => { if (chosen.length === need) { const P = [start, ...chosen.map(k => pool[k]), lastP]; for (let q = 1; q < P.length; q++) if (P[q].t === P[q - 1].t) return; tryPick(P, legs); return; } for (let k = from; k < idx.length; k++) comb(k + 1, chosen.concat(idx[k])); };
          comb(0, []);
        } else {
          if (piv.length < need) continue;
          const comb = (from, chosen) => { if (chosen.length === need) { const P = [start, ...chosen.map(k => piv[k]), end]; for (let q = 1; q < P.length; q++) if (P[q].t === P[q - 1].t) return; tryPick(P, legs); return; } for (let k = from; k < piv.length; k++) comb(k + 1, chosen.concat(k)); };
          comb(0, []);
        }
      }
    }
    if (best) return best;
    // Sin estructura válida: se muestran igualmente los giros internos del grado inferior (aproximado, marcado con ?)
    let piv = null;
    for (const m of [12, 9, 7, 5, 4, 3, 2, 1.5, 1]) {
      const zz = zigzag(sub, sa, m); const p = zz.piv.filter(q => q.i > 0 && q.i < sub.length - 1);
      if (p.length >= 2 && p.length <= 10) { piv = p; break; }
    }
    if (!piv) return null;
    const pts = [{ i: i0, p: dirSeg === 1 ? sub[0].l : sub[0].h, t: dirSeg === 1 ? 'L' : 'H', lab: '' }].concat(piv.map(q => ({ i: q.i + i0, p: q.p, t: q.t, lab: '·' })));
    return { sc: 0, aprox: true, nombre: 'Estructura interna sin patrón claro', points: pts };
  }
  // Cuántas ondas internas debe tener cada onda de un recuento (5 motriz, 3 correctiva)
  function expectedLegs(o, k) { // k = índice del punto final de la onda (1..n-1)
    const lab = o.points[k].lab;
    if (o.kind === 'tramo') return 0; // desconocido: se prueba 5 y 3
    if (o.kind === 'triangulo') return 3;
    if (o.kind === 'impulso') return o.tipo === 'comun' ? (['1', '3', '5'].includes(lab) ? 5 : 3) : 3;
    if (o.kind === 'correccion') { const zz = o.tipo.startsWith('Zigzag'); return lab === 'B' ? 3 : lab === 'A' ? (zz ? 5 : 3) : 5; }
    return ['b', 'X'].includes(lab) ? 3 : 5; // compleja: a y c de cada zigzag son motrices
  }

  // Recuento histórico completo: encadena patrones hacia atrás desde el último pivote hasta el inicio de los datos.
  // Cada tramo es el patrón que mejor encaja terminando en ese punto; los anteriores tienen que estar terminados.
  function countHistory(c, atrA, mult, maxSeg) {
    const zz = zigzag(c, atrA, mult);
    const pts = zz.piv.slice(); if (zz.prov) pts.push(zz.prov);
    const segs = []; let L = pts.length, guard = 0;
    while (L >= 4 && segs.length < (maxSeg || 40) && guard++ < 400) {
      let cand = candidatesAt(c, pts, L, mult);
      if (segs.length) cand = cand.filter(complete); // los tramos anteriores al actual están terminados
      if (atrA) for (const o of cand) structureCheck(c, atrA, o);
      scoreAll(c, cand);
      cand.sort((a, b) => b.total - a.total);
      const best = cand[0];
      if (!best || best.total < 0.35) { // tramo sin estructura clara: se marca como tal (no se deja en blanco)
        const a = pts[L - 2], b = pts[L - 1];
        segs.unshift({ kind: 'tramo', tipo: 'tramo', nombre: 'Tramo sin patrón claro', mult, score: 0, chk: [], points: [Object.assign({}, a, { lab: '0' }), Object.assign({}, b, { lab: '?' })], objetivos: [], invalida: { p: b.p }, sesgo: 0 });
        L -= 1; continue;
      }
      segs.unshift(best);
      L = L - best.points.length + 1; // el inicio de este patrón es el final del anterior
    }
    return { mult, segs, pts };
  }

  function planImpulse(c, P, dir, tipo, ev, mult) {
    const n = P.length, last = P[n - 1], prov = !!last.prov, dTxt = dir === 1 ? 'alcista' : 'bajista';
    const pts = P.map((p, k) => Object.assign({}, p, { lab: LAB.imp[k] }));
    const w1 = Math.abs(P[1].p - P[0].p);
    let estado, objetivos = [], invalida, fib, sesgo = dir, operativa = null, confirma = null;
    if (n === 3) {
      estado = prov ? `${NOMBRE[tipo]} ${dTxt}: onda 2 en curso` : `${NOMBRE[tipo]} ${dTxt}: ondas 1 y 2 completas; la onda 3 debería empezar`;
      fib = { tipo: 'retroceso', a: P[0].p, b: P[1].p };
      const z = [0.5, 0.618, 0.786].map(r => P[1].p - dir * w1 * r);
      const e2 = prov ? z[1] : P[2].p;
      operativa = { titulo: 'Operativa del curso: entrada en la onda 2', zona: [z[0], z[2]], stop: P[0].p, tp1: e2 + dir * w1, tp2: e2 + dir * w1 * 1.618,
        txt: `Entradas escalonadas en 0,5 / 0,618 / 0,786 de la onda 1 (${fmt(z[0])} / ${fmt(z[1])} / ${fmt(z[2])}). Stop más allá del inicio de la 1 (${fmt(P[0].p)}). Toma de beneficios desde el 1:1 de la 3 con la 1; objetivo 1,618 (ratio de oro).` };
      objetivos = [{ txt: 'Onda 3 = 1:1 de la 1', p: e2 + dir * w1 }, { txt: 'Onda 3 = 1,618 de la 1 (objetivo)', p: e2 + dir * w1 * 1.618 }, { txt: 'Onda 3 = 2,618 de la 1', p: e2 + dir * w1 * 2.618 }];
      invalida = { p: P[0].p, hard: true, txt: 'La onda 2 no puede retroceder el 100 % de la 1' };
      confirma = { p: P[1].p, txt: 'Si supera el final de la 1, la onda 3 está en marcha' };
      sesgo = prov ? -dir : dir;
    } else if (n === 4) {
      const w3 = Math.abs(P[3].p - P[2].p);
      estado = `${NOMBRE[tipo]} ${dTxt}: onda 3 ${prov ? 'en curso' : 'completa'}; después viene la corrección de onda 4`;
      fib = { tipo: 'retroceso', a: P[2].p, b: P[3].p };
      objetivos = (prov ? [{ txt: 'Onda 3 = 1,618 de la 1', p: P[2].p + dir * w1 * 1.618 }, { txt: 'Onda 3 = 2,618 de la 1', p: P[2].p + dir * w1 * 2.618 }] : [])
        .concat([0.236, 0.382, 0.5].map(r => ({ txt: `Onda 4 al ${pc(r)} de la 3`, p: P[3].p - dir * w3 * r })));
      invalida = { p: tipo === 'comun' ? P[1].p : P[2].p, hard: true, txt: tipo === 'comun' ? 'En un impulso común la 4 no puede entrar en el terreno de la 1' : 'La 4 no puede retroceder el 100 % de la 2' };
      confirma = prov ? { p: P[2].p + dir * w1 * 1.618, txt: 'Con la 3 por encima de 1,618× la 1 el impulso queda claro' } : { p: P[3].p - dir * w3 * 0.382, txt: 'Un retroceso al 38,2 % de la 3 confirma que la 4 está en marcha' };
      operativa = { titulo: 'Operativa del curso', txt: prov ? 'Si entraste en la onda 2, la 3 está en marcha: a partir del 1:1 de la 3 con la 1 se pueden tomar beneficios; objetivo 1,618.' : 'El curso no plantea entrada en la onda 4. La 4 suele ser un flat o un triángulo (corrección lateral, menos agresiva que la 2).' };
      sesgo = prov ? dir : -dir;
    } else if (n === 5) {
      const w03 = Math.abs(P[3].p - P[0].p);
      estado = `${NOMBRE[tipo]} ${dTxt}: onda 4 ${prov ? 'en curso' : 'completa'}; falta la onda 5`;
      fib = { tipo: 'extension', a: P[0].p, b: P[1].p, from: P[4].p };
      const m24 = (P[4].p - P[2].p) / Math.max(1, P[4].i - P[2].i), i5 = P[4].i + Math.max(1, P[1].i - P[0].i);
      const canal = P[3].p + m24 * (i5 - P[3].i);
      objetivos = [{ txt: 'Onda 5 = 1:1 de la 1 (lo normal)', p: P[4].p + dir * w1 },
        ...((canal - P[4].p) * dir > 0 ? [{ txt: 'Techo del canal 2–4 por la 3 (Prechter)', p: canal }] : []), { txt: '0,618 de (inicio 1 → final 3) desde el final de 4', p: P[4].p + dir * w03 * 0.618 }, { txt: 'Onda 5 = 1,618 de la 1', p: P[4].p + dir * w1 * 1.618 }, { txt: 'Onda 5 corta = 0,618 de la 1', p: P[4].p + dir * w1 * 0.618 }];
      invalida = { p: P[4].p, hard: true, txt: 'Si el precio supera el final de la onda 4, la onda 5 no está en marcha y el recuento cambia' };
      invalida = tipo === 'comun' ? { p: P[1].p, hard: true, txt: 'La 4 no puede entrar en el terreno de la 1 (regla)' } : { p: P[2].p, hard: true, txt: 'En una diagonal la 4 no puede superar el final de la 2' };
      confirma = { p: P[3].p, txt: 'Si supera el final de la 3, la onda 5 está en marcha' };
      operativa = { titulo: 'Operativa del curso: la onda 5 se usa para salir', txt: 'La 5 cierra el ciclo impulsivo: es la onda para deshacer posiciones acumuladas, no para abrir nuevas. Después viene una corrección A-B-C de grado mayor.' };
      sesgo = prov ? -dir : dir;
    } else {
      const tot = Math.abs(P[5].p - P[0].p);
      estado = `${NOMBRE[tipo]} ${dTxt} de 5 ondas ${prov ? 'posiblemente terminando' : 'completo'}: lo esperable es una corrección A-B-C en contra`;
      fib = { tipo: 'retroceso', a: P[0].p, b: P[5].p };
      objetivos = [0.382, 0.5, 0.618].map(r => ({ txt: `Corrección al ${pc(r)} del impulso`, p: P[5].p - dir * tot * r }));
      if (tipo === 'comun') objetivos.unshift({ txt: 'Zona de la onda 4 previa (donde suele terminar la corrección)', p: P[4].p });
      else objetivos.unshift({ txt: 'Tras una diagonal final, el retroceso suele volver rápido a su inicio', p: P[0].p });
      invalida = { p: P[5].p, txt: 'Si supera con fuerza el final de la 5, el impulso se estaría extendiendo' };
      const m24 = (P[4].p - P[2].p) / Math.max(1, P[4].i - P[2].i);
      confirma = { p: P[4].p + m24 * (P[5].i + 3 - P[4].i), txt: 'Romper la línea 2–4 (o el final de la 4) confirma que el impulso terminó' };
      operativa = { titulo: 'Operativa del curso', txt: 'Ciclo impulsivo completo: deshacer posiciones. Con 5 ondas terminadas faltan las 3 correctivas (A-B-C) para completar el ciclo de 8 ondas.' };
      sesgo = -dir;
    }
    if (tipo !== 'comun') estado += n >= 6 ? '. Diagonal: si está en la onda 5 o C es final (giro brusco al terminar); si está en la 1 o A es de inicio' : '';
    return { kind: 'impulso', tipo, nombre: NOMBRE[tipo], dir, mult, score: ev.score, chk: ev.chk, points: pts, estado, objetivos, invalida, confirma, fib, sesgo, operativa, provisional: prov };
  }

  function planCorrection(c, P, dir, ev, mult) {
    const n = P.length, last = P[n - 1], prov = !!last.prov;
    const cd = -dir; // sentido de la corrección
    const pts = P.map((p, k) => Object.assign({}, p, { lab: LAB.abc[k] }));
    const A = ev.A, tT = dir === 1 ? 'alcista' : 'bajista';
    let estado, objetivos = [], invalida, fib, sesgo, operativa = null, confirma = null;
    if (n === 3) {
      confirma = { p: P[1].p, txt: 'Si supera el final de A, la C está en marcha' };
      estado = `${ev.tipo.split(' (')[0]} en curso: onda A completa, onda B ${prov ? 'en desarrollo' : 'completa'}; falta la C`;
      fib = { tipo: 'retroceso', a: P[0].p, b: P[1].p };
      const zz = ev.tipo.startsWith('Zigzag');
      const z = [zz ? 0.5 : 0.382, 0.618, 0.786].map(r => P[1].p - cd * A * r);
      const eB = prov ? P[1].p - cd * A * 0.618 : P[2].p;
      objetivos = [{ txt: 'C = 1:1 de A (objetivo del curso)', p: eB + cd * A }, { txt: 'C = 1,236 de A', p: eB + cd * A * 1.236 }, { txt: 'C = 1,618 de A', p: eB + cd * A * 1.618 }, { txt: 'C = 0,618 de A', p: eB + cd * A * 0.618 }];
      const exp = ev.tipo.startsWith('Flat expandido');
      invalida = zz ? { p: P[0].p, hard: true, txt: 'En un zigzag la B nunca cubre el 100 % de A' }
        : exp ? { p: P[1].p + cd * A * 0.1, txt: 'Si C no supera el final de A, el flat expandido no se completa' }
        : { p: P[0].p - cd * A * 0.236, hard: true, txt: 'Más allá de 1,236 de A ya no sería un flat regular o running' };
      operativa = { titulo: 'Operativa del curso: entrada en la B', zona: [z[0], z[2]], stop: P[0].p, tp1: eB + cd * A, tp2: eB + cd * A * 1.618,
        txt: `Tras un impulso en A, esperar el retroceso de B: mínimo ${zz ? '0,5' : '0,382'}, nivel más interesante 0,618–0,786 (${fmt(z[1])}–${fmt(z[2])}). Stop justo por encima del inicio de A (${fmt(P[0].p)}). Salida en C = 1:1 de A.` };
      sesgo = prov ? dir : cd;
    } else {
      const tot = Math.abs(P[3].p - P[0].p);
      estado = `${ev.tipo} ${prov ? 'terminando' : 'completo'}: si se confirma, se retoma la tendencia ${tT}`;
      fib = { tipo: 'retroceso', a: P[0].p, b: P[3].p };
      const flatTxt = ev.tipo.startsWith('Flat') ? 'por encima del máximo de B' : 'más allá del final de C';
      objetivos = (prov ? [{ txt: 'C = 1:1 de A', p: P[2].p + cd * A }, { txt: 'C = 1,618 de A', p: P[2].p + cd * A * 1.618 }] : [])
        .concat([0.618, 1, 1.618].map(r => ({ txt: `Nuevo impulso = ${r.toString().replace('.', ',')}× la corrección`, p: P[3].p + dir * tot * r })));
      invalida = { p: P[3].p, txt: 'Si el precio sigue más allá del final de C, la corrección se está extendiendo (posible compleja W-X-Y)' };
      confirma = { p: P[2].p, txt: 'Superar el final de B confirma que la corrección terminó' };
      operativa = { titulo: 'Operativa del curso: tras el final de C', txt: `Esperar una reacción con características impulsivas y entrar en su onda 2 (0,5 / 0,618 / 0,786). Stop ${prov ? 'más allá del final de C' : `más allá del final de C (${fmt(P[3].p)})`}. Objetivo: 1,618 de la 3 con la 1 del nuevo impulso.${ev.tipo.startsWith('Flat') ? ` Si aún estás dentro de la C: stop ${flatTxt}, salida en C = 1:1 de A.` : ''}` };
      sesgo = prov ? cd : dir;
    }
    return { kind: 'correccion', tipo: ev.tipo, nombre: ev.tipo, dir, mult, score: ev.score, chk: ev.chk, points: pts, estado, objetivos, invalida, confirma, fib, sesgo, operativa, provisional: prov };
  }

  function planTriangle(c, P, ev, mult, before) {
    const last = P[5], prov = !!last.prov;
    const pts = P.map((p, k) => Object.assign({}, p, { lab: LAB.tri[k] }));
    const dir = before && before.p < P[0].p ? 1 : -1; // tendencia previa al triángulo
    const A = Math.abs(P[1].p - P[0].p), D = Math.abs(P[4].p - P[3].p);
    const zE = [0.618, 0.786].map(r => P[4].p - Math.sign(P[4].p - P[3].p) * D * r);
    const nombre = ev.tipo;
    const mBD = (P[4].p - P[2].p) / Math.max(1, P[4].i - P[2].i), bdAt = i => P[2].p + mBD * (i - P[2].i);
    const width = Math.abs(P[1].p - bdAt(P[1].i)); // parte más ancha: de A a la línea B–D
    const exp = nombre === 'Triángulo expansivo';
    return { kind: 'triangulo', tipo: 'triangulo', nombre, dir, mult, score: ev.score, chk: ev.chk, points: pts,
      estado: `${nombre} (A-B-C-D-E, 3-3-3-3-3) ${prov ? 'con la E en curso' : 'completo'}: aparece en la onda 4, la B, la X o como último grupo de una compleja; tras él viene el último tramo (empuje) de la tendencia`,
      objetivos: exp ? [{ txt: 'Tras un expansivo el empuje suele ser corto: 1:1 de la A', p: P[5].p + dir * A }] : [{ txt: 'Empuje tras el triángulo ≈ su parte más ancha', p: P[5].p + dir * width }, { txt: 'Empuje mínimo: amplitud de la onda A', p: P[5].p + dir * A }],
      confirma: { p: bdAt(P[5].i + 2), txt: 'Romper la línea B–D confirma el final del triángulo' },
      invalida: { p: P[0].p, hard: true, txt: 'Más allá del inicio de A el triángulo no vale' },
      fib: { tipo: 'retroceso', a: P[3].p, b: P[4].p },
      operativa: { titulo: 'Operativa del curso: triángulo', zona: [zE[0], zE[1]], stop: P[0].p,
        txt: `Opción 1: entrada cuando la E llegue al 0,618–0,786 de la D (${fmt(zE[0])}–${fmt(zE[1])}), stop más allá de A. Opción 2: esperar que el nuevo impulso rompa ${dir === 1 ? 'el máximo' : 'el mínimo'} de D (${fmt(P[4].p)}) y entrar en su onda 2 (0,5–0,786). Objetivo: 1,618 de la 3 con la 1, o 1:1 de la 5 con la 1 si el triángulo es la onda 4.` },
      sesgo: dir, provisional: prov };
  }

  function planComplex(c, P, dir, ev, mult, plan) {
    const n = P.length, last = P[n - 1], prov = !!last.prov, cd = -dir, tT = dir === 1 ? 'alcista' : 'bajista';
    // etiquetas: a-b dentro de cada grupo, W/X/Y/Z al final de cada uno
    const lab = new Array(n).fill(''); lab[0] = '0'; let k = 0, g = 0;
    for (const part of plan) {
      if (part === 'X') { k += 1; lab[k] = 'X'; continue; }
      const len = part === 'T' ? 5 : part === 'P' ? 2 : 3, inner = part === 'T' ? ['a', 'b', 'c', 'd'] : ['a', 'b'];
      for (let j = 1; j < len; j++) lab[k + j] = inner[j - 1];
      if (part !== 'P') lab[k + len] = ['W', 'Y', 'Z'][g];
      else lab[k + len] = 'b';
      k += len; g++;
    }
    const pts = P.map((p, j) => Object.assign({}, p, { lab: lab[j] }));
    const W = ev.W, endPart = plan[plan.length - 1];
    let estado, objetivos = [], invalida, confirma = null, sesgo, fib, operativa;
    if (endPart === 'X') {
      estado = `${ev.nombre.split(' (')[0]} en formación: W completa, X ${prov ? 'en curso' : 'terminada'}; falta la Y`;
      const xe = last.p;
      objetivos = [1, 0.618, 1.618].map(r => ({ txt: `Y = ${r.toString().replace('.', ',')}× W`, p: xe + cd * W * r }));
      invalida = { p: P[0].p, hard: true, txt: 'La X no puede superar el inicio de W' };
      confirma = { p: P[3].p, txt: 'Si supera el final de W, la Y está en marcha' };
      fib = { tipo: 'retroceso', a: P[0].p, b: P[3].p };
      sesgo = prov ? dir : cd;
    } else if (endPart === 'P') {
      const ys = P[n - 3].p;
      estado = `${ev.nombre.split(' (')[0]} en formación: Y en curso (a-b hechas), falta su c`;
      objetivos = [1, 0.618, 1.618].map(r => ({ txt: `Y = ${r.toString().replace('.', ',')}× W`, p: ys + cd * W * r }));
      invalida = { p: ys, hard: true, txt: 'La b de la Y no puede superar el inicio de la Y' };
      confirma = { p: P[n - 2].p, txt: 'Si supera el final de la a, la c de la Y está en marcha' };
      fib = { tipo: 'retroceso', a: P[n - 3].p, b: P[n - 2].p };
      sesgo = prov ? dir : cd;
    } else {
      const tot = Math.abs(last.p - P[0].p), max3 = plan.filter(x => x !== 'X').length >= 3;
      estado = `${ev.nombre} ${prov ? 'terminando' : 'completa'}: ${max3 ? 'no puede haber más grupos (máximo 3), la corrección debe terminar aquí' : 'si se confirma, se retoma la tendencia ' + tT}`;
      objetivos = [0.618, 1, 1.618].map(r => ({ txt: `Nuevo impulso = ${r.toString().replace('.', ',')}× la corrección`, p: last.p + dir * tot * r }));
      invalida = { p: last.p, txt: max3 ? 'Superar este punto obliga a recontar en un grado mayor' : 'Si sigue más allá, la corrección se extiende (posible tercer grupo X-Z)' };
      confirma = { p: P[n - 2].p, txt: 'Se confirma el final de la corrección si supera el último pivote interno' };
      fib = { tipo: 'retroceso', a: P[0].p, b: last.p };
      sesgo = prov ? cd : dir;
    }
    operativa = { titulo: 'Lectura', txt: 'Las correcciones complejas son laterales y lentas: la tendencia de fondo se retoma al terminar el último grupo. Mejor esperar a la confirmación que adivinar el final.' };
    const o = { kind: 'compleja', tipo: ev.nombre, nombre: ev.nombre, dir, mult, score: ev.score, chk: ev.chk, points: pts, estado, objetivos, invalida, confirma, fib, sesgo, operativa, provisional: prov, segs: ev.segs };
    return o;
  }

  function fibLevels(f) {
    if (!f) return [];
    if (f.tipo === 'retroceso') return retracements(f.a, f.b).map(x => ({ r: x.r, p: x.p, lab: pc(x.r) }));
    return extensions(f.a, f.b, f.from).map(x => ({ r: x.r, p: x.p, lab: `ext ${x.r.toString().replace('.', ',')}` }));
  }

  // ---------- Estrategia validable: entrada en retroceso Fibonacci tras un impulso ----------
  // Se añade al conjunto de setups del motor para poder probarla igual que las demás.
  function zzCached(D, mult) {
    D._zz = D._zz || {};
    if (!D._zz[mult]) {
      const zz = zigzag(D.c, D.i.atr, mult);
      // índice: para cada vela, últimos pivotes confirmados hasta ella
      D._zz[mult] = zz.piv.slice().sort((a, b) => a.conf - b.conf);
    }
    return D._zz[mult];
  }
  E.SETUPS.fibo = {
    nombre: 'Retroceso Fibonacci (onda 2/4)',
    params: { mult: [2, 3], zona: ['50-618', '382-618'], impulso: [4, 6], filtro: ['tendencia', 'ninguno'] },
    detect(D, i, p) {
      const c = D.c, A = D.i.atr[i]; if (isNaN(A) || i < 220) return null;
      const piv = zzCached(D, p.mult);
      // último pivote confirmado antes de i
      let k = -1; for (let lo = 0, hi = piv.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (piv[m].conf <= i - 1) { k = m; lo = m + 1; } else hi = m - 1; }
      if (k < 0) return null;
      for (const dir of [1, -1]) {
        // a = último mínimo (largos) o máximo (cortos) confirmado; b = extremo opuesto alcanzado desde entonces
        let ka = k; while (ka >= 0 && piv[ka].t !== (dir === 1 ? 'L' : 'H')) ka--;
        if (ka < 0) continue;
        const a = piv[ka];
        let bi = a.i;
        for (let j = a.i + 1; j <= i - 1; j++) if (dir === 1 ? c[j].h > c[bi].h : c[j].l < c[bi].l) bi = j;
        if (bi === a.i) continue;
        const bp = dir === 1 ? c[bi].h : c[bi].l;
        const S = Math.abs(bp - a.p); if (S < p.impulso * A) continue;
        if (p.filtro === 'tendencia' && D.tr4[i] !== dir) continue;
        const top = p.zona === '50-618' ? 0.5 : 0.382;
        const zHi = bp - dir * S * top, zLo = bp - dir * S * 0.618, z786 = bp - dir * S * 0.786;
        let first = true;
        for (let j = bi + 1; j < i; j++) if (dir === 1 ? c[j].l <= zHi : c[j].h >= zHi) { first = false; break; }
        if (!first) continue;
        const bar = c[i];
        const touched = dir === 1 ? bar.l <= zHi && bar.l >= z786 : bar.h >= zHi && bar.h <= z786;
        const reject = dir === 1 ? bar.c > zLo && bar.c > bar.o : bar.c < zLo && bar.c < bar.o;
        if (!touched || !reject) continue;
        return { side: dir, entry: bar.c, stop: z786 - dir * 0.25 * A, nivel: zLo,
          why: `Impulso ${dir === 1 ? 'alcista' : 'bajista'} de ${fmt(a.p)} a ${fmt(bp)}; retrocede a la zona ${p.zona === '50-618' ? '50–61,8' : '38,2–61,8'} % y rechaza (posible fin de onda 2 o 4)` };
      }
      return null;
    }
  };

  // ---------- Estrategia del curso: entrada en la onda 2 (o en la B de un zigzag) ----------
  // Onda 1 = tramo impulsivo que rompe el máximo/mínimo anterior. Entrada límite en el retroceso
  // (0,5 o 0,618), stop justo más allá del inicio de la 1, objetivos: 1:1 de la 3 con la 1 y 1,618 (ratio de oro).
  E.SETUPS.onda2 = {
    nombre: 'Elliott: entrada en onda 2 (curso)',
    params: { mult: [3, 5], minW1: [6, 10], entrada: ['0.5', '0.618'], filtro: ['tendencia', 'contra', 'ninguno'] },
    detect(D, i, p) {
      const c = D.c, A = D.i.atr[i]; if (isNaN(A) || i < 220) return null;
      const piv = zzCached(D, p.mult);
      let k = -1; for (let lo = 0, hi = piv.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (piv[m].conf <= i - 1) { k = m; lo = m + 1; } else hi = m - 1; }
      if (k < 1) return null;
      const bar = c[i];
      for (const dir of [1, -1]) {
        let ka = k; while (ka >= 0 && piv[ka].t !== (dir === 1 ? 'L' : 'H')) ka--;
        if (ka < 1) continue;
        const a = piv[ka], prev = piv[ka - 1]; // prev = extremo opuesto anterior (el que la onda 1 debe superar)
        let bi = a.i;
        for (let j = a.i + 1; j <= i - 1; j++) if (dir === 1 ? c[j].h > c[bi].h : c[j].l < c[bi].l) bi = j;
        if (bi === a.i) continue;
        const bp = dir === 1 ? c[bi].h : c[bi].l, w1 = Math.abs(bp - a.p);
        if (w1 < p.minW1 * A) continue;
        if (dir === 1 ? bp <= prev.p : bp >= prev.p) continue; // la onda 1 rompe estructura
        if (dir === 1 ? bar.h > bp : bar.l < bp) continue;      // la vela hace nuevo extremo: el tramo aún no ha terminado
        if (p.filtro === 'tendencia' && D.tr4[i] !== dir) continue;
        if (p.filtro === 'contra' && D.tr4[i] !== -dir) continue;
        const lvl = bp - dir * w1 * (+p.entrada);
        let first = true;
        for (let j = bi + 1; j < i; j++) if (dir === 1 ? c[j].l <= lvl : c[j].h >= lvl) { first = false; break; }
        if (!first) continue;
        if (dir === 1 ? bar.l > lvl : bar.h < lvl) continue;
        const fill = dir === 1 ? Math.min(bar.o, lvl) : Math.max(bar.o, lvl);
        const stop = a.p - dir * 0.1 * A;
        return { side: dir, entry: fill, stop, nivel: lvl, sameBarStop: dir === 1 ? bar.l <= stop : bar.h >= stop,
          tp1: fill + dir * w1, tp2: fill + dir * w1 * 1.618,
          why: `Onda 1 ${dir === 1 ? 'alcista' : 'bajista'} de ${fmt(a.p)} a ${fmt(bp)} (rompe estructura). Entrada límite en el ${(+p.entrada * 100).toFixed(1)} % de retroceso; stop bajo el inicio de la 1; objetivos 1:1 y 1,618 de la 3 con la 1` };
      }
      return null;
    }
  };

  const api = { zigzag, retracements, extensions, countWaves, countHistory, subdivide, expectedLegs, fibLevels, evalImpulse, evalCorrection, evalTriangle, evalComplex, legsIn, RET, EXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BTCElliott = api;
})(typeof window !== 'undefined' ? window : globalThis);
