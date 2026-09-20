// Original fictional teams and players. No real-world names or branding.
const FIRST = ['Arjun','Kabir','Ravi','Zane','Milo','Ezra','Tariq','Leon','Niko','Omar','Sami','Dev','Finn','Hugo','Ivan','Jai','Kian','Luca','Mika','Noor','Owen','Piers','Quinn','Rafi','Sven','Toma'];
const LAST = ['Vale','Rook','Stone','Marsh','Cole','Hayes','Drake','Nair','Khan','Lowe','Frost','Beck','Ward','Shaw','Rana','Quill','Reyes','Voss','Tate','Wilde','Ash','Bane','Crane','Dunn'];
function rng(seed){ let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

function makeSquad(seed, strength) {
  const r = rng(seed); const squad = [];
  const roles = ['bat','bat','bat','bat','all','wk','all','bowl','bowl','bowl','bowl'];
  const used = new Set();
  roles.forEach((role, i) => {
    let name; do { name = FIRST[Math.floor(r()*FIRST.length)] + ' ' + LAST[Math.floor(r()*LAST.length)]; } while (used.has(name));
    used.add(name);
    const base = strength + (r() - 0.5) * 12;
    const bat = role === 'bowl' ? base - 22 : role === 'all' ? base - 4 : base + 4;
    const bowl = role === 'bowl' ? base + 4 : role === 'all' ? base - 6 : base - 30;
    const type = role === 'bowl' || role === 'all' ? (r() < 0.45 ? 'spin' : r() < 0.5 ? 'fast' : 'medium') : 'part';
    squad.push({ id: seed + '-' + i, name, role, bat: clamp(bat), bowl: clamp(bowl), bowlType: type, hand: r() < 0.3 ? 'L' : 'R', skin: Math.floor(r()*4) });
  });
  return squad;
}
const clamp = v => Math.max(25, Math.min(95, Math.round(v)));

export const TEAMS = [
  { id: 'thunder', name: 'Harbor Thunder',  short: 'HBT', color: '#2f6bff', alt: '#ffd23f', strength: 74 },
  { id: 'vipers',  name: 'Desert Vipers',   short: 'DSV', color: '#e8a317', alt: '#1b1b1b', strength: 70 },
  { id: 'lions',   name: 'Coastal Lions',   short: 'CSL', color: '#e63946', alt: '#fff',    strength: 72 },
  { id: 'wolves',  name: 'Northern Wolves', short: 'NWL', color: '#5c6b7a', alt: '#9be7ff', strength: 68 },
  { id: 'comets',  name: 'Metro Comets',    short: 'MTC', color: '#8e44ff', alt: '#ff9ff3', strength: 66 },
  { id: 'rangers', name: 'Valley Rangers',  short: 'VLR', color: '#1fae6b', alt: '#f4f1de', strength: 64 },
].map((t, i) => ({ ...t, squad: makeSquad(1000 + i * 77, t.strength) }));

export const getTeam = id => TEAMS.find(t => t.id === id);
// Custom team: user renames team/colours; squad reuses a seed so it can be edited later.
export function makeCustomTeam({ name = 'My XI', short = 'MYX', color = '#00c2a8', alt = '#ffffff' } = {}) {
  return { id: 'custom', name, short: short.slice(0, 3).toUpperCase(), color, alt, strength: 70, squad: makeSquad(4242, 70) };
}
