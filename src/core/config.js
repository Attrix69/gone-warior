// Constantes de gameplay à l'échelle réaliste (personnage ≈ 1,82 m).
// L'ancienne version utilisait un personnage d'environ 3,8 m : portées, vitesses et
// impulsions ont été recalibrées pour garder le même rythme de jeu.

/** Échelle du squelette procédural (le rig d'origine mesurait ~3,8 m). */
export const RIG_SCALE = 0.48;

export const PHYS = {
  gravity: 22,
  jumpV: 7.2,
  doubleJumpV: 6.2,
  hardLanding: -9.5,
  run: 5.2,
  sprint: 8.2,
  block: 2.2,
  dodge: 13,
  playerRadius: 0.5,
};

/** Portée / impulsions des attaques : multiplicateurs appliqués aux valeurs d'origine. */
export const COMBAT_SCALE = { range: 0.5, lunge: 0.55, kb: 0.55, launch: 0.6 };

export const CAMERA = {
  dist: 7.2, pitch: 0.34, minPitch: 0.02, maxPitch: 1.15, height: 1.55, fov: 58,
  combatDist: 9.2, combatPitch: 0.44, sprintExtra: 1.0,
  vehicleDist: { car: 9.5, bus: 14, bike: 6.5 },
};
