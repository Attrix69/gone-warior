# Gone Warrior — La Gniac du Gone

Jeu d'action 3D à la troisième personne dans un Lyon fictif, jouable dans le
navigateur (Chrome, Edge, Firefox, Safari récents ; ordinateur et mobile).
Rendu Three.js (WebGL 2) avec matières PBR, ciel physique, cycle jour/nuit,
météo, ombres, occlusion ambiante et post-traitement cinéma.

> Fiction humoristique : cette Lyon et ses bandes rivales sont entièrement
> imaginaires.

## Lancer le jeu

```bash
npm install
npm run dev        # serveur de développement → http://localhost:5173
npm run build      # build de production dans dist/
npm run preview    # sert dist/ → http://localhost:4173
npm run test:smoke # test de fumée automatisé (Chromium) sur le build
```

Le build est statique (`base: './'`) : `dist/` peut être servi depuis
n'importe quel hébergement, y compris un sous-dossier.

### GitHub Pages

Le workflow `.github/workflows/deploy.yml` construit et publie le jeu à chaque
push sur `main`. À activer une fois dans le dépôt : **Settings → Pages →
Source : GitHub Actions**.

## Commandes

| Action | Clavier / souris | Tactile |
|---|---|---|
| Se déplacer | ZQSD ou WASD | pouce gauche |
| Caméra | souris (clic pour capturer), flèches | glisser à droite |
| Poing / pied | clic gauche ou J / clic droit ou K | boutons |
| Sauter (double saut au niv. 5) | Espace | bouton |
| Esquiver | L | bouton |
| Garde (parade juste avant l'impact → contre-attaque) | B | bouton |
| Sprint | Maj | bouton |
| Gniac (jauge pleine) | G | bouton |
| Lancer l'objet | T | bouton |
| Changer d'objet | E | case objet |
| Saisir / jeter un adversaire | C | bouton |
| Monter / descendre d'un véhicule | V | bouton |
| Tirer / recharger / changer d'arme | F / R / X | boutons, barre d'armes |
| Carte / pause | M / Échap | boutons en haut |

## Organisation du code

```
src/
  core/     moteur : renderer et qualité, état partagé, entrées, caméra, config
  render/   matières PBR procédurales, atmosphère (ciel, soleil, brouillard), post-traitement, shaders
  world/    ville : plan, bâtiments, sol, eau, monuments, mobilier, végétation, véhicules, passants, oiseaux, LOD, collisions
  player/   personnage (squelette skinné) et contrôleur du joueur
  anim/     animation procédurale des personnages
  enemy/    ennemis et IA (perception, recherche, encerclement, jetons d'attaque, garde, esquive)
  combat/   corps à corps et combos, objets, armes à feu, dégâts
  vfx/      particules, décalques, météo
  audio/    sons, musique et ambiances synthétisés (WebAudio)
  systems/  missions, progression, ramassables, sauvegarde
  ui/       HUD, écrans, styles
tools/      outils de développement (extraction d'assets, labos de textures et de scène)
tests/      test de fumée Playwright
docs/       provenance des assets et emplacements prévus
```

Les assets présents, leur licence et les emplacements prévus pour des modèles,
animations, HDRI et sons réels sont décrits dans [docs/ASSETS.md](docs/ASSETS.md).

La sauvegarde (`localStorage`, clé `gonewarrior.save.v3`) reste compatible avec
les parties de la version d'origine.
