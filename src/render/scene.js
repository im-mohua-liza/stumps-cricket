import * as THREE from 'three';
import { PITCH_HALF, ROPE_R, STUMP_H } from '../match/physics.js';

export function createRenderer(canvas, quality = 'high') {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 2));
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

export function buildWorld(scene, { quality = 'high' } = {}) {
  // Sky gradient + fog for depth
  scene.background = canvasTex(8, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#1a3a63'); grd.addColorStop(0.55, '#6fa6d8'); grd.addColorStop(1, '#dcebf5');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(0xcfe0ee, 90, 240);

  const hemi = new THREE.HemisphereLight(0xdfeeff, 0x3a5a2a, 0.85); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.3);
  sun.position.set(-40, 70, 30);
  sun.castShadow = quality !== 'low';
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera; s.left = -45; s.right = 45; s.top = 45; s.bottom = -45; s.near = 10; s.far = 200;
  sun.shadow.bias = -0.0004; scene.add(sun); scene.add(sun.target);

  // Outfield with mowing stripes
  const grass = canvasTex(1024, 1024, (g, w, h) => {
    for (let i = 0; i < 24; i++) { g.fillStyle = i % 2 ? '#3f8f3a' : '#4aa044'; g.fillRect(0, i * h / 24, w, h / 24 + 1); }
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${20 + Math.random() * 40|0},${90 + Math.random() * 60|0},30,0.08)`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  }, [3, 3]);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(ROPE_R + 12, 96), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // 30-yard style circle (dashed ring)
  const ring = new THREE.Mesh(new THREE.RingGeometry(27.4, 27.55, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; scene.add(ring);

  // Pitch strip
  const pitchTex = canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = '#c9a877'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${120 + Math.random() * 60|0},${90 + Math.random() * 40|0},50,0.12)`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3); }
    g.fillStyle = 'rgba(90,110,40,0.35)'; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.05, PITCH_HALF * 2 + 2.4), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.02; pitch.receiveShadow = true; scene.add(pitch);

  // Creases
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const addLine = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); scene.add(m); };
  for (const sgn of [-1, 1]) {
    const z = sgn * PITCH_HALF; const pz = z - sgn * 1.22;
    addLine(3.05, 0.05, 0, pz);            // popping crease
    addLine(2.64, 0.05, 0, z);             // bowling crease
    addLine(0.05, 1.22, -1.32, z - sgn * 0.61); addLine(0.05, 1.22, 1.32, z - sgn * 0.61); // return creases
  }

  // Stumps
  const stumps = [];
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xf1e2b8, roughness: 0.6 });
  const bailMat = new THREE.MeshStandardMaterial({ color: 0xe8d18a });
  for (const sgn of [-1, 1]) {
    const grp = new THREE.Group(); grp.position.set(0, 0, sgn * PITCH_HALF);
    const parts = [];
    for (let i = -1; i <= 1; i++) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, STUMP_H, 8), woodMat);
      st.position.set(i * 0.1, STUMP_H / 2, 0); st.castShadow = true; grp.add(st); parts.push(st);
    }
    const bails = [];
    for (const bx of [-0.05, 0.05]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), bailMat);
      b.rotation.z = Math.PI / 2; b.position.set(bx, STUMP_H + 0.01, 0); grp.add(b); bails.push(b);
    }
    grp.userData = { parts, bails, sgn, home: parts.map(p => p.position.clone()), homeBails: bails.map(b => b.position.clone()) };
    scene.add(grp); stumps.push(grp);
  }

  // Boundary rope + advertising boards (original brands only)
  const rope = new THREE.Mesh(new THREE.TorusGeometry(ROPE_R, 0.12, 8, 120), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  rope.rotation.x = Math.PI / 2; rope.position.y = 0.12; scene.add(rope);
  const adTex = canvasTex(2048, 64, (g, w, h) => {
    const brands = ['STUMPS ARENA', 'VOLTA POWER', 'NIMBUS AIR', 'ORBIT PAY', 'KESTREL TYRES', 'ZEST COLA'];
    const cols = ['#0d47a1', '#c62828', '#00695c', '#4527a0', '#ef6c00', '#212121'];
    brands.forEach((b, i) => { const x = i * w / 6; g.fillStyle = cols[i]; g.fillRect(x, 0, w / 6, h); g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b, x + w / 12, h / 2); });
  }, [1, 1]);
  adTex.wrapS = THREE.RepeatWrapping; adTex.repeat.set(-3, 1); adTex.offset.x = 1;
  const boards = new THREE.Mesh(new THREE.CylinderGeometry(ROPE_R + 2.2, ROPE_R + 2.2, 1.1, 120, 1, true), new THREE.MeshBasicMaterial({ map: adTex, side: THREE.BackSide }));
  boards.position.y = 0.55; scene.add(boards);

  return { sun, stumps, ground, pitch };
}

// Knock the bails off / scatter stumps when bowled. Returns a function to reset.
export function stumpsHit(grp) {
  const { parts, bails } = grp.userData;
  parts.forEach((p, i) => { p.userData.v = { x: (Math.random() - 0.5) * 2, y: 1 + Math.random() * 2, z: -grp.userData.sgn * (2 + Math.random() * 3) }; });
  bails.forEach(b => { b.userData.v = { x: (Math.random() - 0.5) * 3, y: 3 + Math.random() * 2, z: -grp.userData.sgn * (3 + Math.random() * 2) }; });
  grp.userData.flying = 1.2;
}
export function updateStumps(grp, dt) {
  const u = grp.userData; if (!u.flying) return;
  u.flying -= dt;
  [...u.parts, ...u.bails].forEach(o => {
    const v = o.userData.v; if (!v) return;
    v.y -= 9.8 * dt; o.position.x += v.x * dt; o.position.y = Math.max(0.02, o.position.y + v.y * dt); o.position.z += v.z * dt;
    o.rotation.x += dt * 5; o.rotation.z += dt * 3;
  });
}
export function resetStumps(grp) {
  const u = grp.userData; u.flying = 0;
  u.parts.forEach((p, i) => { p.position.copy(u.home[i]); p.rotation.set(0, 0, 0); p.userData.v = null; });
  u.bails.forEach((b, i) => { b.position.copy(u.homeBails[i]); b.rotation.set(0, 0, Math.PI / 2); b.userData.v = null; });
}
