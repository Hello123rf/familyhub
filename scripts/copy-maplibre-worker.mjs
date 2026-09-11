// Copies MapLibre's web-worker chunk out of node_modules into public/maplibre
// at build time.
//
// Why this is needed: maplibre-gl v6 is ESM-only and locates its worker with
//   new URL('./maplibre-gl-worker.mjs', import.meta.url)
// Webpack does not preserve import.meta.url through bundling, so inside a Next
// build that resolves to the empty string, the worker is constructed against
// the current document, and it dies on load. The map then renders raster
// sources only — no vector tiles, so no water, boundaries or labels — and
// never fires an error (see the globe regression behind #412).
//
// Pointing config.WORKER_URL at a self-hosted copy is the supported escape
// hatch. maplibre-gl-worker.mjs imports ./maplibre-gl-shared.mjs relatively,
// so both files have to land in the same directory.
//
// The assets are NOT committed (gitignored); this runs on prebuild/predev.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules/maplibre-gl/dist');
const dest = path.join(root, 'public/maplibre');

const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

const missing = FILES.filter((f) => !existsSync(path.join(src, f)));
if (missing.length > 0) {
  console.error(`[copy-maplibre-worker] missing from node_modules: ${missing.join(', ')}`);
  console.error('[copy-maplibre-worker] the travel globe will not render vector tiles without these.');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const f of FILES) copyFileSync(path.join(src, f), path.join(dest, f));
console.log(`[copy-maplibre-worker] copied ${FILES.length} files to public/maplibre`);
