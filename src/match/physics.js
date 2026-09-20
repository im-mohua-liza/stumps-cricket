// Ball physics. Units: metres, seconds. Pitch runs along the z axis.
//  bowler end z = -PITCH_HALF, striker end z = +PITCH_HALF, +x = off side for a right-hander.
export const G = 9.81;
export const PITCH_HALF = 10.06;
export const STUMP_HALF_W = 0.114;
export const STUMP_H = 0.711;
export const ROPE_R = 62;
export const BALL_R = 0.036;

export const LENGTHS = { yorker: 0.9, full: 2.6, good: 5.2, short: 7.6 };

// Builds the initial ball state for a delivery so that it lands on (line, length).
//  pace m/s (fast ~38, medium ~30, spin ~21); line = x at pitch point (m); length = metres in front of batter's stumps
//  swing = lateral air acceleration (m/s^2, +off); spin = lateral speed added at bounce (m/s, +off)
export function makeDelivery({ pace, line, length, swing = 0, spin = 0, releaseX = 0 }) {
  const x0 = releaseX, y0 = 2.15, z0 = -PITCH_HALF + 0.9;
  const tz = PITCH_HALF - length;
  const t = (tz - z0) / pace;
  const vx = (line - x0 - 0.5 * swing * t * t) / t;
  const vy = (0.5 * G * t * t - y0) / t;
  return {
    x: x0, y: y0, z: z0, vx, vy, vz: pace,
    ax: swing, spin, bounces: 0, rolling: false, hit: false, t: 0, landX: line, landZ: tz,
    pitchLength: length,
  };
}

const clone = b => ({ ...b });

// Advance the ball by dt. Mutates and returns b. Handles swing, bounce, turn, rolling.
export function stepBall(b, dt) {
  if (!b.hit) b.vx += b.ax * dt * (b.bounces === 0 ? 1 : 0);
  b.vy -= G * dt;
  if (b.hit) { const d = 1 - 0.012 * dt; b.vx *= d; b.vz *= d; }
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.t += dt;

  if (b.y <= BALL_R && b.vy < 0) {
    b.y = BALL_R;
    b.bounces++;
    if (!b.hit && b.bounces === 1) { b.vx += b.spin; b.vz *= 0.82; b.vy = -b.vy * 0.66; }
    else { b.vy = -b.vy * 0.5; b.vx *= 0.86; b.vz *= 0.86; }
    if (Math.abs(b.vy) < 1.3) { b.vy = 0; b.rolling = true; }
  }
  if (b.rolling) {
    const k = Math.exp(-0.34 * dt);
    b.vx *= k; b.vz *= k; b.y = BALL_R; b.vy = 0;
  }
  return b;
}

export const speedOf = b => Math.hypot(b.vx, b.vy, b.vz);
export const groundDist = b => Math.hypot(b.x, b.z);

// Simulate a copy of the ball until it reaches z-plane (moving +z). Returns state at crossing, or null.
export function predictAtZ(ball, zPlane, maxT = 3) {
  const b = clone(ball); const dt = 1 / 240;
  while (b.t - ball.t < maxT) {
    const pz = b.z; stepBall(b, dt);
    if (pz < zPlane && b.z >= zPlane) return { ...b };
    if (b.vz <= 0 && b.z < zPlane) return null;
  }
  return null;
}

// Would the undisturbed delivery hit the stumps at the striker's end?
export function wouldHitStumps(ball) {
  const p = predictAtZ(ball, PITCH_HALF);
  return !!p && Math.abs(p.x) <= STUMP_HALF_W + BALL_R && p.y <= STUMP_H && p.y > 0;
}

// Boundary: returns 4, 6 or 0 (still in play).
export function boundaryCheck(b) {
  if (groundDist(b) < ROPE_R) return 0;
  return b.bounces === 0 ? 6 : 4;
}
