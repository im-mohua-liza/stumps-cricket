// Shot resolution: turns (incoming ball, player's shot input, timing) into an outcome and new ball velocity.
import { PITCH_HALF } from './physics.js';

export const CONTACT_Z = PITCH_HALF - 0.9;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Choose a shot label from swipe angle (deg, 0 = straight, +off, -leg) and the ball's pitched length.
export function classifyShot(angleDeg, length, tapOnly) {
  if (tapOnly) return 'defend';
  const a = Math.abs(angleDeg);
  if (a < 22) return 'drive';
  if (a < 65) return angleDeg > 0 ? 'coverdrive' : 'flick';
  if (angleDeg > 0) return length > 5.5 || a > 100 ? 'cut' : 'square';
  return length > 5.8 ? 'pull' : 'sweep';
}

// How well does this shot suit the delivery? 0..1
function suitability(shot, ball, length) {
  const h = ball.y, x = ball.x;
  let s;
  switch (shot) {
    case 'defend': s = 1; break;
    case 'drive': case 'coverdrive': s = length < 3.5 ? 1 : length < 5.6 ? 0.72 : 0.3; break;
    case 'flick': s = length < 5 ? 0.9 : 0.5; break;
    case 'pull': s = length > 6.2 ? 1 : length > 5 ? 0.55 : 0.2; break;
    case 'cut': case 'square': s = length > 5.4 ? 1 : 0.5; break;
    case 'sweep': s = length > 3 && length < 6.5 ? 0.85 : 0.35; break;
    default: s = 0.6;
  }
  if (h > 1.5 && (shot === 'drive' || shot === 'coverdrive' || shot === 'flick')) s *= 0.6;
  if (shot === 'cut' && x < 0.2) s *= 0.6;               // cut needs width
  if ((shot === 'flick' || shot === 'pull' || shot === 'sweep') && x > 0.5) s *= 0.55; // leg-side shot to wide off ball
  return s;
}

// dt = contact time minus ball arrival time (s, game time). Negative = early. skill 0..100.
export function resolveShot({ ball, angleDeg, power, loft, tapOnly, dt, window = 0.11, skill = 60, freeHit = false }) {
  const length = ball.pitchLength;
  const shot = classifyShot(angleDeg, length, tapOnly);
  const sigma = window * (1.25 - (skill - 50) / 200);
  const timing = Math.exp(-((dt / sigma) ** 2));
  const suit = suitability(shot, ball, length);
  const score = timing * (0.35 + 0.65 * suit) * (0.9 + Math.random() * 0.2);

  // Direction (world): 0 deg = down the ground (-z). Early pulls leg-ward, late pushes off-ward.
  let dir = clamp(angleDeg, -140, 140) + clamp(dt / sigma, -2, 2) * 12;
  const res = { shot, timing, suit, score, dir, loft: !!loft };

  if (Math.abs(dt) > sigma * 2.6 && !tapOnly) { res.outcome = 'miss'; return res; }
  if (score < 0.14) { res.outcome = 'miss'; return res; }

  let speed, up;
  if (shot === 'defend') {
    speed = 2.5 + 4 * power * timing; up = 0.02;
    res.outcome = score < 0.25 ? 'edge' : 'defend';
    if (res.outcome === 'edge') { speed = 8 + Math.random() * 6; dir = 160 * (Math.random() < 0.5 ? 1 : -1); up = 0.2; }
  } else if (score < 0.3) {
    res.outcome = 'edge';
    speed = 12 + Math.random() * 10; dir = (dt > 0 ? 1 : -1) * (140 + Math.random() * 30); up = 0.12 + Math.random() * 0.25;
  } else {
    const base = 10 + 24 * clamp(power, 0.15, 1);
    speed = base * (0.45 + 0.55 * clamp(score, 0, 1));
    up = loft ? 0.32 + 0.4 * power * score : 0.03 + Math.random() * 0.04;
    res.outcome = score < 0.5 ? 'mistime' : score > 0.78 ? 'perfect' : 'good';
    if (res.outcome === 'mistime') up += 0.18 + Math.random() * 0.25;   // skied / hurried
    if (shot === 'pull' && !loft) up += 0.1;
  }
  const rad = dir * DEG;
  res.speed = speed;
  res.vel = { x: Math.sin(rad) * speed * Math.cos(up), y: speed * Math.sin(up * 1.35) + 0.4, z: -Math.cos(rad) * speed * Math.cos(up) };
  return res;
}

export function applyShot(ball, res) {
  ball.vx = res.vel.x; ball.vy = res.vel.y; ball.vz = res.vel.z;
  ball.ax = 0; ball.hit = true; ball.bounces = 0; ball.rolling = false; ball.y = Math.max(ball.y, 0.3);
  return ball;
}
