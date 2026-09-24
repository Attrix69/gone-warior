// Niveaux de détail pour objets instanciés : chaque objet est rangé périodiquement
// dans le niveau correspondant à sa distance à la caméra (détaillé, simplifié, masqué).
import * as THREE from 'three';
import { scene } from '../core/renderer.js';

const ALL = [];
const _m = new THREE.Matrix4();

export class LODInstancer {
  /**
   * @param {Array<{matrix: THREE.Matrix4, color?: THREE.Color}>} items
   * @param {Array<{parts: Array<{geo, mat, colored?: boolean}>, maxDist: number, shadow?: boolean}>} levels  du plus fin au plus grossier
   */
  constructor(name, items, levels) {
    this.items = items;
    this.levels = levels.map((lv) => ({
      ...lv,
      meshes: lv.parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geo, p.mat, Math.max(1, items.length));
        im.count = 0; im.castShadow = lv.shadow ?? true; im.receiveShadow = true; im.name = `${name}:${lv.maxDist}`;
        im.frustumCulled = false; // l'ensemble couvre la ville : culling par distance à la place
        im.userData.colored = !!p.colored;
        if (p.colored) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, items.length) * 3), 3);
        scene.add(im);
        return im;
      }),
    }));
    this.last = new THREE.Vector3(1e9, 0, 0);
    ALL.push(this);
  }

  /** Recalcule les niveaux si la caméra s'est déplacée. */
  update(cam, force = false) {
    if (!force && cam.distanceToSquared(this.last) < 16) return;
    this.last.copy(cam);
    const counts = this.levels.map(() => 0);
    for (const it of this.items) {
      if (it.hidden) continue;
      const e = it.matrix.elements;
      const dx = e[12] - cam.x, dz = e[14] - cam.z;
      const dd = Math.sqrt(dx * dx + dz * dz);
      const li = this.levels.findIndex((lv) => dd < lv.maxDist);
      if (li < 0) continue;
      const lv = this.levels[li], idx = counts[li]++;
      for (const im of lv.meshes) {
        _m.copy(it.matrix);
        im.setMatrixAt(idx, _m);
        if (im.userData.colored && it.color) im.setColorAt(idx, it.color);
      }
    }
    this.levels.forEach((lv, i) => lv.meshes.forEach((im) => {
      im.count = counts[i];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }));
  }
}

/** Met à jour tous les ensembles LOD (appelé chaque image ; coût négligeable si immobile). */
export function updateLOD(camPos, force = false) {
  for (const l of ALL) l.update(camPos, force);
}
