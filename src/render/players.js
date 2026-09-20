import * as THREE from 'three';

// Low-poly humanoid rig with procedural animation. Faces local +z; rotate group.rotation.y to turn.
const SKINS = [0xf0c6a0, 0xd9a273, 0xa8744a, 0x6f4a2f];
const geo = {
  head: new THREE.SphereGeometry(0.13, 12, 10),
  torso: new THREE.BoxGeometry(0.42, 0.56, 0.24),
  hips: new THREE.BoxGeometry(0.36, 0.2, 0.22),
  thigh: new THREE.CapsuleGeometry(0.075, 0.36, 3, 6),
  shin: new THREE.CapsuleGeometry(0.06, 0.36, 3, 6),
  upperArm: new THREE.CapsuleGeometry(0.055, 0.22, 3, 6),
  foreArm: new THREE.CapsuleGeometry(0.05, 0.22, 3, 6),
  bat: new THREE.BoxGeometry(0.11, 0.8, 0.05),
  batHandle: new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6),
  pad: new THREE.BoxGeometry(0.13, 0.4, 0.12),
  helmet: new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
  hat: new THREE.CylinderGeometry(0.17, 0.2, 0.06, 12),
};
const mats = {};
const mat = (c) => mats[c] || (mats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));

export function createPlayer({ shirt = 0x2f6bff, pants = 0xffffff, skin = 0, batter = false, umpire = false, hat = true, left = false } = {}) {
  const root = new THREE.Group();
  const skinMat = mat(SKINS[skin % SKINS.length]);
  const shirtMat = mat(umpire ? 0xf4f4f4 : shirt), pantMat = mat(umpire ? 0x222831 : pants);
  const add = (parent, g, m, x = 0, y = 0, z = 0, shadow = true) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; parent.add(o); return o; };

  const hips = new THREE.Group(); hips.position.y = 0.98; root.add(hips);
  add(hips, geo.hips, pantMat, 0, 0, 0);
  const torso = new THREE.Group(); torso.position.y = 0.1; hips.add(torso);
  add(torso, geo.torso, shirtMat, 0, 0.3, 0);
  const head = add(torso, geo.head, skinMat, 0, 0.74, 0);
  if (batter) add(head, geo.helmet, mat(0x1b2a41), 0, 0.02, 0);
  else if (umpire || hat) add(head, geo.hat, mat(umpire ? 0xf4f4f4 : shirt), 0, 0.1, 0);

  const limb = (parent, x, y, upG, lowG, upM, loM, lowY) => {
    const up = new THREE.Group(); up.position.set(x, y, 0); parent.add(up);
    add(up, upG, upM, 0, -lowY * 0.5, 0);
    const lo = new THREE.Group(); lo.position.y = -lowY; up.add(lo);
    add(lo, lowG, loM, 0, -lowY * 0.5, 0);
    return { up, lo };
  };
  const legL = limb(hips, -0.1, -0.05, geo.thigh, geo.shin, pantMat, pantMat, 0.44);
  const legR = limb(hips, 0.1, -0.05, geo.thigh, geo.shin, pantMat, pantMat, 0.44);
  const armL = limb(torso, -0.27, 0.52, geo.upperArm, geo.foreArm, shirtMat, skinMat, 0.26);
  const armR = limb(torso, 0.27, 0.52, geo.upperArm, geo.foreArm, shirtMat, skinMat, 0.26);
  if (batter) { add(legL.lo, geo.pad, mat(0xf5f5f5), 0, -0.2, 0.03); add(legR.lo, geo.pad, mat(0xf5f5f5), 0, -0.2, 0.03); }

  // Bat lives on the batter's top hand
  let bat = null;
  if (batter) {
    bat = new THREE.Group(); const hand = left ? armL.lo : armR.lo; hand.add(bat);
    bat.position.set(0, -0.28, 0.02);
    add(bat, geo.batHandle, mat(0x222222), 0, 0.12, 0); add(bat, geo.bat, mat(0xd9b779), 0, -0.4, 0);
  }
  const p = { root, hips, torso, head, legL, legR, armL, armR, bat, anim: 'idle', t: 0, base: 0, facing: 0, speed: 0, dir: 1, left };
  root.userData.rig = p;
  return p;
}

export function setAnim(p, name, opts = {}) {
  if (p.anim === name && !opts.force) return;
  p.anim = name; p.t = 0; p.dir = opts.dir ?? 1; p.speed = opts.speed ?? 1;
}

const lerp = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));
const ease = u => u * u * (3 - 2 * u);

function reset(p) {
  p.hips.position.y = 0.98; p.hips.rotation.set(0, 0, 0); p.torso.rotation.set(0, 0, 0); p.head.rotation.set(0, 0, 0);
  for (const l of [p.legL, p.legR, p.armL, p.armR]) { l.up.rotation.set(0, 0, 0); l.lo.rotation.set(0, 0, 0); }
  p.root.rotation.x = 0; p.root.rotation.z = 0;
  if (p.bat) p.bat.rotation.set(0, 0, 0);
}

export function updatePlayer(p, dt) {
  p.t += dt; const t = p.t; reset(p);
  const { hips, torso, legL, legR, armL, armR } = p;
  switch (p.anim) {
    case 'idle': {
      const b = Math.sin(t * 2) * 0.02; torso.rotation.x = 0.05 + b; armL.up.rotation.z = 0.12; armR.up.rotation.z = -0.12; break;
    }
    case 'ready': { // fielder crouch
      hips.position.y = 0.88; torso.rotation.x = 0.35; legL.up.rotation.x = -0.5; legL.lo.rotation.x = 0.7; legR.up.rotation.x = -0.5; legR.lo.rotation.x = 0.7;
      armL.up.rotation.x = -0.5; armR.up.rotation.x = -0.5; armL.up.rotation.z = 0.2; armR.up.rotation.z = -0.2; break;
    }
    case 'stance': { // batter waiting: side-on, knees soft, bat grounded
      hips.position.y = 0.92; torso.rotation.x = 0.28; torso.rotation.y = 0.5;
      legL.up.rotation.x = -0.3; legL.lo.rotation.x = 0.4; legR.up.rotation.x = -0.3; legR.lo.rotation.x = 0.4;
      armL.up.rotation.x = -0.5; armR.up.rotation.x = -0.45; armL.lo.rotation.x = -0.6; armR.lo.rotation.x = -0.6;
      if (p.bat) p.bat.rotation.x = 0.25 + Math.sin(t * 5) * 0.04; break;
    }
    case 'backlift': { // bat raised as ball is delivered
      const u = ease(t / 0.35);
      hips.position.y = 0.9; torso.rotation.x = 0.3; torso.rotation.y = 0.5;
      armL.up.rotation.x = lerp(-0.5, -2.1, u); armR.up.rotation.x = lerp(-0.45, -2.0, u); armL.lo.rotation.x = -0.9; armR.lo.rotation.x = -0.9;
      legL.up.rotation.x = -0.3; legR.up.rotation.x = -0.3; legL.lo.rotation.x = 0.4; legR.lo.rotation.x = 0.4; break;
    }
    case 'swing': { // dir: +1 off side, -1 leg side
      const u = ease(t / (0.32 / p.speed)); const d = p.dir;
      hips.position.y = 0.9; torso.rotation.y = lerp(0.5, -0.9 * d, u); torso.rotation.x = 0.3 - 0.15 * u;
      armL.up.rotation.x = lerp(-2.1, 0.4, u); armR.up.rotation.x = lerp(-2.0, 0.4, u); armL.up.rotation.z = lerp(0, -0.5 * d, u); armR.up.rotation.z = lerp(0, -0.5 * d, u);
      armL.lo.rotation.x = -0.4; armR.lo.rotation.x = -0.4;
      legL.up.rotation.x = lerp(-0.3, -0.6, u); legL.lo.rotation.x = 0.7; legR.up.rotation.x = -0.2; legR.lo.rotation.x = 0.3;
      if (t > 0.32 / p.speed) { armL.up.rotation.x = 0.9; armR.up.rotation.x = 0.9; armL.up.rotation.z = -0.9 * d; armR.up.rotation.z = -0.9 * d; } break;
    }
    case 'defend': {
      const u = ease(t / 0.25); hips.position.y = 0.9; torso.rotation.x = 0.4; torso.rotation.y = 0.3;
      armL.up.rotation.x = lerp(-0.5, -0.9, u); armR.up.rotation.x = lerp(-0.45, -0.9, u); armL.lo.rotation.x = -0.4; armR.lo.rotation.x = -0.4;
      legL.up.rotation.x = -0.6; legL.lo.rotation.x = 0.8; break;
    }
    case 'run': {
      const w = t * 13 * p.speed; const s = Math.sin(w);
      torso.rotation.x = 0.22; hips.position.y = 0.98 + Math.abs(Math.cos(w)) * 0.05;
      legL.up.rotation.x = s * 0.9; legR.up.rotation.x = -s * 0.9; legL.lo.rotation.x = Math.max(0, -s) * 1.2; legR.lo.rotation.x = Math.max(0, s) * 1.2;
      armL.up.rotation.x = -s * 0.9; armR.up.rotation.x = s * 0.9; armL.lo.rotation.x = -0.9; armR.lo.rotation.x = -0.9; break;
    }
    case 'bowl': { // run-up handled by movement; this is the delivery stride (t 0..0.7)
      const u = t / 0.7; const s = Math.sin(t * 12);
      if (u < 0.55) { legL.up.rotation.x = s * 0.9; legR.up.rotation.x = -s * 0.9; armL.up.rotation.x = -s * 0.7; armR.up.rotation.x = -2.2 - s * 0.2; torso.rotation.x = 0.1; }
      else { const v = ease((u - 0.55) / 0.35); armR.up.rotation.x = lerp(-3.0, 0.9, v); armL.up.rotation.x = lerp(-1.4, 0.4, v); torso.rotation.x = lerp(-0.15, 0.6, v); legL.up.rotation.x = -0.8; legR.up.rotation.x = 0.4; }
      break;
    }
    case 'throw': {
      const u = ease(t / 0.35); torso.rotation.y = lerp(0.6, -0.5, u); armR.up.rotation.x = lerp(-2.6, 0.6, u); armL.up.rotation.x = -0.6; legL.up.rotation.x = -0.4 * u; break;
    }
    case 'catch': { armL.up.rotation.x = -2.5; armR.up.rotation.x = -2.5; armL.lo.rotation.x = -0.3; armR.lo.rotation.x = -0.3; hips.position.y = 0.94 + Math.sin(Math.min(t * 6, Math.PI)) * 0.15; break; }
    case 'dive': {
      const u = ease(t / 0.4); p.root.rotation.x = lerp(0, 1.35, u); hips.position.y = lerp(0.98, 0.5, u);
      armL.up.rotation.x = -2.8; armR.up.rotation.x = -2.8; legL.up.rotation.x = 0.4; legR.up.rotation.x = 0.4; break;
    }
    case 'celebrate': {
      const s = Math.abs(Math.sin(t * 7)); hips.position.y = 0.98 + s * 0.22;
      armL.up.rotation.x = -3.0 + Math.sin(t * 9) * 0.3; armR.up.rotation.x = -3.0 - Math.sin(t * 9) * 0.3; armL.up.rotation.z = 0.3; armR.up.rotation.z = -0.3; break;
    }
    case 'walk': {
      const w = t * 6; const s = Math.sin(w); torso.rotation.x = 0.1; torso.rotation.z = 0;
      legL.up.rotation.x = s * 0.5; legR.up.rotation.x = -s * 0.5; legL.lo.rotation.x = Math.max(0, -s) * 0.6; legR.lo.rotation.x = Math.max(0, s) * 0.6;
      armL.up.rotation.x = -s * 0.4; armR.up.rotation.x = s * 0.4; break;
    }
    case 'dejected': { torso.rotation.x = 0.5; head_down(p); armL.up.rotation.x = 0.1; armR.up.rotation.x = 0.1; break; }
    case 'signalOut': { armR.up.rotation.x = -3.1; armR.up.rotation.z = -0.1; armL.up.rotation.z = 0.15; break; }
    case 'signalFour': { armR.up.rotation.z = -1.5; armR.up.rotation.x = 0; armR.up.rotation.z = -1.4 + Math.sin(t * 9) * 0.5; break; }
    case 'signalSix': { armL.up.rotation.x = -3.1; armR.up.rotation.x = -3.1; break; }
  }
  if (p.bat && p.anim !== 'stance' && p.anim !== 'backlift' && p.anim !== 'swing' && p.anim !== 'defend') p.bat.rotation.x = 0.2;
}
function head_down(p) { p.head.rotation.x = 0.4; }

export function faceTowards(p, x, z) {
  const dx = x - p.root.position.x, dz = z - p.root.position.z;
  if (dx * dx + dz * dz > 1e-4) p.root.rotation.y = Math.atan2(dx, dz);
}
