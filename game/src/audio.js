// Solmar City v2 — all sound is synthesised with WebAudio: no audio files, no
// network, no downloads. Two buses feed one master: the effects bus (engine
// hum, siren, gunshots, pickups, crashes, the UI) and the music bus, which the
// radio in music.js schedules into. A horn (H) and a side-job jingle join the
// old effects, and the radio's track follows the game: cruise on the title
// screen, drive while working or driving, chase at three stars and up.

import { createRadio } from './music.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenPhase = 0;
  let muted = false;
  let radio = null;

  /** Build the context and the buses on the first user gesture. */
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.55;
      musicBus.connect(master);
      // The engine: a sawtooth through a low-pass, pitched by speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(sfxBus);
      engineOsc.start();
      // The siren: a triangle that alternates two tones while wanted.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(sfxBus);
      sirenOsc.start();
      radio = createRadio(() => ({ ctx, destination: musicBus }));
      return true;
    } catch {
      return false;
    }
  }

  /** A short oscillator tone with a pitch glide and a quick fade. */
  function blip(freqA, freqB, duration, volume, type = 'sine') {
    if (!ensure()) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqB), now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(sfxBus);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** A burst of shaped noise: gunshots, punches, crashes, skids. */
  function noiseBurst(duration, volume, filterFreq) {
    if (!ensure()) return;
    const now = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    source.start(now);
  }

  /** Two notes, one after the other, for jingles. */
  function twoNote(freqA, freqB, gapMs, duration, volume) {
    blip(freqA, freqA, duration, volume);
    setTimeout(() => blip(freqB, freqB, duration, volume), gapMs);
  }

  return {
    /** Call from any user gesture so the browser unlocks audio. */
    unlock() {
      ensure();
    },

    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },

    isMuted() {
      return muted;
    },

    /** The name of the radio track playing right now, or null. */
    nowPlaying() {
      return radio ? radio.nowPlaying() : null;
    },

    /**
     * Per-frame: engine pitch from speed, siren wail while wanted, and the
     * radio's track from the mode the game picked (cruise / drive / chase /
     * off). The radio only starts scheduling after the first unlock.
     */
    update(drivingSpeed, wantedLevel, dt, musicMode = 'off') {
      if (!ctx) return;
      sirenPhase += dt;
      const targetEngine = drivingSpeed > 0 ? 0.05 + Math.min(0.09, drivingSpeed / 5000) : 0;
      engineGain.gain.setTargetAtTime(targetEngine, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + drivingSpeed * 0.35, ctx.currentTime, 0.08);
      if (wantedLevel > 0) {
        const tone = Math.sin(sirenPhase * 3.4) > 0 ? 720 : 960;
        sirenOsc.frequency.setTargetAtTime(tone, ctx.currentTime, 0.05);
        sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.2);
      } else {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      }
      if (radio) {
        radio.setMode(musicMode);
        radio.update();
      }
    },

    gunshot() {
      noiseBurst(0.16, 0.5, 1800);
      blip(160, 60, 0.1, 0.25, 'square');
    },

    punch() {
      noiseBurst(0.08, 0.25, 900);
    },

    pickup() {
      twoNote(660, 990, 70, 0.1, 0.22);
    },

    cash() {
      blip(880, 880, 0.08, 0.2);
      setTimeout(() => blip(1174, 1174, 0.1, 0.2), 60);
      setTimeout(() => blip(1568, 1568, 0.16, 0.2), 120);
    },

    crash() {
      noiseBurst(0.25, 0.4, 600);
    },

    /** Two-tone horn. Near the police it is also a crime — see main.js. */
    honk() {
      blip(370, 370, 0.18, 0.22, 'square');
      setTimeout(() => blip(466, 466, 0.22, 0.22, 'square'), 40);
    },

    ui() {
      blip(520, 700, 0.07, 0.16);
    },

    missionDone() {
      blip(523, 523, 0.12, 0.22);
      setTimeout(() => blip(659, 659, 0.12, 0.22), 110);
      setTimeout(() => blip(784, 784, 0.2, 0.22), 220);
    },

    /** A brighter four-note jingle for finishing a side job. */
    sideDone() {
      blip(784, 784, 0.1, 0.2);
      setTimeout(() => blip(988, 988, 0.1, 0.2), 90);
      setTimeout(() => blip(1175, 1175, 0.1, 0.2), 180);
      setTimeout(() => blip(1568, 1568, 0.22, 0.2), 270);
    },

    busted() {
      blip(320, 140, 0.5, 0.3, 'sawtooth');
    },
  };
}
