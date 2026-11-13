/* Motor de señales BTC — indicadores, setups, gestión de riesgo y backtest.
   Funciona en navegador (window.BTCEngine) y en Node (module.exports). Sin dependencias. */
(function (root) {
  'use strict';

  // ---------- Indicadores ----------
  function ema(src, n) {
    const out = new Array(src.length).fill(NaN);
    if (src.length < n) return out;
    let s = 0;
    for (let i = 0; i < n; i++) s += src[i];
    let e = s / n; out[n - 1] = e;
    const a = 2 / (n + 1);
    for (let i = n; i < src.length; i++) { e = src[i] * a + e * (1 - a); out[i] = e; }
    return out;
  }
  function sma(src, n) {
    const out = new Array(src.length).fill(NaN);
    let s = 0;
    for (let i = 0; i < src.length; i++) {
      s += src[i];
      if (i >= n) s -= src[i - n];
      if (i >= n - 1) out[i] = s / n;
    }
    return out;
  }
  function stdev(src, n, mean) {
    const out = new Array(src.length).fill(NaN);
    for (let i = n - 1; i < src.length; i++) {
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += (src[j] - mean[i]) ** 2;
      out[i] = Math.sqrt(s / n);
    }
    return out;
  }
  function atr(c, n) {
    const out = new Array(c.length).fill(NaN);
    let a = NaN;
    for (let i = 1; i < c.length; i++) {
      const tr = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
      if (i < n) { a = isNaN(a) ? tr : a + tr; if (i === n - 1) { a = a / n; out[i] = a; } continue; }
      a = (a * (n - 1) + tr) / n; out[i] = a;
    }
    return out;
  }
  function rsi(src, n) {
    const out = new Array(src.length).fill(NaN);
    let g = 0, l = 0;
    for (let i = 1; i < src.length; i++) {
      const d = src[i] - src[i - 1];
      const up = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = 100 - 100 / (1 + g / (l || 1e-12)); } continue; }
      g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n;
      out[i] = 100 - 100 / (1 + g / (l || 1e-12));
    }
    return out;
  }
  function rollingPercentile(src, n) { // percentil (0-100) del valor actual frente a los n anteriores
    const out = new Array(src.length).fill(NaN);
    for (let i = n; i < src.length; i++) {
      const v = src[i]; if (isNaN(v)) continue;
      let below = 0, cnt = 0;
      for (let j = i - n; j < i; j++) { if (!isNaN(src[j])) { cnt++; if (src[j] < v) below++; } }
      out[i] = cnt ? (below / cnt) * 100 : NaN;
    }
    return out;
  }

  function computeIndicators(c) {
    const close = c.map(x => x.c), vol = c.map(x => x.v);
    const bbMid = sma(close, 20), bbSd = stdev(close, 20, bbMid);
    const bbUp = bbMid.map((m, i) => m + 2 * bbSd[i]);
    const bbLo = bbMid.map((m, i) => m - 2 * bbSd[i]);
    const bbW = bbMid.map((m, i) => (bbUp[i] - bbLo[i]) / m);
    return {
      ema20: ema(close, 20), ema50: ema(close, 50), ema200: ema(close, 200),
      atr: atr(c, 14), rsi: rsi(close, 14), volSma: sma(vol, 20),
      bbMid, bbUp, bbLo, bbW, bbWPct: rollingPercentile(bbW, 200)
    };
  }

  // Alinea cada vela base con la última vela CERRADA de un marco superior (sin mirar al futuro)
  function alignHigher(base, higher, baseMs, higherMs) {
    const idx = new Array(base.length).fill(-1);
    let j = -1;
    for (let i = 0; i < base.length; i++) {
      const baseClose = base[i].t + baseMs;
      while (j + 1 < higher.length && higher[j + 1].t + higherMs <= baseClose) j++;
      idx[i] = j;
    }
    return idx;
  }

  function regimeAt(c, ind, k) { // 1 alcista, -1 bajista, 0 neutral
    if (k < 0 || isNaN(ind.ema200[k]) || isNaN(ind.ema50[k])) return 0;
    const cl = c[k].c;
    if (cl > ind.ema200[k] && ind.ema20[k] > ind.ema50[k]) return 1;
    if (cl < ind.ema200[k] && ind.ema20[k] < ind.ema50[k]) return -1;
    return 0;
  }
  function trendAt(c, ind, k) { // tendencia de 4h
    if (k < 0 || isNaN(ind.ema50[k])) return 0;
    if (ind.ema20[k] > ind.ema50[k] && c[k].c > ind.ema50[k]) return 1;
    if (ind.ema20[k] < ind.ema50[k] && c[k].c < ind.ema50[k]) return -1;
    return 0;
  }

  // ---------- Preparación del conjunto de datos ----------
  const H1 = 3600e3, H4 = 4 * H1, D1 = 24 * H1;
  // base = marco operativo; mid = marco de tendencia; high = marco de régimen
  function prepare(base, mid, high, msBase, msMid, msHigh) {
    msBase = msBase || H1; msMid = msMid || H4; msHigh = msHigh || D1;
    const ib = computeIndicators(base), im = computeIndicators(mid), ih = computeIndicators(high);
    const am = alignHigher(base, mid, msBase, msMid), ah = alignHigher(base, high, msBase, msHigh);
    const reg = base.map((_, i) => regimeAt(high, ih, ah[i]));
    const tr4 = base.map((_, i) => trendAt(mid, im, am[i]));
    return { c: base, i: ib, mid, im, high, ih, am, ah, reg, tr4, msBase };
  }

  // ---------- Setups ----------
  // Cada detector devuelve null o {side, entry, stop, why}
  const SETUPS = {
    barrido: {
      nombre: 'Barrido de liquidez',
      params: { lookback: [24, 48, 96], wick: [0.35, 0.5], filtro: ['ninguno', 'regimen'] },
      detect(D, i, p) {
        const c = D.c, A = D.i.atr[i];
        if (i < p.lookback + 2 || isNaN(A)) return null;
        let lo = Infinity, hi = -Infinity;
        for (let j = i - p.lookback; j <= i - 2; j++) { if (c[j].l < lo) lo = c[j].l; if (c[j].h > hi) hi = c[j].h; }
        const b = c[i], rng = b.h - b.l; if (rng <= 0) return null;
        const lowerWick = (Math.min(b.o, b.c) - b.l) / rng, upperWick = (b.h - Math.max(b.o, b.c)) / rng;
        if (b.l < lo && b.c > lo && lowerWick >= p.wick) {
          if (p.filtro === 'regimen' && D.reg[i] === -1) return null;
          return { side: 1, entry: b.c, stop: b.l - 0.25 * A, nivel: lo, why: `Barre el mínimo de ${p.lookback} velas (${lo.toFixed(0)}) y recupera` };
        }
        if (b.h > hi && b.c < hi && upperWick >= p.wick) {
          if (p.filtro === 'regimen' && D.reg[i] === 1) return null;
          return { side: -1, entry: b.c, stop: b.h + 0.25 * A, nivel: hi, why: `Barre el máximo de ${p.lookback} velas (${hi.toFixed(0)}) y pierde` };
        }
        return null;
      }
    },
    pullback: {
      nombre: 'Retroceso en tendencia',
      params: { media: ['ema20', 'ema50'], rsiReset: [40, 45], exigirDiario: [true, false] },
      detect(D, i, p) {
        const c = D.c, I = D.i, A = I.atr[i], m = I[p.media][i];
        if (i < 210 || isNaN(A) || isNaN(m)) return null;
        const b = c[i];
        let minRsi = 100, maxRsi = 0, lo = Infinity, hi = -Infinity;
        for (let j = i - 5; j <= i; j++) { minRsi = Math.min(minRsi, I.rsi[j]); maxRsi = Math.max(maxRsi, I.rsi[j]); lo = Math.min(lo, c[j].l); hi = Math.max(hi, c[j].h); }
        const upTrend = D.tr4[i] === 1 && (!p.exigirDiario || D.reg[i] === 1);
        const dnTrend = D.tr4[i] === -1 && (!p.exigirDiario || D.reg[i] === -1);
        if (upTrend && b.l <= m * 1.001 && b.c > m && b.c > b.o && minRsi < p.rsiReset)
          return { side: 1, entry: b.c, stop: lo - 0.25 * A, nivel: m, why: `Tendencia alcista 4h${p.exigirDiario ? '+1D' : ''}, retrocede a la ${p.media.toUpperCase()} 1h y rebota` };
        if (dnTrend && b.h >= m * 0.999 && b.c < m && b.c < b.o && maxRsi > 100 - p.rsiReset)
          return { side: -1, entry: b.c, stop: hi + 0.25 * A, nivel: m, why: `Tendencia bajista 4h${p.exigirDiario ? '+1D' : ''}, rebota a la ${p.media.toUpperCase()} 1h y se gira` };
        return null;
      }
    },
    ruptura: {
      nombre: 'Ruptura de compresión',
      params: { pct: [10, 20], volMult: [1.3, 1.8], stopAtr: [1.5, 2.5] },
      detect(D, i, p) {
        const c = D.c, I = D.i, A = I.atr[i];
        if (i < 210 || isNaN(A) || isNaN(I.bbWPct[i - 1])) return null;
        let comp = false;
        for (let j = i - 6; j <= i - 1; j++) if (I.bbWPct[j] <= p.pct) comp = true;
        if (!comp) return null;
        const b = c[i];
        if (b.v < p.volMult * I.volSma[i - 1]) return null;
        if (b.c > I.bbUp[i] && b.c > b.o && D.tr4[i] !== -1)
          return { side: 1, entry: b.c, stop: b.c - p.stopAtr * A, nivel: I.bbUp[i], why: 'Rompe al alza una compresión de volatilidad con volumen' };
        if (b.c < I.bbLo[i] && b.c < b.o && D.tr4[i] !== 1)
          return { side: -1, entry: b.c, stop: b.c + p.stopAtr * A, nivel: I.bbLo[i], why: 'Rompe a la baja una compresión de volatilidad con volumen' };
        return null;
      }
    }
  };

  SETUPS.tendencia = {
    nombre: 'Ruptura de tendencia (Donchian)',
    params: { n: [20, 55], filtro: ['regimen', 'tendencia'], stopAtr: [2, 3] },
    detect(D, i, p) {
      const c = D.c, A = D.i.atr[i];
      if (i < Math.max(p.n + 2, 210) || isNaN(A)) return null;
      let hi = -Infinity, lo = Infinity;
      for (let j = i - p.n; j <= i - 1; j++) { if (c[j].h > hi) hi = c[j].h; if (c[j].l < lo) lo = c[j].l; }
      const b = c[i], okL = p.filtro === 'regimen' ? D.reg[i] === 1 : D.tr4[i] === 1, okS = p.filtro === 'regimen' ? D.reg[i] === -1 : D.tr4[i] === -1;
      if (b.c > hi && okL) return { side: 1, entry: b.c, stop: b.c - p.stopAtr * A, nivel: hi, why: `Cierra por encima del máximo de ${p.n} velas (${hi.toFixed(0)}) a favor de la tendencia` };
      if (b.c < lo && okS) return { side: -1, entry: b.c, stop: b.c + p.stopAtr * A, nivel: lo, why: `Cierra por debajo del mínimo de ${p.n} velas (${lo.toFixed(0)}) a favor de la tendencia` };
      return null;
    }
  };

  // ---------- Gestión de la operación ----------
  // Gestión: 50% en TP1, stop a breakeven, resto a TP2; cierre por tiempo
  // trail > 0: tras TP1 el resto sigue con stop dinámico a trail×ATR del máximo/mínimo alcanzado (tp2 se ignora)
  const DEFAULT_MGMT = { tp1R: 1.5, tp2R: 3, partial: 0.5, maxBars: 72, minRiskAtr: 0.3, maxRiskAtr: 4, costPct: 0.0005, trail: 0 };

  function buildPlan(sig, mgmt, A) {
    const risk = Math.abs(sig.entry - sig.stop);
    if (!(risk > 0) || risk < mgmt.minRiskAtr * A || risk > mgmt.maxRiskAtr * A) return null;
    // un setup puede fijar sus propios objetivos (p. ej. proyecciones de Fibonacci de Elliott)
    return Object.assign({}, sig, {
      risk,
      tp1: sig.tp1 != null ? sig.tp1 : sig.entry + sig.side * mgmt.tp1R * risk,
      tp2: sig.tp2 != null ? sig.tp2 : sig.entry + sig.side * mgmt.tp2R * risk
    });
  }

  // Simula la operación desde la vela i+1. Si stop y objetivo caen en la misma vela, se asume stop (conservador).
  function simulate(D, i, plan, mgmt) {
    const c = D.c, atrA = D.i.atr;
    const s = plan.side, e = plan.entry, R = plan.risk;
    // orden límite ejecutada en una vela que también tocó el stop: se cuenta como pérdida (conservador)
    if (plan.sameBarStop) return { r: (-R - e * mgmt.costPct * 2) / R, tp1Hit: false, exitIdx: i, reason: 'stop' };
    let stop = plan.stop, rem = 1, pnl = 0, tp1Hit = false, exitIdx = -1, reason = '', ext = e;
    for (let k = i + 1; k < c.length && k <= i + mgmt.maxBars; k++) {
      const b = c[k];
      const hitStop = s === 1 ? b.l <= stop : b.h >= stop;
      const hitTp1 = !tp1Hit && (s === 1 ? b.h >= plan.tp1 : b.l <= plan.tp1);
      const hitTp2 = !mgmt.trail && (s === 1 ? b.h >= plan.tp2 : b.l <= plan.tp2);
      if (hitStop) { pnl += rem * s * (stop - e); rem = 0; exitIdx = k; reason = tp1Hit ? (mgmt.trail ? 'trailing' : 'breakeven') : 'stop'; break; }
      if (hitTp1) { tp1Hit = true; pnl += mgmt.partial * s * (plan.tp1 - e); rem -= mgmt.partial; stop = e; }
      if (hitTp2) { pnl += rem * s * (plan.tp2 - e); rem = 0; exitIdx = k; reason = 'tp2'; break; }
      if (mgmt.trail && tp1Hit) { // actualiza el stop dinámico al cierre de la vela
        ext = s === 1 ? Math.max(ext, b.h) : Math.min(ext, b.l);
        const ts = ext - s * mgmt.trail * atrA[k];
        stop = s === 1 ? Math.max(stop, ts) : Math.min(stop, ts);
      }
    }
    if (rem > 0) {
      const k = Math.min(c.length - 1, i + mgmt.maxBars);
      if (k <= i) return null;
      if (k === c.length - 1 && k < i + mgmt.maxBars) return null; // operación aún abierta: no cuenta
      pnl += rem * s * (c[k].c - e); exitIdx = k; reason = reason || 'tiempo';
    }
    const fees = e * mgmt.costPct * 2;
    return { r: (pnl - fees) / R, tp1Hit, exitIdx, reason };
  }

  // ---------- Backtest ----------
  function backtest(D, setupKey, p, mgmt, from, to, opts) {
    opts = opts || {};
    const c = D.c, S = SETUPS[setupKey], trades = [];
    let busyUntil = -1, lossStreak = 0, cooldownUntil = -1;
    for (let i = from; i < to - 1; i++) {
      if (i <= busyUntil || i <= cooldownUntil) continue;
      const sig = S.detect(D, i, p); if (!sig) continue;
      if (opts.side && sig.side !== opts.side) continue;
      const plan = buildPlan(sig, mgmt, D.i.atr[i]); if (!plan) continue;
      const res = simulate(D, i, plan, mgmt); if (!res) continue;
      trades.push({ t: c[i].t, i, side: sig.side, entry: plan.entry, stop: plan.stop, r: res.r, tp1Hit: res.tp1Hit, reason: res.reason, bars: res.exitIdx - i });
      busyUntil = res.exitIdx;
      if (res.r < 0) { lossStreak++; if (lossStreak >= 2) { cooldownUntil = res.exitIdx + 24; lossStreak = 0; } } else lossStreak = 0;
    }
    return trades;
  }

  function stats(trades, riskPct) {
    riskPct = riskPct || 0.01;
    const n = trades.length;
    if (!n) return { n: 0 };
    let w = 0, gp = 0, gl = 0, sum = 0, tp1 = 0, eq = 1, peak = 1, mdd = 0, streak = 0, maxStreak = 0;
    for (const t of trades) {
      sum += t.r; if (t.r > 0) { w++; gp += t.r; streak = 0; } else { gl -= t.r; streak++; maxStreak = Math.max(maxStreak, streak); }
      if (t.tp1Hit) tp1++;
      eq *= 1 + riskPct * t.r; peak = Math.max(peak, eq); mdd = Math.max(mdd, (peak - eq) / peak);
    }
    return { n, winRate: w / n, tp1Rate: tp1 / n, expR: sum / n, totalR: sum, pf: gl ? gp / gl : Infinity, maxDD: mdd, maxLossStreak: maxStreak, ret: eq - 1 };
  }

  function combos(params) {
    const keys = Object.keys(params);
    let out = [{}];
    for (const k of keys) { const next = []; for (const o of out) for (const v of params[k]) next.push(Object.assign({}, o, { [k]: v })); out = next; }
    return out;
  }

  // Optimiza en muestra y valida fuera de muestra. Elige por robustez, no por el mejor resultado en muestra.
  function optimize(D, setupKey, mgmtGrid, split) {
    const c = D.c, cut = Math.floor(c.length * split), start = 220;
    const results = [];
    for (const p of combos(SETUPS[setupKey].params)) {
      for (const mg of mgmtGrid) {
        const mgmt = Object.assign({}, DEFAULT_MGMT, mg);
        const is = stats(backtest(D, setupKey, p, mgmt, start, cut));
        const oos = stats(backtest(D, setupKey, p, mgmt, cut, c.length));
        results.push({ setup: setupKey, p, mgmt, is, oos });
      }
    }
    // puntuación: exige muestra mínima y esperanza positiva en ambos tramos; penaliza diferencias
    const score = r => {
      if (r.is.n < 25 || r.oos.n < 8) return -Infinity;
      if (r.is.expR <= 0) return -Infinity;
      return Math.min(r.is.expR, r.oos.expR) * Math.sqrt(Math.min(r.is.n, r.oos.n * 2.33));
    };
    results.forEach(r => r.score = score(r));
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  // Señal en la última vela cerrada (para el panel en vivo)
  function liveSignals(D, chosen) {
    const i = D.c.length - 2; // penúltima = última vela 1h cerrada (la última está en curso)
    const out = [];
    for (const ch of chosen) {
      const sig = SETUPS[ch.setup].detect(D, i, ch.p); if (!sig) continue;
      const plan = buildPlan(sig, ch.mgmt, D.i.atr[i]); if (!plan) continue;
      out.push(Object.assign({ setup: ch.setup, nombre: SETUPS[ch.setup].nombre, t: D.c[i].t, mgmt: ch.mgmt, stats: ch.oos }, plan));
    }
    return out;
  }

  const api = { ema, sma, atr, rsi, computeIndicators, alignHigher, prepare, SETUPS, DEFAULT_MGMT, buildPlan, simulate, backtest, stats, combos, optimize, liveSignals, H1, H4, D1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BTCEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
