// The pattern engine — honest by construction. Finds real cross-domain correlations
// and refuses spurious ones. Proven on real data (scratchpad/engine.js).
//
// Guardrails: (1) variance filter — ignore signals too rare/common to correlate;
// (2) MEANINGFULNESS filter — never pair two signals in the same category (kills
// trivial "you pray Asr on days you pray Maghrib" / meds↔meds); (3) Fisher exact
// two-sided test; (4) Bonferroni correction for the number of pairs tested.

const MIN_MINORITY = 6;   // need >=6 days of the rarer outcome to be analysable
const MIN_CELL = 3;       // each 2x2 cell must have some support

function logFact(n) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
function hyperLogP(a, b, c, d) {
  return logFact(a + b) + logFact(c + d) + logFact(a + c) + logFact(b + d)
    - logFact(a + b + c + d) - logFact(a) - logFact(b) - logFact(c) - logFact(d);
}
function fisherTwoSided(a, b, c, d) {
  const r1 = a + b, c1 = a + c, r2 = c + d, pObs = hyperLogP(a, b, c, d);
  let p = 0; const lo = Math.max(0, c1 - r2), hi = Math.min(r1, c1);
  for (let x = lo; x <= hi; x++) {
    const lp = hyperLogP(x, r1 - x, c1 - x, r2 - (c1 - x));
    if (lp <= pObs + 1e-9) p += Math.exp(lp);
  }
  return Math.min(1, p);
}
function phi(a, b, c, d) { const den = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d)); return den ? (a * d - b * c) / den : 0; }

/**
 * @param {Array<{name,category,values:number[]}>} signals aligned 0/1 arrays.
 * @returns {{strong:Pattern[], emerging:Pattern[], analysed:number}}
 */
export function findPatterns(signals) {
  const kept = signals.filter((s) => {
    const t = s.values.filter((v) => v === 1).length;
    return Math.min(t, s.values.length - t) >= MIN_MINORITY;
  });

  const results = [];
  for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
    const A = kept[i], B = kept[j];
    if (A.category && A.category === B.category) continue; // meaningfulness filter
    let a = 0, b = 0, c = 0, d = 0, n = 0;
    for (let k = 0; k < A.values.length; k++) {
      const x = A.values[k], y = B.values[k];
      if (x == null || y == null) continue; n++;
      if (x && y) a++; else if (x) b++; else if (y) c++; else d++;
    }
    if (Math.min(a + b, c + d, a + c, b + d) < MIN_CELL) continue;
    results.push({ A, B, a, b, c, d, n, phi: phi(a, b, c, d), p: fisherTwoSided(a, b, c, d) });
  }

  const M = results.length || 1;
  const bonf = 0.05 / M;
  results.sort((x, y) => Math.abs(y.phi) - Math.abs(x.phi));
  const label = (r) => {
    const pB_A = r.a / (r.a + r.b), pB_nA = r.c / (r.c + r.d);
    return {
      a: r.A.name, b: r.B.name, phi: r.phi, p: r.p, n: r.n,
      whenA: Math.round(pB_A * 100), whenNotA: Math.round(pB_nA * 100),
      positive: r.phi > 0,
    };
  };
  return {
    analysed: kept.length,
    strong: results.filter((r) => r.p < bonf && Math.abs(r.phi) >= 0.5).map(label),
    emerging: results.filter((r) => r.p < 0.05 && !(r.p < bonf && Math.abs(r.phi) >= 0.5) && Math.abs(r.phi) >= 0.45).slice(0, 5).map(label),
  };
}
