/* Vlexyna — main.js — app state & bootstrap */
'use strict';
(() => {
  const app = VX.app = {
    playing: false, time: 0, loop: true, muted: false, micOn: false, exporting: false,
    previewQuality: 720, zoom: 1,
    duration() {
      const eng = VX.audio.engine;
      return eng.duration || (VX.project.current && VX.project.current.duration) || 30;
    },
    play() {
      VX.audio.engine.resume();
      if (VX.audio.engine.buffer) { VX.audio.engine.setLoop(app.loop); VX.audio.engine.play(); app.playing = VX.audio.engine.playing; }
      else app.playing = true;
      VX.ui.updateTransport();
    },
    pause() {
      VX.audio.engine.pause();
      app.playing = false;
      VX.ui.updateTransport();
    },
    togglePlay() { app.playing ? app.pause() : app.play(); },
    seekTo(t) {
      const dur = app.duration();
      app.time = U.clamp(t, 0, dur);
      if (VX.audio.engine.buffer) VX.audio.engine.seek(app.time);
      VX.ui && VX.ui.drawOverlay();
    },
    onFrame() { }
  };

  let booted = false;
  const boot = () => {
    if (booted) return;
    booted = true;
    /* visible error trap — helps diagnose issues instantly */
    window.addEventListener('error', (e) => {
      U.toast('⚠ ' + (e.message || 'Script error'), 'err');
      console.error(e.error || e.message);
    });

    VX.project.init();
    if (!VX.project.current.layers.length) {
      const blank = VX.templates.list.find(t => t.name === 'Blank');
      if (blank) VX.project.current.layers = blank.layers.map(l => {
        const m = VX.layers.make(l.type); Object.assign(m.props, l.props || {}); return m;
      });
    }

    VX.audio.engine.onstate = () => {
      if (VX.audio.engine.playing !== app.playing) { app.playing = VX.audio.engine.playing; VX.ui.updateTransport(); }
      VX.ui.updateTransport();
    };
    VX.audio.engine.onended = () => { app.pause(); };

    VX.ui.init();
    VX.renderer.start(document.getElementById('preview'));
    VX.ui.refreshAll();
    VX.ui.updateUndo();

    /* resume audio ctx on first gesture */
    const kick = () => { VX.audio.engine.resume(); document.removeEventListener('pointerdown', kick); };
    document.addEventListener('pointerdown', kick);

    window.addEventListener('resize', U.debounce(() => VX.ui.refreshTimeline(), 250));

    const welcomed = localStorage.getItem('vlexyna_welcomed');
    if (!welcomed) {
      localStorage.setItem('vlexyna_welcomed', '1');
      setTimeout(() => VX.ui.openWelcome(), 350);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
