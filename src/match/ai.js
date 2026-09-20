// AI decision making for bowlers and batters, scaled by difficulty.
import { LENGTHS } from './physics.js';
import { RUN_TIME } from './fielding.js';

const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += Math.random(); return (s - 2) / 0.58; };
const pick = (weights) => { let r = Math.random() * weights.reduce((a, [, w]) => a + w, 0); for (const [v, w] of weights) { if ((r -= w) <= 0) return v; } return weights[0][0]; };

// Situation helper: 0 = calm, 1 = desperate/attacking (chasing or death overs)
export function pressure(match) {
  const inn = match.cur; const ballsLeft = match.ballsLeft; const total = match.overs * 6;
  let p = 0.3 + 0.4 * (1 - ballsLeft / total) * (match.format.id === 'TEST' ? 0.3 : 1);
  if (inn.target != null) { const need = inn.target - inn.runs; const rr = need / Math.max(1, ballsLeft) * 6; p = Math.min(1, Math.max(0.1, rr / 12)); }
  return p;
}

export function aiDelivery(bowler, match, diff) {
  const skill = (bowler.bowl / 100) * (0.6 + 0.4 * diff.aiBowl) + 0.1;
  const death = match.ballsLeft <= 24 && match.format.id !== 'TEST';
  const type = bowler.bowlType === 'part' ? 'medium' : bowler.bowlType;
  const length = pick(death
    ? [['yorker', 4], ['full', 2], ['good', 2], ['short', 1]]
    : [['good', 5], ['full', 3], ['short', 2], ['yorker', 0.6]]);
  const err = (1.1 - skill) * 0.55;
  let pace, swing = 0, spin = 0;
  if (type === 'fast') { pace = rand(35, 40) * (0.9 + skill * 0.1); swing = rand(-0.8, 1.6) * (skill > 0.55 ? 1 : 0.5); }
  else if (type === 'medium') { pace = rand(27, 32); swing = rand(-1.4, 1.4); }
  else { pace = rand(19, 24); spin = rand(-2.6, 2.6) * (0.6 + skill * 0.6); }
  const line = 0.15 + gauss() * err + (Math.random() < 0.08 ? rand(0.8, 1.5) : 0);
  const len = LENGTHS[length] + gauss() * err * 0.9;
  return { pace, line, length: Math.max(0.5, Math.min(9, len)), swing, spin, type, tag: length };
}

// Returns the batter's chosen response to an incoming delivery
export function aiBat(batter, delivery, match, diff, window) {
  const skill = batter.bat / 100; const press = pressure(match);
  const aggr = Math.min(1, 0.25 + press * 0.7 * (0.5 + diff.aiBat * 0.5));
  const L = delivery.length, x = delivery.line;
  // Leave clearly wide balls
  if (Math.abs(x) > 1.05 && Math.random() < 0.8) return { leave: true };
  let angle, tapOnly = false;
  if (L < 2.2 && !aggr) tapOnly = true;
  if (L > 6.5) angle = Math.random() < 0.5 ? rand(-110, -55) : rand(60, 110);           // pull or cut
  else if (L < 3.5) angle = rand(-25, 35);                                                // drive
  else angle = x > 0.3 ? rand(20, 70) : rand(-60, -10);
  if (Math.random() < 0.15 * (1 - aggr)) tapOnly = true;
  const loft = Math.random() < aggr * 0.75;
  const power = Math.min(1, rand(0.4, 0.8) + aggr * 0.35);
  // Timing error: better batters and higher difficulty are more precise
  const sigma = window * (1.5 - skill * 0.7) * (1.4 - diff.aiBat * 0.7) * 0.6;
  return { angleDeg: angle, power, loft, tapOnly, dt: gauss() * sigma };
}

// Should batters go for the next run? (called near the end of run k). AI + auto-decisions.
export function aiTakesRun(plan, k, aggr = 0.5) {
  const nextEnd = (k + 1) * RUN_TIME;
  const dest = (k + 1) % 2 === 1 ? 'bowler' : 'striker';
  const safe = plan.tReturn[dest] - nextEnd;
  return safe > 0.9 - aggr * 0.7 && plan.kind !== 'boundary';
}

// Commentary lines
const P = arr => arr[Math.floor(Math.random() * arr.length)];
export function commentary(ev) {
  const { runs, wicket, extra, shot, outcome, batter, bowler, boundary, fielder } = ev;
  if (wicket) {
    const k = wicket.kind;
    if (k === 'bowled') return P([`BOWLED! ${bowler} rattles the stumps!`, `Timber! ${batter} misses and the stumps are shattered.`]);
    if (k === 'lbw') return P([`Trapped in front! ${batter} has to go, LBW.`, `That looks plumb. LBW, ${batter} is gone.`]);
    if (k === 'caught') return P([`Caught! ${fielder} takes it safely. ${batter} departs.`, `Straight down the throat of ${fielder}. What a catch!`]);
    if (k === 'runout') return P([`Direct hit! ${batter} is short of the crease.`, `Mix-up in the middle and ${batter} is run out!`]);
  }
  if (extra === 'wide') return P(['Wide ball, drifting down leg.', 'Too wide, the umpire stretches the arms out.']);
  if (extra === 'noball') return 'No ball! And it is a free hit next.';
  if (runs === 6) return P([`SIX! ${batter} launches it into the stands!`, `Massive! That one is gone into the crowd.`, `Maximum! Clean strike from ${batter}.`]);
  if (runs === 4) return P([`FOUR! Beautifully timed through the field.`, `Cracked to the rope, no chance for the fielders.`, `Boundary! ${batter} finds the gap.`]);
  if (runs === 0) return P([`Dot ball. ${bowler} keeps it tight.`, `Defended solidly by ${batter}.`, `Beaten! Just misses the edge.`]);
  return P([`${runs} run${runs > 1 ? 's' : ''}, good running between the wickets.`, `Worked away for ${runs}.`, `Pushed into the gap for ${runs}.`]);
}
