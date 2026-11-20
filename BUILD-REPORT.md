# Vice Solmara — Build Report (rebuild #3)

**Game:** SOLMARA NIGHTS — a 3D open-world crime game set in the fictional island city of
Solmara. Original city, characters, names and music; no Rockstar IP. Playable offline in
Chrome from static files (`game/index.html`), Three.js vendored at
`game/vendor/three.module.js` (three@0.160.0, flagged vendored as expected).

Built fresh in one session from the documented design of the previous 3D build — every line
of game code authored for this entry, closing the two known gaps (mission count, intro
framing) and the cover-plume note.

## Architecture — one job per file (`game/src/`)

| File | Lines | Job |
| --- | --- | --- |
| `main.js` | ~300 | Boot, fixed-step loop (1/60), state machine (title/play/map/pause/over/shot), camera, cross-system hooks, `window.__game` test hooks |
| `rng.js` | 47 | Seeded RNG (mulberry32) + math helpers — the whole city is deterministic per seed |
| `city.js` | 347 | Spline-coast island (closed Catmull-Rom, bay pull, Isla Chica, hill, causeway deck), analytic height(), curved road network, junction graph + Dijkstra route(), 9 districts, 10 named places, building/palm/lamp placement, OBB colliders |
| `world3d.js` | 371 | Terrain mesh, road ribbons, water, sky/sun cycle settling into neon dusk, buildings with lit windows, neon signs (12 original names), place buildings with signs + doors, palms, lamps |
| `vehicles.js` | 251 | 7 vehicle types (sedan, taxi, hatch, pickup, van, sports "Águila GT" with magenta underglow, interceptor with flashing lightbar), arcade physics, OBB building collision, car–car collision, health → smoke <45 → fire <22 → explosion, wreck limp |
| `explosions.js` | 214 | Pooled fire/smoke/spark particles with a soft radial sprite, squashed-burst fireballs, flash light, instanced debris, scorch decals, plume + burn emitters so explosions develop over ~16 s, delayed chain damage |
| `traffic.js` | 122 | 11 routed traffic cars (graph routes, brake-for-ahead, recycle) + 52 parked cars (spawn rejects building footprints — see bugs) |
| `pedestrians.js` | 143 | 24 wandering pedestrians who flee danger; car hits report crimes |
| `combat.js` | 268 | Fists/pistol/SMG hitscan with tracers + muzzle flashes, ray vs cars/peds/buildings/ground, armed guards with burst fire |
| `player.js` | 220 | Rico: third-person on foot, carjacking (driver ejected as fleeing ped), driving, drive-by fire, health regen |
| `police.js` | 327 | Heat model per crime with witness gating, 5 stars, pursuit AI (prediction + graph-route fallback), foot cops, bust rules, roadblocks ≥3★, helicopter with spotlight ≥4★, line-of-sight heat loss, dispatch callsigns (GAVIOTA, HALCÓN, BRISA, MUELLE, FARO, CORAL, PALMA, VIGÍA) |
| `missions.js` | 475 | The 8-mission story (below): stage engine (goto/drive/pickup/deliver/tail/chase/shootout/escape/steal), dialogue with canvas portraits, chapter cards, gold beacons, timers, forgiving fail-reset |
| `minimap.js` | 173 | Pre-rendered island chart; corner minimap + full map with district names, legend and live GPS route |
| `hud.js` | 137 | Cash/respect/stars/health, mission panel with distance + timer, dispatch feed, bust meter, weapon slots, speedo, dialogue box with portraits, chapter cards, banners, title + poster cover treatment |
| `audio.js` | 175 | WebAudio synth: engine, distance sirens, shots, crashes, booms, doors, stings; 3 radio stations as step sequencers (ONDA FARO 98.1, RADIO BRISA 103.7, NEÓN FM 88.9; R cycles, in-car only) |
| `save.js` | 30 | localStorage save (`vice-solmara-save-v1`): cash, respect, mission progress, weapons |
| `shots.js` | 259 | The four `?shot=` staging scenes (below) |
| `index.html` | 132 | All DOM/CSS for HUD, title, dialogue, map, pause/end screens |

## The 8 story missions (fixer: Marina Vidal)

1. **First Wheels** — drive the Águila GT from Taller Marisol to the Hotel Brisa Grande. $450 / 10 respect
2. **Package for the Pier** — timed delivery, Puerto Viejo → Muelle de Carga (165 s). $600 / 12
3. **Tail the Courier** — follow Club Faro → Muelle Sur without spooking (<9 m) or losing (>58 m) him. $750 / 14 — **unlocks the SMG**
4. **Dockside Noise** — shootout with 4 dock guards at the pier, then escape to the safehouse at 2★. $950 / 18
5. **The Collector** — chase down a fleeing sports car, showroom → Jardines del Norte. $1,100 / 20
6. **Night Run to Isla Chica** — timed delivery hotel → Refugio de la Isla (230 s); picking up the luggage sets 3★. $1,400 / 24
7. **Mirador Ambush** — drive to the hilltop meet, survive a 5-guard ambush, escape to the garage at 3★. $1,750 / 28
8. **Bay of Sirens** — steal the prototype from Vitral Motors and escape to the garage at 4★. $2,600 / 40 — completes the story (end card)

Intro dialogue is framed at the **street-front Taller Marisol garage** (gap closed), with
portraits for Marina, Rico, Elías, La Tuerta and Don Aurelio drawn on canvas.

## Screenshots (all real renders of the running game, `?shot=` staging, headless Chromium)

| File | Bytes | Scene |
| --- | --- | --- |
| `1-cover.jpg` | 70,456 | Poster cover, HUD hidden: orange Águila GT front three-quarter on the east causeway at dusk, two interceptors behind it, a van exploding (developed smoke plume + fresh squashed-burst fireball + debris), helicopter spotlight raking the road, skyline, SOLMARA NIGHTS treatment + tagline |
| `2-dialogue.jpg` | 62,351 | Rico takes job 1 from Marina Vidal in front of the Taller Marisol door and neon sign, Águila GT beside them; dialogue box with portrait, chapter-1 mission panel, minimap, full HUD |
| `3-chase.jpg` | 54,650 | 4★ causeway chase at 108 km/h: roadblock interceptors in the helicopter spotlight ahead, 3-line dispatch feed, GPS minimap, speedo, mission panel |
| `4-combat.jpg` | 45,415 | On-foot SMG fight on Muelle Uno pier: a live tracer in frame, burning taxi wreck, two dock guards, debris, 3★, dispatch feed, SMG slot lit |

All four ≤ 262,144 bytes (cap), captured with zero console errors.

## Validation (all numbers from actual runs)

- **Headless play-test (CDP, real key events): 16/16 checks passed, 0 console errors.**
  Boot → title → Enter → mission 1 (chapter card → 5-line dialogue → active) → walked
  9.2 units → carjacked a parked sedan → drove (odometer 14.2 units) → exited → fired via
  the real combat path → map opened/closed → `setWanted(5)` → 4–5 police cars responded
  and the helicopter activated. World at boot: 63 vehicles, 19 pedestrians.
- **Dossier smoke:** `MAKEFUN_OUTPUT_DIR=/tmp/vice3-out node main.ts` → `dossier.json`
  478,640 bytes, schema `makefun/dossier/v1`, cover = image 0, 4 images; game payload
  19 files / 1,463,030 bytes (caps: 993 files / 50,331,648 bytes); screenshots as above.
- Every source file passes `node --check`.

## Bugs found by testing and fixed

1. **Missions never advanced** — `createMissions` never exposed its `update()` on the
   returned object, so chapter cards froze and dialogue never opened in real play
   (the play-test caught it as a thrown TypeError every frame). Fixed + re-verified.
2. **10 of 52 parked cars spawned inside building footprints** and could never move
   (measured with an OBB-overlap diagnostic). Parked placement now rejects collider
   overlaps; re-measured 0/52.
3. **Title overlay stayed up in shot mode** — `hideTitle()` used a CSS class that does
   not exist, and `stageShot` never called it. Both fixed.
4. **Explosion smoke rendered as stacked hard squares** — the particle material had no
   sprite map. Added a shared radial-gradient sprite; plume rise velocities softened.
5. **Fireball was a clean expanding sphere** (the old build's noted flaw) — now a
   vertically squashed, fainter burst; the long-lived smoke plume is the visual anchor.
6. **Dispatch lines vanished from screenshots** — they expire after 8 real seconds and
   headless captures take longer; scenes now re-post their lines when the feed runs dry.
7. Smaller staging fixes: pursuers aim at a trailing point so they no longer ram the
   hero off the road; staged cars follow road point indices so they stay on the road;
   chase hero starts at speed (108 km/h in frame); combat moved to the open pier.

## Honest remaining gaps

- **Dossier text truncation:** authored source totals ~186 KB vs the 163,840-byte dossier
  text cap. The dossier shows everything through most of `hud.js`; `audio.js` and
  `shots.js` (27,517 bytes together) are listed in the cut note but not shown in full.
  Both systems are described in `main.ts`'s header and the README; this is a text-preview
  limit, not a build failure.
- Headless SwiftShader runs the game at very low fps on this shared VM, so play-test
  timings were measured in game time; on real hardware the fixed-step loop targets 60 fps.
- The causeway deck terrain reads grass-green around the asphalt ribbon in some light;
  measured lateral offset of staged cars to the road line is 0.00 — cosmetic only.
- No manual real-hardware playthrough was possible in this environment; the full mission
  chain beyond mission 1's start is code-reviewed and uses the same stage engine the
  play-test exercised, but missions 2–8 were not played end-to-end headlessly.

## Screenshot fix (post-build, staging only)

The committed screenshots 1–2 read weak (cover sparse and flat, hero small mid-frame;
dialogue framing loose), so both were re-staged. Changes are confined to
`game/src/shots.js` — no gameplay or system code was touched. This section supersedes
the Screenshots table above for shots 1–2 (descriptions and byte sizes) and for the
byte sizes of shots 3–4.

**Shot 1 (cover)** — re-staged from the flat causeway tableau to a dusk chase on
Bulevar Costero (south shore, t=0.738):

- The hero Águila GT now drives the boulevard itself (`roadFollower` + `followRoad`,
  cruise 8) with the camera low at a true front three-quarter (offset +5.6 forward /
  +5.2 side, height +1.6, fov 60): the car fills roughly a third of the frame instead
  of sitting small in the middle distance, city buildings lining the street behind it.
- Two interceptors hold a formation behind the hero — spawn offsets behind each rear
  quarter, per-frame `driveAlong` targets, cruise matched to the hero (8.15 / 8.1 vs
  8). First attempt parked one on the hero's rear bumper: `driveAlong`'s 0.92 throttle
  overshoots a slower cruise target, so formation speeds had to be matched explicitly.
- A grey van sits spun-out on the landward shoulder ahead of the hero, set burning at
  t>0.35 and detonated at t>0.92, so the t=1.55 capture catches a developed smoke
  plume and debris field mid-frame over the hero's shoulder (the first attempt's fresh
  fireball ended ~27 units away and read as confetti).
- Helicopter repositioned to the landward rear quarter with a narrowed, dimmer cone
  (radius 8.5, opacity 0.10); its spotlight is re-aimed behind the formation
  (target (0, −29, −7), intensity 700) so the beam rakes the street instead of
  blowing out the hero. One iteration put the camera inside the cone — reverted.
- Poster title treatment and feature strip unchanged; HUD still hidden (cover mode).

**Shot 2 (dialogue)** — re-framed at the Taller Marisol forecourt:

- The Águila GT is parked on the forecourt's seaward side, swung toward the street
  (garage angle + 0.5), so its orange flank and rear deck read at frame right.
- Camera moved from (forward +7.6, side +4.4, height +2.2, fov 58) to (forward +6.2,
  side +1.6, height +1.9, fov 52), aimed at the pair: Rico and Marina stand large in
  frame under the full-width glowing TALLER MARISOL marquee instead of small figures
  in a loose frame. Dialogue box, portrait, mission panel, minimap and HUD render
  exactly as before.

**Shots 3 and 4:** staging untouched — re-captured only (byte drift is the capture
flow's settle timing).

**Honest limitation:** "lane markings visible under the car" could not be produced
within staging-only scope. Road ribbons are built at analytic height +0.14 sampled
every 6 units, but the terrain mesh is a 12.5-unit grid whose interpolation bulges
over the ribbons on any slope; street-level probes on Bulevar Costero, Anillo Medio
and inner-city roads all read grass-green at car height (the same effect the gaps
section above notes on the causeway deck). The cover therefore stages the chase in
the boulevard corridor, where the lining buildings, street lamps and parked cars
read as the street. Fixing the ribbons themselves would mean editing `world3d.js`
(gameplay-side code), which was out of scope for this fix.

**Byte sizes** (cap 262,144 each; every capture 0 console errors):

| shot | before | after |
|---|---|---|
| 1-cover.jpg | 70,456 | 66,210 |
| 2-dialogue.jpg | 62,351 | 57,106 |
| 3-chase.jpg | 54,650 | 47,958 |
| 4-combat.jpg | 45,415 | 38,538 |

**Re-verification after the fix:** headless boot → title → Enter → play → walk to
Marina → talk (E) → mission 1 chapter-card phase, 0 console errors;
`MAKEFUN_OUTPUT_DIR=/tmp/vice3-out2 node main.ts` → `dossier.json` 447,888 bytes,
schema `makefun/dossier/v1`, 4 images (cover = image 0), game payload 19 files /
1,464,420 bytes — within caps.
