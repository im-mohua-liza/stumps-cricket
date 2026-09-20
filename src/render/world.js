import * as THREE from 'three';
import { createRenderer, buildWorld, stumpsHit, updateStumps, resetStumps } from './scene.js';
import { buildStadium } from './stadium.js';
import { createPlayer, setAnim, updatePlayer, faceTowards } from './players.js';
import { CameraRig } from './camera.js';
import { PITCH_HALF } from '../match/physics.js';

const hex = c => new THREE.Color(c).getHex();

export class World {
  constructor(canvas, quality = 'high') {
    this.quality = quality;
    this.renderer = createRenderer(canvas, quality);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.rig = new CameraRig(this.camera);
    const w = buildWorld(this.scene, { quality });
    this.stumps = w.stumps;
    this.stadium = buildStadium(this.scene, { quality });
    this.excite = 0.15;

    // Ball + shadow + trail
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0x666666 }));
    this.ball.castShadow = true; this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35 }));
    this.ballShadow.rotation.x = -Math.PI / 2; this.scene.add(this.ballShadow);
    this.trailPts = []; this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    this.trail.frustumCulled = false; this.scene.add(this.trail);
    this.ballVel = new THREE.Vector3();

    // Players
    this.fielderRigs = []; this.batters = []; this.umpire = null;
    this.rec = null; this.playing = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones: widen vertical FOV so the pitch stays framed
    this.rig.aspectBoost = w / h < 1 ? 1.35 : 1;
    this.camera.updateProjectionMatrix();
  }

  // Build (or rebuild) all humanoids for a new innings.
  setKits(bat, field, ballColor = 0xffffff) {
    [...this.fielderRigs, ...this.batters].forEach(p => this.scene.remove(p.root));
    if (this.umpire) this.scene.remove(this.umpire.root);
    this.ball.material.color.set(ballColor);
    this.fielderRigs = Array.from({ length: 11 }, (_, i) => {
      const p = createPlayer({ shirt: hex(field.color), pants: hex(field.alt), skin: i % 4 });
      this.scene.add(p.root); setAnim(p, 'ready'); return p;
    });
    this.batters = [0, 1].map(i => {
      const p = createPlayer({ shirt: hex(bat.color), pants: hex(bat.alt), skin: (i + 1) % 4, batter: true });
      this.scene.add(p.root); return p;
    });
    this.umpire = createPlayer({ umpire: true, skin: 1 });
    this.umpire.root.position.set(1.3, 0, -PITCH_HALF - 1.4); faceTowards(this.umpire, 0, PITCH_HALF);
    this.scene.add(this.umpire.root); setAnim(this.umpire, 'idle');
    this.stumps.forEach(resetStumps);
  }

  setBallPos(x, y, z) { this.ball.position.set(x, y, z); this.ballShadow.position.set(x, 0.035, z); const s = Math.max(0.5, 1 - y * 0.05); this.ballShadow.scale.setScalar(s); }
  pushTrail(x, y, z) { this.trailPts.push(new THREE.Vector3(x, y, z)); if (this.trailPts.length > 36) this.trailPts.shift(); this.trail.geometry.setFromPoints(this.trailPts); }
  clearTrail() { this.trailPts = []; this.trail.geometry.setFromPoints([]); }
  knockStumps(end) { stumpsHit(this.stumps[end]); }

  // Sync a fielder-state object to its rig
  syncFielder(i, f, lookAt) {
    const r = this.fielderRigs[i]; if (!r) return;
    const moving = f.anim === 'run';
    r.root.position.set(f.pos.x, 0, f.pos.z);
    if (moving && f.target) faceTowards(r, f.target.x, f.target.z); else if (lookAt) faceTowards(r, lookAt.x, lookAt.z);
    if (r.anim !== f.anim) setAnim(r, f.anim);
  }

  startRecording() { this.rec = []; this.recT = 0; }
  stopRecording() { const r = this.rec; this.rec = null; return r; }
  _snapshot() {
    const all = [...this.fielderRigs, ...this.batters, this.umpire];
    return { ball: this.ball.position.toArray(), bp: this.ballVel.toArray(), players: all.map(p => [p.root.position.x, p.root.position.z, p.root.rotation.y, p.anim, p.t, p.dir, p.speed]) };
  }
  startReplay(frames, onDone) { this.playing = { frames, i: 0, acc: 0, onDone }; }
  stopReplay() { this.playing = null; }

  frame(dt, ctx = {}) {
    if (this.rec) { this.recT += dt; if (this.recT >= 1 / 30) { this.recT -= 1 / 30; if (this.rec.length < 900) this.rec.push(this._snapshot()); } }
    const all = [...this.fielderRigs, ...this.batters, this.umpire].filter(Boolean);
    if (this.playing) {
      const pl = this.playing; pl.acc += dt * (ctx.replaySpeed || 0.6); const idx = Math.floor(pl.acc * 30);
      if (idx >= pl.frames.length) { const cb = pl.onDone; this.playing = null; cb && cb(); }
      else {
        const f = pl.frames[idx]; this.ball.position.fromArray(f.ball); this.ballVel.fromArray(f.bp); this.ballShadow.position.set(f.ball[0], 0.035, f.ball[2]);
        f.players.forEach((s, i) => { const p = all[i]; if (!p) return; p.root.position.set(s[0], 0, s[1]); p.root.rotation.y = s[2]; if (p.anim !== s[3]) setAnim(p, s[3], { dir: s[5], speed: s[6] }); });
        ctx = { ...ctx, ball: { pos: this.ball.position, vel: this.ballVel } };
      }
    }
    all.forEach(p => updatePlayer(p, dt));
    this.stumps.forEach(s => updateStumps(s, dt));
    this.stadium.update(dt, this.excite);
    this.rig.update(dt, ctx);
    // keep the ball readable at any distance
    this.ball.scale.setScalar(Math.min(3.2, Math.max(1, this.camera.position.distanceTo(this.ball.position) * 0.11)));
    this.renderer.render(this.scene, this.camera);
  }
}
