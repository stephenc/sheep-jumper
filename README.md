# Sheep Jumper

A 3D ligne-claire driving game. One country road, one nana, one screaming baby, far too many sheep.

Dodge sheep, rams, cows, Seamus's tractor, hay bales, potholes and cowpats. When the car gives up, ring
Ewe-Turn Roadside Rescue and endure the back seat until Derek arrives. You get three repairs.

Home is 5 km away. The clock never stops, not even while you wait for Derek, and the faster you get home the more points you score.

Play it at https://sheep-jumper.one-dash.com/

## Run

    npm install
    npm run dev          # development server
    npm run build        # static site in docs/ (commit it: GitHub Pages serves docs/ from main)
    npm run build:single # one self-contained dist-single/index.html

## Controls

| | Desktop | Touch |
|---|---|---|
| Steer | Arrow keys or A / D | ◀ ▶ buttons |
| Brake | Down arrow or S | BRAKE |
| Horn (scares sheep, mostly) | Space | Horn button |
| Camera (chase / first person) | C | Camera button |
| Mute | M | Speaker button |

Sheep leaping high over the road can be driven under for a bonus.

## Code

- `src/main.js` game loop, driving, obstacles, breakdown and rescue sequence
- `src/world.js` endless road and countryside generation
- `src/models.js` toon-shaded, ink-outlined models built from primitives
- `src/audio.js` all sound effects, synthesised with WebAudio
- `src/ui.js`, `src/lines.js` HUD, speech bubbles and every joke

## Licence

AGPL-3.0. See `LICENSE`.
