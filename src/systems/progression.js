// Progression : expérience, montées de niveau, statistiques et déblocages.
import { P, unlocked } from '../core/state.js';
import { groundH } from '../world/layout.js';
import { sfx } from '../audio/audio.js';
import { ring, burst, floatTxt } from '../vfx/effects.js';
import { toast } from '../ui/hud.js';
import { save } from './save.js';

export function addXP(n) {
  P.xp += n;
  floatTxt(P.x, P.y + 2.3, P.z, `+${n} XP`, '#ffd98a', 12);
  while (P.xp >= P.xpNext) {
    P.xp -= P.xpNext; P.lvl++; P.xpNext = Math.round(P.xpNext * 1.32);
    P.hpMax += 12; P.hp = P.hpMax; P.str += 0.1; P.spd += 0.035; P.def += 0.07; P.gn += 0.1;
    sfx('lvl');
    toast(`NIVEAU ${P.lvl}`, 1500);
    ring(P.x, groundH(P.x, P.z) + 0.3, P.z, 0xffd166, 14, 0.8, true);
    burst(P.x, P.y + 1, P.z, 0xffd166, 20, 1.3);
    const later = (msg, d = 2800) => setTimeout(() => toast(msg, d), 1400);
    if (P.lvl === 2 && !unlocked.combo3) { unlocked.combo3 = true; later('DÉBLOQUÉ : POING → PIED → PIED = COUP DE TÊTE EXTRÊME'); }
    if (P.lvl === 3 && !unlocked.patate) { unlocked.patate = true; later('DÉBLOQUÉ : PIED → PIED → POING = PATATE LYONNAISE'); }
    if (P.lvl === 4 && !unlocked.dash2) { unlocked.dash2 = true; later('ESQUIVE AMÉLIORÉE', 1600); }
    if (P.lvl === 5) later('DÉBLOQUÉ : DOUBLE SAUT', 1600);
    if (P.lvl === 6 && !unlocked.gniacFast) { unlocked.gniacFast = true; later('GNIAC : RECHARGE ACCÉLÉRÉE', 1800); }
  }
  save();
}
