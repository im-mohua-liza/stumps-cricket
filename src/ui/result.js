import { show } from './screens.js';

const ov = b => `${Math.floor(b / 6)}.${b % 6}`;
const sr = (r, b) => (b ? (r / b * 100).toFixed(0) : '-');

export function inningsTable(m, inn) {
  const bat = m.teams[inn.batSide], bowl = m.teams[inn.bowlSide];
  const batted = inn.batters.filter((b, i) => b.balls > 0 || b.out || i === inn.striker || i === inn.nonStriker);
  const dnb = inn.batters.filter(b => !batted.includes(b)).map(b => b.name).join(', ');
  const bowlers = Object.values(inn.bowlers);
  return `<h3>${bat.name} &nbsp; ${inn.runs}/${inn.wickets} (${ov(inn.balls)} ov)</h3>
  <table class="tbl"><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr>
  ${batted.map(b => `<tr><td>${b.name}<span class="out">${b.out ? (b.out === 'runout' ? 'run out' : `${b.out} b ${(bowl.squad.find(p => p.id === b.bowler) || {}).name || ''}`) : 'not out'}</span></td><td><b>${b.runs}</b></td><td>${b.balls}</td><td>${b.fours}</td><td>${b.sixes}</td><td>${sr(b.runs, b.balls)}</td></tr>`).join('')}
  <tr><td>Extras</td><td colspan="5">${inn.extras}</td></tr></table>
  ${dnb ? `<div class="sub" style="margin-top:-6px">Did not bat: ${dnb}</div>` : ''}
  <table class="tbl"><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th><th>Econ</th></tr>
  ${bowlers.map(b => `<tr><td>${b.name}</td><td>${ov(b.balls)}</td><td>${b.runs}</td><td><b>${b.wkts}</b></td><td>${b.balls ? (b.runs / (b.balls / 6)).toFixed(1) : '-'}</td></tr>`).join('')}</table>
  ${inn.fow.length ? `<div class="sub" style="font-size:12px">Fall of wickets: ${inn.fow.map(f => `${f.runs}-${f.wkt} (${f.name.split(' ')[1] || f.name})`).join(', ')}</div>` : ''}`;
}

// In-match scorecard overlay; onClose resumes play
export function scorecard(m, onClose) {
  show(`<div class="top"><button class="back" data-act="close">‹ Resume</button><h2>Scorecard</h2></div>
    ${m.innings.map(i => inningsTable(m, i)).join('<hr style="border:0;border-top:1px solid var(--line);margin:16px 0">')}
    <div class="sub" style="margin-top:12px"><b>Commentary</b></div>
    ${m.commentary.slice(0, 12).map(c => `<div class="stat"><span>${c.text}</span><span class="pill">${c.over}</span></div>`).join('')}`, { close: onClose }, 'clear');
}

export function resultScreen({ match, result, userSide, reward, extraLines = '', onMenu, onAgain, onNext, nextLabel, onDouble }) {
  const won = result.winner === userSide, tie = !result.winner;
  const A = match.teams.A, B = match.teams.B;
  const line = s => match.innings.filter(i => i.batSide === s).map(i => `${i.runs}/${i.wickets}`).join(' & ');
  show(`<div class="center">
    <span class="pill">${match.format.name} • ${match.overs} overs</span>
    <h1 style="font-size:clamp(34px,10vw,54px);margin-top:12px" class="${won ? 'win' : tie ? '' : 'lose'}">${won ? 'VICTORY' : tie ? 'NO WINNER' : 'DEFEAT'}</h1>
    <p class="sub" style="margin-bottom:14px">${result.text}</p>
    <div class="stat"><span>${A.name}</span><b>${line('A')}</b></div><div class="stat"><span>${B.name}</span><b>${line('B')}</b></div>
    ${reward ? `<div class="stat"><span>Rewards</span><b>+${reward.xp} XP &nbsp; +${reward.coins} coins${reward.levelUp ? ` &nbsp; <span class="win">LEVEL ${reward.level}!</span>` : ''}</b></div>` : ''}
    ${extraLines}
    <div style="height:14px"></div>
    ${onNext ? `<button class="btn primary" data-act="next" style="text-align:center">${nextLabel}</button>` : ''}
    ${onDouble ? `<button class="btn" data-act="dbl">Watch ad for double coins<small>Demo: ad SDK not connected, reward is simulated</small></button>` : ''}
    <button class="btn" data-act="card">View full scorecard</button>
    ${onAgain ? `<button class="btn" data-act="again">Play again</button>` : ''}
    <button class="btn" data-act="menu">Main menu</button></div>`, {
    next: onNext, again: onAgain, menu: onMenu, dbl: onDouble,
    card: () => show(`<div class="top"><button class="back" data-act="b">‹ Back</button><h2>Scorecard</h2></div>${match.innings.map(i => inningsTable(match, i)).join('')}`, { b: () => resultScreen(arguments[0]) }, 'clear'),
  });
}
