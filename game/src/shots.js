// The screenshot scenes behind ?shot=start|play|rings|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot (aim at
// the next ring's x and altitude, hold a steady throttle, land when the runway is ahead), so the
// frame is what a short game really looks like and the same seed always gives the same frame.
import { COURSE_SEGMENTS, SEGMENT_LENGTH, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 24;
const RINGS_SECONDS = 52;
const END_LIMIT_SECONDS = 600;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/** Steer toward the next ring and hold its altitude; a timid pilot for the end scene. */
function autopilot(state, cautious) {
  const plane = state.plane;
  const ring = state.rings.find((item) => !item.passed) ?? null;
  let steer = 0;
  let pitch = 0;
  let throttle = 0;
  if (ring !== null) {
    const dx = ring.x - plane.x;
    steer = clamp(dx / 18, -1, 1);
    const dy = ring.alt - plane.alt;
    pitch = clamp(dy / 14, -1, 1);
    throttle = dy > 8 ? 0.6 : 0;
  } else {
    // No rings left: line up with the runway, come down to a landing height and slow down.
    steer = clamp((0 - plane.x) / 18, -1, 1);
    const targetAlt = state.segments[Math.min(Math.floor(plane.z / SEGMENT_LENGTH), COURSE_SEGMENTS - 1)].ground + 10;
    pitch = clamp((targetAlt - plane.alt) / 12, -1, 0.4);
    throttle = plane.speed > 55 ? -1 : plane.speed < 40 ? 0.3 : -0.3;
  }
  if (cautious) {
    // A hurried pilot: too fast, too late on the stick, too shallow on the pitch.
    steer *= 0.3;
    pitch *= 0.25;
    throttle = 0.8;
  }
  return { steer, pitch, throttle };
}

/**
 * Set `world` to the named scene (start, play, rings or end; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'rings' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, autopilot(world.state, false), true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : name === 'rings' ? RINGS_SECONDS : PLAY_SECONDS;
  const cautious = name === 'end';
  for (let index = 0; index < limit / STEP; index += 1) {
    if (world.step(STEP, autopilot(world.state, cautious), false) & EVENT_OVER) break;
  }
  const over = world.state.lives === 0 || world.state.finished;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
