# Stumps: Cricket Arena

A 3D mobile-first cricket game (Three.js + Vite, plain ES modules). All branding, teams, players and audio are original and procedural, with no external assets.

## Run
    npm install
    npm run dev        # http://localhost:5173 (use --host to test on a phone on the same Wi-Fi)
    npm run build      # static bundle in dist/

## Playable MVP flow
Main menu, team select, match setup (T20 / ODI / Test, overs, difficulty), toss, batting or bowling, scoreboard, innings break, result with scorecard and rewards.

## Controls
**Batting:** swipe as the ball reaches you. Up = drive, up-left/right = flick / cover drive, sideways = pull / cut, tap = defend, LOFT toggle for aerial shots. Timing decides quality (perfect, good, mistimed, edge, miss). RUN button takes extra runs.
Keyboard: arrows/A/D aim + hit, Space defend, L loft, R run.
**Bowling:** drag on the pitch map for line and length, choose swing or spin, pace, field setting, press BOWL and tap the release meter inside the green zone.

## Architecture
    src/core       event bus, save storage
    src/data       teams (fictional), formats, difficulty
    src/match      PURE logic: match.js (scoring/innings/results), physics.js, batting.js, fielding.js, ai.js
    src/game       session.js (ball-by-ball state machine), struck.js (post-hit sim: fielders, catches, running, run-outs)
    src/render     scene, stadium + instanced crowd, procedural humanoids, broadcast camera rig, replay recording
    src/ui         screens, HUD + input, scorecard/result, CSS
    src/audio      synthesized crowd / bat / wicket sounds (WebAudio)
    src/services   tournament, career, ads (stub), iap (stub)

`src/match/*` has no DOM or rendering dependencies, so it can run server-side for authoritative multiplayer, or headless for simulation.

## Extension points
- **Multiplayer:** drive `Match` + `physics` on a server; `Session` becomes a thin client sending shots/deliveries.
- **Ads / IAP:** implement `services/ads.js` and `services/iap.js` (interfaces already called from the result screen).
- **Tournaments / career:** `services/tournament.js` and `career.js` persist through `core/storage.js`.
- **Wrapping for stores:** Capacitor works out of the box with the Vite `dist/` output.

## Not yet done
Real player models/animations (rig is procedural low-poly), bye/leg-bye and overthrow variety, DRS, follow-on, super over, weather/pitch wear, online leaderboards.
