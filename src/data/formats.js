export const FORMATS = {
  T20:  { id: 'T20',  name: 'T20',  overs: 20, innings: 1, maxBowlerOvers: 4,  ballsPerOver: 6 },
  ODI:  { id: 'ODI',  name: 'ODI',  overs: 50, innings: 1, maxBowlerOvers: 10, ballsPerOver: 6 },
  TEST: { id: 'TEST', name: 'Test', overs: 90, innings: 2, maxBowlerOvers: 90, ballsPerOver: 6 },
};
// Quick-play over presets so a mobile match fits in minutes; real overs used when 'full'.
export const OVER_PRESETS = [1, 2, 5, 10, 20];
export const DIFFICULTY = {
  easy:   { id: 'easy',   name: 'Rookie', aiBat: 0.35, aiBowl: 0.35, timing: 1.35 },
  medium: { id: 'medium', name: 'Pro',    aiBat: 0.55, aiBowl: 0.55, timing: 1.0 },
  hard:   { id: 'hard',   name: 'Legend', aiBat: 0.8,  aiBowl: 0.8,  timing: 0.75 },
};
