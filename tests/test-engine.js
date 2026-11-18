// Run with:  node tests/test-engine.js
// Generates puzzles of every size and checks that each one has exactly one
// answer, follows all the rules, and can be solved with logic alone.
const E = require('../js/engine.js');

let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.error('FAIL:', msg); } }

for (let N = 5; N <= 10; N++) {
  const times = [], tiers = {};
  const count = N >= 9 ? 15 : 30;
  for (let s = 0; s < count; s++) {
    const t0 = Date.now();
    const p = E.generate({ size: N, seed: `test-${N}-${s}`, maxTier: 4 });
    times.push(Date.now() - t0);
    tiers[p.hardest] = (tiers[p.hardest] || 0) + 1;

    // every patch is used exactly N times total and patches are 0..N-1
    const ids = new Set(p.regions);
    check(ids.size === N, `N=${N} seed ${s}: has ${ids.size} patches`);
    // exactly one solution
    const sols = E.solveAll(N, p.regions, 2);
    check(sols.length === 1, `N=${N} seed ${s}: ${sols.length} solutions`);
    check(sols[0].join() === p.solution.join(), `N=${N} seed ${s}: solver answer differs`);
    // solution obeys the rules
    const state = new Array(N * N).fill(0);
    p.solution.forEach((c, r) => { state[r * N + c] = 2; });
    check(E.conflicts(N, p.regions, state).size === 0, `N=${N} seed ${s}: solution has conflicts`);
    // logic solve
    check(E.logicSolve(N, p.regions, 4).solved, `N=${N} seed ${s}: not logic-solvable`);
    // determinism
    if (s === 0) {
      const again = E.generate({ size: N, seed: `test-${N}-${s}`, maxTier: 4 });
      check(again.regions.join() === p.regions.join(), `N=${N}: same seed gave a different puzzle`);
    }
  }
  times.sort((a, b) => a - b);
  console.log(`size ${N}: ${count} puzzles, median ${times[times.length >> 1]}ms, max ${times[times.length - 1]}ms, hardest-step tiers`, tiers);
}

// Easy-tier generation works too
const easy = E.generate({ size: 5, seed: 'easy', maxTier: 1 });
check(E.logicSolve(5, easy.regions, 1).solved, 'easy puzzle needs more than tier 1');

console.log(failures ? `\n${failures} FAILURES` : '\nAll engine checks passed.');
process.exit(failures ? 1 : 0);
