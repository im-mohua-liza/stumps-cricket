// Persistent save data (career, settings, custom teams). Swap for cloud save later.
const KEY = 'stumps.save.v1';
const defaults = { settings: { sound: true, difficulty: 'medium', overs: 5 }, career: { level: 1, xp: 0, coins: 500, matches: 0, wins: 0 }, customTeam: null, tournament: null };
let data;
export const storage = {
  load() {
    try { data = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { data = { ...defaults }; }
    return data;
  },
  get() { return data || this.load(); },
  save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} },
};
