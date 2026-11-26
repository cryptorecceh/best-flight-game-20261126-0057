// The game's rules and state, with no drawing and no browser in it: the courier plane, the
// seeded valley course (its bends, ground, zones, decorations and rings), throttle and pitch
// physics, fuel, score, lives and legs. step() advances one fixed step and returns what happened
// as bit flags, so the caller can react without the world knowing about screens or sound.
// Nothing here allocates after createWorld returns.

import {
  COURSE_SEGMENTS,
  FUEL,
  LEGS,
  LIVES,
  MISSION_TIME,
  PLANE,
  RING,
  SCORE,
  SEGMENT_LENGTH,
  VALLEY_HALF,
} from './config.js';
import { makeNoise } from './random.js';

export const EVENT_RING = 1;
export const EVENT_MISS = 2;
export const EVENT_CRASH = 4;
export const EVENT_OVER = 8;
export const EVENT_LAND = 16;
export const EVENT_LEG = 32;
export const EVENT_FUEL = 64;

export const ZONE_FIELD = 'field';
export const ZONE_FOREST = 'forest';
export const ZONE_RIVER = 'river';
export const ZONE_TOWN = 'town';
export const ZONE_MOUNTAIN = 'mountain';
export const ZONE_RUNWAY = 'runway';

const RUNWAY_START_SEG = 240;
const COURSE_END_Z = COURSE_SEGMENTS * SEGMENT_LENGTH;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function legIndexFor(segment) {
  for (let i = 0; i < LEGS.length; i += 1) {
    if (segment < LEGS[i].until) return i;
  }
  return LEGS.length - 1;
}

export function createWorld(random) {
  const segments = [];
  const rings = [];
  const clouds = [];

  // --- Build the course once, from the seed. -------------------------------------------
  const bendNoise = makeNoise(random);
  const hillNoise = makeNoise(random);
  const peakNoise = makeNoise(random);
  const bendPhase = random() * 10;
  const hillPhase = random() * 10;
  const peakPhase = random() * 10;

  for (let index = 0; index < COURSE_SEGMENTS; index += 1) {
    const leg = legIndexFor(index);
    const onRunway = index < 5 || index >= RUNWAY_START_SEG;
    let zone = ZONE_FIELD;
    if (onRunway) {
      zone = ZONE_RUNWAY;
    } else if (leg === 0) {
      const roll = random();
      zone = roll < 0.45 ? ZONE_FIELD : roll < 0.7 ? ZONE_FOREST : roll < 0.9 ? ZONE_RIVER : ZONE_TOWN;
    } else if (leg === 1) {
      const roll = random();
      zone = roll < 0.4 ? ZONE_RIVER : roll < 0.7 ? ZONE_FIELD : roll < 0.9 ? ZONE_TOWN : ZONE_FOREST;
    } else if (leg === 2) {
      const roll = random();
      zone = roll < 0.55 ? ZONE_MOUNTAIN : roll < 0.8 ? ZONE_FIELD : ZONE_FOREST;
    } else {
      zone = ZONE_FIELD;
    }

    // The valley bends gently; the runway legs are straight.
    let curve = 0;
    if (!onRunway) {
      curve = 0.85 * Math.sin(index * 0.045 + bendPhase) + 0.45 * bendNoise(index * 0.08);
      curve = clamp(curve, -1.3, 1.3);
    }

    // Rolling ground, with the mountain leg rising into a pass. The runway is flat, and the
    // first stretch is gentle so a fresh plane is never handed a hill to climb over.
    let ground = 6 + 8 * hillNoise(index * 0.05 + hillPhase) + 3 * Math.sin(index * 0.11 + hillPhase);
    if (leg === 2) ground += 12 * Math.max(0, peakNoise(index * 0.03 + peakPhase)) + 6;
    if (index >= RUNWAY_START_SEG - 6) ground = lerp(ground, 6, (index - (RUNWAY_START_SEG - 6)) / 6);
    if (index < 5) ground = 6;
    if (index >= 5 && index < 15) ground = lerp(6, ground, (index - 5) / 10);

    // A slow shade per segment, so the fields read as patchy farmland, not stripes.
    const shade = 0.5 + 0.5 * hillNoise(index * 0.13 + hillPhase + 40);

    // Trees and houses beside the corridor, seeded per segment.
    const decorations = [];
    const decorCount = zone === ZONE_FOREST ? 3 + Math.floor(random() * 3)
      : zone === ZONE_TOWN ? 2 + Math.floor(random() * 3)
      : zone === ZONE_FIELD ? Math.floor(random() * 2)
      : 0;
    for (let d = 0; d < decorCount; d += 1) {
      const side = random() < 0.5 ? -1 : 1;
      decorations.push({
        x: side * (20 + random() * 34),
        kind: zone === ZONE_TOWN ? 'house' : 'tree',
        size: 0.7 + random() * 0.7,
        shade: random(),
      });
    }

    segments.push({ index, leg, zone, curve, ground, shade, decorations });
  }

  // Rings along the course: each one hangs over the corridor at a seeded height.
  for (let seg = RING.first; seg < RUNWAY_START_SEG; seg += RING.every) {
    const ground = segments[seg].ground;
    rings.push({
      segment: seg,
      z: seg * SEGMENT_LENGTH + SEGMENT_LENGTH / 2,
      x: (random() * 2 - 1) * 28,
      alt: ground + 24 + random() * 30,
      radius: RING.radius,
      passed: false,
      hit: false,
    });
  }

  // Clouds drifting high above the valley.
  for (let i = 0; i < 16; i += 1) {
    clouds.push({
      x: (random() * 2 - 1) * 260,
      z: random() * COURSE_END_Z,
      alt: 78 + random() * 38,
      size: 26 + random() * 42,
      speed: 1.5 + random() * 2,
    });
  }

  const plane = {
    x: 0, z: 0, alt: 0, speed: 20, throttle: 0.5,
    pitch: 0, bank: 0, heading: 0, fuel: FUEL.start, invulnerable: 0,
  };
  const state = {
    plane, segments, rings, clouds,
    score: 0, combo: 0, bestCombo: 0, lives: LIVES,
    timeLeft: MISSION_TIME, leg: 0, ringsHit: 0,
    elapsed: 0, landed: false, finished: false, finishedReason: '',
    message: '', messageTimer: 0, flash: 0,
    lastRingZ: 0, groundAtPlane: 0,
  };

  function groundAt(x, z) {
    const seg = clamp(Math.floor(z / SEGMENT_LENGTH), 0, COURSE_SEGMENTS - 1);
    const next = Math.min(seg + 1, COURSE_SEGMENTS - 1);
    const frac = clamp((z - seg * SEGMENT_LENGTH) / SEGMENT_LENGTH, 0, 1);
    const ground = lerp(segments[seg].ground, segments[next].ground, frac);
    // The valley walls rise steeply past the corridor, so wandering off is a crash.
    return ground + Math.max(0, Math.abs(x) - VALLEY_HALF) * 0.9;
  }

  function corridorHeading(z) {
    const seg = clamp(Math.floor(z / SEGMENT_LENGTH), 0, COURSE_SEGMENTS - 1);
    return (-Math.atan2(segments[seg].curve, SEGMENT_LENGTH) * 180) / Math.PI;
  }

  function reset() {
    plane.x = 0;
    plane.z = 0;
    plane.alt = segments[0].ground + 30;
    plane.speed = 35;
    plane.throttle = 0.5;
    plane.pitch = 0;
    plane.bank = 0;
    plane.heading = 0;
    plane.fuel = FUEL.start;
    plane.invulnerable = 0;
    state.score = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.lives = LIVES;
    state.timeLeft = MISSION_TIME;
    state.leg = 0;
    state.ringsHit = 0;
    state.elapsed = 0;
    state.landed = false;
    state.finished = false;
    state.finishedReason = '';
    state.message = 'FLY THROUGH THE RINGS';
    state.messageTimer = 3;
    state.flash = 0;
    state.lastRingZ = 0;
    for (const ring of rings) {
      ring.passed = false;
      ring.hit = false;
    }
  }

  function nextRing() {
    for (const ring of rings) if (!ring.passed) return ring;
    return null;
  }

  function respawn() {
    plane.z = state.lastRingZ;
    plane.x = 0;
    plane.alt = groundAt(0, plane.z) + 30;
    plane.speed = 35;
    plane.throttle = 0.5;
    plane.pitch = 0;
    plane.bank = 0;
    plane.heading = 0;
    plane.invulnerable = PLANE.invulnerable;
  }

  function crash(events) {
    state.lives -= 1;
    state.combo = 0;
    state.message = state.lives > 0 ? 'CRASH! HULL DAMAGED' : 'CRASH! NO PLANES LEFT';
    state.messageTimer = 2.5;
    if (state.lives <= 0) {
      state.finished = true;
      state.finishedReason = 'crashed';
      return events | EVENT_CRASH | EVENT_OVER;
    }
    respawn();
    return events | EVENT_CRASH;
  }

  /**
   * One fixed step. `controls` is { steer -1..1, pitch -1..1, throttle -1..1 }.
   * With `harmless` set (the title screen's backdrop) the plane flies but nothing scores,
   * nothing crashes and the clock never runs out.
   */
  function step(dt, controls, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 3);
    if (state.messageTimer > 0) state.messageTimer = Math.max(0, state.messageTimer - dt);
    if (plane.invulnerable > 0) plane.invulnerable = Math.max(0, plane.invulnerable - dt);

    // Throttle, speed and bank chase their targets.
    plane.throttle = clamp(plane.throttle + controls.throttle * 0.8 * dt, 0, 1);
    if (plane.fuel <= 0) plane.throttle = 0;
    const targetSpeed = PLANE.minSpeed + plane.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
    const diff = targetSpeed - plane.speed;
    plane.speed += Math.sign(diff) * Math.min(Math.abs(diff), PLANE.accel * dt);
    const targetBank = controls.steer * PLANE.maxBank;
    const bankDiff = targetBank - plane.bank;
    plane.bank += Math.sign(bankDiff) * Math.min(Math.abs(bankDiff), 190 * dt);
    plane.pitch = clamp(controls.pitch, -1, 1);

    // Heading follows the stick and settles back onto the valley's direction. The settle
    // uses the shortest way around the compass: a naive (corridor - heading) would drag a
    // heading of 351 degrees the long way down through 180 instead of up through 0.
    const corridor = corridorHeading(plane.z);
    plane.heading += controls.steer * 26 * dt;
    const settle = ((corridor - plane.heading + 540) % 360) - 180;
    plane.heading += settle * 0.35 * dt;
    plane.heading = ((plane.heading % 360) + 360) % 360;

    // Lateral motion and climb, then forward motion.
    plane.x = clamp(plane.x + controls.steer * plane.speed * PLANE.steerRate * dt, -(VALLEY_HALF + 6), VALLEY_HALF + 6);
    const climb = plane.pitch * PLANE.climbRate * plane.speed;
    const sink = (1 - plane.throttle) * PLANE.sink + (plane.speed < 25 ? 4 : 0);
    plane.alt = clamp(plane.alt + (climb - sink) * dt, 0, PLANE.ceiling);
    plane.z += plane.speed * dt;
    state.groundAtPlane = groundAt(plane.x, plane.z);

    if (!harmless) {
      plane.fuel = Math.max(0, plane.fuel - (0.12 + plane.throttle * FUEL.drain) * dt);
      if (plane.fuel <= 0 && state.messageTimer === 0) {
        state.message = 'FUEL EMPTY — GLIDING';
        state.messageTimer = 2;
        events |= EVENT_FUEL;
      }
      state.timeLeft -= dt;
    }

    // Rings: the next unpassed ring is judged as the plane crosses its z.
    const ring = nextRing();
    if (ring !== null && plane.z >= ring.z) {
      ring.passed = true;
      const dx = Math.abs(plane.x - ring.x);
      const dy = Math.abs(plane.alt - ring.alt);
      if (dx < ring.radius * 0.85 && dy < ring.radius * 0.85 && !harmless) {
        ring.hit = true;
        state.combo += 1;
        state.bestCombo = Math.max(state.bestCombo, state.combo);
        const multiplier = 1 + Math.min(state.combo - 1, 10) * 0.1;
        state.score += Math.round(RING.points * multiplier);
        state.ringsHit += 1;
        state.lastRingZ = ring.z;
        plane.fuel = Math.min(100, plane.fuel + FUEL.ringBonus);
        state.flash = 1;
        state.message = state.combo > 1 ? `RING! COMBO x${state.combo}` : 'RING! +100';
        state.messageTimer = 1.6;
        events |= EVENT_RING;
      } else if (!harmless) {
        state.combo = 0;
        state.score = Math.max(0, state.score - SCORE.missPenalty);
        state.message = 'MISSED RING −25';
        state.messageTimer = 1.6;
        events |= EVENT_MISS;
      }
    }

    // Legs change as the course rolls on.
    const leg = legIndexFor(clamp(Math.floor(plane.z / SEGMENT_LENGTH), 0, COURSE_SEGMENTS - 1));
    if (leg !== state.leg && !harmless) {
      state.leg = leg;
      state.message = LEGS[leg].name;
      state.messageTimer = 2.5;
      events |= EVENT_LEG;
    }

    // Terrain collision: the ground, or a valley wall, ends the run.
    if (!harmless && plane.invulnerable === 0 && plane.alt <= state.groundAtPlane + 1.5) {
      return crash(events);
    }

    // Landing: slow and low over the home runway, after the last ring.
    const segment = clamp(Math.floor(plane.z / SEGMENT_LENGTH), 0, COURSE_SEGMENTS - 1);
    if (!harmless && segment >= RUNWAY_START_SEG && plane.alt <= state.groundAtPlane + 6 && plane.speed <= 80) {
      state.landed = true;
      state.finished = true;
      state.finishedReason = 'landed';
      state.score += SCORE.landBonus + Math.round(state.timeLeft) * SCORE.timeBonus + Math.round(plane.fuel) * SCORE.fuelBonus;
      state.message = 'LANDED SAFELY!';
      state.messageTimer = 4;
      return events | EVENT_LAND | EVENT_OVER;
    }
    if (!harmless && plane.z >= COURSE_END_Z) {
      state.finished = true;
      state.finishedReason = 'overshot';
      state.message = 'OVERSHOT THE RUNWAY';
      state.messageTimer = 4;
      return events | EVENT_OVER;
    }
    if (!harmless && state.timeLeft <= 0) {
      state.finished = true;
      state.finishedReason = 'time';
      state.message = 'OUT OF TIME';
      state.messageTimer = 4;
      return events | EVENT_OVER;
    }
    return events;
  }

  reset();
  return { state, reset, step, groundAt, corridorHeading, nextRing, legIndexFor };
}
