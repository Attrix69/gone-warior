// Outil d'injection de code dans les shaders intégrés de three.js (onBeforeCompile).
import { injectGlobals } from './globals.js';

/**
 * Applique des modifications à un matériau intégré.
 * @param {THREE.Material} material
 * @param {object} p
 * @param {string} p.key               clé de cache de programme (unique par variante)
 * @param {object} [p.uniforms]         uniformes ajoutés (références partagées conservées)
 * @param {string} [p.vertexPars]       déclarations ajoutées en tête du vertex shader
 * @param {string} [p.vertexMain]       code inséré après #include <project_vertex>
 * @param {string} [p.fragmentPars]     déclarations ajoutées en tête du fragment shader
 * @param {object} [p.fragment]         { nomDuChunk: codeDeRemplacement }
 * @param {object} [p.vertex]           { nomDuChunk: codeDeRemplacement }
 */
export function patchMaterial(material, p) {
  material.onBeforeCompile = (shader) => {
    injectGlobals(shader);
    if (p.uniforms) Object.assign(shader.uniforms, p.uniforms);
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    if (p.vertexPars) vs = vs.replace('#include <common>', `#include <common>\n${p.vertexPars}`);
    if (p.vertexMain) vs = vs.replace('#include <project_vertex>', `#include <project_vertex>\n${p.vertexMain}`);
    for (const [chunk, code] of Object.entries(p.vertex || {})) vs = vs.replace(`#include <${chunk}>`, code);
    if (p.fragmentPars) fs = fs.replace('#include <common>', `#include <common>\n${p.fragmentPars}`);
    for (const [chunk, code] of Object.entries(p.fragment || {})) fs = fs.replace(`#include <${chunk}>`, code);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => p.key;
  material.needsUpdate = true;
  return material;
}
