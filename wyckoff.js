// ===================== Wyckoff =====================
// Lectura automática de estructuras de Wyckoff sobre velas {t,o,h,l,c,v}.
// Acumulación: PS · SC (clímax de venta) · AR (rebote automático) · ST (test secundario) · Spring/Shakeout · Test · SOS · LPS · fase E (subida)
// Distribución: PSY · BC (clímax de compra) · AR · ST · UT/UTAD · SOW · LPSY · fase E (bajada)
// Fases A–E según Wyckoff / Pruden («The Three Skills of Top Trading») y Weis («Trades About to Happen»).
// Es una lectura heurística: detecta los eventos por volumen, rango y posición; no es infalible.
(function (root) {
  const sma = (a, i, p) => { let s = 0, k = 0; for (let j = Math.max(0, i - p); j < i; j++) { s += a[j]; k++; } return k ? s / k : a[i]; };
  function atrArr(c, p = 14) { const out = []; let a = null; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = a == null ? tr : (a * (p - 1) + tr) / p; out.push(a); } return out; }
  function ema(c, p) { const k = 2 / (p + 1); let e = c[0].c; return c.map(x => (e = x.c * k + e * (1 - k))); }

  // Métricas por vela: volumen relativo, rango relativo, posición del cierre
  function metrics(c) {
    const atr = atrArr(c), vol = c.map(x => x.vb != null ? x.vb : (x.v || 0)); // volumen en BTC si existe (Wyckoff usa unidades, no dólares)
    return c.map((x, i) => ({ rv: vol[i] / (sma(vol, i, 50) || 1), rr: (x.h - x.l) / (atr[i] || 1), cp: x.h > x.l ? (x.c - x.l) / (x.h - x.l) : 0.5, atr: atr[i] }));
  }

  // Clímax: volumen muy alto + rango amplio en el extremo de las últimas N velas, tras una tendencia
  function climaxes(c, m, look = 40) {
    const out = [];
    for (let i = look; i < c.length; i++) {
      const M = m[i]; if (M.rv < 2 || M.rr < 1.2) continue;
      let lo = Infinity, hi = -Infinity; for (let k = i - look; k < i; k++) { lo = Math.min(lo, c[k].l); hi = Math.max(hi, c[k].h); }
      const trendDn = c[i].c < c[Math.max(0, i - 20)].c * 0.97, trendUp = c[i].c > c[Math.max(0, i - 20)].c * 1.03;
      if (c[i].l <= lo && trendDn) out.push({ i, type: 'SC', score: M.rv * M.rr, absorb: M.cp });
      else if (c[i].h >= hi && trendUp) out.push({ i, type: 'BC', score: M.rv * M.rr, absorb: 1 - M.cp });
    }
    // agrupa clímax cercanos (mismo episodio): se queda con el extremo del grupo
    const g = [];
    for (const x of out) {
      const last = g[g.length - 1];
      if (last && last.type === x.type && x.i - last.i <= 8) { const better = x.type === 'SC' ? c[x.i].l <= c[last.i].l : c[x.i].h >= c[last.i].h; if (better) g[g.length - 1] = { ...x, score: Math.max(x.score, last.score) }; }
      else g.push(x);
    }
    return g;
  }

  // Construye la estructura que nace en un clímax y sigue sus eventos hasta hoy (o hasta romperse)
  function structureFrom(c, m, cl, endI) {
    const acc = cl.type === 'SC', s = cl.i, n = Math.min(endI, c.length - 1), ev = [];
    const sgn = acc ? 1 : -1, ext = x => acc ? x.l : x.h, opp = x => acc ? x.h : x.l;
    ev.push({ i: s, k: acc ? 'SC' : 'BC', p: ext(c[s]), txt: acc ? 'Clímax de venta' : 'Clímax de compra', rv: m[s].rv });
    // AR: extremo opuesto del rebote que sigue al clímax (hasta 25 velas, mientras no rompa el clímax)
    let a = -1;
    for (let k = s + 1; k <= Math.min(n, s + 25); k++) {
      if (acc ? c[k].l < c[s].l : c[k].h > c[s].h) break;
      if (a < 0 || (acc ? c[k].h > c[a].h : c[k].l < c[a].l)) a = k;
    }
    const st = { type: acc ? 'acumulacion' : 'distribucion', climax: s, events: ev, phase: 'A', confirmed: false, broken: null };
    if (a < 0 || Math.abs(opp(c[a]) - ext(c[s])) < 1.5 * m[s].atr || a === n) { st.pendingAR = true; st.lo = acc ? c[s].l : null; st.hi = acc ? null : c[s].h; st.last = n; return st; }
    ev.push({ i: a, k: 'AR', p: opp(c[a]), txt: acc ? 'Rebote automático (techo del rango)' : 'Reacción automática (suelo del rango)', rv: m[a].rv });
    st.lo = acc ? c[s].l : c[a].l; st.hi = acc ? c[a].h : c[s].h; st.confirmed = true;
    const H = st.hi - st.lo, edge = acc ? st.lo : st.hi, top = acc ? st.hi : st.lo;
    let phase = 'A', stDone = false, cFound = null, sosI = null;
    for (let k = a + 1; k <= n; k++) {
      const x = c[k], M = m[k];
      if (!sosI) {
        // Test secundario: vuelve cerca del clímax con menos volumen
        const near = acc ? x.l <= st.lo + 0.25 * H && x.l >= st.lo - 0.02 * H : x.h >= st.hi - 0.25 * H && x.h <= st.hi + 0.02 * H;
        if (!stDone && near && M.rv < m[s].rv * 0.8 && k - a >= 2) { ev.push({ i: k, k: acc ? 'ST' : 'ST', p: ext(x), txt: 'Test secundario (menos volumen que el clímax)', rv: M.rv }); stDone = true; phase = 'B'; continue; }
        // Spring / UTAD: perfora el borde y vuelve dentro en ≤3 velas
        const pierce = acc ? x.l < edge : x.h > edge;
        if (pierce) {
          let back = -1; for (let j = k; j <= Math.min(n, k + 3); j++) if (acc ? c[j].c > edge : c[j].c < edge) { back = j; break; }
          if (back >= 0) {
            let deepest = k; for (let j = k; j <= back; j++) if (acc ? c[j].l < c[deepest].l : c[j].h > c[deepest].h) deepest = j;
            const depth = Math.abs(ext(c[deepest]) / edge - 1);
            if (!cFound || (acc ? c[deepest].l < c[cFound].l : c[deepest].h > c[cFound].h)) {
              if (cFound) ev.splice(ev.findIndex(e => e.i === cFound && (e.k === 'Spring' || e.k === 'UTAD')), 1);
              cFound = deepest; ev.push({ i: deepest, k: acc ? 'Spring' : 'UTAD', p: ext(c[deepest]), txt: acc ? `Spring: barre el suelo un ${(depth * 100).toFixed(1).replace('.', ',')} % y vuelve al rango` : `UTAD: supera el techo un ${(depth * 100).toFixed(1).replace('.', ',')} % y vuelve al rango`, rv: m[deepest].rv, depth });
              phase = 'C';
            }
            k = back; continue;
          } else if (k + 3 <= n || (acc ? x.c < edge - 0.15 * H : x.c > edge + 0.15 * H)) {
            // rompe el borde y no vuelve: la estructura falla → continúa la tendencia
            st.broken = { i: k, txt: acc ? 'Rompe el suelo del rango y no vuelve: sigue la caída (no era acumulación)' : 'Rompe el techo del rango y no vuelve: sigue la subida (no era distribución)' };
            ev.push({ i: k, k: acc ? 'Ruptura' : 'Ruptura', p: acc ? x.l : x.h, txt: st.broken.txt, rv: M.rv });
            phase = 'E-'; break;
          }
        }
        // Test del spring/UTAD: vuelve cerca con poco volumen sin superar el extremo
        if (cFound && k > cFound + 1 && !ev.some(e => e.k === 'Test') && (acc ? x.l <= c[cFound].l + 0.3 * (st.hi - c[cFound].l) && x.l > c[cFound].l : x.h >= c[cFound].h - 0.3 * (c[cFound].h - st.lo) && x.h < c[cFound].h) && M.rv < 1) {
          ev.push({ i: k, k: 'Test', p: ext(x), txt: `Test del ${acc ? 'spring' : 'UTAD'} con poco volumen (entrada de menor riesgo)`, rv: M.rv });
        }
        // SOS / SOW: cierre fuera del lado opuesto con volumen
        if ((acc ? x.c > top : x.c < top) && M.rv >= 1.2) { sosI = k; ev.push({ i: k, k: acc ? 'SOS' : 'SOW', p: x.c, txt: acc ? 'Señal de fuerza: cierra por encima del techo con volumen' : 'Señal de debilidad: cierra por debajo del suelo con volumen', rv: M.rv }); phase = 'D'; continue; }
      } else {
        // fallo tras la señal de fuerza/debilidad: vuelve al otro lado del rango → la estructura queda invalidada
        if (acc ? x.c < st.lo : x.c > st.hi) {
          st.broken = { i: k, txt: acc ? 'Tras salir del rango vuelve por debajo de su suelo: la acumulación ha fallado' : 'Tras salir del rango vuelve por encima de su techo: la distribución ha fallado' };
          ev.push({ i: k, k: 'Ruptura', p: x.c, txt: st.broken.txt, rv: M.rv }); phase = 'E-'; break;
        }
        // LPS / LPSY: retroceso tras la señal de fuerza/debilidad que respeta el rango
        if (!ev.some(e => e.k === 'LPS' || e.k === 'LPSY')) {
          const pull = acc ? x.l < c[k - 1].l && x.l > st.lo + 0.5 * H : x.h > c[k - 1].h && x.h < st.hi - 0.5 * H;
          if (pull && M.rv < 1.2) ev.push({ i: k, k: acc ? 'LPS' : 'LPSY', p: ext(x), txt: acc ? 'Último punto de soporte (retroceso con poco volumen)' : 'Último punto de oferta (rebote con poco volumen)', rv: M.rv });
        }
        if (acc ? x.c > st.hi + H : x.c < st.lo - H) { if (phase !== 'E') st.eI = k; phase = 'E'; }
        if (acc ? x.c < st.lo + 0.5 * H : x.c > st.hi - 0.5 * H) { phase = phase === 'E' ? 'E' : 'D?'; }
      }
    }
    if (phase === 'A' && n - a > 3) phase = stDone ? 'B' : 'B';
    st.phase = phase; st.last = n; st.cI = cFound; st.sosI = sosI;
    return st;
  }

  // Esfuerzo frente a resultado en las últimas velas
  function effort(c, m, N = 20) {
    const n = c.length, a = c.slice(-N), mm = m.slice(-N);
    let vUp = 0, vDn = 0, nU = 0, nD = 0;
    a.forEach((x, i) => { if (x.c >= x.o) { vUp += mm[i].rv; nU++; } else { vDn += mm[i].rv; nD++; } });
    const last = c[n - 2], lm = m[n - 2]; // última vela cerrada
    let bar = null;
    const down = last.c < last.o;
    if (lm.rv >= 1.8 && lm.rr < 0.9) bar = down ? 'Mucho volumen y poco recorrido a la baja: absorción (alguien compra la oferta)' : 'Mucho volumen y poco recorrido al alza: absorción (alguien vende a los compradores)';
    else if (lm.rv >= 1.8 && lm.rr >= 1.3) bar = down ? 'Esfuerzo y resultado a la baja: la oferta manda' : 'Esfuerzo y resultado al alza: la demanda manda';
    else if (lm.rv < 0.7 && !down && lm.rr < 1) bar = 'Subida con poco volumen: falta de demanda';
    else if (lm.rv < 0.7 && down && lm.rr < 1) bar = 'Bajada con poco volumen: falta de oferta';
    return { volUp: nU ? vUp / nU : 0, volDn: nD ? vDn / nD : 0, dom: (nU ? vUp / nU : 0) >= (nD ? vDn / nD : 0) ? 'demanda' : 'oferta', bar };
  }

  function analyze(c, opts = {}) {
    if (!c || c.length < 80) return null;
    const m = metrics(c), cls = climaxes(c, m, opts.look || 40), n = c.length - 1;
    const e50 = ema(c, 50), e200 = ema(c, Math.min(200, c.length - 1));
    const trend = c[n].c < e50[n] && e50[n] < e200[n] ? 'bajista' : c[n].c > e50[n] && e50[n] > e200[n] ? 'alcista' : 'lateral';
    // estructuras: cada clímax abre una; la siguiente empieza donde la anterior se rompe o en el siguiente clímax
    // Una estructura sigue viva hasta que se rompe o llega a fase E; los clímax que caen dentro de una estructura viva
    // (p. ej. la vela de la señal de fuerza o un spring con mucho volumen) no abren otra.
    const structs = [];
    for (const cl of cls) {
      const prev = structs[structs.length - 1];
      if (prev) {
        const freeAt = prev.broken ? prev.broken.i : prev.eI != null ? prev.eI : prev.pendingAR ? -1 : Infinity;
        const replacesPending = prev.pendingAR && cl.type === (prev.type === 'acumulacion' ? 'SC' : 'BC');
        if (!(cl.i > freeAt || replacesPending)) continue;
        if (replacesPending && !prev.broken) structs.pop();
      }
      structs.push(structureFrom(c, m, cl, n));
    }
    const cur = structs.length ? structs[structs.length - 1] : null;
    const price = c[n].c;
    // estado
    let fase, nombre, sesgo = 0, plan = [], espera = '';
    if (!cur || cur.broken || (cur.confirmed && cur.last < n - 2 && !(price <= cur.hi && price >= cur.lo))) {
      const dn = trend === 'bajista';
      fase = dn ? 'Markdown' : trend === 'alcista' ? 'Markup' : 'Sin estructura';
      nombre = dn ? 'Fase de caída (markdown): no hay acumulación todavía' : trend === 'alcista' ? 'Fase de subida (markup)' : 'Sin estructura de Wyckoff clara';
      sesgo = dn ? -1 : trend === 'alcista' ? 1 : 0;
      espera = dn ? 'Esperar un clímax de venta (volumen ≥2× y rango amplio en mínimos) y su rebote automático para tener rango.' : trend === 'alcista' ? 'Esperar un clímax de compra para hablar de distribución.' : '';
      plan = dn ? ['Rebotes con poco volumen (falta de demanda) = zonas de venta.', 'No comprar hasta ver clímax + rebote automático + test.'] : trend === 'alcista' ? ['Retrocesos con poco volumen (falta de oferta) = zonas de compra.'] : [];
    } else {
      const acc = cur.type === 'acumulacion';
      const P = { 'A': 'A (parada de la tendencia)', 'B': 'B (construcción de la causa dentro del rango)', 'C': 'C (test final: ' + (acc ? 'spring' : 'UTAD') + ')', 'D': 'D (' + (acc ? 'señal de fuerza, sale del rango hacia arriba' : 'señal de debilidad, sale del rango hacia abajo') + ')', 'D?': 'D en duda (ha vuelto dentro del rango)', 'E': 'E (' + (acc ? 'subida' : 'bajada') + ' en marcha)' };
      fase = cur.pendingAR ? 'A?' : cur.phase;
      nombre = cur.pendingAR ? (acc ? 'Posible clímax de venta: falta el rebote automático que lo confirme' : 'Posible clímax de compra: falta la reacción que lo confirme') : `${acc ? 'Acumulación' : 'Distribución'} · fase ${P[cur.phase] || cur.phase}`;
      sesgo = cur.pendingAR ? 0 : ({ A: 0, B: 0, C: acc ? 1 : -1, D: acc ? 1 : -1, 'D?': 0, E: acc ? 1 : -1 }[cur.phase] || 0);
      if (cur.pendingAR) { espera = acc ? 'Rebote automático (AR) en las próximas velas; su máximo será el techo del rango.' : 'Reacción automática a la baja; su mínimo será el suelo del rango.'; plan = acc ? ['No perseguir el rebote: el AR suele venderse.', 'Después vendrá el test secundario hacia el clímax con menos volumen.'] : []; }
      else if (cur.phase === 'A' || cur.phase === 'B') {
        espera = acc ? `Rango entre ${Math.round(cur.lo)} y ${Math.round(cur.hi)}. Falta el spring (barrido bajo ${Math.round(cur.lo)} que vuelve dentro) o la señal de fuerza (cierre sobre ${Math.round(cur.hi)} con volumen).` : `Rango entre ${Math.round(cur.lo)} y ${Math.round(cur.hi)}. Falta el UTAD (barrido sobre ${Math.round(cur.hi)} que vuelve dentro) o la señal de debilidad (cierre bajo ${Math.round(cur.lo)} con volumen).`;
        plan = acc ? ['No operar en mitad del rango.', `Compra: al recuperar ${Math.round(cur.lo)} tras un spring, stop bajo el mínimo del spring.`, `O compra en el retroceso (LPS) tras cerrar sobre ${Math.round(cur.hi)}.`] : ['No operar en mitad del rango.', `Venta: al perder ${Math.round(cur.hi)} tras un UTAD, stop sobre el máximo del UTAD.`, `O venta en el rebote (LPSY) tras cerrar bajo ${Math.round(cur.lo)}.`];
      } else if (cur.phase === 'C') {
        const sp = c[cur.cI];
        espera = acc ? `Spring en ${Math.round(sp.l)}. Ahora: test con poco volumen sin perder ${Math.round(sp.l)}, luego señal de fuerza sobre ${Math.round(cur.hi)}.` : `UTAD en ${Math.round(sp.h)}. Ahora: test con poco volumen sin superar ${Math.round(sp.h)}, luego señal de debilidad bajo ${Math.round(cur.lo)}.`;
        plan = acc ? [`Compra en el test del spring, stop bajo ${Math.round(sp.l)}.`, `Objetivo inicial: techo del rango ${Math.round(cur.hi)}.`] : [`Venta en el test del UTAD, stop sobre ${Math.round(sp.h)}.`, `Objetivo inicial: suelo del rango ${Math.round(cur.lo)}.`];
      } else if (cur.phase === 'D' || cur.phase === 'E') {
        const H = cur.hi - cur.lo;
        espera = acc ? `Salió del rango. Objetivo por la «causa» del rango: ~${Math.round(cur.hi + H)}–${Math.round(cur.hi + 2 * H)}.` : `Salió del rango. Objetivo por la «causa»: ~${Math.round(cur.lo - H)}–${Math.round(cur.lo - 2 * H)}.`;
        plan = acc ? [`Compra en retrocesos con poco volumen (LPS) que respeten ${Math.round(cur.hi)}.`, `Invalida si vuelve bajo ${Math.round(cur.lo + H / 2)}.`] : [`Venta en rebotes con poco volumen (LPSY) que respeten ${Math.round(cur.lo)}.`, `Invalida si vuelve sobre ${Math.round(cur.hi - H / 2)}.`];
      } else { espera = 'Ha vuelto dentro del rango tras salir: señal débil, esperar.'; plan = ['Esperar a que vuelva a salir del rango con volumen.']; }
    }
    // rangos anteriores relevantes (soportes/resistencias de Wyckoff)
    const ranges = structs.filter(s => s.confirmed).map(s => ({ type: s.type, lo: s.lo, hi: s.hi, t0: c[s.climax].t, t1: c[s.last].t, broken: !!s.broken })).slice(-4);
    return { trend, fase, nombre, sesgo, espera, plan, cur, structs, ranges, effort: effort(c, m), events: (cur ? cur.events : []).map(e => ({ ...e, t: c[e.i].t })), allEvents: structs.flatMap(s => s.events.map(e => ({ ...e, t: c[e.i].t, st: s.type }))), m };
  }

  const api = { analyze, metrics, climaxes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BTCWyckoff = api;
})(typeof window !== 'undefined' ? window : this);
