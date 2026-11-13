// Телефон участника: имя → кадр → голос → результат. Одно действие на экран.
(function () {
  var K = window.K, h = K.h, api = K.api;
  if (K.role !== 'guest') return;

  var S = {
    name: K.store.get('kadras_name' + K.sfx) || '', phone: K.store.get('kadras_phone' + K.sfx) || '',
    named: false, st: null, key: '', file: null, prev: null, busy: false, err: '', note: '', pick: null, change: false, revote: false, round: 0,
    poll: null, pkey: '', psel: [], pother: '', pedit: false, perr: '', pseen: false,
    dstream: null, dvideo: null, dstate: null, dshot: '', dmsg: '', dtimer: null
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
  function img(path, cls, small) { return h('img', { src: api.url(small ? K.thumb(path) : path), class: cls || '', alt: '', loading: 'lazy' }); }
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
  function send() {
    if (S.busy || !S.file) return;
    var path = K.event + '/' + S.st.event.round + '/' + K.uuid() + '.jpg';
    S.busy = true; S.err = ''; render();
    Promise.all([K.shrink(S.file, 1600, 0.82), K.shrink(S.file, 480, 0.7)])
      .then(function (b) { return Promise.all([api.upload(path, b[0]), api.upload(K.thumb(path), b[1])]); })
      .then(function () { return api.addPhoto(S.name, S.phone, path); })
      .then(function (r) {
        if (r.error) throw new Error(r.error);
        if (S.prev) URL.revokeObjectURL(S.prev);
        S.file = null; S.prev = null; S.change = false; S.busy = false;
        return refresh(true);
      })
      .catch(function (e) {
        S.busy = false;
        S.err = e.message === 'closed' ? 'Kadrų priėmimas jau baigtas.' : e.message === 'full' ? 'Kadrų jau per daug – šis nebetilpo.' :
          (e.message === 'image' || e.message === 'blob') ? 'Šios nuotraukos atidaryti nepavyko. Fotografuokite iš naujo.' :
          'Nepavyko išsiųsti. Patikrinkite internetą ir bandykite dar kartą.';
        render();
      });
  }
  function shoot() {
    var ev = S.st.event, out = [h('p', { class: 'kicker' }, 'Užduotis')];
    if (ev.task) out.push(h('div', { class: 'task' }, ev.task));
    out.push(h('input', { type: 'file', accept: 'image/*', capture: 'environment', id: 'cam', class: 'hid', onchange: onFile }));
    out.push(h('input', { type: 'file', accept: 'image/*', id: 'gal', class: 'hid', onchange: onFile }));
    if (S.prev) {
      out.push(h('img', { src: S.prev, class: 'shot', alt: '' }));
      out.push(h('button', { class: 'btn', disabled: S.busy, onclick: send }, S.busy ? 'Siunčiama…' : 'Siųsti'));
      if (!S.busy) out.push(h('label', { class: 'btn ghost', for: 'cam' }, 'Fotografuoti iš naujo'));
    } else {
      out.push(h('label', { class: 'btn big', for: 'cam' }, '📷 Fotografuoti'));
      out.push(h('label', { class: 'btn ghost', for: 'gal' }, 'Pasirinkti iš galerijos'));
      if (S.change) out.push(h('button', { class: 'btn ghost', onclick: function () { S.change = false; render(); } }, 'Palikti ankstesnį kadrą'));
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
      body = ph === 'collect' ? (st.my_photo && !S.change ? sent() : (K.isDuel(st.event) ? duelView() : shoot())) : ph === 'vote' ? vote() :
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
      if (force || key !== S.key || pchanged) { S.key = key; if (!(document.activeElement && document.activeElement.id === 'pother') || force) render(!force); }
    });
  }

  render();
  K.poll(function () { return refresh(false); }, 2800);
})();
