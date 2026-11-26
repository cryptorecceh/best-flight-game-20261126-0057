# best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/cryptorecceh/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/cryptorecceh/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Sky Courier: Ring Run** is a complete chase-view flight game. You fly **Kestrel**, a
courier plane, down a seeded valley — over green fields, forest, a winding river, a town and a
mountain pass — threading glowing rings, minding your fuel, and landing slow on the Homestead
runway to finish the run. The cockpit panel carries lit instruments (artificial horizon,
altimeter, airspeed, vertical speed, compass tape, throttle and fuel) and the HUD shows
altitude, speed and heading in big numbers. Three legs, combo scoring, three planes, a 3-minute
mission clock, and a seeded course so every run is the same valley until you change the seed.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser.

| Input | Action |
| --- | --- |
| ← → or A D | Steer (bank) |
| ↑ / W | Climb |
| ↓ / S | Descend |
| Shift / E | Throttle up |
| Ctrl / Q | Throttle down |
| Mouse hold left/right | Steer toward that side |
| Space / click | Start, restart |
| R | Restart |
| P / Esc | Pause |
| M | Mute |

## The flight

- **Rings pay.** Each glowing ring is +100 points (combo grows the multiplier) and +10 fuel.
  Miss one and the combo breaks (−25).
- **Fuel is the decision.** Full throttle is fast but thirsty; rings are the only refuel. Run
  dry and you glide.
- **The ground bites.** Fly into the terrain or a valley wall and you lose a plane, respawning
  at the last ring you took. Three planes, then the run is over.
- **Land it.** After the last ring, slow down and settle onto the Homestead runway: landing
  pays +500 plus bonuses for time and fuel left. Overshoot the runway and the run ends.

## The code

- `game/src/world.js` — the rules: the seeded course, flight physics, rings, fuel, legs.
- `game/src/render.js` — the chase view: projected valley strips, river and runway, rings,
  clouds, the plane, the lit instruments and the HUD.
- `game/src/input.js` — keyboard and mouse.
- `game/src/audio.js` — engine, wind, ring chime and crash, synthesised with WebAudio.
- `game/src/shots.js` — the `?shot=` scenes, played by an autopilot on the real rules.
- `game/src/config.js` — every tuning number and colour. `game/src/random.js` — the seeded RNG.

Screenshots are real renders of the game's own code (`shots.json` lists the four scenes).
`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output and
writes `dossier.json` with the vendored make.fun library.

---

<sub>Entered on [make.fun](https://make.fun/?ref=zdkc9vmx&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
