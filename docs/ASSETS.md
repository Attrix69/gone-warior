# Assets — provenance, emplacements prévus, manques

Le jeu ne référence **aucun fichier inexistant**. Tout ce qui n'est pas listé
comme « présent » ci-dessous est produit par le code : textures PBR procédurales
cuites sur le GPU au chargement, sons synthétisés en WebAudio, modèles 3D
construits en géométrie. Chaque emplacement prévu pour un asset réel est
indiqué, avec ce qu'il faut y déposer.

## Présents dans le dépôt

| Fichier | Rôle | Provenance / licence |
|---|---|---|
| `public/assets/textures/lyon-skyline.webp` | Panorama lointain de Lyon (horizon, répété 4×) | Asset d'origine du jeu (extrait de l'`index.html` historique, commit `966775f`) |
| `public/assets/textures/normals/water-waves.webp` | Normal map de l'eau (Saône, Rhône, lac) | [pmndrs/assets](https://github.com/pmndrs/assets), normal `0007`, **CC0** |
| `public/assets/textures/normals/fabric-weave.webp` | Grain des tissus (vêtements, auvents) | pmndrs/assets, normal `0018`, **CC0** |
| `public/assets/textures/normals/skin-pores.webp` | Micro-relief de la peau | pmndrs/assets, normal `0020`, **CC0** |
| Polices Barlow Condensed, Inter | Interface | [Fontsource](https://fontsource.org), **SIL OFL 1.1** (paquets npm, intégrées au build) |

`npm run assets` régénère ces fichiers depuis leurs sources.

## Générés par le code (aucun fichier)

- **Matières PBR** (`src/render/texgen.js`, `src/render/glsl/surfaces.glsl.js`) :
  asphalte, dalles, pavés, enduit, pierre de taille, tuiles, zinc, ardoise,
  béton, herbe, gravier, bois, peinture, rouille, tissu. Albédo + normale + ORM
  (occlusion, rugosité, métal), bruit périodique donc répétition sans couture,
  résolution selon la qualité (256 / 512 / 1024 px).
- **Ciel, soleil, lune, étoiles, nuages, brouillard de hauteur, reflets
  d'environnement** (`src/render/atmosphere.js`) : aucun HDRI.
- **Sons et musique** (`src/audio/audio.js`) : synthèse WebAudio (impacts,
  pas selon la surface, tirs, explosions, ambiance urbaine, vent, pluie).
- **Personnages** (`src/player/rig.js`) : squelette + maillage skinné procédural.

## Emplacements prévus pour des assets réels (à fournir)

Aucun de ces fichiers n'est chargé aujourd'hui : le code ne les réclame pas,
il n'y a donc ni erreur 404 ni fausse référence. Ils sont la prochaine marche
vers le photoréalisme ; leur branchement est prévu dans les modules indiqués.

| Emplacement | Contenu attendu | Module qui le chargera | Sources CC0 / libres suggérées |
|---|---|---|---|
| `public/assets/characters/gone.glb` | Personnage réaliste riggé (squelette humanoïde type Mixamo), ≤ 25 k triangles, textures 2K (albédo, normale, ORM) | `src/player/rig.js` | Quaternius *Universal Base Characters* (CC0), Kenney, personnage Mixamo exporté par l'auteur |
| `public/assets/characters/anims.glb` | ~20 animations : idle, marche, course, sprint, saut, atterrissage, esquive, garde, 4 coups de poing, 3 coups de pied, prise, lancer, touché, K.O., relevé | `src/anim/` | Quaternius *Universal Animation Library* (CC0) |
| `public/assets/hdri/*.hdr` | Ciels HDRI (jour, couchant, nuit) pour un éclairage d'environnement photographique | `src/render/atmosphere.js` | [Poly Haven](https://polyhaven.com/hdris) (CC0) |
| `public/assets/textures/pbr/<surface>/` | Jeux PBR scannés (albedo, normal, ORM) pour remplacer les matières procédurales | `src/render/materials.js` | Poly Haven, ambientCG (CC0) |
| `public/assets/audio/*.ogg` | Impacts (poing, pied, métal, verre), pas (asphalte, pavés, herbe, gravier), ambiance ville, pluie, foule | `src/audio/audio.js` | Freesound (filtre CC0), Kenney *Impact Sounds* (CC0), Sonniss GDC (libre de droits) |
| `public/assets/models/props/*.glb` | Mobilier urbain détaillé (lampadaire lyonnais, banc, kiosque, voitures) | `src/world/props.js`, `src/world/vehicleModels.js` | Kenney *City Kit* (CC0), Quaternius (CC0) |

Règles à respecter en ajoutant un asset :

1. licence compatible (CC0 de préférence), consignée dans le tableau ci-dessus ;
2. glTF binaire (`.glb`) compressé (Draco ou meshopt) et textures KTX2/WebP ;
3. chargement asynchrone, avec retour au rendu procédural si le fichier manque ;
4. budget : ≤ 25 k triangles par personnage, ≤ 2K par texture de personnage.
