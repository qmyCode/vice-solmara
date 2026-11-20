# Vice Solmara — *Solmara Nights*

[![Make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/qmyCode/vice-solmara/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/qmyCode/vice-solmara/reward.svg)](https://make.fun/bounty/gta6-01)

A 3D open-world crime game that runs entirely offline in the browser from static files.
You are Rico, a driver new to Solmara — a spline-coast island city (no grid) with a bay cut
into its east shore, a hill district, a working harbour and a second isle across the
causeway. Fixer **Marina Vidal** has eight jobs for you, and the whole island — traffic,
pedestrians, and a police force with a long memory — reacts to how you drive them.

Built with Three.js (vendored under `game/vendor/`, no network requests, no build step).
Run it with `node serve.ts` and open http://localhost:8080, or just open `game/index.html`
from any static host.

## The world

- Island generated from a closed Catmull-Rom coastline spline; terrain height is analytic,
  so mesh, roads and physics share one ground truth
- Curved road network — coastal boulevard, two ring roads, bowed radials, old-town
  diagonals, a hill switchback, harbour piers and the Calzada del Este causeway — with a
  junction graph and Dijkstra GPS routing
- 9 named districts (Puerto Viejo, Centro Neón, Bulevar del Sol, Colina Alta, Muelle Sur,
  Playa Serena, Bahía Este, Jardines del Norte, Isla Chica), ~200 buildings, palms, lamps,
  neon signs with original names, and a day cycle that settles into neon dusk

## Systems

- **Story:** 8 missions — delivery, tail, chase, shootout, steal and escape stages — with
  dialogue, canvas-drawn character portraits and chapter cards
- **Driving & crime:** 7 car types, carjacking (drivers get dragged out), routed traffic AI,
  parked cars everywhere, vehicle health → fire → explosion with debris, scorch marks and
  chain reactions
- **Police:** 5-star wanted model fed by witnessed crimes; pursuit AI with prediction,
  dispatch radio with callsigns and district names, roadblocks from 3 stars, a spotlight
  helicopter from 4, foot cops and busts, and heat that bleeds off only when nobody has
  eyes on you
- **Combat:** fists, pistol and SMG (unlockable), hitscan tracers, armed guards
- **Presentation:** minimap + full map with GPS route, HUD with cash/respect/stars/weapon
  slots/speedo/dispatch feed, 3 synthesized WebAudio radio stations plus synth SFX, and a
  localStorage save (cash, respect, story progress, weapons)

## Controls

| Input | Action |
| --- | --- |
| WASD | Move / drive |
| Shift | Run |
| F or E | Enter/exit car · talk · take a job · advance dialogue |
| Mouse (click to lock) | Look / aim |
| Mouse button or J | Shoot |
| 1 / 2 / 3 | Fists / pistol / SMG |
| Space | Brake |
| M | Full map |
| R | Radio station |
| P or Esc | Pause |

## Layout

- `main.ts` — the hand-in program: copies `game/` + `screenshots/` to the output directory
  and writes `dossier.json` with the vendored make.fun library
- `game/src/` — one job per module: `rng`, `city` (map data + GPS), `world3d` (Three.js
  scene), `vehicles`, `traffic`, `pedestrians`, `combat`, `explosions`, `player`, `police`,
  `missions`, `minimap`, `hud`, `audio`, `save`, `shots` (screenshot staging), `main`
- `screenshots/` — four real renders of the running game (cover, dialogue, chase, combat)
