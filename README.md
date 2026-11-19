# VICE SOLMARA

An original 3D open-world crime game that runs in a desktop browser from static files — no
build step, no network. You are Rico, a new wheelman on Isla del Poniente, a sun-soaked island
city drawn entirely from curves: a spline coastline with a bay bitten out of its east shore, a
second isle across a causeway, and 21 roads without a single straight grid line.

## Play it

```
node serve.ts        # serves game/ on http://localhost:8080
```

Open the page, press **Continuar**, and drive to the gold beacon.

## What's in the city

- **A natural map** — coast boulevard hugging the shoreline, two ring roads, eight bowed
  radials, old-town diagonals, a hill switchback to the Mirador, a harbour avenue and the
  Calzada del Este causeway to Isla Chica. 234 buildings, 9 named districts, a GPS graph that
  provably reaches every junction.
- **Eight story missions** for fixer Marina Vidal: timed deliveries, a stolen-car recovery, a
  four-gate boulevard race, warehouse shootouts against guards who shoot back, a paper-bag van
  chase, a cross-causeway debt run, a four-star manhunt, and a finale at the port. Dialogue
  with drawn portraits, chapter cards, cash and respect rewards — then endless courier work.
- **The SMPD** — a five-star wanted system with predictive pursuit steering, a live dispatch
  feed (callsigns, tactics, distances), roadblocks from three stars, a helicopter with a
  spotlight from four that opens fire at five, bust pressure, and heat that cools only when
  nobody can see you.
- **Cars and violence** — seven vehicle types to steal and drive (including the Águila GT with
  neon underglow), fists/pistol/SMG, damage, fires, and real explosions with debris, scorch
  marks, burning wrecks and chain reactions.
- **The dressing** — golden-hour light that settles into neon dusk, glowing windows, 14 neon
  signs with original names, three synthesized radio stations, a corner minimap and a full map
  with GPS routing, and a localStorage save.

## Controls

| Keys | Action |
| --- | --- |
| W A S D | Drive / walk |
| Mouse | Camera (click the game for pointer lock); left button fires |
| E | Enter/exit a car, advance dialogue |
| 1 · 2 · 3 | Fists · pistol · SMG |
| Shift / Space | Sprint / handbrake |
| R | Next radio station (in a car) |
| M | Full map |
| Esc | Pause |

## Layout

- `main.ts` — hands the entry in (copies `game/` + `screenshots/`, writes `dossier.json`).
- `game/index.html` — the page, HUD DOM and all styling, including the poster title treatment.
- `game/src/` — one module per job: `city` (map data + GPS), `world3d` (the visible world),
  `vehicles`, `traffic`, `pedestrians`, `player`, `police`, `missions`, `combat`,
  `explosions`, `minimap`, `hud`, `audio`, `save`, `shots` (screenshot staging), `main`.
- `game/vendor/three.module.js` — Three.js 0.160, vendored so the game runs fully offline.
