// Fielding: field placements and interception planning for a struck ball.
import { PITCH_HALF, stepBall, boundaryCheck, speedOf } from './physics.js';

// Polar helper: distance d from the striker's crease, angle a (deg, 0 = straight, +off, -leg, >90 = behind square)
const at = (d, a) => { const r = a * Math.PI / 180; return { x: d * Math.sin(r), z: PITCH_HALF - d * Math.cos(r) }; };

export const FIELD_SETS = {
  attacking: [at(15, 40), at(16, 90), at(24, 30), at(24, -30), at(22, -70), at(19, -95), at(9, -60), at(30, 12), at(30, -10)],
  balanced:  [at(17, 155), at(22, 95), at(29, 50), at(30, 18), at(30, -18), at(30, -55), at(24, -95), at(44, -150), at(44, 140)],
  defensive: [at(46, 60), at(50, 20), at(52, -20), at(48, -60), at(34, -95), at(38, 95), at(52, -150), at(52, 150), at(28, 40)],
};
export const FIELD_NAMES = ['attacking', 'balanced', 'defensive'];

const throwSpeed = 30;
export const RUN_TIME = 2.7;        // seconds to cross the pitch (game time)

// Creates the 11 fielder objects. squad = bowling XI; bowlerId = current bowler.
export function buildField(squad, bowlerId, setName = 'balanced') {
  const set = FIELD_SETS[setName] || FIELD_SETS.balanced;
  const bowler = squad.find(p => p.id === bowlerId) || squad[squad.length - 1];
  const keeper = squad.find(p => p.role === 'wk' && p.id !== bowler.id) || squad.find(p => p.id !== bowler.id);
  const others = squad.filter(p => p !== bowler && p !== keeper);
  const mk = (p, home, role) => ({
    id: p.id, name: p.name, player: p, role, home: { ...home }, pos: { ...home }, target: null,
    speed: 6.6 + (p.bowl + p.bat) / 200 * 1.6, catchSkill: 0.62 + Math.min(0.32, (p.bat + p.bowl) / 400), anim: 'idle', facing: 0,
  });
  const f = [mk(bowler, { x: 0, z: -PITCH_HALF - 0.4 }, 'bowler'), mk(keeper, { x: 0.25, z: PITCH_HALF + 13 }, 'keeper')];
  others.slice(0, 9).forEach((p, i) => f.push(mk(p, set[i], 'field')));
  return f;
}

// Plan the whole fielding sequence for a struck ball. All times in game seconds after the strike.
export function planFielding(ball0, fielders, { catchFactor = 1 } = {}) {
  const b = { ...ball0 }; const dt = 0.05;
  const reaction = 0.28;
  for (let t = 0; t < 16; t += dt) {
    stepBall(b, dt);
    const boundary = boundaryCheck(b);
    // fielders may still cut it off inside the rope; check before declaring a boundary
    let best = null;
    for (const f of fielders) {
      const d = Math.hypot(f.pos.x - b.x, f.pos.z - b.z);
      const canReach = f.speed * Math.max(0, t - reaction);
      const airborne = b.bounces === 0 && !b.rolling;
      const reach = airborne ? 1.5 : (speedOf(b) < 20 ? 1.3 : 0.7);
      if (d - reach > canReach) continue;
      if (airborne) { if (b.y < 0.25 || b.y > 2.7) continue; }
      else if (b.y > 1.0) continue;
      if (!best || d - canReach < best.slack) best = { f, slack: d - canReach, air: airborne };
    }
    if (best) {
      const tHold = t;
      const f = best.f;
      const dEnds = { bowler: Math.hypot(b.x, b.z + PITCH_HALF), striker: Math.hypot(b.x, b.z - PITCH_HALF) };
      const tReturn = { bowler: tHold + 0.32 + dEnds.bowler / throwSpeed, striker: tHold + 0.32 + dEnds.striker / throwSpeed };
      const hard = Math.min(1, speedOf(b) / 26);
      const chance = best.air ? Math.min(0.97, f.catchSkill * catchFactor * (1 - 0.25 * hard)) : 1;
      const caught = best.air && Math.random() < chance;
      return {
        kind: best.air ? (caught ? 'catch' : 'drop') : 'stop', fielder: f, t: tHold,
        point: { x: b.x, y: b.y, z: b.z }, tReturn, ballAtHold: { ...b },
      };
    }
    if (boundary) return { kind: 'boundary', runs: boundary, t, point: { x: b.x, y: b.y, z: b.z }, tReturn: { bowler: t + 6, striker: t + 6 } };
  }
  return { kind: 'stop', fielder: fielders[0], t: 16, point: { x: b.x, y: 0, z: b.z }, tReturn: { bowler: 18, striker: 18 } };
}

// Run-out / completed-runs resolution. Batters begin running at t=0 (contact) and complete one cycle every RUN_TIME.
// `attempts` = runs the players tried to take (each attempt started before ball returned).
export function completedRuns(plan, wantedRuns) {
  if (plan.kind === 'boundary') return { runs: plan.runs, runOut: false };
  let runs = 0; let runOut = false;
  for (let i = 1; i <= wantedRuns; i++) {
    const end = i * RUN_TIME;
    // odd runs finish at bowler's end, even at striker's end
    const dest = i % 2 === 1 ? 'bowler' : 'striker';
    const ret = plan.tReturn[dest];
    if (ret < end - 0.15 && Math.random() < 0.82) { runOut = true; break; }
    runs++;
  }
  return { runs, runOut };
}
