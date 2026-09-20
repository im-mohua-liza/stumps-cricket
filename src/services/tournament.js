// Tournament mode: 4-team round robin then a final. Only the user's fixtures are played; the rest are simulated.
import { TEAMS } from '../data/teams.js';
import { storage } from '../core/storage.js';

const ROUNDS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];

export function simulate(a, b) {
  const pa = a.strength / (a.strength + b.strength); const winner = Math.random() < pa ? a.id : b.id;
  return { winner, margin: 5 + Math.floor(Math.random() * 40) };
}

export const tournament = {
  create(userId, allTeams) {
    const others = allTeams.filter(t => t.id !== userId).sort(() => Math.random() - 0.5).slice(0, 3);
    const ids = [userId, ...others.map(t => t.id)];
    const t = { ids, userId, round: 0, table: Object.fromEntries(ids.map(id => [id, { p: 0, w: 0, l: 0, pts: 0 }])), done: false, final: null, champion: null, log: [] };
    storage.get().tournament = t; storage.save(); return t;
  },
  get() { return storage.get().tournament; },
  clear() { storage.get().tournament = null; storage.save(); },
  fixtureFor(t) {
    if (t.done) return null;
    if (t.round < 3) { const pair = ROUNDS[t.round].find(([i, j]) => t.ids[i] === t.userId || t.ids[j] === t.userId); return { a: t.ids[pair[0]], b: t.ids[pair[1]], stage: `League round ${t.round + 1} of 3` }; }
    if (t.final) return { a: t.final[0], b: t.final[1], stage: 'FINAL' };
    return null;
  },
  standings(t) { return t.ids.map(id => ({ id, ...t.table[id] })).sort((x, y) => y.pts - x.pts || y.w - x.w); },
  // record the user's match winner (null = tie) and simulate the rest of the round
  record(t, allTeams, winnerId) {
    const byId = id => allTeams.find(x => x.id === id);
    const apply = (a, b, w) => { [a, b].forEach(id => t.table[id].p++); if (w) { t.table[w].w++; t.table[w].pts += 2; t.table[w === a ? b : a].l++; } else { t.table[a].pts++; t.table[b].pts++; } };
    if (t.round < 3) {
      ROUNDS[t.round].forEach(([i, j]) => {
        const a = t.ids[i], b = t.ids[j]; const mine = a === t.userId || b === t.userId;
        if (mine) apply(a, b, winnerId); else { const s = simulate(byId(a), byId(b)); apply(a, b, s.winner); t.log.push(`${byId(s.winner).name} beat ${byId(s.winner === a ? b : a).name}`); }
      });
      t.round++;
      if (t.round === 3) { const top = this.standings(t).slice(0, 2).map(x => x.id); t.final = top; if (!top.includes(t.userId)) { const s = simulate(byId(top[0]), byId(top[1])); t.champion = s.winner; t.done = true; } }
    } else { t.champion = winnerId || t.final[0]; t.done = true; }
    storage.save(); return t;
  },
};
