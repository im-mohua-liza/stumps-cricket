// Match session: orchestrates one match ball by ball. Owns the phase state machine and connects
// pure match rules (Match), physics, AI, the 3D world, HUD and audio.
import * as THREE from 'three';
import { Match } from '../match/match.js';
import { makeDelivery, stepBall, predictAtZ, wouldHitStumps, PITCH_HALF, STUMP_H, STUMP_HALF_W } from '../match/physics.js';
import { resolveShot, applyShot, CONTACT_Z } from '../match/batting.js';
import { buildField, planFielding } from '../match/fielding.js';
import { aiDelivery, aiBat, aiTakesRun, commentary, pressure } from '../match/ai.js';
import { StruckSim } from './struck.js';
import { setAnim } from '../render/players.js';
import { audio } from '../audio/audio.js';
import { bus } from '../core/bus.js';
import { FORMATS, DIFFICULTY } from '../data/formats.js';
import { show } from '../ui/screens.js';

const S_END = { x: -0.8, z: PITCH_HALF - 0.7 }, B_END = { x: 1.6, z: -PITCH_HALF + 0.6 };
const RUNUP_START = { x: 0.7, z: -PITCH_HALF - 9.5 }, BOWL_POS = { x: 0.35, z: -PITCH_HALF - 0.1 };
const lastName = n => n.split(' ')[1] || n;

export class Session {
  constructor({ world, hud, setup, onFinish }) {
    this.world = world; this.hud = hud; this.onFinish = onFinish; this.setup = setup;
    this.diff = DIFFICULTY[setup.difficulty];
    this.format = FORMATS[setup.format];
    this.match = new Match({ teamA: setup.myTeam, teamB: setup.oppTeam, format: this.format, overs: setup.overs, battingFirst: setup.userBatsFirst ? 'A' : 'B', userTeamId: setup.myTeam.id, difficulty: setup.difficulty });
    this.phase = 'idle'; this.timers = []; this.fieldSet = 'balanced'; this.fielders = []; this.rigOf = {};
    this.ballObj = { pos: new THREE.Vector3(0, 1, 0), vel: new THREE.Vector3() };
    this.lastFrames = null; this.replaying = false; this.stopped = false;
    hud.callbacks = null;
  }

  get userBatting() { return this.match.cur.batSide === 'A'; }
  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  // ---------------- lifecycle ----------------
  start() {
    this.hud.show(); this.setupInnings();
  }
  destroy() { this.stopped = true; this.timers = []; this.world.stopReplay(); this.hud.hideControls(); this.hud.hide(); }

  setupInnings() {
    const m = this.match; const bat = m.battingTeam, bowl = m.bowlingTeam;
    this.world.setKits(bat, bowl, this.format.id === 'TEST' ? 0xc0392b : 0xffffff);
    this.rigOf = {}; this.assignRigs(); this.fielders = []; this.fieldSet = 'balanced';
    this.hud.update(m); this.hud.hint('');
    m.addComment(`${bat.name} to bat. ${m.cur.target ? `Target: ${m.cur.target}.` : `${m.overs} overs.`}`);
    this.hud.comment(m.commentary[0].text, '');
    this.world.rig.set(this.userBatting ? 'batting' : 'bowling', { snap: true });
    this.after(0.6, () => this.startOver());
  }

  // Two batter rigs follow whichever batters are at the crease
  assignRigs() {
    const inn = this.match.cur; const at = [inn.striker, inn.nonStriker]; const free = [0, 1].filter(i => !at.some(a => this.rigOf[a] === i));
    at.forEach(a => { if (this.rigOf[a] === undefined || ![0, 1].includes(this.rigOf[a]) || at.filter(b => this.rigOf[b] === this.rigOf[a]).length > 1) this.rigOf[a] = free.shift() ?? 0; });
    // drop stale mappings for batters no longer at the crease
    Object.keys(this.rigOf).forEach(k => { if (!at.includes(+k)) delete this.rigOf[k]; });
  }
  rigFor(role) { const inn = this.match.cur; return this.world.batters[this.rigOf[role === 'striker' ? inn.striker : inn.nonStriker] ?? (role === 'striker' ? 0 : 1)]; }

  // ---------------- over / ball flow ----------------
  async startOver() {
    if (this.stopped) return; const m = this.match;
    if (!m.cur.bowlerId) {
      const el = m.eligibleBowlers(); const pool = el.length ? el : m.bowlingTeam.squad.filter(p => p.id !== m.cur.lastBowlerId);
      let id;
      if (!this.userBatting && pool.length > 1) id = await this.chooseBowler(pool);
      else { const w = pool.map(p => ({ p, w: Math.pow(p.bowl, 3) })); let r = Math.random() * w.reduce((a, b) => a + b.w, 0); id = (w.find(x => (r -= x.w) <= 0) || w[0]).p.id; }
      m.setBowler(id);
    }
    // rebuild the field for this bowler, keeping current positions to avoid teleporting
    const old = new Map(this.fielders.map(f => [f.id, f.pos]));
    this.fielders = buildField(m.bowlingTeam.squad, m.cur.bowlerId, this.fieldSet);
    this.fielders.forEach(f => { const o = old.get(f.id); if (o) f.pos = { ...o }; });
    this.hud.update(m); this.beginDelivery();
  }

  chooseBowler(pool) {
    return new Promise(res => {
      const m = this.match;
      const rows = pool.map(p => { const b = m.cur.bowlers[p.id]; return `<button class="btn" data-act="pick" data-val="${p.id}"><b>${p.name}</b> <span class="pill">${p.bowlType}</span><small>Bowling ${p.bowl} &nbsp;•&nbsp; ${b ? `${Math.floor(b.balls / 6)}.${b.balls % 6} ov, ${b.runs} runs, ${b.wkts} wkts` : 'not bowled yet'}</small></button>`; }).join('');
      show(`<div class="center"><h2>Over ${m.overNo + 1}: choose your bowler</h2><p class="sub">Pick who bowls this over.</p>${rows}</div>`, { pick: id => { document.getElementById('screen').innerHTML = ''; res(id); } }, 'overlay');
    });
  }

  beginDelivery() {
    if (this.stopped) return; const m = this.match; this.phase = 'prep'; this.struck = null; this.swung = null; this.userShot = null;
    this.world.clearTrail(); this.world.stumps.forEach(s => { s.userData.flying = 0; });
    if (this.needStumpReset) { this.world.stumps.forEach(s => { const u = s.userData; u.parts.forEach((p, i) => { p.position.copy(u.home[i]); p.rotation.set(0, 0, 0); }); u.bails.forEach((b, i) => { b.position.copy(u.homeBails[i]); b.rotation.set(0, 0, Math.PI / 2); }); }); this.needStumpReset = false; }
    this.assignRigs();
    const bowlerF = this.fielders[0]; bowlerF.pos = { ...RUNUP_START }; bowlerF.anim = 'idle';
    this.world.rig.set(this.userBatting ? 'batting' : 'bowling');
    const bowlerP = bowlerF.player;
    this.hud.update(m); this.hud.hint(''); this.hud.hideControls();
    this.world.excite = Math.max(0.15, this.world.excite * 0.9); audio.excite(this.world.excite);
    this.aiBatterShot = null;

    if (!this.userBatting) {
      // user bowls: choose delivery via the panel
      this.hud.hint('');
      this.hud.bowlPanel({
        bowler: bowlerP, fieldSet: this.fieldSet, windowW: 0.16 * (2 - this.diff.aiBat),
        onField: f => { this.fieldSet = f; this.fielders = buildField(m.bowlingTeam.squad, m.cur.bowlerId, f); this.fielders[0].pos = { ...RUNUP_START }; },
        onDeliver: d => this.runUp({ pace: this.paceFor(bowlerP, d.type) * d.speedMul, line: d.line + d.err * 1.6 * (d.speedMul > 1 ? 1.3 : 1), length: d.length + d.err * 2.2, swing: d.swing * (0.6 + bowlerP.bowl / 120), spin: d.spin * (0.6 + bowlerP.bowl / 120), type: d.type }),
      });
    } else {
      this.hud.battingMode(true); this.hud.setRunEnabled(false);
      this.hud.hint(m.overNo === 0 && m.ballInOver === 0 ? 'Swipe as the ball arrives. Up = drive, sideways = cut / pull, tap = defend' : '');
      this.pending = aiDelivery(bowlerP, m, this.diff);
      this.after(1.1, () => this.runUp(this.pending));
    }
  }
  paceFor(p, type) { return type === 'spin' ? 20 + p.bowl / 40 : type === 'medium' ? 26 + p.bowl / 20 : 33 + p.bowl / 14; }

  runUp(d) {
    if (this.stopped) return; this.phase = 'runup'; this.delivery = d; this.runT = 0; this.released = false;
    this.hud.hint('');
    const bowlerF = this.fielders[0]; bowlerF.anim = 'run';
    this.runDur = d.type === 'spin' ? 1.1 : d.type === 'medium' ? 1.35 : 1.6;
    this.world.rig.set(this.userBatting ? 'delivery' : 'bowling');
    this.hud.setRunEnabled(false);
    // The batters take guard
    this.rigFor('striker') && setAnim(this.rigFor('striker'), 'stance');
  }

  release() {
    const d = this.delivery; this.released = true; this.phase = 'flight';
    this.ball = makeDelivery({ pace: d.pace, line: d.line, length: Math.max(0.4, d.length), swing: d.swing, spin: d.spin, releaseX: BOWL_POS.x });
    this.origBall = { ...this.ball };
    this.ballT = 0; this.bounced = false; this.swung = null; this.contactAt = null;
    this.timeScale = this.userBatting ? this.diff.timing >= 1 ? (this.diff.id === 'easy' ? 0.5 : 0.62) : 0.8 : 0.85;
    // flags decided from the undisturbed path
    const p = predictAtZ(this.ball, CONTACT_Z); this.arrival = p ? p.t : 0.6;
    const q = predictAtZ(this.ball, PITCH_HALF - 0.5);
    this.wide = !!q && Math.abs(q.x) > 1.12 + (this.ball.spin ? 0.15 : 0);
    this.noBall = Math.random() < 0.015 || (!!p && p.bounces === 0 && p.y > 1.4);
    this.willHit = wouldHitStumps(this.ball);
    this.world.startRecording();
    this.world.ball.visible = true; this.world.setBallPos(this.ball.x, this.ball.y, this.ball.z); this.world.clearTrail();
    audio.blip(300);
    const bs = this.rigFor('striker'); if (bs) setAnim(bs, 'backlift');
    // AI batter decides now and schedules the contact moment
    if (!this.userBatting || false) {
      const batter = this.match.striker; const b = this.match.battingTeam.squad.find(p => p.id === batter.id);
      const window = 0.11 * this.diff.timing;
      const dec = aiBat(b, { line: d.line, length: d.length }, this.match, this.diff, window);
      if (!dec.leave) this.aiBatterShot = { ...dec, at: (this.arrival + dec.dt) / this.timeScale - 0.09 };
    }
    if (this.userBatting) { this.hud.setRunEnabled(false); this.hud.hint(''); }
  }

  // ---------------- input ----------------
  onShot(inp) {
    if (this.phase !== 'flight' || !this.userBatting || this.swung) return;
    this.swung = { ...inp, at: this.ballT + 0.09 }; audio.init();
    const b = this.rigFor('striker'); if (b) setAnim(b, inp.tapOnly ? 'defend' : 'swing', { dir: inp.angleDeg >= 0 ? 1 : -1, speed: 1 + inp.power * 0.5 });
  }
  onRun() {
    if (this.struck && this.struck.tapRun()) audio.blip(740);
  }

  // ---------------- per-frame ----------------
  update(dt) {
    if (this.stopped) return;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    if (this.world.playing) { this.syncFielders(dt, true); return; }
    switch (this.phase) {
      case 'runup': this.updateRunUp(dt); break;
      case 'flight': this.updateFlight(dt); break;
      case 'struck': this.updateStruck(dt); break;
    }
    this.idleMotion(dt); this.syncFielders(dt);
    this.updateCameraCtx();
  }

  updateCameraCtx() { const f = this.ballObj; this.cameraCtx = { ball: f, targetPos: this.focusPos || new THREE.Vector3(0, 0, 0) }; }

  updateRunUp(dt) {
    this.runT += dt; const bowlerF = this.fielders[0]; const u = Math.min(1, this.runT / this.runDur);
    bowlerF.pos.x = RUNUP_START.x + (BOWL_POS.x - RUNUP_START.x) * u; bowlerF.pos.z = RUNUP_START.z + (BOWL_POS.z - RUNUP_START.z) * u;
    if (!this.bowlAnimSet && u > 0.85) { this.bowlAnimSet = true; bowlerF.anim = 'bowl'; }
    // ball in hand
    this.world.setBallPos(bowlerF.pos.x + 0.25, 1.15 + (u > 0.95 ? (u - 0.95) * 18 : 0), bowlerF.pos.z + 0.2);
    if (this.runT >= this.runDur + 0.3) { this.bowlAnimSet = false; this.release(); }
  }

  updateFlight(dt) {
    const ball = this.ball; let rem = dt * this.timeScale; const hadBounce = ball.bounces;
    // AI batter swing trigger
    if (this.aiBatterShot && !this.swung && this.ballT >= this.aiBatterShot.at) {
      const s = this.aiBatterShot; this.swung = { ...s, at: this.ballT + 0.09 };
      const b = this.rigFor('striker'); if (b) setAnim(b, s.tapOnly ? 'defend' : 'swing', { dir: s.angleDeg >= 0 ? 1 : -1, speed: 1 + s.power * 0.5 });
    }
    while (rem > 0) {
      const h = Math.min(rem, 1 / 240); stepBall(ball, h); rem -= h; this.ballT += h / this.timeScale;
      // contact moment
      if (this.swung && !this.contactAt && this.ballT >= this.swung.at) { this.contactAt = this.ballT; this.contact(); return; }
      // wicket hit while unplayed
      if (ball.z >= PITCH_HALF - 0.05 && !this.swung) { this.passed(); return; }
      if (ball.z >= PITCH_HALF + 0.1 && this.swung) { this.passed(); return; }
    }
    if (ball.bounces > hadBounce && !this.bounced) { this.bounced = true; audio.thud(); }
    this.world.setBallPos(ball.x, ball.y, ball.z); this.world.pushTrail(ball.x, ball.y, ball.z);
    this.setBallObj(ball);
  }
  setBallObj(b) { this.ballObj.pos.set(b.x, b.y, b.z); this.ballObj.vel.set(b.vx, b.vy, b.vz); this.world.ballVel.copy(this.ballObj.vel); }

  contact() {
    const ball = this.ball, s = this.swung; const win = 0.11 * this.diff.timing;
    // timing: time until the ball reaches the contact plane (negative = early)
    let dt; const p = predictAtZ(ball, CONTACT_Z, 1.2);
    if (p) dt = -(p.t - ball.t); else dt = Math.max(0, (ball.z - CONTACT_Z)) / Math.max(5, ball.vz);
    const batter = this.match.striker; const bp = this.match.battingTeam.squad.find(x => x.id === batter.id);
    const res = resolveShot({ ball: { ...ball, y: ball.y }, angleDeg: s.angleDeg, power: s.power, loft: s.loft, tapOnly: s.tapOnly, dt: dt / this.timeScale * this.timeScale, window: win, skill: bp?.bat ?? 60, freeHit: this.match.isFreeHit });
    // scale dt into game seconds consistently (already game secs); miss handled below
    this.shotRes = res;
    if (res.outcome === 'miss') { audio.blip(200); this.missed = true; return; }
    if (res.outcome === 'defend') audio.thud(); else audio.bat(Math.min(1, (res.speed || 8) / 26));
    applyShot(ball, res);
    this.world.camShake?.(); this.world.rig.shake = res.outcome === 'perfect' ? 0.8 : 0.3;
    this.beginStruck(res);
  }

  beginStruck(res) {
    const ball = this.ball; const catchFactor = this.userBatting ? (0.82 + 0.18 * this.diff.aiBowl) : 1;
    const plan = planFielding(ball, this.fielders, { catchFactor });
    const autoRun = res.outcome !== 'defend' && plan.kind !== 'boundary' && plan.kind !== 'catch' && (this.userBatting ? plan.t > 1.3 : aiTakesRun(plan, 0, pressure(this.match)));
    this.plan = plan; this.phase = 'struck';
    const bs = this.match; this.striker = this.rigFor('striker'); this.non = this.rigFor('nonStriker');
    const view = {
      ball: (x, y, z, b) => { this.world.setBallPos(x, y, z); if (b) this.setBallObj(b); else { this.ballObj.pos.set(x, y, z); } },
      trail: (x, y, z) => this.world.pushTrail(x, y, z),
      batter: (i, x, z, anim, dest) => this.moveBatter(i, x, z, anim, dest),
      onHold: pl => { this.focusPos = new THREE.Vector3(pl.point.x, 0, pl.point.z); },
    };
    this.struck = new StruckSim({ ball, fielders: this.fielders, plan, autoRun, userBatting: this.userBatting, aggr: pressure(this.match), view });
    this.world.rig.set(plan.kind === 'boundary' && plan.runs === 6 ? 'chase' : 'chase');
    this.chaser = plan.fielder;
    this.strikerRunRig = this.striker; this.nonRunRig = this.non;
    // bat follow-through then start running
    if (autoRun) { const a = this.striker; if (a) this.after(0.25, () => a.anim !== 'run' && setAnim(a, 'run')); }
    if (this.userBatting) this.hud.setRunEnabled(plan.kind !== 'boundary' && plan.kind !== 'catch');
    this.hud.hint(this.userBatting && plan.kind !== 'boundary' ? 'Tap RUN to go for more' : '');
    if (this.userBatting) this.hud.battingMode(true);
    const lofted = res.vel && res.vel.y > 6; this.world.excite = Math.min(1, this.world.excite + (plan.kind === 'boundary' ? 0.4 : 0.1));
  }

  moveBatter(i, x, z, anim, dest) {
    const rig = i === 0 ? this.striker : this.non; if (!rig) return;
    rig.root.position.set(x, 0, z); const dx = dest.x - x, dz = dest.z - z; if (dx * dx + dz * dz > 1e-3) rig.root.rotation.y = Math.atan2(dx, dz);
    if (rig.anim !== anim) setAnim(rig, anim);
  }

  updateStruck(dt) {
    const r = this.struck.update(dt);
    if (this.hud) this.hud.setRunEnabled(this.userBatting && this.struck.canTapRun);
    if (r) this.resolveBall(r);
  }

  // Ball passed the batter's crease without being hit (missed, left, or beaten)
  passed() {
    const ball = this.ball; this.phase = 'passed';
    const hitsStumps = ball.z >= PITCH_HALF - 0.1 && Math.abs(ball.x) <= STUMP_HALF_W + 0.036 && ball.y <= STUMP_H + 0.02 && ball.y > 0 && !this.wide;
    if (hitsStumps) {
      const lbw = Math.random() < 0.3 && ball.y < 0.5 && this.bounced && Math.abs(this.origBall.x - 0) < 0.3 && !!this.swung === false;
      this.world.knockStumps(1); this.needStumpReset = true; audio.wicket(); this.world.rig.set('stumps', { z: PITCH_HALF });
      this.resolveBall({ runs: 0, wicket: { kind: lbw ? 'lbw' : 'bowled', who: 'striker' } }, { fromMiss: true });
      return;
    }
    // keeper collects
    const kp = this.fielders[1]; this.world.setBallPos(kp.pos.x, 1, kp.pos.z); kp.anim = 'catch';
    this.world.clearTrail();
    let extra = null; if (this.wide) extra = 'wide';
    const b = this.swung ? (Math.random() < 0.06 ? 1 : 0) : 0;
    this.resolveBall({ runs: extra === 'wide' ? 0 : b, extra: extra || (b ? 'bye' : null), miss: true });
  }

  // ---------------- resolve and record ----------------
  resolveBall(r, opts = {}) {
    if (this.phase === 'dead') return; this.phase = 'dead';
    const m = this.match; const inn = m.cur; const batter = m.striker, bowler = m.bowlerStats(inn.bowlerId);
    const ballIn = { runs: r.runs || 0, extra: r.extra || (this.noBall && !r.miss ? 'noball' : (this.noBall && r.miss ? 'noball' : null)), wicket: r.wicket || null, boundary: !!r.boundary };
    if (this.noBall && r.extra === 'wide') ballIn.extra = 'wide';
    const outBatter = r.wicket ? (r.wicket.who === 'non' ? m.nonStriker : batter) : null;
    const isFree = m.isFreeHit; const wasNo = ballIn.extra === 'noball';
    const res = m.recordBall(ballIn);
    const wk = res.wicket;
    const ev = { runs: ballIn.runs, wicket: wk, extra: ballIn.extra, batter: lastName((outBatter || batter).name), bowler: lastName(bowler.name), fielder: r.fielder ? lastName(r.fielder) : '' };
    const text = commentary(ev); m.addComment(text); this.hud.comment(text, `${Math.floor((inn.balls - (res.overEnded ? 1 : 0) + (res.overEnded ? 1 : 0)) / 6)}.${inn.balls % 6 || (res.overEnded ? 6 : 0)}`);
    this.hud.update(m); this.hud.hideControls(); this.hud.hint('');

    // presentation
    const um = this.world.umpire; let delay = 1.5, replay = false;
    if (wk) {
      this.hud.popup(wk.kind === 'runout' ? 'RUN OUT!' : wk.kind === 'caught' ? 'CAUGHT!' : wk.kind === 'lbw' ? 'LBW!' : 'BOWLED!', '#ff4d5e'); audio.wicket(); audio.groan(); audio.cheer(0.8, 2.4);
      this.world.excite = 0.9; setAnim(um, 'signalOut'); this.fielders.forEach(f => f.anim = 'celebrate');
      const br = this.striker || this.rigFor('striker'); if (br) setAnim(br, 'dejected');
      if (!opts.fromMiss) this.world.rig.set('celebrate'); this.focusPos = new THREE.Vector3(this.fielders[0].pos.x, 0, this.fielders[0].pos.z);
      delay = 2.4; replay = true; this.needStumpReset = true;
    } else if (ballIn.runs === 6) { this.hud.popup('SIX!', '#ffd23f'); audio.cheer(1, 3); this.world.excite = 1; setAnim(um, 'signalSix'); replay = true; delay = 2.6; const s = this.rigFor('striker'); s && setAnim(s, 'celebrate'); }
    else if (ballIn.runs === 4 && r.boundary) { this.hud.popup('FOUR!', '#3d8bff'); audio.cheer(0.7, 2.4); this.world.excite = 0.75; setAnim(um, 'signalFour'); delay = 2.1; }
    else if (ballIn.extra === 'wide') { this.hud.popup('WIDE', '#c39bff'); }
    else if (wasNo) { this.hud.popup('NO BALL', '#ff8a3d'); }
    else if (ballIn.runs === 0) { this.world.excite = Math.max(0.12, this.world.excite - 0.05); }
    else audio.cheer(0.2, 1);

    this.lastFrames = this.world.stopRecording();
    const done = () => this.afterBall(res);
    if (replay && this.lastFrames && this.lastFrames.length > 20) this.after(delay, () => this.playReplay(done, true)); else this.after(delay, done);
  }

  playReplay(done, auto = false) {
    if (!this.lastFrames || this.replaying) return done && done();
    this.replaying = true; this.hud.hint(auto ? 'INSTANT REPLAY  •  tap to skip' : 'REPLAY  •  tap to skip'); this.hud.hide?.call;
    this.world.rig.set('replaySide'); const sk = () => { this.world.stopReplay(); finish(); };
    const finish = () => { if (!this.replaying) return; this.replaying = false; window.removeEventListener('pointerdown', sk); this.hud.hint(''); this.world.rig.set(this.userBatting ? 'batting' : 'bowling'); done && done(); };
    setTimeout(() => window.addEventListener('pointerdown', sk, { once: true }), 400);
    this.world.startReplay(this.lastFrames, finish);
  }
  manualReplay() { if (this.phase === 'prep' || this.phase === 'idle' || this.phase === 'wait') { if (this.lastFrames) { const prev = this.phase; this.phase = 'replay'; this.playReplay(() => { this.phase = prev; }); } } }

  afterBall(res) {
    if (this.stopped) return; const m = this.match; this.phase = 'wait';
    this.fielders.forEach(f => { f.anim = 'ready'; f.target = null; });
    setAnim(this.world.umpire, 'idle');
    this.focusPos = null;
    this.world.ball.visible = true; this.hud.update(m);
    if (res.matchOver) return this.after(0.4, () => this.finishMatch());
    if (res.inningsOver) return this.inningsBreak();
    if (res.overEnded) { this.hud.popup(`END OF OVER ${m.overNo}`, '#2ee6a6'); this.after(1.3, () => this.startOver()); }
    else this.after(0.3, () => this.beginDelivery());
  }

  inningsBreak() {
    const m = this.match; const inn = m.cur; const bat = m.battingTeam; const next = m.teams[inn.bowlSide];
    this.hud.hideControls();
    const tgtLine = m.format.id === 'TEST' ? '' : (m.innings.length === 1 ? `<p class="sub">${next.name} need <b>${inn.runs + 1}</b> to win from ${m.overs} overs.</p>` : '');
    show(`<div class="center"><span class="pill">Innings ${m.innings.length} complete</span><h2 style="margin-top:12px">${bat.name}</h2><div class="big-num">${inn.runs}/${inn.wickets}</div>
      <div class="sub">${Math.floor(inn.balls / 6)}.${inn.balls % 6} overs &nbsp;•&nbsp; Extras ${inn.extras}</div>${tgtLine}
      <button class="btn primary" data-act="go" style="text-align:center">${m.innings.length === 1 ? 'Start innings' : 'Continue'}</button></div>`, {
      go: () => { document.getElementById('screen').innerHTML = ''; m.nextInnings(); this.setupInnings(); },
    }, 'overlay');
  }

  finishMatch() { this.hud.hideControls(); this.hud.hide(); this.onFinish(this.match, this.match.result()); }

  // ---------------- background motion ----------------
  idleMotion(dt) {
    // batters walk to their marks when not running
    if (this.phase !== 'struck') {
      const walk = (rig, tgt) => {
        if (!rig || !tgt) return; const p = rig.root.position; const dx = tgt.x - p.x, dz = tgt.z - p.z; const d = Math.hypot(dx, dz);
        if (d > 0.08 && rig.anim !== 'dejected' && rig.anim !== 'celebrate') { const s = Math.min(d, 7 * dt); p.x += dx / d * s; p.z += dz / d * s; rig.root.rotation.y = Math.atan2(dx, dz); if (rig.anim !== 'run' && d > 0.6) setAnim(rig, 'run'); else if (d <= 0.6 && rig.anim === 'run') setAnim(rig, 'idle'); }
        else if (d <= 0.08 && !['swing', 'defend', 'backlift', 'stance', 'dejected', 'celebrate'].includes(rig.anim)) { setAnim(rig, 'stance'); }
      };
      const s = this.rigFor('striker'), n = this.rigFor('nonStriker');
      walk(s, S_END); walk(n, B_END);
      if (s && s.anim === 'stance') s.root.rotation.y = Math.PI; // face the bowler
      if (n && (n.anim === 'stance' || n.anim === 'idle')) { n.root.rotation.y = 0; setAnim(n, 'idle'); }
      if (s && this.phase !== 'flight' && this.phase !== 'runup' && s.anim === 'stance') { /* holds guard */ }
    }
  }

  syncFielders(dt, replay = false) {
    if (replay) return;
    const focus = this.ballObj.pos;
    this.fielders.forEach((f, i) => {
      if (this.phase !== 'struck' && this.phase !== 'dead') {
        // return to positions
        if (!(i === 0 && (this.phase === 'runup' || this.phase === 'flight'))) {
          const dx = f.home.x - f.pos.x, dz = f.home.z - f.pos.z, d = Math.hypot(dx, dz);
          if (d > 0.1 && f.role !== 'bowler') { const s = Math.min(d, f.speed * 0.8 * dt); f.pos.x += dx / d * s; f.pos.z += dz / d * s; f.target = f.home; if (f.anim !== 'celebrate') f.anim = 'run'; }
          else if (f.anim === 'run' || f.anim === 'throw' || f.anim === 'dive' || f.anim === 'catch') f.anim = 'ready';
        }
      }
      if (i === 0 && this.phase === 'runup') { /* run-up handled */ }
      this.world.syncFielder(i, f, f.anim === 'run' ? null : (i === 0 && this.phase === 'runup' ? { x: 0, z: PITCH_HALF } : { x: 0, z: PITCH_HALF }));
    });
    // umpire keeps eyes on the pitch
  }
}
