// Solmar City v2 — the radio. Three original synth tracks, written as note
// tables and played by a lookahead scheduler on the shared WebAudio context.
// Nothing is sampled, nothing is downloaded: every sound is an oscillator or a
// burst of filtered noise, and the melodies below are the game's own.
//   cruise — "Sunset Cruise", 96 BPM: a lazy pad-and-bass loop for the title
//            screen and for free-roaming the beachfront.
//   drive  — "Palm Row Drive", 116 BPM: a groovier bass riff with hats and
//            lead stabs, for missions and for driving around town.
//   chase  — "Heat Chase", 138 BPM: a tense minor 8th-note bass line with
//            off-beat stabs, for wanted level 3 and up.
// The player (audio.js) owns the context and the music gain bus; this module
// only schedules notes into them, and it never touches the network.

/** MIDI note number to frequency in Hz. */
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** One bar of a track: [beat, midi, lengthInBeats, velocity]. */
const TRACKS = {
  cruise: {
    bpm: 96,
    // Am7 — F — C — G, one bar each, bass roots on the beat, lead answers.
    bass: [
      [0, 45, 2, 0.9], [2, 52, 2, 0.7], [4, 41, 2, 0.9], [6, 48, 2, 0.7],
      [8, 45, 2, 0.9], [10, 52, 2, 0.7], [12, 43, 2, 0.9], [14, 50, 2, 0.7],
    ],
    lead: [
      [0, 69, 1.5, 0.5], [2.5, 72, 1, 0.45], [4, 76, 2, 0.5], [7, 74, 1, 0.4],
      [8, 72, 1.5, 0.5], [10.5, 69, 1, 0.45], [12, 67, 2, 0.5], [15, 64, 1, 0.4],
    ],
    pad: [
      [0, 57, 4, 0.16], [0, 60, 4, 0.16], [0, 64, 4, 0.16],
      [4, 53, 4, 0.16], [4, 57, 4, 0.16], [4, 60, 4, 0.16],
      [8, 48, 4, 0.16], [8, 52, 4, 0.16], [8, 55, 4, 0.16],
      [12, 55, 4, 0.16], [12, 59, 4, 0.16], [12, 62, 4, 0.16],
    ],
    hats: false,
    kick: false,
  },
  drive: {
    bpm: 116,
    // A two-bar bass riff around A minor with a syncopated kick, hats on 8ths.
    bass: [
      [0, 45, 0.9, 0.95], [1, 45, 0.9, 0.7], [2, 48, 0.9, 0.9], [3, 45, 0.9, 0.7],
      [4, 52, 0.9, 0.9], [5, 50, 0.9, 0.7], [6, 48, 0.9, 0.9], [7, 43, 0.9, 0.8],
    ],
    lead: [
      [0, 69, 0.5, 0.5], [2, 72, 0.5, 0.5], [4, 76, 0.5, 0.55], [6, 74, 0.5, 0.5],
    ],
    pad: [],
    hats: true,
    kick: true,
  },
  chase: {
    bpm: 138,
    // Driving 8th-note bass in A minor, stabs on the off-beats, no rest.
    bass: [
      [0, 45, 0.45, 0.95], [0.5, 45, 0.45, 0.7], [1, 48, 0.45, 0.95], [1.5, 45, 0.45, 0.7],
      [2, 45, 0.45, 0.95], [2.5, 45, 0.45, 0.7], [3, 50, 0.45, 0.95], [3.5, 52, 0.45, 0.8],
      [4, 45, 0.45, 0.95], [4.5, 45, 0.45, 0.7], [5, 48, 0.45, 0.95], [5.5, 45, 0.45, 0.7],
      [6, 43, 0.45, 0.95], [6.5, 43, 0.45, 0.7], [7, 50, 0.45, 0.95], [7.5, 52, 0.45, 0.8],
    ],
    lead: [
      [1, 69, 0.5, 0.5], [3, 72, 0.5, 0.5], [5, 71, 0.5, 0.5], [7, 74, 0.5, 0.55],
    ],
    pad: [],
    hats: true,
    kick: true,
  },
};

const LOOP_BEATS = 16;

/**
 * @param {() => { ctx: AudioContext|null, destination: GainNode|null }} getAudio
 *   A function returning the shared context and the music gain bus (or nulls
 *   before the player has unlocked audio). The radio schedules into them.
 */
export function createRadio(getAudio) {
  let mode = 'off';
  let nextBarTime = 0;
  let barStart = 0;
  let noiseBuffer = null;

  /** A shared noise buffer, built once, for hats and snares. */
  function noise(ctx) {
    if (noiseBuffer) return noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.1);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  function note(ctx, destination, freq, when, duration, volume, type, filterFreq) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    let head = osc;
    if (filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      osc.connect(filter);
      head = filter;
    }
    head.connect(gain);
    gain.connect(destination);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  function drum(ctx, destination, when, kind) {
    if (kind === 'kick') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, when);
      osc.frequency.exponentialRampToValueAtTime(42, when + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(when);
      osc.stop(when + 0.2);
      return;
    }
    // hat: a short burst of high-passed noise.
    const source = ctx.createBufferSource();
    source.buffer = noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(when, Math.random() * 0.05, 0.06);
  }

  /** Schedule one bar of the current track starting at `when`. */
  function scheduleBar(ctx, destination, track, when) {
    const beat = 60 / track.bpm;
    for (const [b, midi, len, vel] of track.bass) {
      note(ctx, destination, midiToFreq(midi), when + b * beat, len * beat, vel * 0.32, 'triangle', 900);
    }
    for (const [b, midi, len, vel] of track.lead) {
      note(ctx, destination, midiToFreq(midi), when + b * beat, len * beat, vel * 0.16, 'square', 1600);
    }
    for (const [b, midi, len, vel] of track.pad) {
      note(ctx, destination, midiToFreq(midi), when + b * beat, len * beat, vel, 'sine');
    }
    if (track.kick) {
      for (let b = 0; b < LOOP_BEATS; b += 1) drum(ctx, destination, when + b * beat, 'kick');
    }
    if (track.hats) {
      for (let b = 0; b < LOOP_BEATS; b += 0.5) drum(ctx, destination, when + b * beat, 'hat');
    }
  }

  return {
    /** Switch track. 'off' stops scheduling; a new track starts on the next bar. */
    setMode(next) {
      if (next === mode) return;
      mode = next;
      nextBarTime = 0;
    },

    mode() {
      return mode;
    },

    /** The name of the track that is playing, or null when the radio is off. */
    nowPlaying() {
      if (mode === 'off') return null;
      return { cruise: 'Sunset Cruise', drive: 'Palm Row Drive', chase: 'Heat Chase' }[mode] || null;
    },

    /** Call every frame: schedules bars a little ahead of the playhead. */
    update() {
      const { ctx, destination } = getAudio();
      if (!ctx || !destination || mode === 'off') return;
      const track = TRACKS[mode];
      if (!track) return;
      const beat = 60 / track.bpm;
      const barLength = LOOP_BEATS * beat;
      if (nextBarTime === 0) {
        nextBarTime = ctx.currentTime + 0.06;
        barStart = nextBarTime;
      }
      while (nextBarTime < ctx.currentTime + 0.25) {
        scheduleBar(ctx, destination, track, nextBarTime);
        nextBarTime += barLength;
      }
      barStart = nextBarTime - barLength;
    },
  };
}
