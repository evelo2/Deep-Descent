# Deep Descent — Build Roadmap (2026-08-19)

User-set order: **1) Salvage Log → 2) Mini-sub (deep-dive) → 3) Whirlpool → 4) PCG stages.**
Build incrementally, push playable milestones ("test as you go"), advise + compress.

Specs/designs (memory + docs): `meta-progression-design`, `special-levels-design`,
`pcg-stages-design`; spec `docs/superpowers/specs/2026-08-19-salvage-log-meta-progression-design.md`.

---

## Cross-cutting compression (build once, reuse across the roadmap)

These are the levers that make the whole roadmap smaller than the sum of its parts:

- **C1 · Shared special-zone scaffold.** The whale belly, temple, and platformer stage
  already share the enter/exit pattern (snapshot the reef → generate a zone → restore
  on exit → consume the one-shot entrance: `_enterWhale`/`_enterTemple`/`_enterStage`
  + `_snapshotReef`/`_restoreReef`). The **mini-sub abyss** and the **whirlpool** are
  new special zones → build them on this SAME scaffold instead of reinventing entry/exit.
- **C2 · Black Pearl = one universal Salvage source.** Build the Black Pearl collectible
  once (Salvage Log Phase 4), then REUSE it as loot in the mini-sub abyss and as the
  whirlpool's speed-break reward — so the meta currency and the special zones reinforce
  each other with no new reward plumbing.
- **C3 · Relic/Salvage reuse.** The whirlpool "relics at speed breaks" and any special-
  zone rewards feed the **already-built** Salvage Log meta module (`src/meta/*`). New
  zones just call `this.meta` / award Salvage — no second progression system.
- **C4 · Traversal harness → PCG validator.** The real-physics traversal harness already
  exists; the PCG work generalizes it into a solver rather than building a validator from
  scratch.
- **C5 · Air-drain multiplier reuse.** The mini-sub's 150%-on-foot penalty reuses the
  existing per-reef `oxyMult` air-drain path with an extra flag — not a new system.

---

## 1. Salvage Log — Phases 4–6 (IN PROGRESS; P1–3 live)

- **P4 · Black Pearls** — rare collectible (1–2/reef, deep/guarded), bank → Salvage;
  counts on the run-end payout. *(→ reused by C2 in the mini-sub + whirlpool.)*
- **P5 · Full relic pool (~10) + effects** — implement the remaining relics (sonar,
  barbed harpoon, second wind, chum ward, salvager's eye, …) + their hooks.
- **P6 · Balance + polish** — earn rates, relic/slot costs, HUD "equipped" readout,
  save-version safety, docs.

## 2. Mini-sub / Deep-dive abyss (#4)

- New special zone (C1) reached via a reef entrance: an **extreme-depth** area with rich
  loot + Black Pearls (C2).
- On foot: **150% air drain** (C5). Near the entrance, a **buyable mini-sub** (gold);
  once bought, usable the rest of that reef — **enter it like a station** and, while
  piloting, the pressure penalty is off (normal/low drain); **exit by ascending to the
  entrance**. Sub = a piloted vehicle (bigger/tougher body, different movement).
- COMPRESS: reuse the shop-purchase pattern for buying the sub; reuse station enter/exit
  for boarding; reuse the zone snapshot/restore.

## 3. Whirlpool survival level (#5)

- New special zone (C1): the diver is **swept along at increasing speed**; steer to dodge
  obstacles + grab bubbles (air) and loot; **hit an obstacle OR run out of air → exit,
  NO life lost** (it just ends the level). Stay-alive-as-long-as-you-can.
- **Speed breaks award Salvage-Log relics/Salvage** (C3) + high score; collected loot
  banks on exit.
- COMPRESS: reuse the zone scaffold + the meta module for rewards; the "sweep" is a
  strong current (reuse `CURRENT`/current-apply, ramped).

## 4. PCG platformer stages

- Replace hand-authored stage rooms with generated ones (keep a few as chunk seeds).
- (a) **Generalize the traversal harness into a real SOLVER** (A*/BFS over walk/climb/
  fall/jump reachability; "can spawn reach exit AND cache without death?") — C4.
- (b) **Constructive chunk generator** — stitch rooms from validated segments per the
  ladder-traversal contract; difficulty by reef.
- (c) **Generate-and-test** — generate → solve → reject+regenerate if unsolvable.

---

## Advice

- Do **Salvage Log P4 (Black Pearls) before the mini-sub/whirlpool** so C2 lands once and
  both zones inherit it — avoids building the collectible twice.
- The mini-sub and whirlpool should share a small **special-zone helper** (C1) extracted
  during the mini-sub build, so the whirlpool is mostly content + its sweep mechanic.
- Keep each as its own spec/plan at build time; ship playable milestones per phase.
