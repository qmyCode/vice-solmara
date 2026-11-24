// VICE SOLMARA — "Solmara Nights", a 3D open-world crime game for gta6-01 (Node 22, standard
// library only in this file): the game is this directory's game/ folder, plain static files a
// desktop browser loads offline (game/index.html and its ES modules; Three.js 0.160 vendored
// under game/vendor/, no network request), and this program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary
// the judge reads, with the vendored make.fun library.
//
// What the game is: a full 3D open world on a spline-coast island (no grid) with a bay, a
// second isle across a causeway, curved roads with a junction graph and Dijkstra GPS, 9 named
// districts and ~200 buildings. Third-person on foot and driving, carjacking, routed traffic,
// pedestrians, an 8-mission story with fixer Marina Vidal (portraits, dialogue, chapter
// cards), five weapons with real magazines (fists/pistol/SMG plus a shotgun and rifle the
// late chapters unlock), vehicle damage and a per-car condition readout feeding a pooled
// explosion system with chain reactions, a 5-star wanted system with pursuit AI whose units
// take pursuit/flanking/ramming/roadblock roles, dispatch callsigns, roadblocks from 3 stars
// and a spotlight helicopter from 4 that tags you IN SIGHT, bust and line-of-sight heat loss,
// a three-person crew with keybound abilities on cooldowns (plate swap burns a wanted star,
// quick fix restores the car's condition, eyes out marks roadblocks on the map), district
// standing that moves with missions and witnessed crimes, a respect rank ladder, health and
// armour, a minimap and full map with GPS route, a day cycle settling into neon dusk,
// 3 synthesized WebAudio radio stations with named tracks and synth SFX, and a localStorage
// save (cash, respect, story progress).
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
