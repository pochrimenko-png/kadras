// Звук большого экрана: фоновые петли и перебивки (написаны кодом — garsas/gen.py) и короткие сигналы.
// Браузер не даёт звук без щелчка: один раз щёлкнуть по экрану. M — выключить/включить, ↑ ↓ — громкость.
(function () {
  var K = window.K;
  if (!K || K.role !== 'screen') return;
  var AC = window.AudioContext || window.webkitAudioContext;
  var EMB = false; try { EMB = window.top !== window; } catch (e) { EMB = true; } // страница открыта окном внутри презентации
  var G = K.snd = { on: false, mute: false, emb: EMB, vol: parseFloat(K.store.get('kadras_vol')) || 0.7, hold: 0 };
  var ctx = null, master = null, buf = {}, cur = { name: '', src: null, g: null }, want = { name: '', lvl: 1 };
  var LOOPS = { a: 32 * 60 / 92, b: 32 * 60 / 108, c: 32 * 60 / 116 }, PRE = 0.5, BED = 0.5;

  function ok() { return ctx && ctx.state === 'running' && !G.mute; }
  function load(name) {
    if (buf[name]) return buf[name];
    return buf[name] = fetch('garsas/' + name + '.mp3').then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(function (ab) { return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); })
      .catch(function () { buf[name] = null; return null; });
  }
  function setMaster() { if (master) master.gain.setTargetAtTime(G.mute ? 0 : G.vol, ctx.currentTime, 0.05); }
  function unlock() {
    if (!AC) return;
    if (!ctx) {
      ctx = new AC(); master = ctx.createGain(); master.gain.value = G.vol; master.connect(ctx.destination);
      ['a', 'b', 'c', 'fanfara', 'atskleidimas'].forEach(load);
    }
    if (ctx.state === 'suspended') ctx.resume();
    G.on = true; draw(); apply();
  }

  // фон: name = 'a' | 'b' | 'c' | '' (тишина), lvl — доля обычной громкости
  G.bed = function (name, lvl) {
    name = name || ''; lvl = lvl == null ? 1 : lvl;
    if (want.name === name && want.lvl === lvl) return;
    want = { name: name, lvl: lvl }; apply();
  };
  function apply() {
    if (!ctx) return;
    var t = Math.max(ctx.currentTime, G.hold);
    if (cur.name === want.name) { if (cur.g) cur.g.gain.setTargetAtTime(BED * want.lvl, t, 0.4); return; }
    var old = cur;
    if (old.g) { old.g.gain.cancelScheduledValues(ctx.currentTime); old.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(function () { try { old.src.stop(); } catch (e) {} }, 2500); }
    var me = cur = { name: want.name, src: null, g: null };
    if (!want.name) return;
    load(want.name).then(function (b) {
      if (!b || cur !== me) return;
      var s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = b; s.loop = true; s.loopStart = PRE; s.loopEnd = PRE + LOOPS[me.name];
      g.gain.value = 0; g.gain.setTargetAtTime(BED * want.lvl, Math.max(ctx.currentTime, G.hold) + 0.05, 0.6);
      s.connect(g); g.connect(master); s.start(0, PRE);
      me.src = s; me.g = g;
    });
  }
  // перебивка: фон на время уходит и возвращается после неё
  G.sting = function (name) {
    if (!ok()) return;
    G.hold = ctx.currentTime + 1.7;
    if (cur.g) { cur.g.gain.cancelScheduledValues(ctx.currentTime); cur.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); cur.g.gain.setTargetAtTime(BED * want.lvl, G.hold, 0.6); }
    load(name).then(function (b) {
      if (!b) return;
      var s = ctx.createBufferSource(); s.buffer = b; s.connect(master); s.start();
    });
  };

  function tone(f, dur, type, vol, at) {
    var t = ctx.currentTime + (at || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  var PENT = [0, 2, 4, 7, 9];
  // новый кадр на стене: каждая следующая нота — выше по гамме
  G.pop = function (i) {
    if (!ok()) return;
    var f = 440 * Math.pow(2, (72 + PENT[i % 5] + 12 * (Math.floor(i / 5) % 2) - 69) / 12);
    tone(f, 0.4, 'triangle', 0.3); tone(f * 2, 0.2, 'sine', 0.1);
  };
  G.blip = function () { if (ok()) tone(1568, 0.1, 'sine', 0.1); };
  G.beep = function (last) { if (ok()) { tone(last ? 988 : 660, last ? 0.3 : 0.16, 'triangle', 0.4); } };
  G.shutter = function () {
    if (!ok()) return;
    var n = Math.floor(ctx.sampleRate * 0.09), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), i;
    for (i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n / 5)) * (i < n / 3 || i > n / 2 ? 1 : 0.15);
    var s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; g.gain.value = 0.5; s.connect(g); g.connect(master); s.start();
  };

  // кнопка в углу экрана
  var b = document.createElement('button'); b.id = 'snd';
  function draw() {
    b.className = 'snd' + (G.on || EMB ? ' on' : '');
    b.textContent = !AC ? '' : !G.on ? (EMB ? '🔇' : '🔇 Spustelėkite ekraną — įsijungs garsas') : G.mute ? '🔇' : '🔊';
  }
  draw();
  document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(b); });
  if (document.body) document.body.appendChild(b);
  document.addEventListener('click', function (ev) {
    if (!G.on) { if (!EMB || ev.target === b) unlock(); return; }
    if (ctx.state === 'suspended') ctx.resume();
    if (ev.target === b) { G.mute = !G.mute; setMaster(); draw(); }
  });
  document.addEventListener('keydown', function (ev) {
    if (!G.on) { if (!EMB && (ev.key.length === 1 || ev.key === 'Enter')) unlock(); return; }
    if (ev.key === 'm' || ev.key === 'M' || ev.key === 'ь' || ev.key === 'Ь') { G.mute = !G.mute; setMaster(); draw(); }
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      G.vol = Math.max(0.1, Math.min(1, G.vol + (ev.key === 'ArrowUp' ? 0.1 : -0.1)));
      K.store.set('kadras_vol', String(G.vol)); setMaster();
    }
  });
})();
