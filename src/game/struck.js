// Simulates everything after the bat meets ball: ball flight, fielder chase, catch/drop,
// throw-in, and the batters running between the wickets (including run-outs).
import { stepBall, speedOf, PITCH_HALF } from '../match/physics.js';
import { RUN_TIME } from '../match/fielding.js';
import { aiTakesRun } from '../match/ai.js';

const S_END = { x: -0.8, z: PITCH_HALF - 0.7 };   // striker's crease
const B_END = { x: 1.6, z: -PITCH_HALF + 0.6 };    // bowler's end crease
const lerp = (a, b, u) => a + (b - a) * u;

export class StruckSim {
  constructor({ ball, fielders, plan, autoRun, userBatting, aggr = 0.5, view }) {
    Object.assign(this, { ball, fielders, plan, userBatting, aggr, view });
    this.t = 0; this.runsDone = 0; this.running = !!autoRun; this.runStart = 0; this.wantNext = false; this.decided = false;
    this.held = false; this.thrown = false; this.done = null; this.postT = 0; this.checkedRunOut = false;
    this.chaser = plan.fielder || null; this.chaserStart = this.chaser ? { ...this.chaser.pos } : null;
    if (plan.kind === 'drop') { plan.tReturn = { bowler: plan.tReturn.bowler + 0.9, striker: plan.tReturn.striker + 0.9 }; }
    this.destKey = plan.tReturn.bowler <= plan.tReturn.striker ? 'bowler' : 'striker';
    this.sinceTap = 99;
  }

  get runProgress() { return this.running ? Math.min(1, (this.t - this.runStart) / RUN_TIME) : 0; }
  get canTapRun() { return !this.done && this.plan.kind !== 'boundary' && this.plan.kind !== 'catch' && this.t < this.plan.tReturn[this.destKey] + 0.2; }

  tapRun() {
    if (!this.canTapRun) return false;
    if (!this.running) { this.running = true; this.runStart = this.t; this.decided = false; this.wantNext = false; return true; }
    this.wantNext = true; return true;
  }

  update(dt) {
    if (this.done) return this.done;
    const { plan, ball, view } = this; this.t += dt;
    const t = this.t;

    // ----- ball -----
    if (!this.held) {
      if (plan.kind === 'boundary' && t >= plan.t) { this.held = true; view.ball(plan.point.x, 0.15, plan.point.z); }
      else {
        let rem = dt; while (rem > 0) { const h = Math.min(rem, 1 / 120); stepBall(ball, h); rem -= h; }
        view.ball(ball.x, ball.y, ball.z, ball); view.trail(ball.x, ball.y, ball.z);
        if (t >= plan.t) { this.held = true; if (plan.kind !== 'boundary') view.ball(plan.point.x, plan.point.y, plan.point.z); }
      }
      if (this.held && plan.fielder && plan.kind !== 'boundary') { this.chaser.anim = plan.kind === 'stop' && speedOf(ball) > 15 ? 'dive' : (plan.kind === 'stop' ? 'ready' : 'catch'); view.onHold?.(plan); }
    } else if (plan.kind !== 'boundary') {
      // Throw-in to the chosen end
      const tHold = plan.t, tArr = plan.tReturn[this.destKey];
      if (!this.thrown && t > tHold + 0.3) { this.thrown = true; if (this.chaser) this.chaser.anim = 'throw'; }
      if (this.thrown) {
        const u = Math.min(1, (t - (tHold + 0.3)) / Math.max(0.1, tArr - tHold - 0.3));
        const endZ = this.destKey === 'bowler' ? -PITCH_HALF : PITCH_HALF;
        const x = lerp(plan.point.x, 0, u), z = lerp(plan.point.z, endZ, u), y = 0.5 + Math.sin(u * Math.PI) * 1.6 * (1 - u * 0.3);
        view.ball(x, y, z); view.trail(x, y, z);
      }
    }

    // ----- fielders -----
    for (const f of this.fielders) {
      if (f === this.chaser && !this.held && this.chaserStart) {
        const rt = 0.28, u = Math.min(1, Math.max(0, (t - rt) / Math.max(0.05, plan.t - rt)));
        f.pos.x = lerp(this.chaserStart.x, plan.point.x, u); f.pos.z = lerp(this.chaserStart.z, plan.point.z, u);
        f.target = plan.point; f.anim = u > 0 && u < 1 ? 'run' : f.anim;
      } else if (f !== this.chaser && f.anim !== 'celebrate') { f.anim = 'ready'; }
      if (f.role === 'keeper' && f !== this.chaser) { /* keeper stays put */ }
    }

    // ----- catch: immediate dismissal -----
    if (plan.kind === 'catch' && t >= plan.t) { return this.finish({ runs: 0, wicket: { kind: 'caught', who: 'striker' }, fielder: this.chaser.name }); }
    if (plan.kind === 'boundary' && t >= plan.t + 0.5) { return this.finish({ runs: plan.runs, boundary: true }); }

    // ----- batters running -----
    if (this.running) {
      const u = this.runProgress; const r = this.runsDone + 1; // current run index (1-based)
      const strikerHeadsToBowler = r % 2 === 1; // rig0 = original striker
      const a0 = strikerHeadsToBowler ? S_END : B_END, a1 = strikerHeadsToBowler ? B_END : S_END;
      const bend = Math.sin(u * Math.PI) * 0.9;
      view.batter(0, lerp(a0.x, a1.x, u) + bend, lerp(a0.z, a1.z, u), 'run', a1);
      view.batter(1, lerp(a1.x, a0.x, u) - bend, lerp(a1.z, a0.z, u), 'run', a0);

      // Decision point for the next run
      if (!this.decided && u >= 0.72) {
        this.decided = true;
        if (!this.userBatting) this.wantNext = aiTakesRun(plan, r, this.aggr);
      }
      // Run-out: ball reaches the stumps end while a runner is still short of it
      const ret = plan.tReturn[this.destKey];
      if (!this.checkedRunOut && t >= ret && u < 0.96 && this.held) {
        this.checkedRunOut = true;
        if (Math.random() < 0.78) {
          const headsToBowlerEnd = this.destKey === 'bowler';
          const strikerIsOut = headsToBowlerEnd === strikerHeadsToBowler;
          return this.finish({ runs: this.runsDone, wicket: { kind: 'runout', who: strikerIsOut ? 'striker' : 'non' }, fielder: this.chaser?.name });
        }
      }
      if (u >= 1) {
        this.runsDone++;
        if (this.wantNext && this.canTapRun) { this.runStart = t; this.decided = false; this.wantNext = false; }
        else this.running = false;
      }
    } else if (t >= plan.t + 0.5 && plan.kind !== 'boundary') {
      return this.finish({ runs: this.runsDone });
    }
    return null;
  }

  finish(res) { this.done = res; return res; }
}
