// Career progression: XP, levels, coins, opponent ladder and difficulty scaling.
import { storage } from '../core/storage.js';

export const career = {
  get() { return storage.get().career; },
  xpForNext(level) { return 150 + level * 100; },
  difficultyFor(level) { return level < 3 ? 'easy' : level < 7 ? 'medium' : 'hard'; },
  // Opponents get stronger with level: pick from the sorted ladder
  opponentFor(level, teams, myId) {
    const ladder = teams.filter(t => t.id !== myId).sort((a, b) => a.strength - b.strength);
    return ladder[Math.min(ladder.length - 1, Math.floor((level - 1) / 2) % ladder.length)];
  },
  award({ won, tied, overs }) {
    const c = storage.get().career; const before = c.level;
    const xp = (won ? 120 : tied ? 70 : 40) + Math.min(60, overs * 3); const coins = won ? 150 + overs * 5 : tied ? 80 : 40;
    c.xp += xp; c.coins += coins; c.matches++; if (won) c.wins++;
    while (c.xp >= this.xpForNext(c.level)) { c.xp -= this.xpForNext(c.level); c.level++; c.coins += 100; }
    storage.save(); return { xp, coins, levelUp: c.level > before, level: c.level };
  },
};
