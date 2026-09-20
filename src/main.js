import { World } from './render/world.js';
import { createHud } from './ui/hud.js';
import * as UI from './ui/screens.js';
import { scorecard, resultScreen } from './ui/result.js';
import { Session } from './game/session.js';
import { storage } from './core/storage.js';
import { audio } from './audio/audio.js';
import { career } from './services/career.js';
import { tournament } from './services/tournament.js';
import { ads } from './services/ads.js';
import { DIFFICULTY } from './data/formats.js';

const settings = storage.load().settings;
audio.setEnabled(settings.sound !== false);
let quality = settings.quality || (window.devicePixelRatio > 2 && navigator.hardwareConcurrency <= 4 ? 'low' : 'high');
if (/Android|iPhone|iPad/i.test(navigator.userAgent) && !settings.quality) quality = 'medium';

const world = new World(document.getElementById('game'), quality === 'medium' ? 'high' : quality);
let session = null;
const hud = createHud({
  onShot: s => session?.onShot(s), onRun: () => session?.onRun(),
  onScorecard: () => { if (!session) return; session.paused = true; scorecard(session.match, () => { document.getElementById('screen').innerHTML = ''; session.paused = false; }); },
  onReplay: () => session?.manualReplay(),
});

// ---------- main loop ----------
let last = performance.now(), menuT = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (session && !session.paused) session.update(dt);
  if (!session) { menuT += dt; world.rig.set('menu'); }
  world.frame(dt, session ? (session.cameraCtx || {}) : {});
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- flows ----------
const home = () => { if (session) { session.destroy(); session = null; } world.setKits({ color: '#2f6bff', alt: '#fff' }, { color: '#e63946', alt: '#fff' }); world.ball.visible = false; menu(); };

function menu() {
  UI.menu({
    onQuick: () => quickFlow(), onTournament: () => tournamentFlow(), onCareer: () => careerFlow(),
    onCustom: () => UI.customTeam({ onBack: menu }), onSettings: () => UI.settings({ onBack: menu }),
  });
}

function quickFlow() {
  UI.teamSelect({ title: 'Quick Match', sub: 'Pick your side', onBack: menu, onNext: (mine, opp) => {
    const my = UI.findTeam(mine), op = UI.findTeam(opp);
    UI.setup({ myTeam: my, oppTeam: op, onBack: quickFlow, onStart: cfg => UI.toss({ myTeam: my, oppTeam: op, onDone: t => play({ ...cfg, myTeam: my, oppTeam: op, userBatsFirst: t.userBatsFirst, mode: 'quick' }) }) });
  } });
}

function play(setup) {
  audio.init();
  document.getElementById('screen').innerHTML = '';
  session = new Session({ world, hud, setup, onFinish: (match, result) => onMatchDone(setup, match, result) });
  session.start();
}

function onMatchDone(setup, match, result) {
  const won = result.winner === 'A', tie = !result.winner;
  const winnerId = tie ? null : (won ? setup.myTeam.id : setup.oppTeam.id);
  let reward = null, extra = '', next = null, nextLabel = '', again = () => { session.destroy(); session = null; quickFlow(); };
  const menuFn = () => home();
  if (setup.mode === 'career' || setup.mode === 'tournament' || setup.mode === 'quick') reward = career.award({ won, tied: tie, overs: setup.overs });
  if (setup.mode === 'career') { again = null; next = () => { home(); careerFlow(); }; nextLabel = 'Back to career'; }
  if (setup.mode === 'tournament') {
    again = null; const t = tournament.get(); tournament.record(t, UI.allTeams(), winnerId);
    next = () => { home(); tournamentFlow(); }; nextLabel = t.done ? 'See final result' : 'Continue tournament';
  }
  const cfg = { match, result, userSide: 'A', reward, extraLines: extra, onMenu: menuFn, onAgain: again, onNext: next, nextLabel };
  cfg.onDouble = reward ? async () => { const r = await ads.showRewarded(); if (r.rewarded) { const c = career.get(); c.coins += reward.coins; storage.save(); reward.coins *= 2; UI.toast('Coins doubled'); cfg.onDouble = null; resultScreen(cfg); } } : null;
  resultScreen(cfg);
}

// ----- Tournament -----
function tournamentFlow() {
  let t = tournament.get();
  const draw = () => {
    const teams = UI.allTeams(); const name = id => teams.find(x => x.id === id)?.name || id;
    const st = tournament.standings(t); const fx = tournament.fixtureFor(t);
    const rows = st.map((r, i) => `<tr><td>${i + 1}. ${name(r.id)}${r.id === t.userId ? ' <span class="pill">You</span>' : ''}</td><td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td><b>${r.pts}</b></td></tr>`).join('');
    UI.show(`<div class="top"><button class="back" data-act="back">‹ Menu</button><h2>Tournament</h2></div>
      <table class="tbl"><tr><th>Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th></tr>${rows}</table>
      ${t.done ? `<div class="center"><h2 class="${t.champion === t.userId ? 'win' : ''}">${t.champion === t.userId ? 'You are the champions!' : name(t.champion) + ' are the champions'}</h2>
        <button class="btn primary" data-act="new" style="text-align:center">New tournament</button></div>`
      : `<div class="center"><span class="pill">${fx.stage}</span><h2 style="margin:10px 0 16px">${name(fx.a)} vs ${name(fx.b)}</h2>
        <button class="btn primary" data-act="play" style="text-align:center">Play match</button><button class="btn" data-act="new">Abandon and restart</button></div>`}`, {
      back: home, new: () => { tournament.clear(); tournamentFlow(); },
      play: () => {
        const my = UI.findTeam(t.userId), op = UI.findTeam(fx.a === t.userId ? fx.b : fx.a);
        UI.setup({ myTeam: my, oppTeam: op, defaults: { format: 'T20', overs: 2 }, onBack: draw, onStart: cfg => UI.toss({ myTeam: my, oppTeam: op, onDone: r => play({ ...cfg, myTeam: my, oppTeam: op, userBatsFirst: r.userBatsFirst, mode: 'tournament' }) }) });
      },
    });
  };
  if (!t) return UI.teamSelect({ title: 'Tournament', sub: 'Pick your team', pickOpponent: false, onBack: menu, onNext: mine => { t = tournament.create(mine, UI.allTeams()); draw(); } });
  draw();
}

// ----- Career -----
function careerFlow() {
  const c = career.get(); const teams = UI.allTeams();
  const myId = teams.find(t => t.id === 'custom')?.id || storage.get().career.team || 'thunder';
  const my = UI.findTeam(myId); const op = career.opponentFor(c.level, teams, my.id); const diff = career.difficultyFor(c.level);
  const need = career.xpForNext(c.level);
  UI.show(`<div class="top"><button class="back" data-act="back">‹ Menu</button><h2>Career</h2></div>
    <div class="center"><div class="stat"><span>Level</span><b>${c.level}</b></div><div class="stat"><span>XP</span><b>${c.xp} / ${need}</b></div>
      <div class="bar" style="margin-bottom:8px"><i style="width:${Math.min(100, c.xp / need * 100)}%"></i></div>
      <div class="stat"><span>Coins</span><b>${c.coins}</b></div><div class="stat"><span>Record</span><b>${c.wins} wins from ${c.matches}</b></div>
      <h3 style="margin-top:20px">Next fixture</h3>
      <div class="stat"><span>${my.name}</span><b>vs</b><span>${op.name}</span></div>
      <p class="sub">T20 • 2 overs • ${DIFFICULTY[diff].name} AI. Win to earn XP and coins. Higher levels face tougher sides.</p>
      <button class="btn primary" data-act="play" style="text-align:center">Play career match</button>
      <button class="btn" data-act="pick">Choose my team</button></div>`, {
    back: menu,
    pick: () => UI.teamSelect({ title: 'Career team', pickOpponent: false, onBack: careerFlow, onNext: id => { storage.get().career.team = id; storage.save(); careerFlow(); } }),
    play: () => UI.toss({ myTeam: my, oppTeam: op, onDone: t => play({ myTeam: my, oppTeam: op, format: 'T20', overs: 2, difficulty: diff, userBatsFirst: t.userBatsFirst, mode: 'career' }) }),
  });
}

world.setKits({ color: '#2f6bff', alt: '#fff' }, { color: '#e63946', alt: '#fff' }); world.ball.visible = false;
menu();
window.__stumps = { world, get session() { return session; } };
