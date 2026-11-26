// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour.
//
// The view is a chase camera behind the courier plane: the valley ahead is drawn as projected
// strips, near to far, so the ground rolls, the river winds and the mountain pass rises; the
// plane sits fixed in the lower centre, banked by the stick, and the cockpit panel along the
// bottom carries the lit instruments — artificial horizon, altimeter, airspeed, vertical speed,
// compass tape, throttle and fuel — with the big HUD numbers across the top.

import {
  CAMERA_DEPTH,
  CAMERA_HEIGHT,
  COURSE_SEGMENTS,
  DRAW_DISTANCE,
  FIELD,
  FONT,
  LEGS,
  LIVES,
  PALETTE,
  PLANE,
  RIBBON_HALF,
  SEGMENT_LENGTH,
  VALLEY_HALF,
} from './config.js';
import {
  ZONE_FIELD,
  ZONE_FOREST,
  ZONE_MOUNTAIN,
  ZONE_RIVER,
  ZONE_RUNWAY,
  ZONE_TOWN,
} from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const HORIZON_Y = 300;
const PANEL_TOP = 602;
const PLANE_X = 640;
const PLANE_Y = 468;
const ZONE_COLORS = {
  [ZONE_FIELD]: PALETTE.fieldA,
  [ZONE_FOREST]: PALETTE.forest,
  [ZONE_RIVER]: PALETTE.fieldB,
  [ZONE_TOWN]: PALETTE.town,
  [ZONE_MOUNTAIN]: PALETTE.rock,
  [ZONE_RUNWAY]: PALETTE.fieldB,
};

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function pad3(value) {
  return String(Math.max(0, Math.min(359, Math.round(value)))).padStart(3, '0');
}

/** Blend two hex colours; t = 0 is a, t = 1 is b. */
function mixColor(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${out[0]}, ${out[1]}, ${out[2]})`;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}/${weight ?? ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ?? ''} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  // --- Projection -------------------------------------------------------------------------

  function project(worldX, worldY, relZ, cameraY) {
    if (relZ < 1) return null;
    const scale = CAMERA_DEPTH / relZ;
    return {
      x: FIELD.width / 2 + scale * worldX * (FIELD.width / 2),
      y: HORIZON_Y - scale * (worldY - cameraY) * (FIELD.height / 2),
      scale,
    };
  }

  // --- Sky ----------------------------------------------------------------------------------

  function drawSky(state) {
    const gradient = context.createLinearGradient(0, 0, 0, HORIZON_Y + 40);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.skyLow);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, HORIZON_Y + 40);

    // Sun, top right, with a warm glow.
    const sunX = 1060;
    const sunY = 84;
    const glow = context.createRadialGradient(sunX, sunY, 8, sunX, sunY, 130);
    glow.addColorStop(0, 'rgba(255, 214, 106, 0.85)');
    glow.addColorStop(1, 'rgba(255, 214, 106, 0)');
    context.fillStyle = glow;
    context.fillRect(sunX - 130, sunY - 130, 260, 260);
    context.fillStyle = PALETTE.sunCore;
    context.beginPath();
    context.arc(sunX, sunY, 34, 0, Math.PI * 2);
    context.fill();

    // Distant mountain silhouettes, two layers, parallaxed by how far the valley has bent.
    let bend = 0;
    const baseSeg = clamp(Math.floor(state.plane.z / SEGMENT_LENGTH), 0, COURSE_SEGMENTS - 1);
    for (let i = 0; i < baseSeg; i += 1) bend += state.segments[i].curve;
    drawRidge(bend * 6, 62, PALETTE.mountainFar, 0);
    drawRidge(bend * 14, 92, PALETTE.mountainNear, 900);

    // Slow sky clouds, drifting with the flight time.
    context.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let i = 0; i < 5; i += 1) {
      const cx = ((i * 263 + state.elapsed * (4 + i * 2)) % 1500) - 110;
      const cy = 52 + i * 34;
      const s = 0.7 + (i % 3) * 0.3;
      cloudPuff(cx, cy, 46 * s);
      cloudPuff(cx + 34 * s, cy + 8, 34 * s);
    }
  }

  function drawRidge(offset, height, color, seed) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(-20, HORIZON_Y + 2);
    for (let x = -20; x <= FIELD.width + 20; x += 40) {
      const px = x - (offset % 1280);
      const n = Math.sin((x + seed) * 0.011) * 0.6 + Math.sin((x + seed) * 0.027 + 1.7) * 0.4;
      context.lineTo(px, HORIZON_Y + 2 - (0.35 + 0.65 * (n * 0.5 + 0.5)) * height);
    }
    context.lineTo(FIELD.width + 20, HORIZON_Y + 2);
    context.closePath();
    context.fill();
  }

  function cloudPuff(x, y, r) {
    context.beginPath();
    context.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
    context.fill();
  }

  // --- Terrain ------------------------------------------------------------------------------

  function ribbonColor(zone, index) {
    if (zone === ZONE_RIVER) return PALETTE.river;
    if (zone === ZONE_RUNWAY) return index % 2 === 0 ? '#454b54' : '#3c4148';
    if (zone === ZONE_MOUNTAIN) return '#8a8378';
    if (zone === ZONE_TOWN) return '#7d7468';
    return PALETTE.riverBank;
  }

  function drawTerrain(state) {
    const plane = state.plane;
    const segments = state.segments;
    const baseSeg = clamp(Math.floor(plane.z / SEGMENT_LENGTH), 0, COURSE_SEGMENTS - 1);
    const basePct = clamp((plane.z - baseSeg * SEGMENT_LENGTH) / SEGMENT_LENGTH, 0, 1);
    const cameraY = plane.alt + CAMERA_HEIGHT;
    // Past the runway the course is over, but the ground still has to draw: reuse the last
    // segment so the view never falls through to the backdrop.
    const count = DRAW_DISTANCE;

    let x = 0;
    let dx = -(segments[baseSeg].curve * basePct);
    let clipY = FIELD.height;
    let prevGroundY = FIELD.height + 40;

    for (let n = 0; n < count; n += 1) {
      const seg = segments[Math.min(baseSeg + n, COURSE_SEGMENTS - 1)];
      const nextSeg = segments[Math.min(baseSeg + n + 1, COURSE_SEGMENTS - 1)];
      const relZFar = (n + 1 - basePct) * SEGMENT_LENGTH;
      const relZNear = Math.max(n - basePct, 0.05) * SEGMENT_LENGTH;
      const farCenter = x + dx;
      const far = project(farCenter - plane.x, nextSeg.ground, relZFar, cameraY);
      const near = project(x - plane.x, seg.ground, relZNear, cameraY);
      if (far === null) {
        x += dx;
        dx += seg.curve;
        continue;
      }
      const yFar = far.y;
      if (yFar < clipY) {
        // Ground band: full width, this segment's zone colour, shaded slowly per segment so
        // the fields read as patchy farmland instead of hard stripes.
        const shade = seg.shade ?? 0.5;
        let color = ZONE_COLORS[seg.zone] ?? PALETTE.fieldA;
        if (seg.zone === ZONE_FIELD || seg.zone === ZONE_RIVER) color = mixColor(PALETTE.fieldA, PALETTE.fieldB, shade);
        else if (seg.zone === ZONE_FOREST) color = mixColor('#2f6b2e', '#3d7d33', shade);
        else if (seg.zone === ZONE_TOWN) color = mixColor(PALETTE.fieldA, '#9a8f7a', 0.35 + shade * 0.2);
        else if (seg.zone === ZONE_MOUNTAIN) color = mixColor('#5d7a52', '#6f6a63', 0.4 + shade * 0.2);
        context.fillStyle = color;
        context.fillRect(0, yFar, FIELD.width, clipY - yFar);

        // The ribbon down the valley: river, road or runway, following the bend.
        if (near !== null) {
          const wNear = near.scale * RIBBON_HALF * (FIELD.width / 2);
          const wFar = far.scale * RIBBON_HALF * (FIELD.width / 2);
          context.fillStyle = ribbonColor(seg.zone, n);
          context.beginPath();
          context.moveTo(near.x - wNear, near.y);
          context.lineTo(near.x + wNear, near.y);
          context.lineTo(far.x + wFar, far.y);
          context.lineTo(far.x - wFar, far.y);
          context.closePath();
          context.fill();
          // Runway centreline dashes.
          if (seg.zone === ZONE_RUNWAY && n % 2 === 0) {
            context.fillStyle = PALETTE.runwayLine;
            context.beginPath();
            context.moveTo(near.x - 1.5, near.y);
            context.lineTo(near.x + 1.5, near.y);
            context.lineTo(far.x + 1.5, far.y);
            context.lineTo(far.x - 1.5, far.y);
            context.closePath();
            context.fill();
          }
        }

        // Mountain pass: rock slopes rising on both flanks of the corridor. Only far
        // segments draw them: near ones would project their peaks off the top of the screen
        // and paint the whole view.
        if (seg.zone === ZONE_MOUNTAIN && near !== null && relZFar > 140) {
          const peakScale = far.scale * (FIELD.width / 2);
          const halfW = peakScale * 0.55;
          const apexL = project(farCenter - plane.x - 52, nextSeg.ground + 58, relZFar, cameraY);
          const apexR = project(farCenter - plane.x + 52, nextSeg.ground + 58, relZFar, cameraY);
          context.fillStyle = PALETTE.mountainNear;
          if (apexL !== null && apexL.y > HORIZON_Y - 80 && apexL.y < clipY) {
            context.beginPath();
            context.moveTo(0, clipY);
            context.lineTo(far.x - halfW, clipY);
            context.lineTo(apexL.x, apexL.y);
            context.closePath();
            context.fill();
            context.fillStyle = PALETTE.snow;
            context.beginPath();
            context.moveTo(apexL.x, apexL.y);
            context.lineTo(apexL.x - 16, apexL.y + 18);
            context.lineTo(apexL.x + 16, apexL.y + 18);
            context.closePath();
            context.fill();
          }
          context.fillStyle = PALETTE.mountainNear;
          if (apexR !== null && apexR.y > HORIZON_Y - 80 && apexR.y < clipY) {
            context.beginPath();
            context.moveTo(FIELD.width, clipY);
            context.lineTo(far.x + halfW, clipY);
            context.lineTo(apexR.x, apexR.y);
            context.closePath();
            context.fill();
            context.fillStyle = PALETTE.snow;
            context.beginPath();
            context.moveTo(apexR.x, apexR.y);
            context.lineTo(apexR.x - 16, apexR.y + 18);
            context.lineTo(apexR.x + 16, apexR.y + 18);
            context.closePath();
            context.fill();
          }
        }

        // Trees and houses beside the corridor.
        const relZMid = (n + 0.5 - basePct) * SEGMENT_LENGTH;
        for (const decor of seg.decorations) {
          const p = project(x + dx * 0.5 + decor.x - plane.x, seg.ground, relZMid, cameraY);
          if (p === null || p.y > clipY || p.y < yFar - 40) continue;
          const s = p.scale * (FIELD.width / 2) * decor.size;
          if (s < 2) continue;
          if (decor.kind === 'tree') {
            context.fillStyle = '#5a3d24';
            context.fillRect(p.x - s * 0.08, p.y - s * 0.5, s * 0.16, s * 0.5);
            context.fillStyle = decor.shade > 0.5 ? '#2f6b2e' : '#3d7d33';
            context.beginPath();
            context.moveTo(p.x, p.y - s * 1.5);
            context.lineTo(p.x - s * 0.55, p.y - s * 0.4);
            context.lineTo(p.x + s * 0.55, p.y - s * 0.4);
            context.closePath();
            context.fill();
          } else {
            context.fillStyle = '#d8cbb2';
            context.fillRect(p.x - s * 0.5, p.y - s * 0.7, s, s * 0.7);
            context.fillStyle = PALETTE.townRoof;
            context.beginPath();
            context.moveTo(p.x - s * 0.6, p.y - s * 0.7);
            context.lineTo(p.x, p.y - s * 1.15);
            context.lineTo(p.x + s * 0.6, p.y - s * 0.7);
            context.closePath();
            context.fill();
          }
        }

        clipY = yFar;
        prevGroundY = yFar;
      }
      x += dx;
      dx += seg.curve;
    }
    void prevGroundY;

    // Rings and clouds, far to near, over the terrain.
    const ringDraws = [];
    for (const ring of state.rings) {
      const relZ = ring.z - plane.z;
      if (relZ < 2 || relZ > DRAW_DISTANCE * SEGMENT_LENGTH) continue;
      ringDraws.push(ring);
    }
    ringDraws.sort((a, b) => b.z - a.z);
    for (const ring of ringDraws) drawRing(state, ring, cameraY);
    drawClouds3d(state, cameraY);

    // The plane's shadow on the ground a little ahead of it: it grounds the plane in the
    // valley and fades as the plane climbs.
    const shadowSeg = clamp(Math.floor((plane.z + 40) / SEGMENT_LENGTH), 0, COURSE_SEGMENTS - 1);
    let shadowX = 0;
    let shadowDx = -(segments[baseSeg].curve * basePct);
    for (let n = 0; n < shadowSeg - baseSeg; n += 1) {
      shadowX += shadowDx;
      shadowDx += segments[Math.min(baseSeg + n, COURSE_SEGMENTS - 1)].curve;
    }
    const shadow = project(shadowX + shadowDx * 0.5, segments[shadowSeg].ground, 40, cameraY);
    if (shadow !== null && shadow.y > HORIZON_Y && shadow.y < PANEL_TOP) {
      const heightAbove = Math.max(0, plane.alt - state.groundAtPlane);
      const alpha = clamp(0.34 - heightAbove * 0.004, 0.08, 0.34);
      context.fillStyle = `rgba(10, 16, 28, ${alpha})`;
      context.beginPath();
      context.ellipse(shadow.x, shadow.y, 52, 10, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawRing(state, ring, cameraY) {
    const plane = state.plane;
    const baseSeg = clamp(Math.floor(plane.z / SEGMENT_LENGTH), 0, COURSE_SEGMENTS - 1);
    const basePct = clamp((plane.z - baseSeg * SEGMENT_LENGTH) / SEGMENT_LENGTH, 0, 1);
    // Lateral offset of the corridor at the ring's segment, from the camera's segment.
    let x = 0;
    let dx = -(state.segments[baseSeg].curve * basePct);
    const ringSeg = clamp(ring.segment - baseSeg, 0, DRAW_DISTANCE);
    for (let n = 0; n < ringSeg; n += 1) {
      x += dx;
      dx += state.segments[Math.min(baseSeg + n, COURSE_SEGMENTS - 1)].curve;
    }
    const relZ = ring.z - plane.z;
    const p = project(x + dx * 0.5 - plane.x + ring.x, ring.alt, relZ, cameraY);
    if (p === null || p.y < HORIZON_Y - 60 || p.y > PANEL_TOP) return;
    const r = Math.max(4, p.scale * ring.radius * (FIELD.width / 2));
    // A light beam down to the ground so the ring reads from far away.
    const ground = project(x + dx * 0.5 - plane.x + ring.x, state.segments[ring.segment].ground, relZ, cameraY);
    if (ground !== null) {
      context.strokeStyle = 'rgba(255, 210, 62, 0.28)';
      context.lineWidth = Math.max(1, r * 0.12);
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.lineTo(ground.x, ground.y);
      context.stroke();
    }
    const glow = context.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, r * 1.9);
    glow.addColorStop(0, 'rgba(255, 157, 0, 0.45)');
    glow.addColorStop(1, 'rgba(255, 157, 0, 0)');
    context.fillStyle = glow;
    context.fillRect(p.x - r * 1.9, p.y - r * 1.9, r * 3.8, r * 3.8);
    context.strokeStyle = PALETTE.ring;
    context.lineWidth = Math.max(2, r * 0.16);
    context.beginPath();
    context.ellipse(p.x, p.y, r, r * 0.92, 0, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = PALETTE.ringGlow;
    context.lineWidth = Math.max(1, r * 0.05);
    context.beginPath();
    context.ellipse(p.x, p.y, r * 0.72, r * 0.66, 0, 0, Math.PI * 2);
    context.stroke();
    if (r > 26) {
      text('RING', p.x, p.y - r - 10, 15, PALETTE.ring, 'center', '700');
    }
  }

  function drawClouds3d(state, cameraY) {
    const plane = state.plane;
    const baseSeg = clamp(Math.floor(plane.z / SEGMENT_LENGTH), 0, COURSE_SEGMENTS - 1);
    const basePct = clamp((plane.z - baseSeg * SEGMENT_LENGTH) / SEGMENT_LENGTH, 0, 1);
    const list = [];
    for (const cloud of state.clouds) {
      const relZ = cloud.z + cloud.speed * state.elapsed - plane.z;
      if (relZ < 4 || relZ > DRAW_DISTANCE * SEGMENT_LENGTH) continue;
      list.push({ cloud, relZ });
    }
    list.sort((a, b) => b.relZ - a.relZ);
    for (const { cloud, relZ } of list) {
      let x = 0;
      let dx = -(state.segments[baseSeg].curve * basePct);
      const segN = clamp(Math.floor(relZ / SEGMENT_LENGTH), 0, DRAW_DISTANCE);
      for (let n = 0; n < segN; n += 1) {
        x += dx;
        dx += state.segments[Math.min(baseSeg + n, COURSE_SEGMENTS - 1)].curve;
      }
      const p = project(x + dx * 0.5 + cloud.x - plane.x, cloud.alt, relZ, cameraY);
      if (p === null || p.y < -40 || p.y > PANEL_TOP) continue;
      const r = Math.max(6, p.scale * cloud.size * (FIELD.width / 2));
      context.fillStyle = 'rgba(255, 255, 255, 0.82)';
      cloudPuff(p.x, p.y, r);
      cloudPuff(p.x + r * 0.7, p.y + r * 0.12, r * 0.7);
      cloudPuff(p.x - r * 0.7, p.y + r * 0.14, r * 0.65);
    }
  }

  // --- The plane ----------------------------------------------------------------------------

  function drawPlane(state) {
    const plane = state.plane;
    const blink = Math.floor(state.elapsed * 2) % 2 === 0;
    const speed01 = clamp((plane.speed - 18) / (PLANE.maxSpeed - 18), 0, 1);
    context.save();
    context.translate(PLANE_X, PLANE_Y + plane.pitch * -8);
    context.rotate((-plane.bank * Math.PI) / 180);
    const bob = Math.sin(state.elapsed * 7) * 1.5 * speed01;
    context.translate(0, bob);

    // Propeller blur at the nose (the far end, seen from behind).
    context.fillStyle = 'rgba(220, 228, 240, 0.28)';
    context.beginPath();
    context.ellipse(0, -96, 26, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(220, 228, 240, 0.16)';
    context.beginPath();
    context.ellipse(0, -96, 40, 5, 0, 0, Math.PI * 2);
    context.fill();

    // Wings, with red trim and lit tips.
    context.fillStyle = PALETTE.planeWing;
    context.beginPath();
    context.moveTo(-118, -18);
    context.lineTo(-96, -34);
    context.lineTo(-14, -30);
    context.lineTo(-14, -6);
    context.lineTo(-96, -2);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(118, -18);
    context.lineTo(96, -34);
    context.lineTo(14, -30);
    context.lineTo(14, -6);
    context.lineTo(96, -2);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.planeTrim;
    context.fillRect(-118, -22, 10, 8);
    context.fillRect(108, -22, 10, 8);

    // Fuselage, nose away from the camera, tail toward it.
    const body = context.createLinearGradient(-16, -100, 16, 60);
    body.addColorStop(0, '#f4f1e8');
    body.addColorStop(0.6, PALETTE.planeBody);
    body.addColorStop(1, '#b9b2a0');
    context.fillStyle = body;
    context.beginPath();
    context.moveTo(-13, -92);
    context.quadraticCurveTo(-20, -30, -15, 18);
    context.quadraticCurveTo(-12, 52, 0, 56);
    context.quadraticCurveTo(12, 52, 15, 18);
    context.quadraticCurveTo(20, -30, 13, -92);
    context.quadraticCurveTo(0, -102, -13, -92);
    context.closePath();
    context.fill();
    // Canopy, lit amber by the panel lights.
    context.fillStyle = '#7ec8e8';
    context.beginPath();
    context.ellipse(0, -58, 11, 22, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255, 255, 255, 0.55)';
    context.beginPath();
    context.ellipse(-3, -64, 4, 9, 0.2, 0, Math.PI * 2);
    context.fill();
    // Red cheatline and registration.
    context.fillStyle = PALETTE.planeTrim;
    context.fillRect(-14, -6, 28, 5);
    text('KESTREL', 0, 34, 11, '#5a5344', 'center', '700');

    // Tailplane and fin.
    context.fillStyle = PALETTE.planeWing;
    context.beginPath();
    context.moveTo(-52, 34);
    context.lineTo(-44, 22);
    context.lineTo(-8, 24);
    context.lineTo(-8, 40);
    context.lineTo(-44, 44);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(52, 34);
    context.lineTo(44, 22);
    context.lineTo(8, 24);
    context.lineTo(8, 40);
    context.lineTo(44, 44);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.planeTrim;
    context.beginPath();
    context.moveTo(0, 52);
    context.lineTo(-9, 30);
    context.lineTo(-4, 26);
    context.lineTo(4, 26);
    context.lineTo(9, 30);
    context.closePath();
    context.fill();

    // Navigation lights: red port, green starboard, white tail — blinking.
    if (blink) {
      context.fillStyle = '#ff2e2e';
      context.beginPath();
      context.arc(-116, -20, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2eff5a';
      context.beginPath();
      context.arc(116, -20, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(0, 56, 4, 0, Math.PI * 2);
    context.fill();

    // Exhaust shimmer at full throttle.
    if (plane.throttle > 0.75) {
      context.fillStyle = 'rgba(255, 176, 46, 0.7)';
      context.beginPath();
      context.moveTo(-6, 56);
      context.lineTo(0, 56 + 10 + Math.sin(state.elapsed * 31) * 4);
      context.lineTo(6, 56);
      context.closePath();
      context.fill();
    }
    context.restore();

    // Ring flash: a gold wash when a ring is taken.
    if (state.flash > 0) {
      const glow = context.createRadialGradient(PLANE_X, PLANE_Y, 40, PLANE_X, PLANE_Y, 420);
      glow.addColorStop(0, `rgba(255, 210, 62, ${0.28 * state.flash})`);
      glow.addColorStop(1, 'rgba(255, 210, 62, 0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  // --- Instruments ----------------------------------------------------------------------------

  function drawGauge(cx, cy, r, label) {
    context.fillStyle = PALETTE.gaugeFace;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.gaugeRing;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.litAmber;
    context.beginPath();
    context.arc(cx, cy - r + 2, 3, 0, Math.PI * 2);
    context.fill();
    text(label, cx, cy + r + 16, 13, PALETTE.muted, 'center', '700');
  }

  function drawNeedle(cx, cy, r, angle, color) {
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + Math.sin(angle) * (r - 8), cy - Math.cos(angle) * (r - 8));
    context.stroke();
    context.fillStyle = color;
    context.beginPath();
    context.arc(cx, cy, 4, 0, Math.PI * 2);
    context.fill();
  }

  function drawTicks(cx, cy, r, count, startAngle, endAngle) {
    context.strokeStyle = 'rgba(238, 241, 245, 0.6)';
    context.lineWidth = 2;
    for (let i = 0; i <= count; i += 1) {
      const a = startAngle + ((endAngle - startAngle) * i) / count;
      context.beginPath();
      context.moveTo(cx + Math.sin(a) * (r - 10), cy - Math.cos(a) * (r - 10));
      context.lineTo(cx + Math.sin(a) * (r - 4), cy - Math.cos(a) * (r - 4));
      context.stroke();
    }
  }

  function drawArtificialHorizon(state) {
    const cx = 96;
    const cy = 661;
    const r = 50;
    const plane = state.plane;
    context.save();
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.clip();
    context.translate(cx, cy);
    context.rotate((-plane.bank * Math.PI) / 180);
    context.translate(0, clamp(plane.pitch * 26, -r, r));
    context.fillStyle = '#4a90d9';
    context.fillRect(-r - 4, -r * 2 - 4, (r + 4) * 2, r * 2 + 4);
    context.fillStyle = '#8a5a34';
    context.fillRect(-r - 4, 0, (r + 4) * 2, r * 2 + 4);
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-r - 4, 0);
    context.lineTo(r + 4, 0);
    context.stroke();
    for (const off of [-24, 24]) {
      context.beginPath();
      context.moveTo(-14, off);
      context.lineTo(14, off);
      context.stroke();
    }
    context.restore();
    context.strokeStyle = PALETTE.gaugeRing;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.stroke();
    // Fixed aircraft symbol: the plane never banks, the world does.
    context.strokeStyle = PALETTE.litAmber;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx - 26, cy);
    context.lineTo(cx - 8, cy);
    context.moveTo(cx + 8, cy);
    context.lineTo(cx + 26, cy);
    context.stroke();
    context.fillStyle = PALETTE.litAmber;
    context.beginPath();
    context.arc(cx, cy, 4, 0, Math.PI * 2);
    context.fill();
    text('ATT', cx, cy + r + 16, 13, PALETTE.muted, 'center', '700');
  }

  function drawCompassTape(state) {
    const cy = 616;
    const heading = state.plane.heading;
    context.fillStyle = 'rgba(16, 20, 29, 0.85)';
    context.fillRect(0, PANEL_TOP, FIELD.width, 26);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, PANEL_TOP + 26);
    context.lineTo(FIELD.width, PANEL_TOP + 26);
    context.stroke();
    const centre = FIELD.width / 2;
    const pxPerDeg = 4.2;
    for (let d = -40; d <= 40; d += 5) {
      let h = Math.round(heading + d);
      h = ((h % 360) + 360) % 360;
      const x = centre + d * pxPerDeg;
      const major = h % 30 === 0;
      context.strokeStyle = major ? PALETTE.text : 'rgba(238, 241, 245, 0.45)';
      context.lineWidth = major ? 2 : 1;
      context.beginPath();
      context.moveTo(x, cy + 2);
      context.lineTo(x, cy + (major ? 12 : 7));
      context.stroke();
      if (major) {
        const label = h === 0 ? 'N' : h === 90 ? 'E' : h === 180 ? 'S' : h === 270 ? 'W' : pad3(h);
        text(label, x, cy + 24, 12, major ? PALETTE.text : PALETTE.muted, 'center', '700');
      }
    }
    context.fillStyle = PALETTE.litAmber;
    context.beginPath();
    context.moveTo(centre - 7, PANEL_TOP);
    context.lineTo(centre + 7, PANEL_TOP);
    context.lineTo(centre, PANEL_TOP + 9);
    context.closePath();
    context.fill();
  }

  function drawInstruments(state) {
    const plane = state.plane;
    const altFt = Math.max(0, Math.round((plane.alt - state.groundAtPlane) * 32.8));
    const speedKt = Math.round(plane.speed * 2.4);
    const vsi = Math.round((plane.pitch * PLANE.climbRate * plane.speed - (1 - plane.throttle) * 5 - (plane.speed < 25 ? 4 : 0)) * 3.28 * 10) / 10;

    // Panel body.
    const panelGrad = context.createLinearGradient(0, PANEL_TOP, 0, FIELD.height);
    panelGrad.addColorStop(0, '#202634');
    panelGrad.addColorStop(1, '#12151e');
    context.fillStyle = panelGrad;
    context.fillRect(0, PANEL_TOP, FIELD.width, FIELD.height - PANEL_TOP);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, PANEL_TOP);
    context.lineTo(FIELD.width, PANEL_TOP);
    context.stroke();

    drawCompassTape(state);
    drawArtificialHorizon(state);

    // Altimeter: needle turns once per 1000 ft, digital window below.
    drawGauge(258, 661, 42, 'ALT');
    drawTicks(258, 661, 42, 10, -Math.PI * 0.75, Math.PI * 0.75);
    drawNeedle(258, 661, 42, ((altFt % 1000) / 1000) * Math.PI * 2, PALETTE.litCyan);
    text(`${altFt.toLocaleString('en-US')} FT`, 258, 661 + 2, 13, PALETTE.text, 'center', '700');

    // Airspeed: needle over 0..240 kt.
    drawGauge(372, 661, 42, 'SPD');
    drawTicks(372, 661, 42, 8, -Math.PI * 0.75, Math.PI * 0.75);
    drawNeedle(372, 661, 42, -Math.PI * 0.75 + (clamp(speedKt, 0, 240) / 240) * Math.PI * 1.5, PALETTE.litGreen);
    text(`${speedKt} KT`, 372, 661 + 2, 13, PALETTE.text, 'center', '700');

    // Vertical speed, in hundreds of feet per minute.
    drawGauge(472, 661, 34, 'V/S');
    drawNeedle(472, 661, 34, clamp(vsi / 500, -1, 1) * Math.PI * 0.75, PALETTE.litAmber);

    // Centre block: leg, score, rings, time.
    const ring = state.rings.find((item) => !item.passed) ?? null;
    const ringText = ring === null ? 'COURSE CLEAR' : `NEXT RING ${Math.max(0, Math.round((ring.z - plane.z) * 3))} m`;
    text(LEGS[state.leg].name, 640, 664, 15, PALETTE.muted, 'center', '700');
    text(ringText, 640, 688, 15, PALETTE.ring, 'center', '700');
    text(`SCORE ${state.score.toLocaleString('en-US')}`, 640, 716, 13, PALETTE.text, 'center');

    // Throttle lever.
    const thrX = 1010;
    const thrTop = 646;
    const thrH = 56;
    context.fillStyle = PALETTE.gaugeFace;
    context.fillRect(thrX - 4, thrTop - 4, 8, thrH + 8);
    context.strokeStyle = PALETTE.gaugeRing;
    context.lineWidth = 2;
    context.strokeRect(thrX - 4, thrTop - 4, 8, thrH + 8);
    const leverY = thrTop + thrH - plane.throttle * thrH;
    context.fillStyle = plane.throttle > 0.75 ? PALETTE.litRed : PALETTE.litAmber;
    context.fillRect(thrX - 12, leverY - 4, 24, 8);
    text('THR', thrX, 716, 13, PALETTE.muted, 'center', '700');
    text(`${Math.round(plane.throttle * 100)}%`, thrX + 34, 668, 14, PALETTE.text, 'center', '700');

    // Fuel gauge.
    const fuelX = 1092;
    context.fillStyle = PALETTE.gaugeFace;
    context.fillRect(fuelX, thrTop - 4, 16, thrH + 8);
    const fuelH = (plane.fuel / 100) * thrH;
    context.fillStyle = plane.fuel < 25 ? PALETTE.litRed : plane.fuel < 50 ? PALETTE.litAmber : PALETTE.litGreen;
    context.fillRect(fuelX + 2, thrTop + thrH - fuelH, 12, fuelH);
    context.strokeStyle = PALETTE.gaugeRing;
    context.lineWidth = 2;
    context.strokeRect(fuelX, thrTop - 4, 16, thrH + 8);
    text('FUEL', fuelX + 8, 716, 13, PALETTE.muted, 'center', '700');

    // Lives: little planes left in the hangar.
    text('PLANES', 1206, 650, 13, PALETTE.muted, 'center', '700');
    for (let life = 0; life < LIVES; life += 1) {
      const lx = 1178 + life * 34;
      context.fillStyle = life < state.lives ? PALETTE.planeBody : 'rgba(238, 241, 245, 0.15)';
      // A tiny top-down plane: fuselage, wings, tail.
      context.beginPath();
      context.ellipse(lx + 11, 672, 4, 12, 0, 0, Math.PI * 2);
      context.fill();
      context.fillRect(lx, 668, 22, 5);
      context.fillRect(lx + 5, 682, 12, 4);
    }
    text(state.finished && state.landed ? 'LANDED' : `RINGS ${state.ringsHit}/${state.rings.length}`, 1206, 700, 13, PALETTE.text, 'center', '700');
  }

  // --- HUD ------------------------------------------------------------------------------------

  function drawHudBox(x, y, w, label, value, color) {
    context.fillStyle = 'rgba(10, 16, 28, 0.62)';
    roundRect(x, y, w, 62, 8);
    context.fill();
    context.strokeStyle = 'rgba(238, 241, 245, 0.25)';
    context.lineWidth = 1;
    context.stroke();
    text(label, x + 14, y + 20, 13, PALETTE.muted, 'left', '700');
    text(value, x + 14, y + 48, 30, color ?? PALETTE.text, 'left', '700');
  }

  function drawHud(state) {
    const plane = state.plane;
    const altFt = Math.max(0, Math.round((plane.alt - state.groundAtPlane) * 32.8));
    const speedKt = Math.round(plane.speed * 2.4);
    drawHudBox(16, 14, 168, 'ALTITUDE', `${altFt.toLocaleString('en-US')} FT`, PALETTE.litCyan);
    drawHudBox(196, 14, 150, 'SPEED', `${speedKt} KT`, PALETTE.litGreen);
    drawHudBox(358, 14, 130, 'HEADING', `${pad3(plane.heading)}°`, PALETTE.litAmber);
    drawHudBox(1128, 14, 136, 'TIME', formatTime(state.timeLeft), state.timeLeft < 30 ? PALETTE.litRed : PALETTE.text);
    drawHudBox(964, 14, 152, 'SCORE', state.score.toLocaleString('en-US'));

    // Next-ring pointer: which way to turn, and how far.
    const ring = state.rings.find((item) => !item.passed) ?? null;
    if (ring !== null) {
      const dx = ring.x - plane.x;
      const arrow = dx > 6 ? '▶' : dx < -6 ? '◀' : '▲';
      const dist = Math.max(0, Math.round((ring.z - plane.z) * 3));
      context.fillStyle = 'rgba(10, 16, 28, 0.62)';
      roundRect(520, 14, 240, 62, 8);
      context.fill();
      text('NEXT RING', 640, 34, 13, PALETTE.muted, 'center', '700');
      text(`${arrow} ${dist} m`, 640, 62, 26, PALETTE.ring, 'center', '700');
    } else {
      context.fillStyle = 'rgba(10, 16, 28, 0.62)';
      roundRect(520, 14, 240, 62, 8);
      context.fill();
      text('RUNWAY AHEAD', 640, 34, 13, PALETTE.muted, 'center', '700');
      text('▼ LAND SLOW', 640, 62, 26, PALETTE.litGreen, 'center', '700');
    }

    // A banner message, when the world has something to say.
    if (state.messageTimer > 0 && state.message !== '') {
      const alpha = clamp(state.messageTimer, 0, 1);
      context.fillStyle = `rgba(10, 16, 28, ${0.62 * alpha})`;
      roundRect(440, 92, 400, 40, 8);
      context.fill();
      text(state.message, 640, 119, 22, PALETTE.ring, 'center', '700');
    }

    // Low-fuel warning, blinking.
    if (plane.fuel < 25 && Math.floor(state.elapsed * 2) % 2 === 0) {
      text('LOW FUEL — FLY A RING', 640, 560, 20, PALETTE.litRed, 'center', '700');
    }
  }

  // --- Panels -----------------------------------------------------------------------------------

  function drawPanel(title, subtitle, lines, prompt, accent) {
    const width = 720;
    const height = 178 + lines.length * 32 + 64;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10, 16, 28, 0.82)';
    roundRect(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = accent ?? PALETTE.panelEdge;
    context.lineWidth = 2;
    context.stroke();
    text(title, FIELD.width / 2, y + 72, 52, PALETTE.text, 'center', '800');
    if (subtitle !== '') text(subtitle, FIELD.width / 2, y + 106, 24, PALETTE.ring, 'center', '800');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 152 + index * 32, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 23, PALETTE.ring, 'center', '700');
  }

  const TITLE_LINES = [
    'Fly Kestrel the courier plane down the valley.',
    'Thread every glowing ring: +100 points, +10 fuel.',
    'Mind the mountains — the ground and walls bite.',
    'Land slow on the Homestead runway to finish.',
    '← → steer · ↑ climb · ↓ descend · Shift / Ctrl throttle',
    'P pause · M mute · R restart',
    '',
  ];
  const PAUSED_LINES = ['The valley will wait for you.'];
  const OVER_LINES = ['', '', '', ''];

  /** Paint one frame: sky, terrain, plane, instruments, HUD, then the screen's panel. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSky(state);
    drawTerrain(state);
    drawPlane(state);
    drawInstruments(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[6] = `Best score ${best.toLocaleString('en-US')}`;
      drawPanel('SKY COURIER', 'RING RUN', TITLE_LINES, 'PRESS SPACE OR CLICK TO FLY', PALETTE.ring);
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', '', PAUSED_LINES, 'PRESS P TO RESUME');
    } else if (screen === SCREEN_OVER) {
      const landed = state.landed;
      const title = landed ? 'MISSION COMPLETE' : state.finishedReason === 'time' ? 'OUT OF TIME' : state.finishedReason === 'overshot' ? 'OVERSHOT!' : 'GAME OVER';
      OVER_LINES[0] = `Score ${state.score.toLocaleString('en-US')}   ·   Best ${best.toLocaleString('en-US')}`;
      OVER_LINES[1] = `Rings ${state.ringsHit} of ${state.rings.length}   ·   Best combo x${state.bestCombo}`;
      OVER_LINES[2] = landed ? `Landing bonus included — fuel ${Math.round(state.plane.fuel)} left` : `Fuel ${Math.round(state.plane.fuel)} · Time ${formatTime(Math.max(0, state.timeLeft))} left`;
      OVER_LINES[3] = landed ? 'Kestrel is home. The valley run is done.' : 'Kestrel is down. The valley keeps the rings.';
      drawPanel(title, '', OVER_LINES, 'PRESS SPACE OR CLICK TO FLY AGAIN', landed ? PALETTE.litGreen : PALETTE.litRed);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
