/* Lotto Logic — Documentary Mode (V2)
   Pure static version for GitHub Pages (no build, no npm).
   Core constraints:
   - Exact per-ticket jackpot odds; no shortcuts using coverage.
   - Strategy only changes variance/path, NOT jackpot probability per ticket.
   - No number-picking advice, no “better odds” claims.
*/

(function () {
  "use strict";

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);

  const els = {
    drawId: $("#drawId"),
    jackpot: $("#jackpot"),
    pHit: $("#pHit"),
    totalDraws: $("#totalDraws"),

    btnPlayPause: $("#btnPlayPause"),
    btnSpeed: $("#btnSpeed"),
    btnJackpotMode: $("#btnJackpotMode"),
    btnFullscreen: $("#btnFullscreen"),
    btnFocus: $("#btnFocus"),
    btnNewRun: $("#btnNewRun"),

    ranking: $("#ranking"),
    players: $("#players"),

    playerGrid: $("#playerGrid"),

    addonMode: $("#addonMode"),

    // Strategy B UI
    bSumMin: $("#bSumMin"),
    bSumMax: $("#bSumMax"),
    bExcludeAllOddEven: $("#bExcludeAllOddEven"),
    bSmallMax: $("#bSmallMax"),
    bExcludeAllSmallBig: $("#bExcludeAllSmallBig"),
    bMaxConsec: $("#bMaxConsec"),
    bMinSectors: $("#bMinSectors"),
    bMaxSectors: $("#bMaxSectors"),
    bMaxTailPairs: $("#bMaxTailPairs"),
    bPoolInit: $("#bPoolInit"),
    bPoolMax: $("#bPoolMax"),

    fixedTickets: $("#fixedTickets"),
    btnApplyFixed: $("#btnApplyFixed"),

    years: $("#years"),
    startJackpot: $("#startJackpot"),
    btnRebuild: $("#btnRebuild"),

    timeline: $("#timeline"),
    tickline: $("#tickline"),
    sinceJackpot: $("#sinceJackpot"),
    speedText: $("#speedText"),

    btnWhy: $("#btnWhy"),
    nLineMain: $("#nLineMain"),
    nWhy: $("#nWhy"),
    nLineRational: $("#nLineRational"),
    nLineNotes: $("#nLineNotes"),

    btnExportNarration: $("#btnExportNarration"),
    btnExportSummary: $("#btnExportSummary"),

    chart: $("#chart"),
    legend: $("#legend"),
    buildOverlay: $("#buildOverlay"),
  };

  // ---------- Utilities ----------
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function fmtMoney(n) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Math.round(n).toLocaleString();
  }

  const fmtPct = (x) => (x * 100).toFixed(2) + "%";

  // Mulberry32 RNG
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Normal(0,1) via Box-Muller
  function randn(rng) {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // Poisson (Knuth)
  function poisson(lambda, rng) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rng(); } while (p > L);
    return k - 1;
  }

  // Weighted pick
  function pickWeighted(rng, items) {
    const total = items.reduce((s, it) => s + it.w, 0);
    let r = Math.floor(rng() * total) + 1;
    for (const it of items) { r -= it.w; if (r <= 0) return it.v; }
    return items[0].v;
  }

  function countMatchesSorted(a, b) {
    let i = 0, j = 0, c = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { c++; i++; j++; }
      else if (a[i] < b[j]) i++;
      else j++;
    }
    return c;
  }

  function pickKDistinct(n, k, rng) {
    const set = new Set();
    while (set.size < k) set.add(1 + Math.floor(rng() * n));
    const arr = Array.from(set);
    arr.sort((a, b) => a - b);
    return arr;
  }

  // ---------- Powerball model constants ----------
  const RULES = {
    WHITE_MAX: 69,
    WHITE_PICK: 5,
    PB_MAX: 26,
    COMBOS: 292_201_338,
    TICKET_PRICE: 2,
    ADDON_PP: 1,
    ADDON_DP: 1,
    MIN_JACKPOT_CASH: 20_000_000,
    MAX_JACKPOT_CASH: 2_000_000_000,
    JACKPOT_CONTRIB: 0.340066,
  };

  // Main game fixed prizes (cash; jackpot handled separately)
  const MAIN_PRIZE = {
    "5+PB": 0,
    "5+0": 1_000_000,
    "4+PB": 50_000,
    "4+0": 100,
    "3+PB": 100,
    "3+0": 7,
    "2+PB": 7,
    "1+PB": 4,
    "0+PB": 4,
  };

  // Double Play prizes
  const DP_PRIZE = {
    "5+PB": 10_000_000,
    "5+0": 500_000,
    "4+PB": 50_000,
    "4+0": 500,
    "3+PB": 500,
    "3+0": 20,
    "2+PB": 20,
    "1+PB": 10,
    "0+PB": 7,
  };

  // Power Play wheel (no 10x)
  const PP_WHEEL = [
    { v: 2, w: 24 },
    { v: 3, w: 13 },
    { v: 4, w: 3 },
    { v: 5, w: 2 },
  ];

  function matchKey(whiteMatches, pbMatch) {
    if (whiteMatches === 5 && pbMatch) return "5+PB";
    if (whiteMatches === 5) return "5+0";
    if (whiteMatches === 4 && pbMatch) return "4+PB";
    if (whiteMatches === 4) return "4+0";
    if (whiteMatches === 3 && pbMatch) return "3+PB";
    if (whiteMatches === 3) return "3+0";
    if (whiteMatches === 2 && pbMatch) return "2+PB";
    if (whiteMatches === 1 && pbMatch) return "1+PB";
    if (pbMatch) return "0+PB";
    return null;
  }

  function applyPowerPlayBasePrize(key, basePrize) {
    if (!key) return 0;
    if (key === "5+PB") return 0; // jackpot not multiplied
    if (key === "5+0") return 2_000_000; // special PP rule
    return basePrize;
  }

  function ticketCost(addonMode) {
    if (addonMode === "pp") return RULES.TICKET_PRICE + RULES.ADDON_PP;
    if (addonMode === "dp") return RULES.TICKET_PRICE + RULES.ADDON_DP;
    return RULES.TICKET_PRICE;
  }

  // ---------- Sales / jackpot roll model ----------
  function betaFromJackpot(jCash) {
    const m = jCash / 1_000_000;
    if (m <= 500) return 1.1;
    if (m >= 900) return 1.5;
    return 1.1 + ((m - 500) / 400) * 0.4;
  }

  function dayFactor(dow) {
    if (dow === 1) return 0.85; // Mon
    if (dow === 3) return 1.0;  // Wed
    return 1.3;                 // Sat
  }

  function lognormalNoise(rng) {
    const sigma = 0.182;
    const z = randn(rng);
    return Math.exp(z * sigma - 0.5 * sigma * sigma);
  }

  function ticketsSold(jCash, dow, rng) {
    const alpha = 10_000_000;
    const jM = jCash / 1_000_000;
    const beta = betaFromJackpot(jCash);
    const noise = lognormalNoise(rng);
    const s = alpha * Math.pow(jM, beta) * dayFactor(dow) * noise;
    return Math.max(0, Math.round(s));
  }

  function reserveDeductionRate(jCash) {
    const m = jCash / 1_000_000;
    if (m < 50) return 0.05;
    if (m >= 200) return 0;
    return 0.05 * (1 - (m - 50) / 150);
  }

  function updateJackpotCash(currentCash, tSold) {
    const salesRevenue = tSold * RULES.TICKET_PRICE;
    const base = salesRevenue * RULES.JACKPOT_CONTRIB;
    const ded = reserveDeductionRate(currentCash);
    const inc = base * (1 - ded);
    return clamp(currentCash + inc, RULES.MIN_JACKPOT_CASH, RULES.MAX_JACKPOT_CASH);
  }

  // ---------- Time model ----------
  function drawIdFromIndex(i) {
    const y = Math.floor(i / 156) + 1;
    const within = i % 156;
    const w = Math.floor(within / 3) + 1;
    const d = (within % 3) + 1;
    return `Y${y}-W${w}-D${d}`;
  }

  function nextDrawDate(date, dow) {
    const d = new Date(date.getTime());
    if (dow === 6) d.setDate(d.getDate() + 2);
    else if (dow === 1) d.setDate(d.getDate() + 2);
    else d.setDate(d.getDate() + 3);
    return d;
  }

  function nextDow(dow) {
    if (dow === 6) return 1;
    if (dow === 1) return 3;
    return 6;
  }

  function alignToNextDrawDate(startDate) {
    let d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    while (![1, 3, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
    return d;
  }

  // ---------- Ticket generation ----------
  function makeDraw(rng) {
    return {
      white: pickKDistinct(RULES.WHITE_MAX, RULES.WHITE_PICK, rng),
      pb: 1 + Math.floor(rng() * RULES.PB_MAX),
    };
  }

  function genQuickTickets(n, rng) {
    const t = [];
    for (let i = 0; i < n; i++) t.push(makeDraw(rng));
    return t;
  }

  function passesFilters(white, cfg) {
    const sum = white.reduce((s, x) => s + x, 0);
    if (sum < cfg.sumMin || sum > cfg.sumMax) return false;

    if (cfg.excludeAllOddEven) {
      let odd = 0;
      for (const x of white) if (x % 2) odd++;
      if (odd === 0 || odd === 5) return false;
    }

    if (cfg.excludeAllSmallBig) {
      let small = 0;
      for (const x of white) if (x <= cfg.smallMax) small++;
      if (small === 0 || small === 5) return false;
    }

    let consecPairs = 0;
    for (let i = 1; i < white.length; i++) if (white[i] - white[i - 1] === 1) consecPairs++;
    if (consecPairs > cfg.maxConsecPairs) return false;

    const sec = new Set(white.map((x) => Math.min(6, Math.floor((x - 1) / 10))));
    if (sec.size < cfg.minSectors || sec.size > cfg.maxSectors) return false;

    const tailCount = new Map();
    for (const x of white) {
      const t = x % 10;
      tailCount.set(t, (tailCount.get(t) || 0) + 1);
    }
    let pairs = 0;
    for (const v of tailCount.values()) if (v >= 2) pairs++;
    if (pairs > cfg.maxTailPairs) return false;

    return true;
  }

  function genLogicTickets(n, rng, cfg) {
    let pool = cfg.poolInit;
    const poolMax = cfg.poolMax;
    const passed = [];
    const seen = new Set();

    while (passed.length < n && pool <= poolMax) {
      for (let i = 0; i < pool; i++) {
        const white = pickKDistinct(RULES.WHITE_MAX, RULES.WHITE_PICK, rng);
        if (!passesFilters(white, cfg)) continue;
        const key = white.join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        passed.push({ white, pb: 1 + Math.floor(rng() * RULES.PB_MAX) });
        if (passed.length >= n) break;
      }
      pool *= 2;
    }

    while (passed.length < n) passed.push(makeDraw(rng));

    for (let i = passed.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [passed[i], passed[j]] = [passed[j], passed[i]];
    }
    return passed.slice(0, n);
  }

  function parseFixedTickets(text) {
    const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
    const tickets = [];
    for (const line of lines.slice(0, 5)) {
      const parts = line.split("|").map((x) => x.trim());
      if (parts.length !== 2) continue;
      const whites = parts[0].split(/\s+/).map(Number).filter(Number.isFinite);
      const pb = Number(parts[1]);
      if (whites.length !== 5 || !Number.isFinite(pb)) continue;

      const uniq = Array.from(new Set(whites));
      uniq.sort((a, b) => a - b);
      if (uniq.length !== 5) continue;
      if (uniq.some((x) => x < 1 || x > 69)) continue;
      if (pb < 1 || pb > 26) continue;
      tickets.push({ white: uniq, pb });
    }
    return tickets.length === 5 ? tickets : null;
  }

  function formatFixedTickets(tickets) {
    return tickets.map((t) => `${t.white.join(" ")} | ${t.pb}`).join("\n");
  }

  function defaultFixedTickets(rng) {
    const t = [];
    for (let i = 0; i < 5; i++) t.push(makeDraw(rng));
    return t;
  }

  // ---------- Documentary events ----------
  const DOC = {
    pHitThresholds: [0.05, 0.10, 0.15],
    longNoPrizeAll: 60,
    longRollN: 80,
  };

  // ---------- Simulation engine ----------
  function runSimulation(params) {
    const { years, addonMode, seed, startJackpotCash, playersConfig, logicCfg, fixedTickets } = params;

    const rng = mulberry32(seed);
    const eff = 0.95 + rng() * 0.02; // market only

    const totalDraws = years * 156;
    const snapshots = new Array(totalDraws);
    const chartPoints = [];
    const events = [];
    const narration = [];

    const activePlayers = playersConfig.filter((p) => p.enabled);
    if (activePlayers.length === 0) activePlayers.push({ id: "A", name: "Player A", strat: "quick", enabled: true });

    const players = activePlayers.map((p) => ({
      id: p.id,
      name: p.name,
      strat: p.strat,
      bal: 100000,
      spent: 0,
      won: 0,
      jHits: 0,
      active: true,
    }));

    let curDate = alignToNextDrawDate(new Date());
    let dow = curDate.getDay();

    let jCash = clamp(startJackpotCash, RULES.MIN_JACKPOT_CASH, RULES.MAX_JACKPOT_CASH);
    let lastJackpotIdx = -1;
    let noPrizeStreakAll = 0;
    let rollStreak = 0;
    const pHitFired = new Set();

    function pushEvent(idx, type, main, whyRational, whyNotes) {
      events.push({ idx, type, main, whyRational: whyRational || "", whyNotes: whyNotes || "" });
      const stamp = `${drawIdFromIndex(idx)} ${curDate.toISOString().slice(0, 10)}`;
      narration.push(`[${stamp}] ${main}`);
    }

    const cost = ticketCost(addonMode);

    for (let idx = 0; idx < totalDraws; idx++) {
      const drawId = drawIdFromIndex(idx);

      const tSold = ticketsSold(jCash, dow, rng);
      const tEff = tSold * eff;
      const lambda = tEff / RULES.COMBOS;
      const pHit = 1 - Math.exp(-lambda);
      const coverage = 1 - Math.exp(-tEff / RULES.COMBOS);
      const marketWinners = poisson(lambda, rng);

      const drawMain = makeDraw(rng);
      const drawDP = (addonMode === "dp") ? makeDraw(rng) : null;
      const ppMult = (addonMode === "pp") ? pickWeighted(rng, PP_WHEEL) : 1;

      const ticketsByPlayer = {};
      const jWinCount = {};
      const wonByPlayer = {};

      for (const p of players) {
        ticketsByPlayer[p.id] = [];
        jWinCount[p.id] = 0;
        wonByPlayer[p.id] = 0;

        if (!p.active) continue;

        const affordable = Math.floor(p.bal / cost);
        const n = Math.min(5, Math.max(0, affordable));

        if (n === 0) {
          p.active = false;
          pushEvent(
            idx,
            "ELIMINATED",
            `${p.id} ran out of funds. Eliminated.`,
            "Ticket cost exceeded remaining cash.",
            "Bankruptcy is a normal outcome under long odds."
          );
          continue;
        }

        p.bal -= n * cost;
        p.spent += n * cost;

        let tickets;
        if (p.strat === "quick") tickets = genQuickTickets(n, rng);
        else if (p.strat === "logic") tickets = genLogicTickets(n, rng, logicCfg);
        else tickets = fixedTickets.slice(0, n);

        ticketsByPlayer[p.id] = tickets;

        for (const t of tickets) {
          const wm = countMatchesSorted(t.white, drawMain.white);
          const pbm = (t.pb === drawMain.pb);
          const key = matchKey(wm, pbm);

          if (key === "5+PB") {
            jWinCount[p.id] += 1;
          } else if (key) {
            let base = MAIN_PRIZE[key];
            if (addonMode === "pp") base = applyPowerPlayBasePrize(key, base) * ppMult;
            wonByPlayer[p.id] += base;
          }

          if (addonMode === "dp" && drawDP) {
            const wm2 = countMatchesSorted(t.white, drawDP.white);
            const pbm2 = (t.pb === drawDP.pb);
            const key2 = matchKey(wm2, pbm2);
            if (key2) wonByPlayer[p.id] += DP_PRIZE[key2];
          }
        }

        p.bal += wonByPlayer[p.id];
        p.won += wonByPlayer[p.id];
      }

      let anyPrize = false;
      let playerJackpotWinners = 0;
      for (const p of players) {
        if (wonByPlayer[p.id] > 0) anyPrize = true;
        if (jWinCount[p.id] > 0) anyPrize = true;
        playerJackpotWinners += jWinCount[p.id];
      }
      noPrizeStreakAll = anyPrize ? 0 : (noPrizeStreakAll + 1);

      const totalWinners = marketWinners + playerJackpotWinners;
      const jackpotHit = totalWinners >= 1;

      if (jackpotHit) {
        rollStreak = 0;
        lastJackpotIdx = idx;

        const share = jCash / totalWinners;

        for (const p of players) {
          const c = jWinCount[p.id];
          if (c > 0) {
            const add = share * c;
            p.bal += add;
            p.won += add;
            p.jHits += c;
          }
        }

        pushEvent(
          idx,
          "JACKPOT_HIT",
          "Jackpot hit. Reset to $20M next draw.",
          `Market expected winners λ=${lambda.toFixed(4)}; winners are Poisson(λ), then split across all winners (market + players).`,
          `Coverage (${fmtPct(coverage)}) is narration-only and never used to shortcut player hit checks.`
        );

        jCash = RULES.MIN_JACKPOT_CASH;
      } else {
        rollStreak += 1;
        jCash = updateJackpotCash(jCash, tSold);
      }

      for (const th of DOC.pHitThresholds) {
        if (pHit >= th && !pHitFired.has(th)) {
          pHitFired.add(th);
          pushEvent(
            idx,
            "PHIT_THRESHOLD",
            `P(Hit) crossed ${Math.round(th * 100)}%.`,
            "P(Hit)=1-exp(-λ). It is the probability that at least one market ticket hits the jackpot this draw.",
            "Higher sales raise λ, but that still does not imply frequent winners."
          );
        }
      }

      if (noPrizeStreakAll === DOC.longNoPrizeAll) {
        pushEvent(
          idx,
          "DRY_SPELL_ALL",
          `No one hit anything for ${DOC.longNoPrizeAll} draws.`,
          "Long quiet stretches are expected under long odds. Silence is part of the story.",
          "Nothing happened again. And that’s the point."
        );
      }

      if (rollStreak === DOC.longRollN) {
        pushEvent(
          idx,
          "LONG_ROLL",
          `Jackpot rolled ${DOC.longRollN} draws in a row.`,
          "Rollover streaks are normal when the market’s λ stays small most draws.",
          "The pot grows, and human intuition starts to overreact."
        );
      }

      const rankingNow = players
        .slice()
        .sort((a, b) => b.bal - a.bal)
        .map((p) => p.id)
        .join("");

      const rankingPrev = (idx > 0) ? snapshots[idx - 1].rankingKey : rankingNow;
      if (idx > 0 && rankingNow[0] !== rankingPrev[0]) {
        pushEvent(
          idx,
          "RANK_FLIP",
          `Lead changed: ${rankingNow[0]} is now #1.`,
          "Short-term leads are dominated by variance. Strategy does not change jackpot odds per ticket.",
          "A lead is a path property, not proof of skill."
        );
      }

      snapshots[idx] = {
        idx,
        drawId,
        dateISO: curDate.toISOString().slice(0, 10),
        dow,
        addonMode,
        jCash,
        tSold,
        tEff,
        lambda,
        pHit,
        coverage,
        marketWinners,
        ppMult,
        drawMain,
        drawDP,
        ticketsByPlayer,
        jWinCount,
        wonByPlayer,
        players: players.map((p) => ({
          id: p.id,
          name: p.name,
          strat: p.strat,
          bal: p.bal,
          spent: p.spent,
          won: p.won,
          jHits: p.jHits,
          active: p.active,
        })),
        rankingKey: rankingNow,
        lastJackpotIdx,
      };

      if (idx % 10 === 0) {
        const point = { idx, jCash, leader: rankingNow[0] };
        for (const p of players) point[p.id] = p.bal;
        chartPoints.push(point);
      }

      curDate = nextDrawDate(curDate, dow);
      dow = nextDow(dow);
    }

    const lastSnap = snapshots[totalDraws - 1];
    const finalPlayers = lastSnap.players.slice().sort((a, b) => b.bal - a.bal);

    let drawsWithMarketJackpotHit = 0;
    for (const sp of snapshots) if (sp.marketWinners >= 1) drawsWithMarketJackpotHit++;

    const jackpotHitsPlayers = finalPlayers.reduce((s, p) => s + p.jHits, 0);

    let best = 0, cur = 0;
    for (let i = 0; i < snapshots.length; i++) {
      if (snapshots[i].lastJackpotIdx === i) cur = 0;
      else cur++;
      if (cur > best) best = cur;
    }

    return {
      meta: { years, totalDraws, seed, eff, addonMode },
      snapshots,
      chartPoints,
      events,
      narration,
      summary: {
        finalPlayers,
        jackpotHitsPlayers,
        drawsWithMarketJackpotHit,
        longestNoJackpotDraws: best,
      },
    };
  }

  // ---------- UI / Config ----------
  const PLAYER_IDS = ["A", "B", "C", "D", "E"];
  const STRAT_LABEL = {
    quick: "Quick Pick",
    logic: "Lotto Logic (filter-only)",
    fixed: "Power ME (fixed tickets)",
  };

  const DASH_PRESETS = [
    [],
    [12, 7],
    [4, 7],
    [16, 4, 3, 4],
    [2, 5],
  ];

  let jackpotMode = "cash";
  let focusMode = false;
  let playing = false;
  let speedIdx = 1;
  const speeds = [0.5, 1, 2, 5, 10];

  let seed = (Math.floor(Math.random() * 1e9) >>> 0);
  let sim = null;
  let currentIdx = 0;

  let fixedTicketsLocked = null;

  const view = {
    scaleX: 1,
    scaleY: 1,
    offX: 0,
    offY: 0,
    drag: false,
    dragStart: null,
    hoverPlayer: null,
  };

  function showBuilding(on) {
    els.buildOverlay.classList.toggle("hidden", !on);
  }

  function resetView() {
    view.scaleX = 1;
    view.scaleY = 1;
    view.offX = 0;
    view.offY = 0;
  }

  function getLogicCfgFromUI() {
    const sumMin = clamp(parseInt(els.bSumMin.value, 10) || 130, 5, 345);
    const sumMax = clamp(parseInt(els.bSumMax.value, 10) || 220, 5, 345);
    const minSectors = clamp(parseInt(els.bMinSectors.value, 10) || 2, 1, 7);
    const maxSectors = clamp(parseInt(els.bMaxSectors.value, 10) || 4, 1, 7);

    return {
      sumMin: Math.min(sumMin, sumMax),
      sumMax: Math.max(sumMin, sumMax),
      excludeAllOddEven: !!els.bExcludeAllOddEven.checked,
      smallMax: clamp(parseInt(els.bSmallMax.value, 10) || 34, 10, 59),
      excludeAllSmallBig: !!els.bExcludeAllSmallBig.checked,
      maxConsecPairs: clamp(parseInt(els.bMaxConsec.value, 10) || 1, 0, 4),
      minSectors: Math.min(minSectors, maxSectors),
      maxSectors: Math.max(minSectors, maxSectors),
      maxTailPairs: clamp(parseInt(els.bMaxTailPairs.value, 10) || 1, 0, 4),
      poolInit: clamp(parseInt(els.bPoolInit.value, 10) || 500, 100, 5000),
      poolMax: clamp(parseInt(els.bPoolMax.value, 10) || 20000, 1000, 50000),
    };
  }

  function makeDefaultPlayers() {
    return PLAYER_IDS.map((id, i) => ({
      id,
      enabled: i < 3,
      strat: (i === 0) ? "quick" : (i === 1) ? "logic" : (i === 2) ? "fixed" : "quick",
      name: `Player ${id}`,
    }));
  }

  let playersUI = makeDefaultPlayers();

  function renderPlayerSetupUI() {
    els.playerGrid.innerHTML = "";
    playersUI.forEach((p) => {
      const row = document.createElement("div");
      row.className = "playerRow";

      const tag = document.createElement("div");
      tag.className = "pTag";
      tag.textContent = `Slot ${p.id}`;

      const slot = document.createElement("div");
      slot.className = "pSlot";
      slot.innerHTML = `
        <input type="checkbox" ${p.enabled ? "checked" : ""} aria-label="Enable player ${p.id}" />
        <span class="slotName">${p.name}</span>
      `;

      const sel = document.createElement("select");
      sel.className = "select";
      sel.innerHTML = `
        <option value="quick">Quick Pick</option>
        <option value="logic">Lotto Logic (filter-only)</option>
        <option value="fixed">Power ME (fixed tickets)</option>
        <option value="off">Off</option>
      `;
      sel.value = p.enabled ? p.strat : "off";

      const cb = slot.querySelector("input");
      cb.addEventListener("change", () => {
        p.enabled = cb.checked;
        if (!p.enabled) sel.value = "off";
        else sel.value = p.strat;
        enforceFixedTicketUniqueness();
      });

      sel.addEventListener("change", () => {
        const v = sel.value;
        if (v === "off") {
          p.enabled = false;
          cb.checked = false;
        } else {
          p.enabled = true;
          cb.checked = true;
          p.strat = v;
        }
        enforceFixedTicketUniqueness();
      });

      row.appendChild(tag);
      row.appendChild(slot);
      row.appendChild(sel);
      els.playerGrid.appendChild(row);
    });
  }

  function enforceFixedTicketUniqueness() {
    let fixedCount = playersUI.filter((p) => p.enabled && p.strat === "fixed").length;
    if (fixedCount <= 1) return;

    for (let i = playersUI.length - 1; i >= 0; i--) {
      const p = playersUI[i];
      if (p.enabled && p.strat === "fixed") {
        p.strat = "quick";
        fixedCount--;
        if (fixedCount <= 1) break;
      }
    }
    renderPlayerSetupUI();
    alert("Only one player can use fixed tickets. Extra fixed slots were switched to Quick Pick.");
  }

  function activePlayersConfig() {
    return playersUI
      .filter((p) => p.enabled)
      .slice(0, 5)
      .map((p) => ({ id: p.id, enabled: true, strat: p.strat, name: `${p.id} — ${STRAT_LABEL[p.strat]}` }));
  }

  function initFixedTickets() {
    const rng = mulberry32(seed ^ 0xA5A5F00D);
    fixedTicketsLocked = defaultFixedTickets(rng);
    els.fixedTickets.value = formatFixedTickets(fixedTicketsLocked);
  }

  // ---------- Build / Rebuild ----------
  function rebuild() {
    const years = clamp(parseInt(els.years.value, 10) || 100, 1, 100);
    const addonMode = els.addonMode.value;
    const startJackpotCash = clamp(parseInt(els.startJackpot.value, 10) || RULES.MIN_JACKPOT_CASH, RULES.MIN_JACKPOT_CASH, RULES.MAX_JACKPOT_CASH);
    const logicCfg = getLogicCfgFromUI();
    const playersConfig = activePlayersConfig();

    showBuilding(true);

    setTimeout(() => {
      try {
        sim = runSimulation({
          years,
          addonMode,
          seed,
          startJackpotCash,
          playersConfig,
          logicCfg,
          fixedTickets: fixedTicketsLocked,
        });

        els.totalDraws.textContent = String(sim.meta.totalDraws);
        els.timeline.max = String(sim.meta.totalDraws - 1);
        currentIdx = 0;
        els.timeline.value = "0";

        buildTickline();
        buildLegend();

        resetView();
        renderAll();
      } finally {
        showBuilding(false);
      }
    }, 30);
  }

  function buildLegend() {
    if (!sim) return;
    const ids = sim.snapshots[0].players.map((p) => p.id);
    const parts = ids.map((id) => `${id}: ${STRAT_LABEL[sim.snapshots[0].players.find(x=>x.id===id).strat]}`);
    els.legend.textContent = parts.join(" · ");
  }

  function buildTickline() {
    els.tickline.innerHTML = "";
    const maxTicks = 60;
    const ev = sim.events.slice();
    if (ev.length === 0) return;
    const step = Math.max(1, Math.floor(ev.length / maxTicks));
    for (let i = 0; i < ev.length; i += step) {
      const idx = ev[i].idx;
      const x = idx / (sim.meta.totalDraws - 1);
      const div = document.createElement("div");
      div.className = "tick";
      div.style.left = (x * 100) + "%";
      els.tickline.appendChild(div);
    }
  }

  // ---------- Rendering ----------
  function renderAll() {
    if (!sim) return;
    const snap = sim.snapshots[currentIdx];

    els.drawId.textContent = snap.drawId;
    const jDisplay = (jackpotMode === "cash") ? snap.jCash : Math.min(RULES.MAX_JACKPOT_CASH, snap.jCash * 1.85);
    els.jackpot.textContent = fmtMoney(jDisplay);
    els.pHit.textContent = fmtPct(snap.pHit);

    const since = snap.lastJackpotIdx < 0 ? (currentIdx + 1) : (currentIdx - snap.lastJackpotIdx);
    els.sinceJackpot.textContent = String(since) + " draws";
    els.speedText.textContent = speeds[speedIdx] + "x";

    renderRanking(snap);
    renderPlayers(snap);
    renderNarration();
    renderChart();
  }

  function renderRanking(snap) {
    const ps = snap.players.slice().sort((a, b) => b.bal - a.bal);

    const old = new Map();
    Array.from(els.ranking.children).forEach((li) => {
      const id = li.getAttribute("data-id");
      old.set(id, li.getBoundingClientRect().top);
    });

    els.ranking.innerHTML = "";
    ps.forEach((p, i) => {
      const li = document.createElement("li");
      li.setAttribute("data-id", p.id);
      li.innerHTML = `<div><span class="rankTag">#${i + 1}</span><span class="name">${p.id}</span> <span class="mini">(${STRAT_LABEL[p.strat]})</span></div>
                      <div class="money">${fmtMoney(p.bal)}</div>`;
      li.addEventListener("mouseenter", () => { view.hoverPlayer = p.id; renderChart(); });
      li.addEventListener("mouseleave", () => { view.hoverPlayer = null; renderChart(); });
      els.ranking.appendChild(li);
    });

    Array.from(els.ranking.children).forEach((li) => {
      const id = li.getAttribute("data-id");
      const nowTop = li.getBoundingClientRect().top;
      const prevTop = old.get(id);
      if (prevTop != null) {
        const dy = prevTop - nowTop;
        li.style.transform = `translateY(${dy}px)`;
        li.getBoundingClientRect();
        li.style.transform = "translateY(0px)";
      }
    });
  }

  function renderPlayers(snap) {
    els.players.innerHTML = "";
    for (const p of snap.players) {
      const status = p.active ? "Active" : "Eliminated";
      const card = document.createElement("div");
      card.className = "card";
      card.addEventListener("mouseenter", () => { view.hoverPlayer = p.id; renderChart(); });
      card.addEventListener("mouseleave", () => { view.hoverPlayer = null; renderChart(); });

      card.innerHTML = `
        <div class="cardHead">
          <div>
            <div class="pname">${p.id} — ${STRAT_LABEL[p.strat]}</div>
            <div class="badge">${status}</div>
          </div>
          <div class="badge">${fmtMoney(p.bal)}</div>
        </div>
        <div class="grid2">
          <div><div class="mini">Spent</div><div class="val">${fmtMoney(p.spent)}</div></div>
          <div><div class="mini">Return</div><div class="val">${fmtMoney(p.won)}</div></div>
          <div><div class="mini">Jackpot hits</div><div class="val">${p.jHits}</div></div>
          <div><div class="mini">Tickets/draw</div><div class="val">≤ 5</div></div>
        </div>
      `;
      els.players.appendChild(card);
    }
  }

  function renderNarration() {
    let e = null;
    for (let i = sim.events.length - 1; i >= 0; i--) {
      if (sim.events[i].idx <= currentIdx) { e = sim.events[i]; break; }
    }
    if (!e || e.idx !== currentIdx) {
      els.nLineMain.textContent = "(silence)";
      els.nLineRational.textContent = "";
      els.nLineNotes.textContent = "";
      return;
    }
    els.nLineMain.textContent = e.main || "(silence)";
    els.nLineRational.textContent = e.whyRational || "";
    els.nLineNotes.textContent = e.whyNotes || "";
  }

  // ---------- Chart ----------
  const ctx = els.chart.getContext("2d");

  function resetCanvasSize() {
    const w = Math.floor(els.chart.clientWidth * devicePixelRatio);
    const h = Math.floor(els.chart.clientHeight * devicePixelRatio);
    els.chart.width = w;
    els.chart.height = h;
    return { w, h };
  }

  function renderChart() {
    if (!sim) return;
    const { w, h } = resetCanvasSize();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 56 * devicePixelRatio, padR = 18 * devicePixelRatio, padT = 18 * devicePixelRatio, padB = 42 * devicePixelRatio;
    const pw = w - padL - padR;
    const ph = h - padT - padB;

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const y = padT + (ph * i / 6);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke();
    }
    for (let i = 0; i <= 10; i++) {
      const x = padL + (pw * i / 10);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
    }

    const series = sim.chartPoints;
    if (series.length < 2) return;

    const playerIds = sim.snapshots[0].players.map((p) => p.id);

const totalPts = series.length;
const baseWindow = Math.min(200, totalPts);

// 当前时间轴对应到 chartPoints 的索引（每 10 期一个点）
const ptIndex = clamp(Math.floor(currentIdx / 10), 0, totalPts - 1);

// 以当前点为中心做窗口，支持缩放/平移
const zoomX = view.scaleX;
const span = Math.max(6, baseWindow / zoomX);

// view.offX 作为“按点数平移”
let center = ptIndex - view.offX;

let xMin = clamp(center - span / 2, 0, totalPts - 1);
let xMax = clamp(center + span / 2, 0, totalPts - 1);

// 保证窗口宽度
if (xMax - xMin < 6) xMax = clamp(xMin + 6, 0, totalPts - 1);

    const zoomX = view.scaleX;
    const span = (baseMax - baseMin) / zoomX;
    let center = (baseMin + baseMax) / 2 - view.offX;
    let xMin = clamp(center - span / 2, 0, totalPts - 1);
    let xMax = clamp(center + span / 2, 0, totalPts - 1);
    if (xMax - xMin < 5) xMax = xMin + 5;

    let yMin = Infinity, yMax = -Infinity;
    for (let i = Math.floor(xMin); i <= Math.ceil(xMax); i++) {
      const pt = series[i];
      for (const id of playerIds) {
        const v = pt[id];
        if (typeof v === "number") {
          yMin = Math.min(yMin, v);
          yMax = Math.max(yMax, v);
        }
      }
    }
    if (!isFinite(yMin) || !isFinite(yMax)) return;

    const mid = (yMin + yMax) / 2;
    const half = (yMax - yMin) / 2;
    const spanY = (half * 1.2) / view.scaleY;
    yMin = mid - spanY - view.offY * (spanY * 0.2);
    yMax = mid + spanY - view.offY * (spanY * 0.2);
    if (yMax - yMin < 1) yMax = yMin + 1;

    const xToPx = (x) => padL + ((x - xMin) / (xMax - xMin)) * pw;
    const yToPx = (y) => padT + (1 - ((y - yMin) / (yMax - yMin))) * ph;

    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.font = `${12 * devicePixelRatio}px ui-sans-serif, system-ui`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const t = yMin + (yMax - yMin) * (i / 4);
      ctx.fillText(fmtMoney(t), padL - 10 * devicePixelRatio, yToPx(t));
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= 5; i++) {
      const xi = xMin + (xMax - xMin) * (i / 5);
      const x = xToPx(xi);
      const idx = clamp(Math.round(xi), 0, totalPts - 1);
      ctx.fillText(series[idx].idx.toString(), x, padT + ph + 10 * devicePixelRatio);
    }

    const leader = series[ptIndex].leader;
    const hover = view.hoverPlayer;

    function drawPlayerLine(playerId, dash, baseAlpha) {
      ctx.beginPath();
      let started = false;
      for (let i = Math.floor(xMin); i <= Math.ceil(xMax); i++) {
        const pt = series[i];
        const v = pt[playerId];
        if (typeof v !== "number") continue;
        const x = xToPx(i);
        const y = yToPx(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }

      const isHover = hover && hover === playerId;
      const isLeader = leader === playerId;

      const alpha = hover ? (isHover ? 0.95 : 0.20) : (isLeader ? 0.90 : baseAlpha);
      ctx.strokeStyle = `rgba(214,217,255,${alpha})`;
      ctx.setLineDash(dash.map(d => d * devicePixelRatio));
      ctx.lineWidth = (isHover || isLeader) ? 3.2 * devicePixelRatio : 2.0 * devicePixelRatio;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (let i = 0; i < playerIds.length; i++) {
      drawPlayerLine(playerIds[i], DASH_PRESETS[i] || [], 0.60);
    }

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = Math.max(1, Math.floor(xMin)); i <= Math.min(totalPts - 1, Math.ceil(xMax)); i++) {
      if (series[i].leader !== series[i - 1].leader) {
        const x = xToPx(i);
        const y = padT + 10 * devicePixelRatio;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5 * devicePixelRatio, y + 10 * devicePixelRatio);
        ctx.lineTo(x + 5 * devicePixelRatio, y + 10 * devicePixelRatio);
        ctx.closePath();
        ctx.fill();
      }
    }

    const curX = xToPx(ptIndex);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1 * devicePixelRatio;
    ctx.beginPath(); ctx.moveTo(curX, padT); ctx.lineTo(curX, padT + ph); ctx.stroke();
  }

  // ---------- Chart interactions ----------
  (function bindChartInteractions() {
    const canvas = els.chart;

    canvas.addEventListener("dblclick", () => {
      resetView();
      renderChart();
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const factor = (delta > 0) ? 0.90 : 1.11;
      if (e.shiftKey) view.scaleY = clamp(view.scaleY * factor, 0.3, 8);
      else view.scaleX = clamp(view.scaleX * factor, 0.5, 20);
      renderChart();
    }, { passive: false });

    canvas.addEventListener("mousedown", (e) => {
      view.drag = true;
      view.dragStart = { x: e.clientX, y: e.clientY, offX: view.offX, offY: view.offY };
    });

    window.addEventListener("mouseup", () => { view.drag = false; view.dragStart = null; });

    window.addEventListener("mousemove", (e) => {
      if (!sim) return;

      if (view.drag && view.dragStart) {
        const dx = (e.clientX - view.dragStart.x) / 120;
        const dy = (e.clientY - view.dragStart.y) / 120;
        view.offX = view.dragStart.offX + dx;
        view.offY = view.dragStart.offY - dy;
        renderChart();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

      const series = sim.chartPoints;
      const totalPts = series.length;
      if (totalPts < 2) return;

      const mx = e.clientX - rect.left;
      const t = mx / rect.width;
      const idx = clamp(Math.floor(t * (totalPts - 1)), 0, totalPts - 1);

      const ids = sim.snapshots[0].players.map(p => p.id);
      const vals = {};
      for (const id of ids) vals[id] = series[idx][id];

      const min = Math.min(...ids.map(id => vals[id]));
      const max = Math.max(...ids.map(id => vals[id]));
      const my = e.clientY - rect.top;
      const ny = 1 - (my / rect.height);
      const target = min + (max - min) * ny;

      let best = null, bestD = Infinity;
      for (const id of ids) {
        const d = Math.abs(vals[id] - target);
        if (d < bestD) { bestD = d; best = id; }
      }

      if (best && best !== view.hoverPlayer) {
        view.hoverPlayer = best;
        renderChart();
      }
    });
  })();

  // ---------- Playback loop ----------
  let lastUi = 0;
  function tick(ts) {
    if (playing && sim) {
      const dt = (ts - lastUi) / 1000;
      const advance = Math.floor(dt * 30 * speeds[speedIdx]);
      if (advance > 0) {
        currentIdx = clamp(currentIdx + advance, 0, sim.meta.totalDraws - 1);
        els.timeline.value = String(currentIdx);
        lastUi = ts;
        renderAll();
        if (currentIdx >= sim.meta.totalDraws - 1) {
          playing = false;
          els.btnPlayPause.textContent = "▶";
        }
      }
    }
    requestAnimationFrame(tick);
  }

  // ---------- Export ----------
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportNarration() {
    if (!sim) return;
    downloadText("lotto-logic-narration.txt", sim.narration.join("\n"));
  }

  function exportSummary() {
    if (!sim) return;
    const s = sim.summary;
    const meta = sim.meta;

    const lines = [];
    lines.push("# Lotto Logic — Simulation Summary");
    lines.push("");
    lines.push("## Section 1 — Experiment Overview");
    lines.push(`- Years simulated: ${meta.years}`);
    lines.push(`- Total draws: ${meta.totalDraws}`);
    lines.push(`- Addon: ${meta.addonMode.toUpperCase()}`);
    lines.push(`- Market efficiency: ${meta.eff.toFixed(4)} (used for market only)`);
    lines.push(`- Ticket price: $2 (addons +$1)`);
    lines.push("");

    lines.push("## Section 2 — Key Results");
    lines.push(`- Draws with market jackpot hit (≥1 market winner): ${s.drawsWithMarketJackpotHit}`);
    lines.push(`- Player jackpot hits (total winning tickets across players): ${s.jackpotHitsPlayers}`);
    lines.push(`- Longest no-jackpot streak (draws): ${s.longestNoJackpotDraws}`);
    lines.push("- Final ranking:");
    s.finalPlayers.forEach((p, i) => {
      lines.push(`  - #${i + 1} ${p.id} (${STRAT_LABEL[p.strat]}): balance=${fmtMoney(p.bal)}, spent=${fmtMoney(p.spent)}, return=${fmtMoney(p.won)}, jackpotHits=${p.jHits}, status=${p.active ? "Active" : "Eliminated"}`);
    });
    lines.push("");

    lines.push("## Section 3 — Why It Looks Like This");
    lines.push("- The jackpot combination space is 292,201,338. One ticket does not get “closer” by strategy.");
    lines.push("- Market jackpot hits follow a Poisson process with λ = tickets_eff / 292,201,338.");
    lines.push("- Long stretches of “nothing happens” are not a bug; they are expected under long odds.");
    lines.push("- Strategy B filters patterns. That can change variance and the path, not jackpot probability per ticket.");
    lines.push("");

    lines.push("## Section 4 — Read-Aloud Closing");
    lines.push("\"If you’re wondering why nobody hit the jackpot —");
    lines.push("it’s not bad luck.");
    lines.push("It’s exactly what probability predicts.\"");
    lines.push("");

    lines.push("## Appendix — Event Index (first 200)");
    sim.events.slice(0, 200).forEach((e) => {
      lines.push(`- ${drawIdFromIndex(e.idx)}: ${e.type} — ${e.main}`);
    });
    if (sim.events.length > 200) lines.push(`- ... (${sim.events.length - 200} more)`);

    downloadText("lotto-logic-summary.md", lines.join("\n"));
  }

  // ---------- Bind UI ----------
  function bindUI() {
    els.btnPlayPause.addEventListener("click", () => {
      playing = !playing;
      els.btnPlayPause.textContent = playing ? "⏸" : "▶";
      lastUi = performance.now();
    });

    els.btnSpeed.addEventListener("click", () => {
      speedIdx = (speedIdx + 1) % speeds.length;
      els.btnSpeed.textContent = `⏩ ${speeds[speedIdx]}x`;
      renderAll();
    });

    els.btnJackpotMode.addEventListener("click", () => {
      jackpotMode = (jackpotMode === "cash") ? "adv" : "cash";
      els.btnJackpotMode.textContent = (jackpotMode === "cash") ? "Cash" : "Advertised";
      renderAll();
    });

    els.btnFullscreen.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch {}
    });

    els.btnFocus.addEventListener("click", () => {
      focusMode = !focusMode;
      document.body.classList.toggle("focus", focusMode);
      els.btnFocus.textContent = focusMode ? "Exit Focus" : "Focus";
      renderChart();
    });

    els.btnNewRun.addEventListener("click", () => {
      seed = (Math.floor(Math.random() * 1e9) >>> 0);
      initFixedTickets();
      renderPlayerSetupUI();
      rebuild();
    });

    els.btnRebuild.addEventListener("click", rebuild);

    els.timeline.addEventListener("input", () => {
      currentIdx = parseInt(els.timeline.value, 10) || 0;
      renderAll();
    });

    els.btnWhy.addEventListener("click", () => {
      els.nWhy.classList.toggle("hidden");
    });

    els.btnApplyFixed.addEventListener("click", () => {
      if (playing) return;
      const parsed = parseFixedTickets(els.fixedTickets.value);
      if (!parsed) {
        alert("Fixed tickets invalid. Provide 5 lines: 5 whites | PB. Example: 3 11 19 42 65 | 7");
        return;
      }
      fixedTicketsLocked = parsed;
      rebuild();
    });

    els.btnExportNarration.addEventListener("click", exportNarration);
    els.btnExportSummary.addEventListener("click", exportSummary);
  }

  // ---------- Boot ----------
  function boot() {
    playersUI = makeDefaultPlayers();
    renderPlayerSetupUI();
    enforceFixedTicketUniqueness();

    initFixedTickets();

    bindUI();
    rebuild();
    requestAnimationFrame(tick);
  }

  boot();
})();
