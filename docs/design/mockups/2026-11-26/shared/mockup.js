/* Shared builder for the 2026-11-26 play-screen mockups.
   Each direction supplies window.ART (the drawn marks) and its own stylesheet.
   The board comes from board-data.js, a real createRun result. */
(function () {
  "use strict";
  const DATA = window.BOARD;
  const ART = window.ART;
  const T = 40; // one tile, in board units
  const html = document.documentElement;
  html.dataset.theme = new URLSearchParams(location.search).get("theme") || ART.defaultTheme;

  const key = (r, c) => r + "," + c;
  const STEPS = [[-1, 0, "up"], [1, 0, "down"], [0, -1, "left"], [0, 1, "right"]];

  function model(run, revealAll) {
    const N = run.size;
    const passage = (r, c) => r >= 0 && c >= 0 && r < N && c < N && run.labyrinth[r][c] === 1;
    const revealed = new Set(run.revealed);
    const pulse = new Set(run.pulseVisible || []);
    const e = run.explorer;
    // Line of sight: each straight passage from the Explorer, with the walls beside it.
    const sight = new Set();
    for (const [dr, dc] of STEPS) {
      let r = e.row, c = e.col;
      while (passage(r, c)) {
        sight.add(key(r, c)).add(key(r + dc, c + dr)).add(key(r - dc, c - dr));
        r += dr; c += dc;
      }
      sight.add(key(r, c));
    }
    // Distance in Moves from the Explorer, through known tiles only. Fog leaks no route.
    const known = (k) => revealAll || revealed.has(k) || pulse.has(k);
    const dist = new Map([[key(e.row, e.col), 0]]);
    const queue = [[e.row, e.col]];
    while (queue.length) {
      const [r, c] = queue.shift();
      for (const [dr, dc] of STEPS) {
        const k = key(r + dr, c + dc);
        if (passage(r + dr, c + dc) && known(k) && !dist.has(k)) { dist.set(k, dist.get(key(r, c)) + 1); queue.push([r + dr, c + dc]); }
      }
    }
    const state = (r, c) => {
      if (r < 0 || c < 0 || r >= N || c >= N) return "out";
      if (revealAll) return "seen";
      const k = key(r, c);
      if (revealed.has(k)) return sight.has(k) ? "seen" : "memory";
      return pulse.has(k) ? "pulse" : "fog";
    };
    return { run, N, passage, state, dist: (r, c) => dist.get(key(r, c)) };
  }

  function board(run, opts) {
    const m = model(run, opts.revealAll);
    const N = m.N;
    const G = opts.narrow ? ART.gutterNarrow : ART.gutter;
    const S = N * T + 2 * G;
    const at = (p) => [G + p.col * T + T / 2, G + p.row * T + T / 2];
    const seen = (p) => m.state(p.row, p.col) !== "fog";
    const far = (p) => Math.abs(p.row - run.explorer.row) + Math.abs(p.col - run.explorer.col);
    const mid = (a, b) => ({ row: (a.row + b.row) / 2, col: (a.col + b.col) / 2 });
    let under = ART.base(N, G, S);
    let over = "";
    for (let r = 0; r < N; r += 1) {
      for (let c = 0; c < N; c += 1) {
        const t = ART.tile({
          x: G + c * T, y: G + r * T, passage: m.passage(r, c), state: m.state(r, c), dist: m.dist(r, c),
          nb: (dr, dc) => ({ passage: m.passage(r + dr, c + dc), state: m.state(r + dr, c + dc) })
        });
        under += t.under || "";
        over += t.over || "";
      }
    }
    let marks = "";
    for (const b of run.echoBridges) {
      if (seen(b.from) || seen(b.to)) marks += ART.piece("bridge", ...at(mid(b.from, b.to)), { open: b.open, n: b.echoIndex + 1, horizontal: b.from.row === b.to.row });
    }
    for (const d of run.tideDoors) {
      if (seen(d.from) || seen(d.to)) marks += ART.piece("tide", ...at(mid(d.from, d.to)), { open: d.open, horizontal: d.from.row === d.to.row });
    }
    for (const w of run.windways) if (seen(w.source)) marks += ART.piece("windway", ...at(w.source), { direction: w.direction });
    if (ART.overlay) marks += ART.overlay(m, at);
    if (seen(run.gate)) marks += ART.piece("gate", ...at(run.gate), { open: run.gate.open });
    for (const b of run.signalBells) if (seen(b)) marks += ART.piece("bell", ...at(b), { spent: b.spent });
    run.echoes.forEach((echo, i) => { if (!echo.collected && seen(echo)) marks += ART.piece("echo", ...at(echo), { n: i + 1 }); });
    for (const w of run.wardens) {
      if (!seen(w)) continue;
      // Telegraph: the known exit that brings the Warden closest to the Explorer.
      const next = STEPS.map(([dr, dc, direction]) => ({ row: w.row + dr, col: w.col + dc, direction }))
        .filter((p) => m.passage(p.row, p.col) && seen(p))
        .sort((a, b) => far(a) - far(b))[0];
      if (next && !opts.revealAll) marks += ART.piece("danger", ...at(mid(w, next)), { direction: next.direction });
      marks += ART.piece("warden", ...at(w), { mode: w.mode });
    }
    marks += ART.piece("explorer", ...at(run.explorer), {});
    const frame = ART.frame(N, G, S, opts.narrow);
    return `<svg class="board__svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="${opts.label}">${under}${over}${marks}${frame}</svg>`;
  }

  function swatch(kind, o) {
    const wide = kind === "bridge" || kind === "tide";
    const tile = (x, passage, state) => {
      const t = ART.tile({ x, y: 0, passage, state, dist: 2, nb: () => ({ passage, state }) });
      return (t.under || "") + (t.over || "");
    };
    let out;
    if (kind === "tile") out = ART.swatchFloor(0) + tile(0, o.passage, o.state);
    else if (wide) out = ART.swatchFloor(0) + ART.swatchFloor(T) + ART.swatchFloor(2 * T) + tile(0, true, "seen") + tile(T, false, "seen") + tile(2 * T, true, "seen") + ART.piece(kind, T * 1.5, T / 2, { ...o, horizontal: true });
    else out = ART.swatchFloor(0) + tile(0, true, "seen") + ART.piece(kind, T / 2, T / 2, o);
    const W = wide ? 3 * T : T;
    return `<svg class="swatch${wide ? " swatch--wide" : ""}" viewBox="0 -4 ${W} ${T + 10}" aria-hidden="true">${out}</svg>`;
  }

  const LEGEND = [
    ["Wall", "tile", { passage: false, state: "seen" }],
    ["Passage in sight", "tile", { passage: true, state: "seen" }],
    ["Passage on the map", "tile", { passage: true, state: "memory" }],
    ["Fog", "tile", { passage: true, state: "fog" }],
    ["Tile under a Pulse", "tile", { passage: true, state: "pulse" }],
    ["Explorer", "explorer", {}],
    ["Echo", "echo", { n: 1 }],
    ["Gate, sealed", "gate", { open: false }],
    ["Gate, open", "gate", { open: true }],
    ["Warden on Patrol", "warden", { mode: "patrol" }],
    ["Warden on Hunt", "warden", { mode: "hunt" }],
    ["Warden on Intercept", "warden", { mode: "intercept" }],
    ["Lured Warden", "warden", { mode: "lured" }],
    ["Warden's next Move", "danger", { direction: "right" }],
    ["Signal Bell", "bell", { spent: false }],
    ["Signal Bell, spent", "bell", { spent: true }],
    ["Windway", "windway", { direction: "right" }],
    ["Echo Bridge, sealed", "bridge", { open: false, n: 1 }],
    ["Echo Bridge, open", "bridge", { open: true, n: 1 }],
    ["Tide Door, open", "tide", { open: true }],
    ["Tide Door, shut", "tide", { open: false }]
  ];

  const run = DATA.main;
  const m = model(run, false);
  const e = run.explorer;
  const exits = STEPS.filter(([dr, dc]) => m.passage(e.row + dr, e.col + dc)).map((s) => s[2]);
  const inSight = (p) => m.state(p.row, p.col) !== "fog";
  const echoesSeen = run.echoes.filter((x) => !x.collected && inSight(x)).length;
  const collected = run.echoes.filter((x) => x.collected).length;
  const pulsesLeft = run.pulses;
  const compass = `You stand at row ${e.row + 1}, column ${e.col + 1}. Open exits: ${exits.join(", ")}. ` +
    `The Gate is ${inSight(run.gate) ? `on the map at row ${run.gate.row + 1}, column ${run.gate.col + 1}, and it is ${run.gate.open ? "open" : "sealed"}` : "not on the map"}. ` +
    `${echoesSeen} of ${run.echoes.length} Echoes are on the map.`;
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const watch = run.wardens.map((w, i) => {
    const text = inSight(w) ? `${cap(w.mode)}, ${m.dist(w.row, w.col) === undefined ? "no known route" : m.dist(w.row, w.col) + " Moves away"}` : "Not in sight";
    return `<li>${swatch("warden", { mode: w.mode })}<span><strong>Warden ${i + 1}</strong> ${text}</span></li>`;
  }).join("");
  const arrow = { up: "M12 19V5M5 12l7-7 7 7", left: "M19 12H5M12 5l-7 7 7 7", down: "M12 5v14M5 12l7 7 7-7", right: "M5 12h14M12 5l7 7-7 7" };
  const pad = Object.entries(arrow).map(([d, path]) =>
    `<button class="pad__key pad__key--${d}" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg><span class="sr-only">Move ${d}</span></button>`).join("");
  const cell = (label, value) => `<div class="readout__cell"><dt>${label}</dt><dd>${value}</dd></div>`;
  const twist = (id) => {
    const s = DATA.specimens[id];
    return `<figure class="twist">${board(s, { revealAll: true, narrow: true, label: `${s.ruleset.label} Labyrinth, fully shown` })}<figcaption><strong>${s.ruleset.label}</strong> <code>${s.ruleset.revision}</code></figcaption></figure>`;
  };

  document.body.insertAdjacentHTML("afterbegin", `
    ${ART.defs}
    <a class="skip" href="#board">Skip to the board</a>
    <header class="bar">
      <a class="wordmark" href="#board">Echo Maze</a>
      <nav class="bar__nav" aria-label="Main"><a href="#legend">Atlas</a><a href="#legend">Records</a><a href="#legend">Settings</a></nav>
      <button class="theme" id="theme" type="button"></button>
    </header>
    <main class="play">
      <div class="stage">
        <dl class="readout" aria-label="Readout">
          ${cell("Time", "02:14")}${cell("Moves", run.moves)}${cell("Echoes", `${collected}/${run.echoes.length}`)}${cell("Vitality", `${e.vitality}/${e.maxVitality}`)}${cell("Score", run.score)}
        </dl>
        <figure class="board" id="board"></figure>
        <p class="event" role="status">${run.event.message}</p>
        <div class="rail" role="group" aria-label="Action rail">
          <div class="pad" role="group" aria-label="Touch movement controls">${pad}</div>
          <button class="act act--primary" type="button"><span class="act__name">Pulse</span><span class="act__count">${pulsesLeft} left</span><kbd>Q</kbd></button>
          <button class="act" type="button"><span class="act__name">Ring Bell</span><kbd>B</kbd></button>
          <button class="act" type="button"><span class="act__name">Pause</span><kbd>P</kbd></button>
        </div>
      </div>
      <aside class="notes" aria-label="Run notes">
        <section class="title-block">
          <h1>${run.ruleset.label}</h1>
          <dl><div><dt>Seed</dt><dd>${run.seed}</dd></div><div><dt>Ruleset</dt><dd>${run.ruleset.revision}</dd></div><div><dt>Size</dt><dd>${run.size} by ${run.size}</dd></div></dl>
        </section>
        <section class="compass">
          <h2>Trail Compass</h2>
          <p>${compass}</p>
          <div class="compass__actions"><button class="act act--quiet" type="button">Describe Trail</button><button class="act act--quiet" type="button">Listen</button></div>
        </section>
        <section class="watch"><h2>Wardens</h2><ul>${watch}</ul></section>
      </aside>
    </main>
    <section class="legend" id="legend">
      <h2>Map marks</h2>
      <ul>${LEGEND.map(([label, kind, o]) => `<li>${swatch(kind, o)}<span>${label}</span></li>`).join("")}</ul>
    </section>
    <section class="twists">
      <h2>Trail Twists on seed ${run.seed}</h2>
      <div class="twists__row">${twist("developing")}${twist("capable")}${twist("advanced")}</div>
    </section>`);

  const narrow = matchMedia("(max-width: 759px)");
  const figure = document.getElementById("board");
  const draw = () => {
    figure.innerHTML = board(run, { narrow: narrow.matches, label: `${run.ruleset.label} Labyrinth after ${run.moves} Moves. The Trail Compass section describes this board in words.` });
  };
  narrow.addEventListener("change", draw);
  draw();

  const toggle = document.getElementById("theme");
  const label = () => { toggle.textContent = html.dataset.theme === "night" ? "Light" : "Night"; };
  toggle.addEventListener("click", () => { html.dataset.theme = html.dataset.theme === "night" ? "light" : "night"; label(); });
  label();
})();
