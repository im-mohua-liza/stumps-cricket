// Fully synthesized audio (no asset files): crowd ambience, bat crack, wicket, cheers.
let ctx = null, master = null, crowdGain = null, crowdFilter = null, enabled = true;

function noiseBuffer(seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate); const d = b.getChannelData(0);
  let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.06 * w) / 1.06; d[i] = last * 3.5; }
  return b;
}

export const audio = {
  // Must be called from a user gesture (browser autoplay policy)
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = enabled ? 0.8 : 0; master.connect(ctx.destination);
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(3); src.loop = true;
    crowdFilter = ctx.createBiquadFilter(); crowdFilter.type = 'bandpass'; crowdFilter.frequency.value = 500; crowdFilter.Q.value = 0.6;
    crowdGain = ctx.createGain(); crowdGain.gain.value = 0.08;
    src.connect(crowdFilter).connect(crowdGain).connect(master); src.start();
  },
  setEnabled(v) { enabled = v; if (master) master.gain.value = v ? 0.8 : 0; },
  get enabled() { return enabled; },

  // 0..1 crowd energy
  excite(level) { if (!ctx) return; const t = ctx.currentTime; crowdGain.gain.linearRampToValueAtTime(0.06 + level * 0.35, t + 0.4); crowdFilter.frequency.linearRampToValueAtTime(400 + level * 900, t + 0.4); },
  cheer(level = 1, dur = 2.2) {
    if (!ctx) return; const t = ctx.currentTime;
    crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setValueAtTime(crowdGain.gain.value, t);
    crowdGain.gain.linearRampToValueAtTime(0.1 + 0.4 * level, t + 0.25); crowdGain.gain.linearRampToValueAtTime(0.09, t + dur);
    crowdFilter.frequency.linearRampToValueAtTime(1100, t + 0.25); crowdFilter.frequency.linearRampToValueAtTime(520, t + dur);
  },
  groan() { if (!ctx) return; const t = ctx.currentTime; crowdGain.gain.linearRampToValueAtTime(0.22, t + 0.2); crowdGain.gain.linearRampToValueAtTime(0.08, t + 1.6); crowdFilter.frequency.linearRampToValueAtTime(300, t + 0.5); },

  bat(power = 1) {
    if (!ctx) return; const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(180 + 120 * power, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * power + 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.16);
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(0.2); const ng = ctx.createGain(); ng.gain.setValueAtTime(0.35 * power, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; n.connect(hp).connect(ng).connect(master); n.start(t); n.stop(t + 0.1);
  },
  thud() { if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); const g = ctx.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(g).connect(master); o.start(t); o.stop(t + 0.16); },
  wicket() {
    if (!ctx) return; const t = ctx.currentTime; this.thud();
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(0.5); const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; n.connect(bp).connect(g).connect(master); n.start(t); n.stop(t + 0.5);
  },
  whistle() { if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(2200, t); o.frequency.linearRampToValueAtTime(2600, t + 0.25); const g = ctx.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.03); g.gain.linearRampToValueAtTime(0, t + 0.3); o.connect(g).connect(master); o.start(t); o.stop(t + 0.32); },
  blip(f = 660) { if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08); o.connect(g).connect(master); o.start(t); o.stop(t + 0.09); },
};
