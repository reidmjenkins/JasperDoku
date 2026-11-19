/*
 * JasperDoku puzzle engine
 * ------------------------
 * Rules: an N x N board is split into N color patches.
 * Place exactly one Jasper in every row, every column and every patch,
 * and no two Jaspers may touch - not even corner to corner.
 *
 * This file has no UI code. It works in the browser (window.JasperEngine)
 * and in Node (require) so the generator can be tested from the command line.
 */
(function (root) {
  'use strict';

  // ---------- seeded random numbers (same seed -> same puzzle) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  function orth(i, N) {
    const r = (i / N) | 0, c = i % N, out = [];
    if (r > 0) out.push(i - N);
    if (r < N - 1) out.push(i + N);
    if (c > 0) out.push(i - 1);
    if (c < N - 1) out.push(i + 1);
    return out;
  }

  // Do cells a and b "see" each other (same row, column, patch, or touching)?
  function sees(N, reg, a, b) {
    if (a === b) return false;
    const ra = (a / N) | 0, ca = a % N, rb = (b / N) | 0, cb = b % N;
    if (ra === rb || ca === cb) return true;
    if (reg[a] === reg[b]) return true;
    return Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1;
  }

  // ---------- exact solver (backtracking) ----------
  // Returns up to `limit` solutions; each solution is an array col-per-row.
  function solveAll(N, reg, limit) {
    const sols = [], p = new Array(N);
    let colUsed = 0, regUsed = 0;
    // Which rows each patch touches - used to prune dead branches early.
    const regMaxRow = new Array(N).fill(-1);
    for (let i = 0; i < N * N; i++) regMaxRow[reg[i]] = Math.max(regMaxRow[reg[i]], (i / N) | 0);
    function bt(r) {
      if (sols.length >= limit) return;
      if (r === N) { sols.push(p.slice()); return; }
      // any patch whose last row is above r and still empty -> dead end
      for (let k = 0; k < N; k++) if (!((regUsed >> k) & 1) && regMaxRow[k] < r) return;
      for (let c = 0; c < N; c++) {
        if ((colUsed >> c) & 1) continue;
        const k = reg[r * N + c];
        if ((regUsed >> k) & 1) continue;
        if (r > 0 && Math.abs(p[r - 1] - c) < 2) continue;
        p[r] = c; colUsed |= 1 << c; regUsed |= 1 << k;
        bt(r + 1);
        colUsed &= ~(1 << c); regUsed &= ~(1 << k);
        if (sols.length >= limit) return;
      }
    }
    bt(0);
    return sols;
  }

  // ---------- generator ----------
  function randomQueens(N, rng) {
    const p = new Array(N), used = new Array(N).fill(false);
    function bt(r) {
      if (r === N) return true;
      for (const c of shuffle(range(N), rng)) {
        if (used[c] || (r > 0 && Math.abs(p[r - 1] - c) < 2)) continue;
        used[c] = true; p[r] = c;
        if (bt(r + 1)) return true;
        used[c] = false;
      }
      return false;
    }
    return bt(0) ? p : null;
  }

  function growRegions(N, queens, rng) {
    const reg = new Array(N * N).fill(-1);
    queens.forEach((c, r) => { reg[r * N + c] = r; });
    let remaining = N * N - N;
    // Mix two growth styles so some patches end up big and some tiny.
    const greedy = rng() < 0.5;
    while (remaining > 0) {
      let pick = null;
      if (!greedy && rng() < 0.6) {
        const order = shuffle(range(N), rng);
        for (const k of order) {
          const opts = [];
          for (let i = 0; i < N * N; i++) {
            if (reg[i] !== k) continue;
            for (const j of orth(i, N)) if (reg[j] === -1) opts.push(j);
          }
          if (opts.length) { pick = [opts[(rng() * opts.length) | 0], k]; break; }
        }
      }
      if (!pick) {
        const cand = [];
        for (let i = 0; i < N * N; i++) {
          if (reg[i] !== -1) continue;
          for (const j of orth(i, N)) if (reg[j] !== -1) cand.push([i, reg[j]]);
        }
        pick = cand[(rng() * cand.length) | 0];
      }
      reg[pick[0]] = pick[1];
      remaining--;
    }
    return reg;
  }

  function regionConnectedWithout(N, reg, k, removed) {
    const cells = [];
    for (let i = 0; i < N * N; i++) if (reg[i] === k && i !== removed) cells.push(i);
    if (!cells.length) return false;
    const seen = new Set([cells[0]]), stack = [cells[0]];
    while (stack.length) {
      const i = stack.pop();
      for (const j of orth(i, N)) {
        if (j !== removed && reg[j] === k && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    return seen.size === cells.length;
  }

  // Nudge patch borders until the intended answer is the only answer.
  function makeUnique(N, reg, queens, rng) {
    const queenCells = new Set(queens.map((c, r) => r * N + c));
    for (let iter = 0; iter < 80; iter++) {
      const sols = solveAll(N, reg, 2);
      const alt = sols.find((s) => s.some((c, r) => c !== queens[r]));
      if (!alt) return true;
      const diff = shuffle(range(N).filter((r) => alt[r] !== queens[r]).map((r) => r * N + alt[r]), rng);
      let moved = false;
      for (const x of diff) {
        if (queenCells.has(x)) continue;
        const from = reg[x];
        const targets = shuffle([...new Set(orth(x, N).map((j) => reg[j]).filter((k) => k !== from))], rng);
        if (!targets.length || !regionConnectedWithout(N, reg, from, x)) continue;
        reg[x] = targets[0];
        moved = true;
        break;
      }
      if (!moved) return false;
    }
    return false;
  }

  // ---------- logical solver / hint engine ----------
  // state: array, 0 = open, 1 = ruled out (X), 2 = Jasper
  const OPEN = 0, OUT = 1, JASPER = 2;

  function buildUnits(N, reg) {
    const units = [];
    for (let r = 0; r < N; r++) units.push({ kind: 'row', idx: r, cells: range(N).map((c) => r * N + c) });
    for (let c = 0; c < N; c++) units.push({ kind: 'col', idx: c, cells: range(N).map((r) => r * N + c) });
    for (let k = 0; k < N; k++) units.push({ kind: 'patch', idx: k, cells: range(N * N).filter((i) => reg[i] === k) });
    return units;
  }

  function attacked(N, reg, q) {
    const out = [];
    for (let i = 0; i < N * N; i++) if (sees(N, reg, q, i)) out.push(i);
    return out;
  }

  /*
   * Find the next logical step from `state`. Returns null if stuck, or
   * { tier, type, place?: cell, eliminate?: [cells], focus: [cells], unit?, units? }
   * Tiers: 0 tidy-up, 1 last spot, 2 patch/line squeeze, 3 "would block", 4 group squeeze
   */
  function nextStep(N, reg, state, maxTier, units) {
    units = units || buildUnits(N, reg);
    if (maxTier === undefined) maxTier = 4;
    const open = (u) => u.cells.filter((i) => state[i] === OPEN);
    const hasJ = (u) => u.cells.some((i) => state[i] === JASPER);

    // Tier 0: a Jasper rules out everything it can see
    for (let q = 0; q < N * N; q++) {
      if (state[q] !== JASPER) continue;
      const elim = attacked(N, reg, q).filter((i) => state[i] === OPEN);
      if (elim.length) return { tier: 0, type: 'tidy', eliminate: elim, focus: [q] };
    }
    // Broken board?
    for (const u of units) {
      if (!hasJ(u) && open(u).length === 0) return { tier: -1, type: 'stuck', unit: u, focus: u.cells };
    }
    if (maxTier < 1) return null;

    // Tier 1: only one spot left in a row / column / patch
    for (const kind of ['patch', 'row', 'col']) {
      for (const u of units) {
        if (u.kind !== kind || hasJ(u)) continue;
        const o = open(u);
        if (o.length === 1) return { tier: 1, type: 'last', place: o[0], unit: u, focus: u.cells };
      }
    }
    if (maxTier < 2) return null;

    // Tier 2: a patch squeezed into one line, or a line squeezed into one patch
    for (const u of units) {
      if (hasJ(u)) continue;
      const o = open(u);
      if (!o.length) continue;
      if (u.kind === 'patch') {
        for (const lineKind of ['row', 'col']) {
          const key = (i) => (lineKind === 'row' ? (i / N) | 0 : i % N);
          const k0 = key(o[0]);
          if (o.every((i) => key(i) === k0)) {
            const line = units.find((v) => v.kind === lineKind && v.idx === k0);
            const elim = line.cells.filter((i) => state[i] === OPEN && reg[i] !== u.idx);
            if (elim.length) return { tier: 2, type: 'patchInLine', eliminate: elim, unit: u, line, focus: o };
          }
        }
      } else {
        const k0 = reg[o[0]];
        if (o.every((i) => reg[i] === k0)) {
          const patch = units.find((v) => v.kind === 'patch' && v.idx === k0);
          const inLine = (i) => (u.kind === 'row' ? ((i / N) | 0) === u.idx : i % N === u.idx);
          const elim = patch.cells.filter((i) => state[i] === OPEN && !inLine(i));
          if (elim.length) return { tier: 2, type: 'lineInPatch', eliminate: elim, unit: u, line: patch, focus: o };
        }
      }
    }
    if (maxTier < 3) return null;

    // Tier 3: a Jasper here would leave some row/column/patch with nowhere to go
    for (let x = 0; x < N * N; x++) {
      if (state[x] !== OPEN) continue;
      for (const u of units) {
        if (hasJ(u) || u.cells.includes(x)) continue;
        const o = open(u);
        if (o.length && o.every((i) => sees(N, reg, x, i))) {
          return { tier: 3, type: 'wouldBlock', eliminate: [x], unit: u, focus: o };
        }
      }
    }
    if (maxTier < 4) return null;

    // Tier 4: k patches fit inside exactly k rows (or columns), and the reverse
    const freePatches = units.filter((u) => u.kind === 'patch' && !hasJ(u));
    for (const lineKind of ['row', 'col']) {
      const lineOf = (i) => (lineKind === 'row' ? (i / N) | 0 : i % N);
      const freeLines = units.filter((u) => u.kind === lineKind && !hasJ(u));
      // patches -> lines
      const step = groupSqueeze(freePatches, lineOf, (i) => reg[i], 'patches', lineKind);
      if (step) return step;
      // lines -> patches
      const step2 = groupSqueeze(freeLines, (i) => reg[i], lineOf, lineKind === 'row' ? 'rows' : 'cols', 'patch');
      if (step2) return step2;
    }
    return null;

    function groupSqueeze(groups, keyOf, ownerOf, groupWord, targetKind) {
      const n = groups.length;
      if (n < 3) return null;
      const opens = groups.map(open);
      const keysets = opens.map((o) => new Set(o.map(keyOf)));
      const maxMask = 1 << n;
      for (let size = 2; size < n; size++) {
        for (let mask = 1; mask < maxMask; mask++) {
          if (popcount(mask) !== size) continue;
          const keys = new Set(), owners = new Set();
          for (let g = 0; g < n; g++) if ((mask >> g) & 1) { keysets[g].forEach((k) => keys.add(k)); owners.add(groups[g].idx); }
          if (keys.size !== size) continue;
          const elim = [];
          for (let i = 0; i < N * N; i++) {
            if (state[i] !== OPEN || !keys.has(keyOf(i))) continue;
            if (!owners.has(ownerOf(i))) elim.push(i);
          }
          if (elim.length) {
            const chosen = groups.filter((_, g) => (mask >> g) & 1);
            const focus = [].concat(...chosen.map((u) => open(u)));
            return { tier: 4, type: 'group', eliminate: elim, groups: chosen, groupWord, targetKind, keys: [...keys], focus };
          }
        }
      }
      return null;
    }
  }

  function popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }

  function applyStep(state, step) {
    if (step.place !== undefined) state[step.place] = JASPER;
    if (step.eliminate) for (const i of step.eliminate) state[i] = OUT;
  }

  // Solve with logic only. Returns { solved, hardest, steps }
  function logicSolve(N, reg, maxTier, startState) {
    const units = buildUnits(N, reg);
    const state = startState ? startState.slice() : new Array(N * N).fill(OPEN);
    let hardest = 0, steps = 0, hard = 0;
    for (let guard = 0; guard < 2000; guard++) {
      if (state.filter((s) => s === JASPER).length === N) return { solved: true, hardest, steps, hard, state };
      const st = nextStep(N, reg, state, maxTier, units);
      if (!st || st.tier < 0) return { solved: false, hardest, steps, hard, state };
      hardest = Math.max(hardest, st.tier);
      steps++; if (st.tier >= 3) hard++;
      applyStep(state, st);
    }
    return { solved: false, hardest, steps, state };
  }

  /*
   * Make a puzzle.
   * opts: { size, seed (string or number), maxTier (1-4), minTier (optional),
   *         pick (optional: make this many good puzzles and keep the one with the most hard steps) }
   * Returns { size, regions, solution (col per row), hardest, seed }
   */
  function generate(opts) {
    const N = opts.size;
    const maxTier = opts.maxTier === undefined ? 4 : opts.maxTier;
    const minTier = opts.minTier || 0;
    const seedNum = typeof opts.seed === 'number' ? opts.seed : hashSeed(String(opts.seed || Math.random()));
    const rng = mulberry32(seedNum);
    const pick = opts.pick || 1;
    let fallback = null, best = null, found = 0;
    for (let attempt = 0; attempt < 400; attempt++) {
      const queens = randomQueens(N, rng);
      if (!queens) continue;
      const reg = growRegions(N, queens, rng);
      if (!makeUnique(N, reg, queens, rng)) continue;
      const res = logicSolve(N, reg, maxTier);
      if (!res.solved) continue;
      const puzzle = { size: N, regions: reg, solution: queens, hardest: res.hardest, hardSteps: res.hard, seed: seedNum };
      if (res.hardest >= minTier) {
        if (pick <= 1) return puzzle;
        if (!best || res.hard > best.hardSteps) best = puzzle;
        if (++found >= pick) return best;
        continue;
      }
      if (!fallback) fallback = puzzle;
      if (attempt > 60 && (best || fallback)) return best || fallback;
    }
    if (best || fallback) return best || fallback;
    throw new Error('Could not generate a puzzle');
  }

  // Check a board for rule breaks. Returns a Set of cells holding Jaspers in conflict.
  function conflicts(N, reg, state) {
    const js = [];
    for (let i = 0; i < N * N; i++) if (state[i] === JASPER) js.push(i);
    const bad = new Set();
    for (let a = 0; a < js.length; a++)
      for (let b = a + 1; b < js.length; b++)
        if (sees(N, reg, js[a], js[b])) { bad.add(js[a]); bad.add(js[b]); }
    return bad;
  }

  const api = {
    OPEN, OUT, JASPER,
    mulberry32, hashSeed, solveAll, generate, nextStep, applyStep, logicSolve,
    buildUnits, sees, attacked, conflicts,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JasperEngine = api;
})(typeof window !== 'undefined' ? window : this);
