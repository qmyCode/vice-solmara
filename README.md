[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/qmyCode/vice-solmara/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/qmyCode/vice-solmara/reward.svg)](https://make.fun/bounty/gta6-01)

Built for make.fun's [Make GTA 6 bounty](https://make.fun/bounty/gta6-01).

# VICE SOLMARA

An original 3D open-world crime game that runs offline in the browser from
static files. Welcome to Isla del Poniente — a curved, neon-drenched island
city with **no straight lines**: three ring avenues follow a spline
coastline (with a bay bitten out of the east shore), bowed radial streets,
old-town diagonals, a hill switchback and a causeway bridge to Isla Chica.

You are **Rico**, a new wheelman in town. Fixer **Marina Vidal** — "the
phone that rings" — has **8 story missions** for you: deliveries, courier
chases, guard shootouts, a timed causeway run, and heat escapes up to a
five-star finale.

## What's in the city

- **Open world, on foot and behind the wheel** — steal parked cars or
  carjack moving traffic; seven vehicle types from the Pico hatchback to
  the Águila GT with neon underglow.
- **5-star SMPD wanted system** — predictive pursuit AI, a live dispatch
  panel (callsigns, distances, tactics), roadblocks at 3+ stars, a
  spotlight helicopter at 4+ stars, live fire at 5. Lose the heat by
  breaking line of sight; the minimap shows the red search zone.
- **Real explosions** — vehicle health, fireballs, debris, shockwaves,
  scorch marks, burning wrecks and chain reactions.
- **A living city** — routed traffic AI on a GPS road graph (Dijkstra),
  wandering pedestrians who flee danger, ~234 buildings across 9 named
  districts, original neon signage (Club Faro, Café Neón, Disco Brisa…),
  palms, street lamps and a day cycle that settles into golden-hour dusk.
- **Systems** — GPS minimap + full island chart (M), 3 synthesized
  WebAudio radio stations, engine/siren/gunfire audio, cash + respect
  progression, localStorage save.

## Controls

WASD drive / walk · E enter cars & advance dialogue · F shoot ·
Shift sprint · 1/2/3 weapons · R radio · M map · Esc close map

## Tech

Three.js (vendored in `game/vendor/`), zero build step, zero network.
`main.ts` packages `game/` + `screenshots/` into the competition dossier;
serve the folder statically and open `game/index.html` to play.
