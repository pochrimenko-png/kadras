// Телефон участника: имя → кадр → голос → результат. Одно действие на экран.
(function () {
  var K = window.K, h = K.h, api = K.api;
  if (K.role !== 'guest') return;

  var S = {
    name: K.store.get('kadras_name' + K.sfx) || '', phone: K.store.get('kadras_phone' + K.sfx) || '',
    named: false, st: null, key: '', file: null, prev: null, busy: false, err: '', note: '', pick: null, change: false, revote: false, round: 0,
    poll: null, pkey: '', psel: [], pother: '', pedit: false, perr: '', pseen: false,
    dstream: null, dvideo: null, dstate: null, dshot: '', dmsg: '', dtimer: null,
    rstream: null, rvideo: null, rs: null, rtimer: null, rdone: '', rrec: false, rmsg: ''
  };
  S.named = !!S.name;

  // Модель телефона подставляем сами, где браузер её отдаёт (Android Chrome); поле можно поправить.
  if (!S.phone) {
    try {
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        navigator.userAgentData.getHighEntropyValues(['model']).then(function (v) {
          var el = document.getElementById('ph');
          if (v && v.model && !S.phone) { S.phone = v.model; if (el && !el.value) el.value = v.model; }
        }).catch(function () {});
      } else if (/iPhone/.test(navigator.userAgent)) S.phone = 'iPhone';
    } catch (e) {}
  }

  function balsai(n) {
    var a = n % 10, b = n % 100;
    return n + ' ' + (a === 1 && b !== 11 ? 'balsas' : (a >= 2 && (b < 10 || b >= 20) ? 'balsai' : 'balsų'));
  }
  function img(path, cls, small) { return h('img', { src: api.url(small || K.isVideo(path) ? K.thumb(path) : path), class: cls || '', alt: '', loading: 'lazy' }); }
  function foot() {
    return h('p', { class: 'mut small', style: 'margin-top:auto' }, S.name + ' · ',
      h('a', { href: '#', style: 'color:inherit', onclick: function (e) { e.preventDefault(); S.named = false; render(); } }, 'keisti vardą'));
  }

  function nameForm() {
    var n = h('input', { class: 't', id: 'nm', value: S.name, maxlength: 40, autocomplete: 'given-name', enterkeyhint: 'next' });
    var p = h('input', { class: 't', id: 'ph', value: S.phone, maxlength: 40, placeholder: 'pvz., Samsung A52' });
    function go() {
      S.name = n.value.trim(); S.phone = p.value.trim();
      if (!S.name) { S.err = 'Įrašykite savo vardą.'; render(); return; }
      K.store.set('kadras_name' + K.sfx, S.name); K.store.set('kadras_phone' + K.sfx, S.phone);
      S.err = ''; S.named = true; render();
    }
    return [
      h('h1', null, 'Sveiki!'),
      h('label', { class: 'f' }, 'Jūsų vardas', n),
      h('label', { class: 'f' }, 'Koks jūsų telefonas? (nebūtina)', p),
      S.err && h('p', { class: 'err' }, S.err),
      h('button', { class: 'btn', onclick: go }, 'Toliau'),
      h('p', { class: 'mut small' }, 'Nuotraukas rodysime tik šio renginio metu, o po jo ištrinsime.')
    ];
  }

  function onFile(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    if (S.prev) URL.revokeObjectURL(S.prev);
    S.file = f; S.prev = URL.createObjectURL(f); S.err = ''; render();
  }
  var BASE2 = false, DAUG = K.q.has('daug'); // ссылка ведущего ?daug — много селфи с одного телефона (14.11)
  function send() {
    if (S.busy || !S.file) return;
    var vid = /^video\//.test(S.file.type || '') || K.isVideoTask(S.st.event) && !/^image\//.test(S.file.type || '');
    if (vid) return sendVideo();
    var path = K.event + '/' + S.st.event.round + '/' + K.uuid() + '.jpg';
    if (DAUG) K.device = K.uuid(); // режим ведущего «?daug»: каждый кадр — как от нового телефона, прежние не заменяются
    if (K.isLight2(S.st.event)) path = path.replace(/\/([0-9a-f-]{36})\.jpg$/, function (m, u) { return '/' + K.LMARK + u.slice(8) + '.jpg'; }); // шаг 2 «Света» — метка в имени файла
    S.busy = true; S.err = ''; render();
    Promise.all([K.shrink(S.file, 1600, 0.82), K.shrink(S.file, 480, 0.7)])
      .then(function (b) { return Promise.all([api.upload(path, b[0]), api.upload(K.thumb(path), b[1])]); })
      .then(function () { return api.addPhoto(S.name, S.phone, path); })
      .then(function (r) {
        if (r.error) throw new Error(r.error);
        if (S.prev) URL.revokeObjectURL(S.prev);
        S.file = null; S.prev = null; S.change = DAUG; S.busy = false;
        if (DAUG) S.cnt = (S.cnt || 0) + 1;
        return refresh(true);
      })
      .catch(fail);
  }
  function fail(e) {
    S.busy = false;
    S.err = e.message === 'closed' ? 'Priėmimas jau baigtas.' : e.message === 'full' ? 'Kadrų jau per daug – šis nebetilpo.' :
      e.message === 'too_big' ? 'Vaizdo įrašas per didelis — nufilmuokite trumpiau (5 s).' :
      (e.message === 'image' || e.message === 'blob' || e.message === 'video') ? 'Šio failo atidaryti nepavyko. Pabandykite iš naujo.' :
      'Nepavyko išsiųsti. Patikrinkite internetą ir bandykite dar kartą.';
    render();
  }
  function sendVideo() {
    var f = S.file;
    if (f.size > 50 * 1024 * 1024) { S.err = 'Vaizdo įrašas per didelis — nufilmuokite trumpiau (5 s).'; render(); return; }
    var ext = /quicktime/.test(f.type) ? 'mov' : /webm/.test(f.type) ? 'webm' : 'mp4';
    var path = K.event + '/' + S.st.event.round + '/' + K.uuid() + '.' + ext;
    S.busy = true; S.err = ''; render();
    K.videoThumb(f).then(function (t) {
      if (t.dur && t.dur > 20) throw new Error('long');
      return Promise.all([api.uploadAs(path, f, f.type || 'video/mp4'), api.upload(K.thumb(path), t.blob)]);
    }).then(function () { return api.addVideo(S.name, S.phone, path); })
      .then(function (r) {
        if (r.error) throw new Error(r.error);
        if (S.prev) URL.revokeObjectURL(S.prev);
        S.file = null; S.prev = null; S.change = false; S.busy = false;
        return refresh(true);
      }).catch(function (e) { if (e.message === 'long') { S.busy = false; S.err = 'Per ilgas — ne daugiau 15 sekundžių.'; render(); } else fail(e); });
  }
  function shoot() {
    var ev = S.st.event, out = [h('p', { class: 'kicker' }, DAUG ? 'Daug kadrų · išsiųsta: ' + (S.cnt || 0) : 'Užduotis')], vt = K.isVideoTask(ev);
    if (ev.task) out.push(h('div', { class: 'task' }, ev.task.replace(/^VIDEO:\s*/i, '')));
    out.push(h('input', { type: 'file', accept: vt ? 'video/*' : 'image/*', capture: 'environment', id: 'cam', class: 'hid', onchange: onFile }));
    out.push(h('input', { type: 'file', accept: vt ? 'video/*' : 'image/*', id: 'gal', class: 'hid', onchange: onFile }));
    if (S.prev) {
      out.push(vt || /^video\//.test(S.file && S.file.type || '') ? h('video', { src: S.prev, class: 'shot', controls: true, playsinline: true, muted: true }) : h('img', { src: S.prev, class: 'shot', alt: '' }));
      out.push(h('button', { class: 'btn', disabled: S.busy, onclick: send }, S.busy ? 'Siunčiama…' : 'Siųsti'));
      if (!S.busy) out.push(h('label', { class: 'btn ghost', for: 'cam' }, vt ? 'Filmuoti iš naujo' : 'Fotografuoti iš naujo'));
    } else {
      out.push(h('label', { class: 'btn big', for: 'cam' }, vt ? '🎥 Filmuoti (5 s)' : '📷 Fotografuoti'));
      out.push(h('label', { class: 'btn ghost', for: 'gal' }, 'Pasirinkti iš galerijos'));
      if (S.change && !DAUG) out.push(h('button', { class: 'btn ghost', onclick: function () { S.change = false; render(); } }, 'Palikti ankstesnį'));
    }
    if (S.err) out.push(h('p', { class: 'err' }, S.err));
    return out;
  }
  function sent() {
    var m = S.st.my_photo;
    return [
      h('p', { class: 'ok' }, 'Išsiųsta! Jūsų kadras – Nr. ' + m.num),
      img(m.path, 'shot', true),
      h('p', { class: 'mut' }, 'Žiūrėkite į didelį ekraną.'),
      h('button', { class: 'btn ghost', onclick: function () { S.change = true; render(); } }, 'Pakeisti kadrą')
    ];
  }
  function waiting() {
    var m = S.st.my_photo, out = [h('h1', null, 'Palaukite – tuoj tęsime.')];
    if (m) { out.push(h('p', { class: 'mut' }, 'Jūsų kadras – Nr. ' + m.num)); out.push(img(m.path, 'shot', true)); }
    return out;
  }
  // Голос — «сердечки»: до 3 на человека, повторное нажатие снимает.
  function toggleHeart(p) {
    if (S.busy) return;
    if (p.mine) { S.note = 'Tai jūsų kadras – už savo balsuoti negalima.'; render(true); return; }
    S.busy = true; S.note = ''; render(true);
    api.vote(p.id).then(function (r) {
      S.busy = false;
      if (r.error) S.note = r.error === 'limit' ? 'Daugiausia 3 širdelės. Nuimkite vieną, kad atiduotumėte kitam.' : r.error === 'own' ? 'Tai jūsų kadras – už savo balsuoti negalima.' : 'Balsavimas jau baigtas.';
      return refresh(true);
    }).catch(function () { S.busy = false; S.note = 'Nepavyko. Patikrinkite internetą.'; render(true); });
  }
  function vote() {
    var st = S.st, my = st.my_votes || (st.my_vote ? [st.my_vote] : []);
    if (!st.photos.length) return [h('h1', null, 'Kadrų dar nėra.')];
    var cells = st.photos.map(function (p) {
      var on = my.indexOf(p.id) >= 0;
      return h('div', { class: 'cell' + (on ? ' sel' : '') + (p.mine ? ' own' : ''), onclick: function () { toggleHeart(p); } },
        img(p.path, '', true), h('span', { class: 'n' }, String(p.num)),
        p.mine ? h('span', { class: 'tag' }, 'Jūsų kadras') : h('span', { class: 'heart' + (on ? ' on' : '') }, on ? '❤️' : '🤍'));
    });
    return [
      h('h1', null, 'Kurie kadrai patinka?'),
      h('p', { class: 'mut' }, 'Palieskite kadrą – uždėsite širdelę. Iki 3 širdelių. ' + '❤️'.repeat(my.length) + '🤍'.repeat(Math.max(0, 3 - my.length))),
      h('div', { class: 'grid' }, cells),
      S.note && h('p', { class: 'err' }, S.note)
    ];
  }
  function results() {
    var st = S.st, reveal = st.event.phase === 'reveal';
    var list = st.photos.slice().sort(function (a, b) { return (b.votes || 0) - (a.votes || 0) || a.num - b.num; });
    var max = list.length ? (list[0].votes || 0) : 0;
    var top = list.filter(function (p) { return max > 0 && (p.votes || 0) === max; });
    var out = [h('h1', null, reveal ? (top.length > 1 ? 'Nugalėtojai' : 'Nugalėtojas') : 'Rezultatai')];
    if (reveal && max > 0) {
      top.forEach(function (p) {
        out.push(h('div', { class: 'win' }, img(p.path, '', true),
          h('h2', null, 'Nr. ' + p.num + ' · ' + (p.author || '')),
          h('p', null, (p.phone ? p.phone + ' · ' : '') + balsai(p.votes || 0)),
          p.mine && h('p', { style: 'font-weight:700' }, 'Tai jūsų kadras!')));
      });
    }
    list.forEach(function (p) {
      out.push(h('div', { class: 'row' + (p.mine ? ' me' : '') }, img(p.path, '', true), h('span', { class: 'num' }, String(p.num)),
        h('div', { class: 'bar' },
          h('span', null, balsai(p.votes || 0) + (reveal ? ' · ' + (p.author || '') + (p.phone ? ' · ' + p.phone : '') : '') + (p.mine ? ' · jūsų' : '')),
          h('i', { style: 'width:' + (max ? Math.round(100 * (p.votes || 0) / max) : 0) + '%' }))));
    });
    return out;
  }

  // ---------- опрос на входе ----------
  function pollBars(ps) {
    var max = Math.max.apply(null, ps.counts.concat([1]));
    return h('div', { class: 'pbars' }, K.POLL.opts.map(function (o, i) {
      var c = ps.counts[i] || 0, mine = ps.mine && ps.mine.choices.indexOf(i + 1) >= 0;
      return h('div', { class: 'prow' + (mine ? ' me' : '') }, h('span', null, o), h('b', null, String(c)),
        h('i', { style: 'width:' + Math.round(100 * c / max) + '%' }));
    }));
  }
  function pollAsk() {
    var out = [h('p', { class: 'kicker' }, 'Kol renkamės'), h('h1', null, K.POLL.q), h('p', { class: 'mut' }, K.POLL.sub)];
    out.push(h('div', { class: 'popts' }, K.POLL.opts.map(function (o, i) {
      var n = i + 1, on = S.psel.indexOf(n) >= 0;
      return h('button', { class: 'popt' + (on ? ' on' : ''), onclick: function () {
        S.perr = '';
        if (on) S.psel = S.psel.filter(function (x) { return x !== n; });
        else S.psel.push(n);
        render(true);
      } }, o);
    })));
    if (S.psel.indexOf(10) >= 0) out.push(h('input', { class: 't', id: 'pother', maxlength: 80, placeholder: 'Jūsų variantas…', value: S.pother,
      oninput: function (e) { S.pother = e.target.value; } }));
    if (S.perr) out.push(h('p', { class: 'err' }, S.perr));
    out.push(h('div', { class: 'stick' }, h('button', { class: 'btn', disabled: !S.psel.length || S.busy, onclick: pollSend },
      S.busy ? 'Siunčiama…' : (S.psel.length ? 'Atsakyti' : 'Pasirinkite atsakymą'))));
    return out;
  }
  function pollSend() {
    if (S.busy || !S.psel.length) return;
    if (S.psel.indexOf(10) >= 0 && !S.pother.trim()) { S.perr = 'Įrašykite savo variantą.'; render(true); return; }
    S.busy = true; S.perr = ''; render(true);
    api.pollAnswer(S.psel.slice(), S.pother).then(function (r) {
      S.busy = false;
      if (r.error) { S.perr = r.error === 'closed' ? 'Apklausa jau baigta.' : 'Nepavyko – bandykite dar kartą.'; render(true); return; }
      S.pedit = false; return refresh(true);
    }).catch(function () { S.busy = false; S.perr = 'Nepavyko. Patikrinkite internetą.'; render(true); });
  }
  function pollDone(ps) {
    return [h('p', { class: 'ok' }, 'Ačiū! Štai ką atsakė salė:'), h('p', { class: 'mut' }, 'Atsakė: ' + ps.total), pollBars(ps),
      h('button', { class: 'btn', onclick: function () { S.pseen = true; render(); } }, 'Toliau'),
      h('button', { class: 'btn ghost', onclick: function () { S.pedit = true; S.psel = (ps.mine.choices || []).slice(); S.pother = ps.mine.other || ''; render(); } }, 'Pakeisti atsakymą')];
  }

  // ---------- фотодуэль: камера в странице, общий отсчёт, снимок сам ----------
  function duelCam() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { S.dmsg = 'nocam'; render(); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(function (st) {
        S.dstream = st;
        var v = document.createElement('video'); v.playsInline = true; v.muted = true; v.autoplay = true; v.setAttribute('playsinline', ''); v.className = 'dcam';
        v.srcObject = st; v.play().catch(function () {});
        S.dvideo = v; S.dmsg = ''; render(); duelLoop();
      }).catch(function () { S.dmsg = 'nocam'; render(); });
  }
  function duelLoop() {
    if (S.dtimer) return;
    S.dtimer = setInterval(function () {
      var ev = S.st && S.st.event;
      if (!K.isDuel(ev) || (S.st && S.st.my_photo)) { clearInterval(S.dtimer); S.dtimer = null; return; }
      K.duelFetch().then(function (ds) { S.dstate = ds; tick(); }).catch(function () {});
    }, 900);
  }
  function tick() {
    var left = K.duelLeft(S.dstate), el = document.getElementById('dcount');
    if (left === null || left < -4000) { if (el) el.textContent = ''; return; }
    if (left > 0) {
      if (el) el.textContent = String(Math.ceil(left / 1000));
      setTimeout(tick, Math.min(250, left));
    } else if (S.dshot !== S.dstate.duel_at) { S.dshot = S.dstate.duel_at; if (el) el.textContent = '📸'; snap(); }
  }
  function snap() {
    var v = S.dvideo; if (!v || !v.videoWidth) { S.dmsg = 'Kamera dar nepasiruošusi.'; render(); return; }
    var c = document.createElement('canvas'), s = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    var flash = document.getElementById('dflash'); if (flash) { flash.style.opacity = 1; setTimeout(function () { flash.style.opacity = 0; }, 180); }
    c.toBlob(function (b) {
      if (!b) return;
      S.file = b; if (S.prev) URL.revokeObjectURL(S.prev); S.prev = URL.createObjectURL(b);
      send();
    }, 'image/jpeg', 0.85);
  }
  function duelView() {
    var out = [h('p', { class: 'kicker' }, 'Foto dvikova 🤠')];
    if (S.dmsg === 'nocam') {
      out.push(h('p', { class: 'mut' }, 'Kameros puslapyje įjungti nepavyko — fotografuokite įprastai.'));
      return out.concat(shoot());
    }
    if (!S.dstream) {
      out.push(h('h1', null, 'Pasiruoškite!'));
      out.push(h('p', { class: 'mut' }, 'Įjunkite kamerą. Kai vedėjas paspaus „Startas“, bus 5-4-3-2-1 — ir telefonas nufotografuos pats.'));
      out.push(h('button', { class: 'btn big', onclick: duelCam }, '📷 Įjungti kamerą'));
      return out;
    }
    var wrap = h('div', { class: 'dwrap' }, h('div', { class: 'dcount', id: 'dcount' }, ''), h('div', { class: 'dflash', id: 'dflash' }));
    wrap.insertBefore(S.dvideo, wrap.firstChild);
    out.push(wrap);
    out.push(h('p', { class: 'mut' }, S.busy ? 'Siunčiama…' : (S.dmsg || 'Laukite starto… Nusitaikykite į priešininką!')));
    duelLoop(); setTimeout(tick, 50);
    return out;
  }

  // ---------- эстафета ----------
  function relayJoin() {
    // старые телефоны (iPhone 6 и др., нет записи в браузере): тоже получают номер, а в свою очередь снимают обычной камерой телефона
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || !window.MediaRecorder) {
      S.rnative = true; S.rmsg = '';
      return api.relayJoin(S.name).then(function (r) { if (r && r.error) S.rmsg = r.error === 'closed' ? 'Priėmimas baigtas.' : 'Nepavyko prisijungti.'; render(); relayLoop(); })
        .catch(function () { S.rmsg = 'Nepavyko prisijungti — patikrinkite internetą.'; render(); });
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
      .then(function (st) {
        S.rstream = st;
        var v = document.createElement('video'); v.playsInline = true; v.muted = true; v.autoplay = true; v.setAttribute('playsinline', ''); v.className = 'dcam';
        v.srcObject = st; v.play().catch(function () {}); S.rvideo = v;
        try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { S.rlock = l; }).catch(function () {}); } catch (e) {}
        return api.relayJoin(S.name);
      }).then(function (r) { if (r && r.error) S.rmsg = r.error === 'closed' ? 'Priėmimas baigtas.' : 'Nepavyko prisijungti.'; render(); relayLoop(); })
      .catch(function () { S.rmsg = 'Kameros įjungti nepavyko.'; render(); });
  }
  function relayLoop() {
    if (S.rtimer) return;
    S.rtimer = setInterval(function () {
      if (!S.st || !K.isRelay(S.st.event)) { clearInterval(S.rtimer); S.rtimer = null; return; }
      K.relayFetch(K.device).then(function (rs) { S.rs = rs; rtick(); }).catch(function () {});
    }, 1000);
  }
  function relayWin(rs) {
    if (!rs || !rs.relay_at || !rs.slot) return null;
    var t0 = new Date(rs.relay_at).getTime(), sec = (rs.sec || 5) * 1000;
    return { a: t0 + (rs.slot - 1) * sec, b: t0 + rs.slot * sec, now: K.relayNow(rs), sec: sec };
  }
  function rtick() {
    var w = relayWin(S.rs), big = document.getElementById('rbig'), sub = document.getElementById('rsub'), rdy = document.getElementById('rready');
    if (!big) return;
    // до старта — цветной экран «готов»: ведущий видит поднятые телефоны издалека
    if (rdy) rdy.hidden = !!(S.rs && (S.rs.relay_at || S.rs.joined === false));
    if (!w) { big.textContent = ''; var rn = document.getElementById('rreadyn'); if (rn) rn.textContent = 'Pasiruošę: ' + (S.rs ? S.rs.n : 1);
      if (sub) sub.textContent = 'Laukite starto · pasiruošę: ' + (S.rs ? S.rs.n : 0); return; }
    var now = K.relayNow(S.rs), key = S.rs.relay_at + ':' + S.rs.slot;
    if (now < w.a) {
      var left = Math.ceil((w.a - now) / 1000);
      big.textContent = left <= 3 ? String(left) : ''; big.className = 'rbig' + (left <= 3 ? ' soon' : '');
      if (left <= 3 && S.rvib !== key + left) { S.rvib = key + left; try { if (navigator.vibrate) navigator.vibrate(left === 1 ? 300 : 120); } catch (e) {} }
      if (sub) sub.textContent = 'Jūsų eilė: Nr. ' + S.rs.slot + ' · po ' + left + ' s';
      if (S.rnative) { nativeBtn(left <= 3, key); }
      else if (w.a - now < 1200 && S.rdone !== key && !S.rrec) setTimeout(function () { record(key, w); }, Math.max(0, w.a - K.relayNow(S.rs)));
      setTimeout(rtick, 250);
    } else if (now < w.b) {
      big.textContent = '● ' + Math.ceil((w.b - now) / 1000); big.className = 'rbig rec';
      if (sub) sub.textContent = S.rnative ? 'JŪSŲ EILĖ! Spauskite ir filmuokite 5 s 🎬' : 'FILMUOJATE! 🎬';
      if (S.rnative) nativeBtn(true, key); else if (S.rdone !== key && !S.rrec) record(key, w);
      setTimeout(rtick, 250);
    } else {
      big.textContent = '';
      if (S.rnative && S.rdone !== key) { nativeBtn(true, key); if (sub && !S.rrec) sub.textContent = 'Jūsų eilė! Filmuokite 5 s ir siųskite 🎬'; return; }
      if (sub && !S.rrec) sub.textContent = S.rdone === key ? 'Ačiū! Jūsų 5 sekundės — filme 🎬' : 'Jūsų eilė praėjo.';
    }
  }
  function record(key, w) {
    if (S.rrec || S.rdone === key || !S.rstream) return;
    S.rrec = true; S.rdone = key;
    var mt = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].filter(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); })[0] || '';
    var rec, chunks = [];
    try { rec = mt ? new MediaRecorder(S.rstream, { mimeType: mt, videoBitsPerSecond: 3000000 }) : new MediaRecorder(S.rstream); } catch (e) { S.rrec = false; S.rmsg = 'Įrašyti nepavyko.'; render(); return; }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      var type = (rec.mimeType || mt || 'video/webm').split(';')[0], blob = new Blob(chunks, { type: type });
      var ext = /mp4/.test(type) ? 'mp4' : 'webm', path = K.event + '/' + S.st.event.round + '/' + K.uuid() + '.' + ext;
      var sub = document.getElementById('rsub'); if (sub) sub.textContent = 'Siunčiama…';
      K.videoThumb(blob).then(function (t) { return Promise.all([api.uploadAs(path, blob, type), api.upload(K.thumb(path), t.blob)]); })
        .then(function () { return api.addRelay(S.name, S.phone, path); })
        .then(function (r) { S.rrec = false; if (r.error) throw new Error(r.error); rtick(); return refresh(true); })
        .catch(function () { S.rrec = false; S.rmsg = 'Nepavyko išsiųsti — patikrinkite internetą.'; render(); });
    };
    rec.start(500);
    setTimeout(function () { try { rec.stop(); } catch (e) {} }, Math.max(1000, w.b - K.relayNow(S.rs)));
  }
  function nativeBtn(on, key) {
    var b = document.getElementById('rnat'); if (!b) return;
    b.style.display = on && S.rdone !== key ? 'flex' : 'none'; S.rkey = key;
  }
  function nativeSend(ev) {
    var f = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!f || S.rrec) return;
    var key = S.rkey, sub = document.getElementById('rsub');
    var ext = /quicktime/.test(f.type) ? 'mov' : /webm/.test(f.type) ? 'webm' : 'mp4', path = K.event + '/' + S.st.event.round + '/' + K.uuid() + '.' + ext;
    S.rrec = true; if (sub) sub.textContent = 'Siunčiama…'; nativeBtn(false, key);
    K.videoThumb(f).then(function (t) { return Promise.all([api.uploadAs(path, f, f.type || 'video/mp4'), api.upload(K.thumb(path), t.blob)]); })
      .then(function () { return api.addRelay(S.name, S.phone, path); })
      .then(function (r) { S.rrec = false; if (r.error) throw new Error(r.error); S.rdone = key; if (sub) sub.textContent = 'Ačiū! Jūsų 5 sekundės — filme 🎬'; })
      .catch(function () { S.rrec = false; nativeBtn(true, key); if (sub) sub.textContent = 'Nepavyko išsiųsti — bandykite dar kartą.'; });
  }
  function relayView() {
    var out = [h('p', { class: 'kicker' }, 'Estafetė 🎬')];
    if (S.rmsg) out.push(h('p', { class: 'err' }, S.rmsg));
    if (!S.rstream && !S.rnative) {
      out.push(h('h1', null, 'Jūsų 5 sekundės filme'));
      out.push(h('p', { class: 'mut' }, 'Prisijunkite — gausite atsitiktinį numerį. Kai ateis jūsų eilė, telefonas pats filmuos 5 sekundes.'));
      out.push(h('button', { class: 'btn big', onclick: relayJoin }, '📷 Prisijungti'));
      return out;
    }
    var wrap = h('div', { class: 'dwrap' }, h('div', { class: 'rbig', id: 'rbig' }, ''));
    if (S.rvideo) wrap.insertBefore(S.rvideo, wrap.firstChild); else wrap.style.minHeight = '42vh';
    if (S.rnative) {
      wrap.appendChild(h('input', { type: 'file', accept: 'video/*', capture: 'environment', id: 'rnatf', class: 'hid', onchange: nativeSend }));
      wrap.appendChild(h('label', { id: 'rnat', for: 'rnatf', style: 'display:none;position:absolute;inset:0;z-index:5;align-items:center;justify-content:center;text-align:center;background:#C0392B;color:#fff;font:900 9vw/1.15 Oswald,Arial,sans-serif;padding:4vw' }, '🎥 JŪSŲ EILĖ! Spauskite — filmuokite 5 s'));
    }
    var RC = ['#FFE34F', '#3DDC84', '#FF5CA8', '#35C8FF', '#FF8A3D'], ci = 0, di;
    for (di = 0; di < K.device.length; di++) ci = (ci + K.device.charCodeAt(di)) % RC.length;
    var rdy = h('div', { class: 'rready', id: 'rready', style: 'background:' + RC[ci] },
      h('div', { class: 'rrok' }, '✓'), h('div', { class: 'rrt' }, 'KAMERA PARUOŠTA'),
      h('div', { class: 'rrn' }, S.name || ''), h('div', { class: 'rrs' }, 'Pakelkite telefoną ir parodykite ekraną vedėjui'),
      h('div', { class: 'rrc', id: 'rreadyn' }, ''));
    rdy.hidden = !!(S.rs && S.rs.relay_at);
    out.push(wrap, h('p', { class: 'rsub', id: 'rsub' }, 'Laukite starto…'), h('p', { class: 'mut small' }, 'Neužrakinkite ekrano ir neišeikite iš puslapio.'), rdy);
    relayLoop(); setTimeout(rtick, 50);
    return out;
  }

  function render(keepScroll) {
    var st = S.st, body, y = window.scrollY;
    var ps = S.poll;
    if (ps && ps.open && (!ps.mine || S.pedit)) body = pollAsk();
    else if (ps && ps.open && ps.mine && !S.pseen) body = pollDone(ps);
    else if (!S.named) body = nameForm();
    else if (!st) body = [h('p', { class: 'mut' }, 'Jungiamasi…')];
    else if (st.error) body = [h('p', { class: 'err' }, 'Renginys nerastas. Nuskenuokite QR kodą dar kartą.')];
    else {
      var ph = st.event.phase;
      body = ph === 'collect' ? (st.my_photo && !S.change ? sent() : (K.isDuel(st.event) ? duelView() : K.isRelay(st.event) ? relayView() : shoot())) : ph === 'vote' ? vote() :
        (ph === 'results' || ph === 'reveal') ? results() : waiting();
      body.push(foot());
    }
    K.mount(h('div', { class: 'guest' }, body));
    if (keepScroll) window.scrollTo(0, y);
  }

  // Перерисовываем только когда на сервере изменилось то, что видно на этом экране.
  function keyOf(st) {
    if (!st || st.error) return 'x';
    var e = st.event, k = [e.phase, e.round];
    if (e.phase === 'collect') k.push(e.task, st.my_photo && st.my_photo.path);
    else if (e.phase === 'vote') k.push(JSON.stringify(st.my_votes || st.my_vote), st.photos.map(function (p) { return p.id; }).join());
    else if (e.phase === 'results' || e.phase === 'reveal') k.push(JSON.stringify(st.photos));
    else k.push(st.my_photo && st.my_photo.path);
    return k.join('|');
  }
  function refresh(force) {
    return Promise.all([api.state(K.device), api.pollState(K.device).catch(function () { return null; })]).then(function (rr) {
      var st = rr[0], ps = rr[1] && !rr[1].error ? rr[1] : null;
      var asking = ps && ps.open && (!ps.mine || S.pedit);
      var pk = ps ? JSON.stringify(asking ? [ps.open, !!ps.mine] : [ps.open, ps.total, ps.counts, ps.mine, S.pseen]) : '';
      var pchanged = pk !== S.pkey; S.pkey = pk; S.poll = ps;
      var key = keyOf(st);
      if (st.event && st.event.round !== S.round) { S.round = st.event.round; S.file = null; S.prev = null; S.change = false; S.pick = null; S.revote = false; S.err = ''; S.note = ''; }
      S.st = st;
      // шаг 2 «Света»: тот же телефон шлёт второй кадр отдельно — свой номер устройства «…-2», первый кадр не заменяется
      if (st.event && K.isLight2(st.event) && !BASE2) { BASE2 = true; K.device = K.device.slice(0, 60) + '-2'; return refresh(true); }
      if (force || key !== S.key || pchanged) { S.key = key; if (!(document.activeElement && document.activeElement.id === 'pother') || force) render(!force); }
    });
  }

  render();
  K.poll(function () { return refresh(false); }, 2800);
})();
