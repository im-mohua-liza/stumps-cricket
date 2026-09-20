import * as THREE from 'three';
import { PITCH_HALF } from '../match/physics.js';

// Broadcast-style camera controller. Smoothly blends between named rigs.
export class CameraRig {
  constructor(camera) {
    this.cam = camera; this.mode = 'batting';
    this.pos = new THREE.Vector3(0, 3, 17); this.look = new THREE.Vector3(0, 1, -5);
    this.wantPos = this.pos.clone(); this.wantLook = this.look.clone();
    this.fovWant = 52; this.stiff = 4; this.shake = 0; this.t = 0;
  }
  set(mode, opts = {}) { this.mode = mode; this.opts = opts; if (opts.snap) { this.snapNext = true; } }

  update(dt, ctx) {
    this.t += dt;
    const { ball, batterPos, bowlerPos, targetPos } = ctx;
    let stiff = 4;
    switch (this.mode) {
      case 'menu': { const a = this.t * 0.12; this.wantPos.set(Math.sin(a) * 34, 10, Math.cos(a) * 34); this.wantLook.set(0, 3, 0); this.fovWant = 50; stiff = 1.5; break; }
      case 'batting': // behind the striker, ball comes at the lens
        this.wantPos.set(1.0, 3.5, PITCH_HALF + 7.5); this.wantLook.set(0, 0.6, -3); this.fovWant = 50; stiff = 3; break;
      case 'bowling': // behind the bowler's arm
        this.wantPos.set(0, 5.2, -PITCH_HALF - 10.5); this.wantLook.set(0, 0.5, PITCH_HALF - 2); this.fovWant = 46; stiff = 3; break;
      case 'delivery': // low, tight behind the striker's stumps looking at the bowler's end
        this.wantPos.set(1.0, 3.3, PITCH_HALF + 6.5); this.wantLook.set(0, 0.9, -PITCH_HALF + 2); this.fovWant = 44; stiff = 6; break;
      case 'chase': { // trail the struck ball
        const bp = ball ? ball.pos : new THREE.Vector3();
        const v = ball ? ball.vel : new THREE.Vector3(0, 0, -1);
        const dir = new THREE.Vector3(v.x, 0, v.z); if (dir.lengthSq() < 0.5) dir.set(0, 0, -1); dir.normalize();
        const back = Math.min(18, 8 + Math.hypot(bp.x, bp.z - PITCH_HALF) * 0.28);
        this.wantPos.set(bp.x - dir.x * back * 0.6 + dir.z * 4, 6 + Math.min(9, bp.y * 0.6) + back * 0.25, bp.z - dir.z * back * 0.6 - dir.x * 4);
        this.wantPos.z = Math.max(this.wantPos.z, -40); this.wantLook.copy(bp).setY(Math.max(0.6, bp.y * 0.7)); this.fovWant = 55; stiff = 2.2; break; }
      case 'wide': // high behind the striker watching the whole field
        this.wantPos.set(0, 15, PITCH_HALF + 30); this.wantLook.set(0, 0, -12); this.fovWant = 58; stiff = 2; break;
      case 'fielder': { // tight on the fielder with the ball
        const p = targetPos || new THREE.Vector3();
        this.wantPos.set(p.x * 0.85 + 5, 3.2, p.z * 0.85 + 6); this.wantLook.set(p.x, 1.1, p.z); this.fovWant = 46; stiff = 3; break; }
      case 'stumps': { // dramatic close-up of the stumps
        const z = (this.opts?.z ?? -PITCH_HALF); const s = Math.sign(z) || 1;
        this.wantPos.set(2.2, 0.9, z - s * 3.2); this.wantLook.set(0, 0.45, z); this.fovWant = 38; stiff = 5; break; }
      case 'celebrate': {
        const p = targetPos || new THREE.Vector3(0, 0, 0);
        this.wantPos.set(p.x + 2.5, 1.6, p.z + 4.2); this.wantLook.set(p.x, 1.4, p.z); this.fovWant = 40; stiff = 3; break; }
      case 'replaySide': { // orbiting broadcast angle for replays
        const a = this.t * 0.25; const cx = ball ? ball.pos.x : 0, cz = ball ? ball.pos.z : 0;
        this.wantPos.set(cx + Math.sin(a) * 9 + 6, 4, cz + Math.cos(a) * 9); this.wantLook.set(cx, 1, cz); this.fovWant = 50; stiff = 3; break; }
    }
    if (this.snapNext) { this.pos.copy(this.wantPos); this.look.copy(this.wantLook); this.snapNext = false; }
    const k = 1 - Math.exp(-stiff * dt);
    this.pos.lerp(this.wantPos, k); this.look.lerp(this.wantLook, k * 1.3);
    this.cam.position.copy(this.pos);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2); this.cam.position.x += (Math.random() - 0.5) * this.shake * 0.3; this.cam.position.y += (Math.random() - 0.5) * this.shake * 0.3; }
    this.cam.lookAt(this.look);
    this.cam.fov += (this.fovWant * (this.aspectBoost || 1) - this.cam.fov) * (1 - Math.exp(-3 * dt)); this.cam.updateProjectionMatrix();
  }
}
