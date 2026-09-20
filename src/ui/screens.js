import { TEAMS, getTeam, makeCustomTeam } from '../data/teams.js';
import { FORMATS, OVER_PRESETS, DIFFICULTY } from '../data/formats.js';
import { storage } from '../core/storage.js';
import { audio } from '../audio/audio.js';

const root = () => document.getElementById('screen');
export function clearScreen() { root().innerHTML = ''; }
export function toast(msg, ms = 1800) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }

// Renders html into the screen layer; handlers keyed by data-act are attached via `acts`.
export function show(html, acts = {}, cls = '') {
  const el = root(); el.innerHTML = `<div class="screen ${cls}">${html}</div>`;
  el.querySelectorAll('[data-act]').forEach(n => n.addEventListener('click', e => {
    audio.init(); audio.blip(880);
    const fn = acts[n.dataset.act]; if (fn) fn(n.dataset.val, n, e);
  }));
  return el.firstElementChild;
}
export const allTeams = () => { const s = storage.get(); return s.customTeam ? [makeCustomTeam(s.customTeam), ...TEAMS] : TEAMS; };
export const findTeam = id => allTeams().find(t => t.id === id) || getTeam(id);
const crest = t => `<div class="crest" style="border-color:${t.color};color:${t.color};background:${t.alt}22">${t.short}</div>`;

export function menu({ onQuick, onTournament, onCareer, onCustom, onSettings }) {
  const c = storage.get().career;
  show(`
    <div class="center">
      <span class="pill">Lv ${c.level} &nbsp;•&nbsp; ${c.coins} coins</span>
      <h1 style="margin-top:14px">STUMPS<br><span>ARENA</span></h1>
      <p class="sub">3D cricket. Swipe to smash, drag to bowl.</p>
      <button class="btn primary" data-act="quick">Quick Match<small>T20, ODI or Test against the AI</small></button>
      <button class="btn" data-act="tour">Tournament<small>League table and a final</small></button>
      <button class="btn" data-act="career">Career<small>Climb the ranks, earn coins and XP</small></button>
      <div class="row"><button class="btn" data-act="custom">My Team</button><button class="btn" data-act="settings">Settings</button></div>
    </div>`, { quick: onQuick, tour: onTournament, career: onCareer, custom: onCustom, settings: onSettings });
}

export function teamSelect({ title, sub, pickOpponent = true, lockedOpp = null, onBack, onNext }) {
  let mine = null, opp = lockedOpp;
  const draw = () => {
    const teams = allTeams();
    const step = !mine ? 'your team' : (opp ? 'ready' : 'opponent');
    show(`
      <div class="top"><button class="back" data-act="back">‹ Back</button><div><h2>${title}</h2><div class="pill">${sub || ''}</div></div></div>
      <h3>${!mine ? 'Choose your team' : (pickOpponent && !lockedOpp ? 'Choose opponent' : 'Squad ready')}</h3>
      <div class="teams">${teams.map(t => {
        const sel = t.id === mine || t.id === opp; const dim = (mine && !opp && t.id === mine) || (mine && t.id === opp && false);
        return `<div class="team ${sel ? 'sel' : ''} ${dim ? 'dim' : ''}" data-act="team" data-val="${t.id}">${crest(t)}<b>${t.name}</b>
          <div class="pill" style="margin-top:6px">Rating ${t.strength}</div><div class="bar"><i style="width:${t.strength}%"></i></div></div>`;
      }).join('')}</div>
      <div style="flex:1"></div>
      <button class="btn primary ${mine && (opp || !pickOpponent) ? '' : 'disabled'}" style="margin-top:14px" data-act="next">Continue</button>`, {
      back: onBack,
      team: id => { if (!mine) mine = id; else if (pickOpponent && !lockedOpp && id !== mine) opp = id; else if (id === mine) { mine = null; opp = lockedOpp; } draw(); },
      next: () => onNext(mine, opp),
    });
  };
  draw();
}

export function setup({ myTeam, oppTeam, allowFormat = true, defaults, onBack, onStart }) {
  const s = { format: 'T20', overs: 2, difficulty: storage.get().settings.difficulty || 'medium', ...defaults };
  const draw = () => {
    const f = FORMATS[s.format];
    show(`
      <div class="top"><button class="back" data-act="back">‹ Back</button><h2>Match setup</h2></div>
      <div class="stat"><span>${myTeam.name}</span><b>vs</b><span>${oppTeam.name}</span></div>
      <h3 style="margin-top:16px">Format</h3>
      <div class="chips">${Object.values(FORMATS).map(x => `<div class="chip ${s.format === x.id ? 'on' : ''} ${allowFormat ? '' : 'disabled'}" data-act="fmt" data-val="${x.id}">${x.name}</div>`).join('')}</div>
      <h3>Overs per innings ${f.id === 'TEST' ? '(each of 2 innings)' : ''}</h3>
      <div class="chips">${OVER_PRESETS.filter(o => f.id === 'TEST' ? o >= 5 : true).map(o => `<div class="chip ${s.overs === o ? 'on' : ''}" data-act="ov" data-val="${o}">${o}</div>`).join('')}</div>
      <h3>AI difficulty</h3>
      <div class="chips">${Object.values(DIFFICULTY).map(d => `<div class="chip ${s.difficulty === d.id ? 'on' : ''}" data-act="diff" data-val="${d.id}">${d.name}</div>`).join('')}</div>
      <p class="sub" style="margin:0">Shortened overs keep matches quick on mobile. Rules and scoring are unchanged.</p>
      <div style="flex:1"></div>
      <button class="btn primary" data-act="go">Go to toss</button>`, {
      back: onBack, fmt: v => { s.format = v; if (v === 'TEST' && s.overs < 5) s.overs = 5; draw(); }, ov: v => { s.overs = +v; draw(); },
      diff: v => { s.difficulty = v; draw(); }, go: () => onStart({ ...s }),
    });
  };
  draw();
}

export function toss({ myTeam, oppTeam, onDone }) {
  let stage = 'call';
  const draw = (extra = '') => {
    if (stage === 'call') show(`
      <div class="center"><h2>Toss</h2><p class="sub">Call it in the air, captain of ${myTeam.name}.</p>
        <div class="coin" id="coin">?</div>
        <div class="row"><button class="btn primary" data-act="call" data-val="H" style="text-align:center">Heads</button><button class="btn primary" data-act="call" data-val="T" style="text-align:center">Tails</button></div></div>`, {
      call: v => {
        const flip = Math.random() < 0.5 ? 'H' : 'T'; const won = flip === v;
        const coin = document.getElementById('coin'); coin.classList.add('flip'); coin.textContent = '';
        setTimeout(() => { coin.textContent = flip; }, 1400);
        setTimeout(() => {
          if (won) { stage = 'choose'; draw(); }
          else { const bat = Math.random() < 0.55; show(`<div class="center"><h2>${oppTeam.name} won the toss</h2><p class="sub">They chose to ${bat ? 'bat' : 'bowl'} first.</p><button class="btn primary" data-act="ok" style="text-align:center">Continue</button></div>`, { ok: () => onDone({ userWon: false, userBatsFirst: !bat }) }); }
        }, 1900);
      },
    });
    else show(`<div class="center"><h2>You won the toss!</h2><p class="sub">Choose what to do first.</p>
      <button class="btn primary" data-act="c" data-val="bat">Bat first<small>Set a target</small></button><button class="btn" data-act="c" data-val="bowl">Bowl first<small>Chase it down</small></button></div>`, { c: v => onDone({ userWon: true, userBatsFirst: v === 'bat' }) });
  };
  draw();
}

export function customTeam({ onBack }) {
  const st = storage.get(); const cur = st.customTeam || { name: 'My XI', short: 'MYX', color: '#00c2a8', alt: '#ffffff' };
  const colors = ['#00c2a8', '#ff5a5f', '#ffb400', '#7a5cff', '#2f6bff', '#ff7ab6', '#8bd450', '#f4f1de'];
  const draw = () => show(`
    <div class="top"><button class="back" data-act="back">‹ Back</button><h2>My Team</h2></div>
    ${crest(cur)}<h3>Team name</h3><input id="nm" value="${cur.name}" maxlength="20" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);font-size:16px;user-select:text;-webkit-user-select:text;touch-action:auto">
    <h3 style="margin-top:16px">Short code (3 letters)</h3><input id="sh" value="${cur.short}" maxlength="3" style="width:100px;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);font-size:16px;text-transform:uppercase;user-select:text;-webkit-user-select:text;touch-action:auto">
    <h3 style="margin-top:16px">Kit colour</h3><div class="chips">${colors.map(c => `<div class="chip ${cur.color === c ? 'on' : ''}" data-act="col" data-val="${c}" style="background:${c};color:#111">&nbsp;</div>`).join('')}</div>
    <h3>Trim colour</h3><div class="chips">${['#ffffff', '#111111', '#ffd23f', '#9be7ff'].map(c => `<div class="chip ${cur.alt === c ? 'on' : ''}" data-act="alt" data-val="${c}" style="background:${c};color:#111">&nbsp;</div>`).join('')}</div>
    <div style="flex:1"></div><button class="btn primary" data-act="save">Save team</button>`, {
    back: onBack, col: v => { sync(); cur.color = v; draw(); }, alt: v => { sync(); cur.alt = v; draw(); },
    save: () => { sync(); st.customTeam = { ...cur }; storage.save(); toast('Team saved'); onBack(); },
  });
  const sync = () => { const n = document.getElementById('nm'), s = document.getElementById('sh'); if (n) cur.name = n.value.trim() || 'My XI'; if (s) cur.short = (s.value.trim() || 'MYX').toUpperCase().slice(0, 3); };
  draw();
}

export function settings({ onBack, onChange }) {
  const st = storage.get();
  const draw = () => show(`
    <div class="top"><button class="back" data-act="back">‹ Back</button><h2>Settings</h2></div>
    <h3>Sound</h3><div class="chips"><div class="chip ${st.settings.sound ? 'on' : ''}" data-act="snd" data-val="1">On</div><div class="chip ${!st.settings.sound ? 'on' : ''}" data-act="snd" data-val="0">Off</div></div>
    <h3>Graphics</h3><div class="chips">${['low', 'medium', 'high'].map(q => `<div class="chip ${(st.settings.quality || 'high') === q ? 'on' : ''}" data-act="q" data-val="${q}">${q}</div>`).join('')}</div>
    <p class="sub">Graphics changes apply next time you open the game.</p>
    <h3>Batting controls</h3>
    <p class="sub" style="margin-top:0">Swipe up to drive, sideways to cut or pull, tap to defend. Hold LOFT for aerial shots. Time your swipe as the ball reaches you. Keyboard: arrows to aim, space to hit, L to loft.</p>
    <h3>Progress</h3><button class="btn" data-act="reset">Reset all saved data</button>`, {
    back: onBack, snd: v => { st.settings.sound = v === '1'; audio.setEnabled(st.settings.sound); storage.save(); draw(); },
    q: v => { st.settings.quality = v; storage.save(); draw(); },
    reset: () => { if (confirm('Reset career, coins and custom team?')) { localStorage.removeItem('stumps.save.v1'); storage.load(); toast('Reset done'); onBack(); } },
  });
  draw();
}
