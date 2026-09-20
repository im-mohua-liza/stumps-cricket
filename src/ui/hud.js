import { audio } from '../audio/audio.js';

// In-game HUD: scoreboard, commentary, batting gestures, bowling panel. Emits through callbacks only.
export function createHud(cb) {
  const el = document.getElementById('hud');
  el.innerHTML = `
    <div class="score">
      <div class="sb main"><div><div class="tm" id="h-team"></div><div class="big" id="h-score">0/0</div><div class="ov" id="h-over"></div></div>
        <div style="flex:1;min-width:0"><div class="who" id="h-who"></div><div class="balls" id="h-balls"></div></div></div>
    </div>
    <div class="iconbtn" id="h-sc" style="top:calc(var(--safe-t) + 92px);right:calc(var(--safe-r) + 8px)">≡</div>
    <div class="iconbtn" id="h-rp" style="top:calc(var(--safe-t) + 142px);right:calc(var(--safe-r) + 8px)">⟲</div>
    <div class="iconbtn" id="h-mu" style="top:calc(var(--safe-t) + 192px);right:calc(var(--safe-r) + 8px)">♪</div>
    <div class="popup" id="h-pop"></div>
    <div class="hint" id="h-hint" hidden></div>
    <div class="ctl" id="h-ctl" hidden></div>
    <div class="bpanel" id="h-bp" hidden></div>
    <div class="comm" id="h-comm"></div>
    <div id="h-in" style="position:absolute;inset:0;z-index:-1"></div>`;
  const $ = id => el.querySelector('#' + id);
  el.hidden = true;

  $('h-sc').onclick = () => cb.onScorecard();
  $('h-rp').onclick = () => cb.onReplay();
  $('h-mu').onclick = () => { audio.setEnabled(!audio.enabled); $('h-mu').style.opacity = audio.enabled ? 1 : .4; };

  // ---------- Batting input (pointer + keyboard) ----------
  const inp = $('h-in'); inp.style.zIndex = 0; inp.style.pointerEvents = 'auto'; let down = null; let batting = false; let loft = false; let aimKey = 0;
  const H = () => window.innerHeight;
  inp.addEventListener('pointerdown', e => { audio.init(); down = { x: e.clientX, y: e.clientY, t: performance.now() }; cb.onTouch?.(); });
  inp.addEventListener('pointerup', e => {
    if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y, dur = Math.max(30, performance.now() - down.t);
    const dist = Math.hypot(dx, dy); down = null;
    if (!batting) return;
    if (dist < 16) return cb.onShot({ tapOnly: true, angleDeg: 0, power: 0.3, loft });
    let a = Math.atan2(dx, -dy) * 180 / Math.PI;           // 0 = up (straight), + right (off), - left (leg)
    if (dy > 40) a = dx >= 0 ? 100 + Math.min(40, dy / 4) : -100 - Math.min(40, dy / 4); // downward flicks = behind square
    const power = Math.max(0.25, Math.min(1, (dist / dur) / 1.4));
    cb.onShot({ tapOnly: false, angleDeg: a, power, loft });
  });
  inp.addEventListener('pointercancel', () => { down = null; });
  window.addEventListener('keydown', e => {
    if (e.repeat) return; audio.init();
    if (e.key === 'l' || e.key === 'L') { setLoft(!loft); return; }
    if (e.key === 'r' || e.key === 'R') { cb.onRun?.(); return; }
    const map = { ArrowLeft: -60, ArrowRight: 60, ArrowUp: 0, ArrowDown: 120, a: -100, d: 100, w: 0 };
    if (e.key in map) { aimKey = map[e.key]; if (batting) cb.onShot({ tapOnly: false, angleDeg: aimKey, power: 0.8, loft }); }
    if (e.key === ' ' && batting) cb.onShot({ tapOnly: true, angleDeg: 0, power: 0.3, loft });
  });

  function setLoft(v) { loft = v; const b = el.querySelector('#loft'); if (b) b.classList.toggle('on', v); }
  function ctlBat() {
    const c = $('h-ctl'); c.hidden = false;
    c.innerHTML = `<button class="tog ${loft ? 'on' : ''}" id="loft">LOFT</button><button class="rbtn off" id="run">RUN</button>`;
    c.querySelector('#loft').onclick = () => setLoft(!loft);
    const r = c.querySelector('#run'); r.onpointerdown = e => { e.stopPropagation(); cb.onRun?.(); };
  }

  // ---------- Bowling panel ----------
  let bowlState = null;
  function bowlPanel({ bowler, fieldSet, onField, onDeliver, windowW = 0.16 }) {
    const p = $('h-bp'); p.hidden = false; $('h-ctl').hidden = true;
    const type = bowler.bowlType === 'part' ? 'medium' : bowler.bowlType;
    const st = bowlState = { x: 0.55, y: 0.42, swing: 0, spin: 0, speed: 1, field: fieldSet };
    const varChips = type === 'spin'
      ? `<div class="chip on" data-v="spin:-1">Off spin</div><div class="chip" data-v="spin:1">Leg spin</div>`
      : `<div class="chip on" data-v="swing:0">Straight</div><div class="chip" data-v="swing:1">Out swing</div><div class="chip" data-v="swing:-1">In swing</div>`;
    p.innerHTML = `
      <div class="pmap" id="pm"><div class="z" style="top:6%">SHORT</div><div class="z" style="top:38%">GOOD</div><div class="z" style="top:66%">FULL</div><div class="z" style="top:88%">YORKER</div>
        <div class="stm"></div><div class="dot" id="pd"></div></div>
      <div class="bopts">
        <div style="font-size:12px;color:var(--dim)"><b style="color:var(--ink)">${bowler.name}</b> &nbsp;${type} • drag the map to set line and length</div>
        <div class="chips" id="vars">${varChips}</div>
        <div class="chips" id="spd"><div class="chip" data-s="0.93">Slow</div><div class="chip on" data-s="1">Std</div><div class="chip" data-s="1.07">Quick</div></div>
        <div class="chips" id="fld"><div class="chip ${fieldSet === 'attacking' ? 'on' : ''}" data-f="attacking">Attack</div><div class="chip ${fieldSet === 'balanced' ? 'on' : ''}" data-f="balanced">Balanced</div><div class="chip ${fieldSet === 'defensive' ? 'on' : ''}" data-f="defensive">Defend</div></div>
        <button class="go" id="bowl">BOWL</button>
      </div>`;
    const pm = p.querySelector('#pm'), pd = p.querySelector('#pd');
    const place = () => { pd.style.left = st.x * 100 + '%'; pd.style.top = st.y * 100 + '%'; }; place();
    const setFromEvent = e => { const r = pm.getBoundingClientRect(); st.x = Math.max(0.05, Math.min(0.95, (e.clientX - r.left) / r.width)); st.y = Math.max(0.03, Math.min(0.97, (e.clientY - r.top) / r.height)); place(); };
    let drag = false; pm.onpointerdown = e => { drag = true; pm.setPointerCapture(e.pointerId); setFromEvent(e); }; pm.onpointermove = e => drag && setFromEvent(e); pm.onpointerup = () => { drag = false; };
    p.querySelector('#vars').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; const [k, v] = c.dataset.v.split(':'); st.swing = 0; st.spin = 0; st[k] = +v; [...c.parentNode.children].forEach(n => n.classList.toggle('on', n === c)); };
    p.querySelector('#spd').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; st.speed = +c.dataset.s; [...c.parentNode.children].forEach(n => n.classList.toggle('on', n === c)); };
    p.querySelector('#fld').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; st.field = c.dataset.f; onField(st.field); [...c.parentNode.children].forEach(n => n.classList.toggle('on', n === c)); };
    p.querySelector('#bowl').onclick = () => releaseMeter(windowW, err => {
      const line = -(st.x - 0.5) * 2 * 1.3, length = 0.5 + (1 - st.y) * 8.6;
      onDeliver({ type, line, length, swing: st.swing * 1.3, spin: st.spin * 2.4, speedMul: st.speed, err });
    });
    return p;
  }

  // Timing meter: tap when the marker sits in the green zone for accuracy
  function releaseMeter(w, done) {
    const p = $('h-bp'); const go = p.querySelector('#bowl');
    const mt = document.createElement('div'); mt.className = 'meter'; mt.innerHTML = `<div class="zone" style="left:${(0.5 - w / 2) * 100}%;width:${w * 100}%"></div><div class="mk"></div>`;
    p.querySelector('.bopts').replaceChild(mt, go); const mk = mt.querySelector('.mk');
    const t0 = performance.now(); let raf, fin = false;
    const pos = () => { const ph = ((performance.now() - t0) / 700) % 2; return ph < 1 ? ph : 2 - ph; };
    const tick = () => { mk.style.left = `calc(${pos() * 100}% - 3px)`; raf = requestAnimationFrame(tick); }; tick();
    const stop = () => { if (fin) return; fin = true; cancelAnimationFrame(raf); const v = pos(); p.hidden = true; mt.onpointerdown = null; done(v - 0.5); audio.blip(520); };
    mt.onpointerdown = stop; setTimeout(() => { if (!fin) stop(); }, 3200);
  }

  return {
    el, show() { el.hidden = false; }, hide() { el.hidden = true; },
    update(m, extra = {}) {
      const inn = m.cur; const bt = m.teams[inn.batSide];
      $('h-team').textContent = `${bt.short} ${m.format.name}${m.innings.length > 1 && m.format.id === 'TEST' ? ' • Inns ' + m.innings.length : ''}`;
      $('h-score').textContent = `${inn.runs}/${inn.wickets}`;
      const tgt = inn.target != null ? ` • Need ${Math.max(0, inn.target - inn.runs)} off ${Math.max(0, m.ballsLeft)}` : '';
      $('h-over').textContent = `${Math.floor(inn.balls / 6)}.${inn.balls % 6} / ${m.overs} ov${tgt}`;
      const s = m.striker, n = m.nonStriker, bw = inn.bowlerId ? m.bowlerStats(inn.bowlerId) : null;
      $('h-who').innerHTML = `<b>${s.name.split(' ')[1] || s.name}*</b> ${s.runs}(${s.balls}) &nbsp; ${n.name.split(' ')[1] || n.name} ${n.runs}(${n.balls})<br>${bw ? `${bw.name.split(' ')[1] || bw.name} ${Math.floor(bw.balls / 6)}.${bw.balls % 6}-${bw.runs}-${bw.wkts}` : ''}${m.isFreeHit ? ' &nbsp;<span class="pill" style="background:var(--acc2);color:#222">FREE HIT</span>' : ''}`;
      $('h-balls').innerHTML = inn.thisOver.map(b => `<div class="ball ${b === '4' ? 'r4' : b === '6' ? 'r6' : b === 'W' ? 'w' : (b === 'Wd' || b === 'Nb') ? 'x' : ''}">${b}</div>`).join('');
    },
    comment(text, over) { $('h-comm').innerHTML = `<b>${over || ''}</b>${text}`; },
    popup(text, color = '#fff') { const p = $('h-pop'); p.textContent = text; p.style.color = color; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); },
    hint(text) { const h = $('h-hint'); h.hidden = !text; h.textContent = text || ''; },
    battingMode(on) { batting = on; if (on) ctlBat(); else { if (!bowlState || $('h-bp').hidden) $('h-ctl').hidden = true; } },
    setRunEnabled(on) { const r = el.querySelector('#run'); if (r) r.classList.toggle('off', !on); },
    bowlPanel, hideBowl() { $('h-bp').hidden = true; },
    hideControls() { $('h-ctl').hidden = true; $('h-bp').hidden = true; batting = false; },
    get loft() { return loft; },
  };
}
