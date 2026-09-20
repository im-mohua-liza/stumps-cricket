// Pure match state and scoring rules. No rendering or input here, so it is reusable for
// multiplayer (server-authoritative), tournaments and simulations.
import { bus } from '../core/bus.js';

const newBatter = p => ({ id: p.id, name: p.name, runs: 0, balls: 0, fours: 0, sixes: 0, out: null, bowler: null });
const newBowler = p => ({ id: p.id, name: p.name, balls: 0, runs: 0, wkts: 0 });

export class Match {
  constructor({ teamA, teamB, format, overs, battingFirst, userTeamId, difficulty }) {
    this.teams = { A: teamA, B: teamB };
    this.format = format;
    this.overs = overs;
    this.difficulty = difficulty;
    this.userTeamId = userTeamId;
    this.maxInnings = format.innings * 2;
    this.maxBowlerOvers = format.id === 'TEST' ? overs : Math.max(1, Math.ceil(overs / 5));
    this.history = [];
    this.innings = [];
    this.commentary = [];
    this.startInnings(battingFirst);
  }

  get cur() { return this.innings[this.innings.length - 1]; }
  get battingTeam() { return this.teams[this.cur.batSide]; }
  get bowlingTeam() { return this.teams[this.cur.bowlSide]; }
  get striker() { return this.cur.batters[this.cur.striker]; }
  get nonStriker() { return this.cur.batters[this.cur.nonStriker]; }
  get overNo() { return Math.floor(this.cur.balls / 6); }
  get ballInOver() { return this.cur.balls % 6; }
  get isFreeHit() { return !!this.cur.freeHit; }
  get ballsLeft() { return this.overs * 6 - this.cur.balls; }

  startInnings(batSide) {
    const bowlSide = batSide === 'A' ? 'B' : 'A';
    const bat = this.teams[batSide];
    const inn = {
      batSide, bowlSide, runs: 0, wickets: 0, balls: 0, extras: 0, fow: [],
      batters: bat.squad.map(newBatter), bowlers: {},
      striker: 0, nonStriker: 1, next: 2,
      bowlerId: null, lastBowlerId: null, thisOver: [], done: false, target: null, freeHit: false,
    };
    if (this.format.id === 'TEST') {
      if (this.innings.length === 3) {
        const mine = this.innings.filter(i => i.batSide === batSide).reduce((s, i) => s + i.runs, 0);
        const theirs = this.innings.filter(i => i.batSide === bowlSide).reduce((s, i) => s + i.runs, 0);
        inn.target = theirs - mine + 1;
      }
    } else if (this.innings.length === 1) {
      inn.target = this.innings[0].runs + 1;
    }
    this.innings.push(inn);
    bus.emit('innings:start', { index: this.innings.length - 1, inn });
  }

  bowlerStats(id) {
    const inn = this.cur;
    return inn.bowlers[id] || (inn.bowlers[id] = newBowler(this.bowlingTeam.squad.find(p => p.id === id)));
  }

  eligibleBowlers() {
    const inn = this.cur;
    return this.bowlingTeam.squad.filter(p =>
      p.bowl >= 40 && p.id !== inn.lastBowlerId &&
      (inn.bowlers[p.id]?.balls || 0) < this.maxBowlerOvers * 6);
  }

  setBowler(id) { this.cur.bowlerId = id; this.bowlerStats(id); }

  // ball = { runs, extra: null|'wide'|'noball'|'bye'|'legbye', wicket: null|{kind, who:'striker'|'non'}, boundary }
  recordBall(ball) {
    const inn = this.cur;
    const bw = this.bowlerStats(inn.bowlerId);
    const st = this.striker;
    const runs = ball.runs || 0;
    const extra = ball.extra || null;
    const wide = extra === 'wide', noball = extra === 'noball';
    const bye = extra === 'bye' || extra === 'legbye';
    const legal = !wide && !noball;
    const wasFreeHit = inn.freeHit;

    const total = runs + (wide || noball ? 1 : 0);
    inn.runs += total;
    if (wide || noball) inn.extras += 1;
    if (bye) inn.extras += runs;
    if (!bye) bw.runs += total;
    if (legal) { inn.balls++; bw.balls++; }

    // Batter credit: off the bat only (not wides or byes)
    if (!wide && !bye) {
      st.runs += runs;
      if (runs === 4) st.fours++;
      if (runs === 6) st.sixes++;
    }
    if (!wide) st.balls++;

    inn.freeHit = noball; // a no-ball gives the next delivery a free hit (wide keeps the previous state)
    if (wide) inn.freeHit = wasFreeHit;

    // Free hit: only run-outs count
    let wicket = null;
    if (ball.wicket && !((wasFreeHit || noball) && ball.wicket.kind !== 'runout')) wicket = ball.wicket;
    if (wicket) {
      const out = wicket.who === 'non' ? this.nonStriker : st;
      out.out = wicket.kind;
      out.bowler = wicket.kind === 'runout' ? null : inn.bowlerId;
      inn.wickets++;
      if (wicket.kind !== 'runout') bw.wkts++;
      inn.fow.push({ runs: inn.runs, wkt: inn.wickets, name: out.name });
      if (inn.wickets < 10 && inn.next < inn.batters.length) {
        const nextIdx = inn.next++;
        if (out === st) inn.striker = nextIdx; else inn.nonStriker = nextIdx;
      }
    }

    // Strike rotates on odd completed runs (bat or byes)
    if (!wicket && runs % 2 === 1) [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];

    const label = wicket ? 'W' : wide ? 'Wd' : noball ? 'Nb' : String(runs);
    inn.thisOver.push(label);
    this.history.push({ inn: this.innings.length - 1, ...ball, total, label });

    let overEnded = false;
    if (legal && inn.balls % 6 === 0) {
      overEnded = true;
      [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
      inn.lastBowlerId = inn.bowlerId;
      inn.bowlerId = null;
      inn.thisOver = [];
    }
    const state = this.checkEnd();
    bus.emit('ball', { ball, total, wicket, overEnded, state });
    return { total, wicket, overEnded, ...state };
  }

  checkEnd() {
    const inn = this.cur;
    const chased = inn.target != null && inn.runs >= inn.target;
    inn.done = chased || inn.wickets >= 10 || inn.balls >= this.overs * 6;
    const matchOver = inn.done && (this.innings.length >= this.maxInnings || (this.format.id !== 'TEST' && this.innings.length === 2));
    return { inningsOver: inn.done, matchOver };
  }

  nextInnings() {
    const last = this.cur;
    let side = last.bowlSide; // the other team bats next
    if (this.format.id === 'TEST' && this.innings.length === 2) side = last.batSide === 'A' ? 'B' : 'A'; // same team is not forced; alternate
    this.startInnings(side);
  }

  result() {
    const A = this.teams.A, B = this.teams.B;
    const total = s => this.innings.filter(i => i.batSide === s).reduce((a, i) => a + i.runs, 0);
    if (this.format.id === 'TEST') {
      const a = total('A'), b = total('B');
      if (this.innings.length < 4 || !this.cur.done) return { winner: null, text: 'Match drawn' };
      if (a === b) return { winner: null, text: 'Match tied' };
      const w = a > b ? 'A' : 'B';
      const last = this.cur;
      if (last.target != null && last.runs >= last.target) return { winner: last.batSide, text: `${this.teams[last.batSide].name} won by ${10 - last.wickets} wickets` };
      return { winner: w, text: `${this.teams[w].name} won by ${Math.abs(a - b)} runs` };
    }
    const [i1, i2] = this.innings;
    if (!i2) return { winner: null, text: 'No result' };
    if (i2.runs >= i2.target) return { winner: i2.batSide, text: `${this.teams[i2.batSide].name} won by ${10 - i2.wickets} wickets` };
    if (i2.runs === i2.target - 1) return { winner: null, text: 'Match tied' };
    return { winner: i1.batSide, text: `${this.teams[i1.batSide].name} won by ${i1.runs - i2.runs} runs` };
  }

  addComment(text, kind = 'info') {
    this.commentary.unshift({ text, kind, over: `${this.overNo}.${this.ballInOver}` });
    if (this.commentary.length > 60) this.commentary.pop();
    bus.emit('comment', this.commentary[0]);
  }
}
