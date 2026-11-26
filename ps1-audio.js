/**
 * PS1 BIOS / Menu Tactile Web Audio Synthesizer (Zero external assets)
 */
(function (global) {
  'use strict';

  let ctx = null;
  let enabled = true;

  function ensureCtx() {
    if (!enabled) return null;
    if (!ctx) {
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function playTone(freq, duration, type, volume, delay, slideTo) {
    const ac = ensureCtx();
    if (!ac) return;
    const now = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume || 0.06, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  global.PS1Audio = {
    isEnabled: () => enabled,
    setEnabled: (val) => {
      enabled = Boolean(val);
      if (enabled) {
        playTone(660, 0.07, 'sine', 0.05, 0);
        playTone(880, 0.09, 'sine', 0.05, 0.05);
      }
    },
    tick: () => {
      playTone(520, 0.035, 'triangle', 0.035, 0, 620);
    },
    select: () => {
      playTone(587.33, 0.055, 'triangle', 0.05, 0);
      playTone(880, 0.09, 'sine', 0.045, 0.045);
    },
    confirm: () => {
      playTone(523.25, 0.06, 'sine', 0.05, 0);
      playTone(659.25, 0.06, 'sine', 0.05, 0.055);
      playTone(1046.5, 0.14, 'triangle', 0.055, 0.11);
    },
    load: () => {
      playTone(440, 0.06, 'sine', 0.045, 0);
      playTone(659.25, 0.06, 'sine', 0.045, 0.05);
      playTone(783.99, 0.12, 'triangle', 0.05, 0.10);
    },
  };
})(window);
