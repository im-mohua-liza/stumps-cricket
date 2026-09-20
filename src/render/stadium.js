import * as THREE from 'three';
import { ROPE_R } from '../match/physics.js';

// Tiered stands, instanced animated crowd and floodlight towers.
export function buildStadium(scene, { quality = 'high' } = {}) {
  const inner = ROPE_R + 4, tiers = 3, tierH = 4.2, tierD = 5.5;
  const standMat = new THREE.MeshStandardMaterial({ color: 0x5b6b7a, roughness: 0.9, side: THREE.DoubleSide });
  const rows = [];
  for (let t = 0; t < tiers; t++) {
    const r0 = inner + t * tierD, r1 = r0 + tierD, y0 = 1.2 + t * tierH, y1 = y0 + tierH * 0.9;
    // sloped seating deck
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 96, 1, true), standMat);
    deck.position.y = (y0 + y1) / 2; scene.add(deck);
    rows.push({ r0, r1, y0, y1 });
  }
  const roof = new THREE.Mesh(new THREE.RingGeometry(inner + tiers * tierD - 1, inner + tiers * tierD + 8, 96),
    new THREE.MeshStandardMaterial({ color: 0x2b3742, side: THREE.DoubleSide }));
  roof.rotation.x = -Math.PI / 2; roof.position.y = 1.2 + tiers * tierH + 3; scene.add(roof);

  // Crowd: one instanced mesh, animated in the vertex shader by an excitement uniform
  const perTier = quality === 'low' ? 700 : 1800;
  const count = perTier * tiers;
  const geo = new THREE.CapsuleGeometry(0.28, 0.5, 2, 5);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0.15 } };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uExcite = uniforms.uExcite;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uExcite;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 1.3;
        transformed.y += (0.5 + 0.5 * sin(uTime * (5.0 + uExcite * 6.0) + ph)) * (0.06 + 0.45 * uExcite);`);
  };
  const crowd = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  const palette = ['#e63946', '#2f6bff', '#ffd23f', '#ffffff', '#1fae6b', '#8e44ff', '#f4a261', '#264653'];
  let i = 0;
  rows.forEach(({ r0, r1, y0, y1 }) => {
    for (let k = 0; k < perTier; k++) {
      const a = (k / perTier) * Math.PI * 2 + Math.random() * 0.02;
      const f = Math.random(); const r = r0 + f * (r1 - r0) - 0.3; const y = y0 + f * (y1 - y0) + 0.55;
      m.makeTranslation(Math.sin(a) * r, y, Math.cos(a) * r);
      crowd.setMatrixAt(i, m); crowd.setColorAt(i, col.set(palette[Math.floor(Math.random() * palette.length)])); i++;
    }
  });
  crowd.instanceMatrix.needsUpdate = true; crowd.instanceColor.needsUpdate = true; crowd.frustumCulled = false;
  scene.add(crowd);

  // Floodlight towers
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x9aa5ae });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
  const R = inner + tiers * tierD + 10;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const g = new THREE.Group(); g.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 46, 8), towerMat); pole.position.y = 23; g.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 1.2), towerMat); head.position.y = 47; g.add(head);
    const lamps = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.3), lampMat); lamps.position.set(0, 47, 0.7); g.add(lamps);
    g.lookAt(0, 20, 0); scene.add(g);
  }
  return {
    update(dt, excite) {
      uniforms.uTime.value += dt;
      uniforms.uExcite.value += (excite - uniforms.uExcite.value) * Math.min(1, dt * 2);
    },
  };
}
