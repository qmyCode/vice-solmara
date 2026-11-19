// VICE SOLMARA — a complete 3D open-world crime game for gta6-01 (Node 22, standard library
// only). The game is this directory's game/ folder: plain static files a desktop browser loads
// offline — game/index.html, its ES modules under game/src/, and Three.js vendored under
// game/vendor/ — and this program hands it in: it copies game/ and screenshots/ from beside
// this file to /output and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library.
//
// What the game is: an original island city drawn entirely from curves (a Catmull-Rom
// coastline with a bay, a second isle across a causeway, 21 roads and not one straight grid
// line), explored on foot and by car with living traffic and pedestrians. Eight story missions
// for fixer Marina Vidal — timed deliveries, a stolen-car recovery, a boulevard race, port and
// club shootouts against guards who shoot back, a four-star manhunt, a finale — with dialogue
// and portraits. A five-star SMPD response: predictive pursuit, a dispatch feed with callsigns,
// tactics and distances, roadblocks from three stars, a helicopter with a spotlight from four
// (it opens fire at five), and heat that only cools out of sight. Fists, pistol and SMG;
// carjacking; cars that burn and explode with chain damage; neon signage; a minimap and a full
// map with GPS routing; three synthesized radio stations; cash and respect progression; and a
// localStorage save. Every module under game/src/ does one job and is named for it.
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

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others
// refuse an entry the scorer would refuse (more than 4 screenshots or one over 256 KiB; more
// than 993 files in game/ or 48 MiB of game files, in all, or a path under game/ over 1000
// bytes: game/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
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
