// Extrait les assets binaires utilisés par le jeu vers public/assets.
// - Normal maps CC0 du paquet @pmndrs/assets (base64 → .webp)
// - Panorama de Lyon d'origine (encodé en base64 dans l'index.html historique du projet)
// Usage : npm run assets   (le résultat est versionné, le build n'en dépend pas)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => { const f = join(root, 'public/assets', p); mkdirSync(dirname(f), { recursive: true }); return f; };

const NORMALS = { '0007': 'water-waves', '0018': 'fabric-weave', '0020': 'skin-pores' };
for (const [id, name] of Object.entries(NORMALS)) {
  const src = readFileSync(join(root, `node_modules/@pmndrs/assets/normals/${id}.webp.js`), 'utf8');
  const b64 = src.match(/base64,([A-Za-z0-9+/=]+)/)[1];
  writeFileSync(out(`textures/normals/${name}.webp`), Buffer.from(b64, 'base64'));
  console.log(`normal ${id} → textures/normals/${name}.webp`);
}

// Panorama : commit 966775f = version d'origine du jeu (fichier unique).
const legacy = execSync('git show 966775f:index.html', { cwd: root, maxBuffer: 64 << 20 }).toString();
const pano = legacy.match(/pano:"data:image\/webp;base64,([A-Za-z0-9+/=]+)"/)[1];
writeFileSync(out('textures/lyon-skyline.webp'), Buffer.from(pano, 'base64'));
console.log('panorama → textures/lyon-skyline.webp');
