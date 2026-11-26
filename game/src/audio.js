// Sound, synthesised with WebAudio — no audio files. A low engine drone that follows the
// throttle, wind noise that grows with speed, a two-note chime for a ring, a thud for a crash
// and a click for buttons. Created lazily on the first user gesture; muted with M.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;

  function ensure() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
    } catch {
      return false;
    }
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);

    // Engine: two detuned saws through a low-pass, the classic prop-drone.
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = context.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55.7;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped white noise through a band-pass.
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 800;
    windFilter.Q.value = 0.6;
    windGain = context.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    noise.start();
    return true;
  }

  function blip(frequency, when, duration, type, volume) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime + when);
    gain.gain.linearRampToValueAtTime(volume, context.currentTime + when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + when + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(context.currentTime + when);
    osc.stop(context.currentTime + when + duration + 0.05);
  }

  return {
    /** Call from any user gesture: starts the audio graph. */
    unlock() {
      ensure();
    },
    /** Per-frame engine and wind levels from the plane's throttle and speed. */
    engine(throttle, speed01) {
      if (context === null) return;
      const now = context.currentTime;
      engineOsc.frequency.setTargetAtTime(48 + throttle * 70 + speed01 * 18, now, 0.1);
      engineOsc2.frequency.setTargetAtTime(48.7 + throttle * 70 + speed01 * 18, now, 0.1);
      engineGain.gain.setTargetAtTime(0.05 + throttle * 0.1 + speed01 * 0.03, now, 0.15);
      windGain.gain.setTargetAtTime(speed01 * speed01 * 0.12, now, 0.2);
    },
    ring() {
      if (!ensure()) return;
      blip(880, 0, 0.35, 'sine', 0.25);
      blip(1318.5, 0.09, 0.45, 'sine', 0.2);
    },
    miss() {
      if (!ensure()) return;
      blip(220, 0, 0.25, 'triangle', 0.15);
    },
    crash() {
      if (!ensure()) return;
      blip(70, 0, 0.5, 'sine', 0.4);
      blip(45, 0.05, 0.7, 'sawtooth', 0.25);
    },
    land() {
      if (!ensure()) return;
      blip(523.25, 0, 0.3, 'sine', 0.2);
      blip(659.25, 0.1, 0.3, 'sine', 0.2);
      blip(783.99, 0.2, 0.5, 'sine', 0.22);
    },
    click() {
      if (!ensure()) return;
      blip(660, 0, 0.08, 'square', 0.08);
    },
    toggleMute() {
      muted = !muted;
      if (master !== null) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
