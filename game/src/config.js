// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.
// The world is a pseudo-3D corridor: the plane flies forward along +z, one segment is 20 world
// units, and the ground, river, town and mountains are drawn as projected strips.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** World geometry: one segment is this long, and this many segments are drawn ahead. */
export const SEGMENT_LENGTH = 20;
export const DRAW_DISTANCE = 90;
/** 1 / tan(fov / 2) for a ~100 degree field of view. */
export const CAMERA_DEPTH = 0.84;
/** The camera sits this far above the plane's own altitude. */
export const CAMERA_HEIGHT = 7;
/** Half the width of the valley the plane flies through, in world units. */
export const VALLEY_HALF = 58;
/** Half the width of the river / road ribbon that guides the eye down the valley. */
export const RIBBON_HALF = 17;

export const PLANE = {
  /** Top speed at full throttle, world units a second. */
  maxSpeed: 92,
  /** Speed at closed throttle. */
  minSpeed: 18,
  /** How fast speed chases the throttle's target. */
  accel: 22,
  /** Lateral speed at full stick, as a fraction of forward speed. */
  steerRate: 0.62,
  /** Bank angle, degrees, at full stick. */
  maxBank: 34,
  /** Climb rate at full pitch, as a fraction of forward speed. */
  climbRate: 0.34,
  /** Sink rate with the throttle closed, units a second. */
  sink: 5,
  /** Highest the plane may fly, world units above the datum. */
  ceiling: 120,
  invulnerable: 2.5,
};

export const LIVES = 3;
export const MISSION_TIME = 180;
/** Fuel starts here, drains with the throttle, and a ring adds this much. */
export const FUEL = { start: 100, drain: 0.5, ringBonus: 10 };
export const RING = { radius: 11, points: 100, every: 11, first: 11 };
export const SCORE = { missPenalty: 25, landBonus: 500, timeBonus: 5, fuelBonus: 3 };

/** Three legs, then the home runway. Segments are counted from the start of the course. */
export const LEGS = [
  { name: 'LEG 1 · GREEN VALLEY', until: 80 },
  { name: 'LEG 2 · RIVER CROSSING', until: 160 },
  { name: 'LEG 3 · MOUNTAIN PASS', until: 240 },
  { name: 'FINAL · HOMESTEAD RUNWAY', until: 252 },
];
export const COURSE_SEGMENTS = 252;

export const PALETTE = {
  backdrop: '#0b1020',
  skyTop: '#2f6fb4',
  skyMid: '#7db8e8',
  skyLow: '#cfe8f7',
  sunCore: '#fff3c4',
  sunGlow: '#ffd76a',
  mountainFar: '#7d9cc4',
  mountainNear: '#5d7a9e',
  snow: '#eef4fa',
  fieldA: '#5da244',
  fieldB: '#4c8f3c',
  forest: '#2f6b2e',
  river: '#3f8fd2',
  riverBank: '#c9b078',
  town: '#9a8f7a',
  townRoof: '#b0543c',
  runway: '#3c4148',
  runwayLine: '#f4f4e8',
  rock: '#6f6a63',
  cloud: '#ffffff',
  panel: '#171c26',
  panelEdge: '#2c3444',
  gaugeFace: '#10141d',
  gaugeRing: '#3a4356',
  litAmber: '#ffb02e',
  litGreen: '#4ade80',
  litRed: '#ff5a4e',
  litCyan: '#4fc3f7',
  text: '#eef1f5',
  muted: '#9aa5b5',
  planeBody: '#e8e4da',
  planeTrim: '#c23b2e',
  planeWing: '#d8d2c2',
  ring: '#ffd23e',
  ringGlow: '#ff9d00',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'sky-courier-ring-run.best';
