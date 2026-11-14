// Общая часть: роль по адресу, устройство, запросы к базе, демо-режим, мелкие помощники.
(function () {
  var C = window.KADRAS, q = new URLSearchParams(location.search);
  var K = window.K = { q: q };
  K.event = (q.get('e') || 'kufa').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'kufa';
  K.role = q.has('pultas') ? 'host' : q.has('ekranas') ? 'screen' : 'guest';
  K.demo = q.has('demo') || !C.key;

  K.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };
  var mem = {};
  K.store = {
    get: function (k) { try { var v = localStorage.getItem(k); return v === null ? (k in mem ? mem[k] : null) : v; } catch (e) { return k in mem ? mem[k] : null; } },
    set: function (k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) {} }
  };
  // ?d=2 — «второй телефон» в том же браузере (нужно только для проверки на одном компьютере).
  var sfx = K.demo && q.get('d') ? '_' + q.get('d').replace(/\W/g, '') : '';
  K.sfx = sfx;
  K.device = K.store.get('kadras_device' + sfx);
  if (!K.device) { K.device = K.uuid(); K.store.set('kadras_device' + sfx, K.device); }

  // Маленький конструктор элементов: h('div', {class:'x', onclick:fn}, 'текст', узел…)
  K.h = function (tag, attrs) {
    var el = document.createElement(tag), i, k;
    for (k in (attrs || {})) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'value') el.value = v;
      else if (k === 'muted') { el.muted = true; el.defaultMuted = true; el.setAttribute('muted', ''); }
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
    return el;
  };
  K.mount = function (node) {
    var app = document.getElementById('app');
    app.textContent = '';
    if (K.demo) app.appendChild(K.h('div', { class: 'badge' }, 'DEMO'));
    app.appendChild(node);
  };
  K.thumb = function (path) { return String(path).replace(/\.(jpg|mp4|mov|webm)$/, '_s.jpg'); };
  K.isVideoTask = function (ev) { return ev && /^VIDEO/i.test(ev.task || ''); };
  // упражнение «Свет»: ŠVIESA 1 / ŠVIESA 2 в одном раунде; кадры шага 2 помечены в имени файла (начало «dddd2222»): база отдаёт путь во всех этапах
  // то же для «Плана»: PLANAS 1 — общий план, PLANAS 2 — крупный (слайд «Užduotis: du kadrai»)
  K.isLight = function (ev) { return ev && /^((Š|S)VIESA|PLANAS|ATSTUMAS)\s*[12]/i.test(ev.task || ''); };
  K.isLight2 = function (ev) { return ev && /^((Š|S)VIESA|PLANAS|ATSTUMAS)\s*2/i.test(ev.task || ''); };
  K.isPlan = function (ev) { return ev && /^PLANAS/i.test(ev.task || ''); };
  // эксперимент «Atstumas» (слайд «Eksperimentas»): доброволец на сцене, кадр 1, потом крупнее — зумом или ногами
  K.isDist = function (ev) { return ev && /^ATSTUMAS/i.test(ev.task || ''); };
  K.LMARK = 'dddd2222';
  K.isL2Photo = function (p) { return String(p.path || '').split('/').pop().slice(0, 8) === K.LMARK; };
  K.isVideo = function (path) { return /\.(mp4|mov|webm)$/i.test(String(path)); };
  K.guestUrl = function () {
    var p = [];
    if (K.event !== 'kufa') p.push('e=' + K.event);
    if (q.has('demo')) p.push('demo');
    return location.origin + location.pathname + (p.length ? '?' + p.join('&') : '');
  };
  // Опрос состояния: раз в ms, на паузе, пока вкладка скрыта.
  K.poll = function (fn, ms) {
    var busy = false;
    function tick() {
      if (busy || document.hidden) return;
      busy = true;
      Promise.resolve().then(fn).catch(function () {}).then(function () { busy = false; });
    }
    tick();
    setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('storage', tick);
    return tick;
  };
  // Уменьшение фото в браузере: длинная сторона до max, JPEG.
  K.shrink = function (file, max, quality) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('blob')); }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('image')); };
      img.src = url;
    });
  };

  // ---------- настоящая база ----------
  function head(extra) {
    var o = { apikey: C.key, Authorization: 'Bearer ' + C.key };
    for (var k in (extra || {})) o[k] = extra[k];
    return o;
  }
  function rpc(fn, body) {
    return fetch(C.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: head({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }
  var real = {
    state: function (dev) { return rpc('kadras_state', { p_event: K.event, p_device: dev || '' }); },
    addPhoto: function (author, phone, path) { return rpc('kadras_add_photo', { p_event: K.event, p_device: K.device, p_author: author, p_phone: phone, p_path: path }); },
    vote: function (id) { return rpc('kadras_vote', { p_event: K.event, p_device: K.device, p_photo: id }); },
    host: function (pin, action, arg) { return rpc('kadras_host', { p_event: K.event, p_pin: pin, p_action: action, p_arg: arg || {} }); },
    upload: function (path, blob) {
      return fetch(C.url + '/storage/v1/object/' + C.bucket + '/' + path, { method: 'POST', headers: head({ 'Content-Type': 'image/jpeg' }), body: blob })
        .then(function (r) { if (!r.ok) throw new Error('upload ' + r.status); });
    },
    url: function (path) { return C.url + '/storage/v1/object/public/' + C.bucket + '/' + path; },
    remove: function (paths) {
      var jobs = [];
      for (var i = 0; i < paths.length; i += 100) {
        jobs.push(fetch(C.url + '/storage/v1/object/' + C.bucket, { method: 'DELETE', headers: head({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }) })
          .then(function (r) { if (!r.ok) throw new Error('delete ' + r.status); }));
      }
      return Promise.all(jobs);
    }
  };

  // ---------- демо: та же логика, данные в этом браузере ----------
  var DK = 'kadras_demo_' + K.event;
  function load() {
    var d = null;
    try { d = JSON.parse(K.store.get(DK)); } catch (e) {}
    return d || { event: { id: K.event, title: 'Demo', phase: 'collect', round: 1, task: 'Bandomasis kadras: nufotografuokite bet ką šalia savęs' }, pin: null, photos: [], votes: [], files: {} };
  }
  function save(d) { K.store.set(DK, JSON.stringify(d)); }
  function count(d, id) { return d.votes.filter(function (v) { return v.photo === id; }).length; }
  var demo = {
    state: function (dev) {
      var d = load(), e = d.event, names = e.phase === 'reveal', votes = e.phase === 'results' || names, mine = null, my = null;
      var photos = d.photos.filter(function (p) { return p.round === e.round && !p.hidden; }).sort(function (a, b) { return a.num - b.num; }).map(function (p) {
        return { id: p.id, num: p.num, path: p.path, mine: p.device === dev, author: names ? p.author : null, phone: names ? p.phone : null, votes: votes ? count(d, p.id) : null };
      });
      d.photos.forEach(function (p) { if (p.round === e.round && p.device === dev) mine = { id: p.id, num: p.num, path: p.path }; });
      var mv = [];
      d.votes.forEach(function (v) { if (v.round === e.round && v.device === dev) { my = v.photo; mv.push(v.photo); } });
      return Promise.resolve({ event: e, photos: photos, my_photo: mine, my_vote: my, my_votes: mv, voters: d.votes.filter(function (v) { return v.round === e.round; }).length });
    },
    addPhoto: function (author, phone, path) {
      var d = load(), e = d.event;
      author = String(author || '').trim().slice(0, 40);
      if (!author) return Promise.resolve({ error: 'no_name' });
      if (e.phase !== 'collect') return Promise.resolve({ error: 'closed' });
      var cur = d.photos.filter(function (p) { return p.round === e.round && p.device === K.device; })[0];
      if (cur) { delete d.files[K.thumb(cur.path)]; cur.path = path; cur.author = author; cur.phone = phone; }
      else {
        var n = d.photos.filter(function (p) { return p.round === e.round; }).reduce(function (m, p) { return Math.max(m, p.num); }, 0) + 1;
        cur = { id: K.uuid(), num: n, round: e.round, device: K.device, author: author, phone: String(phone || '').slice(0, 40), path: path, hidden: false };
        d.photos.push(cur);
      }
      save(d);
      return Promise.resolve({ ok: true, id: cur.id, num: cur.num });
    },
    vote: function (id) {
      var d = load(), e = d.event;
      if (e.phase !== 'vote') return Promise.resolve({ error: 'closed' });
      var ph = d.photos.filter(function (p) { return p.id === id && p.round === e.round && !p.hidden; })[0];
      if (!ph) return Promise.resolve({ error: 'no_photo' });
      if (ph.device === K.device) return Promise.resolve({ error: 'own' });
      var had = d.votes.some(function (v) { return v.round === e.round && v.device === K.device && v.photo === id; });
      if (had) d.votes = d.votes.filter(function (v) { return !(v.round === e.round && v.device === K.device && v.photo === id); });
      else {
        if (d.votes.filter(function (v) { return v.round === e.round && v.device === K.device; }).length >= 3) return Promise.resolve({ error: 'limit' });
        d.votes.push({ round: e.round, device: K.device, photo: id });
      }
      save(d);
      return Promise.resolve({ ok: true, num: ph.num, on: !had });
    },
    host: function (pin, action, arg) {
      var d = load(), e = d.event; arg = arg || {};
      if (!pin || pin.length < 4) return Promise.resolve({ error: 'bad_pin', need_pin: !d.pin });
      if (!d.pin) { if (action !== 'set_pin') return Promise.resolve({ error: 'no_pin_yet', need_pin: true }); d.pin = pin; }
      else if (d.pin !== pin) return Promise.resolve({ error: 'wrong_pin' });
      if (action === 'phase') e.phase = arg.phase;
      else if (action === 'round') { e.round += 1; e.phase = 'collect'; e.task = String(arg.task || '').slice(0, 200); }
      else if (action === 'goto') { e.round = Math.max(1, Math.min(50, parseInt(arg.round, 10) || 1)); e.phase = 'wait'; }
      else if (action === 'task') e.task = String(arg.task || '').slice(0, 200);
      else if (action === 'title') e.title = String(arg.title || '').slice(0, 120);
      else if (action === 'hide') d.photos.forEach(function (p) { if (p.id === arg.id) p.hidden = arg.hidden !== false; });
      else if (action === 'purge_begin') e.phase = 'purge';
      else if (action === 'purge_end') { d.photos = []; d.votes = []; d.files = {}; e.phase = 'wait'; e.round = 1; e.task = ''; }
      save(d);
      return Promise.resolve({
        ok: true, event: e, total: d.photos.length,
        voters: d.votes.filter(function (v) { return v.round === e.round; }).length,
        paths: e.phase === 'purge' ? Object.keys(d.files) : null,
        photos: d.photos.filter(function (p) { return p.round === e.round; }).sort(function (a, b) { return a.num - b.num; }).map(function (p) {
          return { id: p.id, num: p.num, path: p.path, author: p.author, phone: p.phone, hidden: p.hidden, votes: count(d, p.id) };
        })
      });
    },
    upload: function (path, blob) {
      if (!/_s\.jpg$/.test(path)) return Promise.resolve(); // в демо храним только маленькую копию
      return new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { var d = load(); d.files[path] = r.result; save(d); res(); };
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
    },
    url: function (path) { return load().files[K.thumb(path.replace(/_s\.jpg$/, '.jpg'))] || ''; },
    remove: function () { return Promise.resolve(); }
  };

  // ---------- опрос на входе ----------
  K.POLL = { q: 'Kam jums naujas telefonas?', sub: 'Galite pasirinkti kelis atsakymus',
    opts: ['😩 Senas / lėtas', '🔋 Baterija nebeišlaiko', '📷 Prasta kamera', '🎬 Noriu gražiau filmuoti', '💾 Nebėra vietos nuotraukoms',
      '📱 Noriu vesti tinklaraštį', '👀 Visi turi – ir man reikia', '✨ Noriu naujo dizaino', '☕ Man nereikia, atėjau dėl kavos', '✍️ Savo variantas'] };
  real.pollState = function (dev) { return rpc('kadras_poll_state', { p_event: K.event, p_device: dev || '' }); };
  real.pollAnswer = function (ch, other) { return rpc('kadras_poll_answer', { p_event: K.event, p_device: K.device, p_choices: ch, p_other: other || '' }); };
  real.pollHost = function (pin, action) { return rpc('kadras_poll_host', { p_event: K.event, p_pin: pin, p_action: action }); };
  function pstate(d, dev) {
    var P = d.poll || (d.poll = { open: true, ans: {} }), counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], other = 0, n = 0, k;
    for (k in P.ans) { n++; P.ans[k].choices.forEach(function (c) { counts[c - 1]++; }); if (P.ans[k].other) other++; }
    return { open: P.open, total: n, counts: counts, other_n: other, mine: P.ans[dev] || null };
  }
  demo.pollState = function (dev) { return Promise.resolve(pstate(load(), dev)); };
  demo.pollAnswer = function (ch, other) {
    var d = load(), P = d.poll || (d.poll = { open: true, ans: {} });
    if (!P.open) return Promise.resolve({ error: 'closed' });
    ch = ch.filter(function (c, i) { return c >= 1 && c <= 10 && ch.indexOf(c) === i; });
    if (!ch.length || ch.length > 3) return Promise.resolve({ error: 'bad_choices' });
    other = ch.indexOf(10) >= 0 ? String(other || '').trim().slice(0, 80) : '';
    if (ch.indexOf(10) >= 0 && !other) return Promise.resolve({ error: 'no_other' });
    P.ans[K.device] = { choices: ch, other: other }; save(d);
    return Promise.resolve({ ok: true });
  };
  demo.pollHost = function (pin, action) {
    var d = load(), P = d.poll || (d.poll = { open: true, ans: {} });
    if (d.pin && d.pin !== pin) return Promise.resolve({ error: 'wrong_pin' });
    if (action === 'open') P.open = true; else if (action === 'close') P.open = false; else if (action === 'clear') P.ans = {};
    save(d);
    var r = pstate(d, ''), k; r.ok = true; r.texts = [];
    for (k in P.ans) if (P.ans[k].other) r.texts.push(P.ans[k].other);
    return Promise.resolve(r);
  };

  // ---------- фотодуэль: общий отсчёт ----------
  real.duelState = function () { return rpc('kadras_duel_state', { p_event: K.event }); };
  real.duelStart = function (pin, sec) { return rpc('kadras_duel_start', { p_event: K.event, p_pin: pin, p_seconds: sec || 6 }); };
  demo.duelState = function () { var d = load(); return Promise.resolve({ duel_at: d.duel_at || null, now: new Date().toISOString() }); };
  demo.duelStart = function () { var d = load(); d.duel_at = new Date(Date.now() + 6000).toISOString(); save(d); return Promise.resolve({ ok: true, duel_at: d.duel_at, now: new Date().toISOString() }); };
  K.isDuel = function (ev) { return ev && ev.phase === 'collect' && /^DVIKOVA/i.test(ev.task || ''); };
  // Отсчёт: сколько мс до старта по часам сервера (поправка на разницу часов телефона и сервера).
  K.duelLeft = function (ds) {
    if (!ds || !ds.duel_at) return null;
    var off = new Date(ds.now).getTime() - ds._got;
    return new Date(ds.duel_at).getTime() - (Date.now() + off);
  };
  K.duelFetch = function () { return K.api.duelState().then(function (r) { r._got = Date.now(); return r; }); };

  // ---------- видео от зала ----------
  real.addVideo = function (author, phone, path) { return rpc('kadras_add_video', { p_event: K.event, p_device: K.device, p_author: author, p_phone: phone, p_path: path }); };
  real.uploadAs = function (path, blob, type) {
    return fetch(C.url + '/storage/v1/object/' + C.bucket + '/' + path, { method: 'POST', headers: head({ 'Content-Type': type || 'application/octet-stream' }), body: blob })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 413 ? 'too_big' : 'upload ' + r.status); });
  };
  demo.addVideo = function (a, ph, path) { return demo.addPhoto(a, ph, path); };
  demo.uploadAs = function (path, blob) { return /_s\.jpg$/.test(path) ? demo.upload(path, blob) : Promise.resolve(); };
  // Превью видео: первый кадр в JPEG (для сетки и пульта).
  K.videoThumb = function (file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), v = document.createElement('video'), done = false;
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = u;
      function grab() {
        if (done) return; done = true;
        var s = Math.min(1, 480 / Math.max(v.videoWidth || 480, v.videoHeight || 480)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round((v.videoWidth || 480) * s)); c.height = Math.max(1, Math.round((v.videoHeight || 270) * s));
        try { c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); } catch (e) {}
        c.toBlob(function (b) { URL.revokeObjectURL(u); b ? res({ blob: b, dur: v.duration }) : rej(new Error('thumb')); }, 'image/jpeg', 0.7);
      }
      v.onloadeddata = function () { try { v.currentTime = Math.min(0.3, (v.duration || 1) / 2); } catch (e) { grab(); } };
      v.onseeked = grab;
      v.onerror = function () { URL.revokeObjectURL(u); rej(new Error('video')); };
      setTimeout(grab, 6000);
    });
  };

  // ---------- эстафета: каждый снимает свои N секунд по очереди ----------
  real.relayJoin = function (author) { return rpc('kadras_relay_join', { p_event: K.event, p_device: K.device, p_author: author || '' }); };
  real.relayState = function (dev) { return rpc('kadras_relay_state', { p_event: K.event, p_device: dev || '' }); };
  real.relayStart = function (pin, sec) { return rpc('kadras_relay_start', { p_event: K.event, p_pin: pin, p_sec: sec || 5 }); };
  real.addRelay = function (author, phone, path) { return rpc('kadras_add_relay', { p_event: K.event, p_device: K.device, p_author: author, p_phone: phone, p_path: path }); };
  K.isRelay = function (ev) { return ev && ev.phase === 'collect' && /^ESTAFET/i.test(ev.task || ''); };
  K.relayFetch = function (dev) { return K.api.relayState(dev).then(function (r) { r._got = Date.now(); return r; }); };
  // время по часам сервера, мс
  K.relayNow = function (rs) { return Date.now() + (new Date(rs.now).getTime() - rs._got); };

  K.api = K.demo ? demo : real;
})();
