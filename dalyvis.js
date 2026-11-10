// Телефон участника: имя → кадр → голос → результат. Одно действие на экран.
(function () {
  var K = window.K, h = K.h, api = K.api;
  if (K.role !== 'guest') return;

  var S = {
    name: K.store.get('kadras_name' + K.sfx) || '', phone: K.store.get('kadras_phone' + K.sfx) || '',
    named: false, st: null, key: '', file: null, prev: null, busy: false, err: '', note: '', pick: null, change: false, revote: false, round: 0
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
  function doVote() {
    if (S.busy || !S.pick) return;
    S.busy = true; S.err = ''; render();
    api.vote(S.pick).then(function (r) {
      S.busy = false;
      if (r.error) { S.err = r.error === 'own' ? 'Tai jūsų kadras – už savo balsuoti negalima.' : 'Balsavimas jau baigtas.'; render(); return; }
      S.revote = false; S.pick = null;
      return refresh(true);
    }).catch(function () { S.busy = false; S.err = 'Nepavyko. Patikrinkite internetą ir bandykite dar kartą.'; render(); });
  }
  function vote() {
    var st = S.st, voted = null, picked = null;
    st.photos.forEach(function (p) { if (p.id === st.my_vote) voted = p; if (p.id === S.pick) picked = p; });
    if (voted && !S.revote) {
      return [
        h('p', { class: 'ok' }, 'Ačiū! Jūsų balsas – kadrui Nr. ' + voted.num),
        img(voted.path, 'shot', true),
        h('button', { class: 'btn ghost', onclick: function () { S.revote = true; S.pick = null; render(); } }, 'Pakeisti balsą')
      ];
    }
    if (!st.photos.length) return [h('h1', null, 'Kadrų dar nėra.')];
    var cells = st.photos.map(function (p) {
      var sel = p.id === S.pick;
      return h('div', {
        class: 'cell' + (sel ? ' sel' : '') + (p.mine ? ' own' : ''),
        onclick: function () {
          if (p.mine) { S.note = 'Tai jūsų kadras – už savo balsuoti negalima.'; S.pick = null; }
          else { S.note = ''; S.pick = sel ? null : p.id; }
          render(true);
        }
      }, img(p.path, '', !sel), h('span', { class: 'n' }, String(p.num)), p.mine && h('span', { class: 'tag' }, 'Jūsų kadras'));
    });
    return [
      h('h1', null, 'Kuris kadras geriausias?'),
      h('p', { class: 'mut' }, 'Palieskite kadrą – jis padidės. Tada spauskite mygtuką apačioje.'),
      h('div', { class: 'grid' }, cells),
      (S.note || S.err) && h('p', { class: 'err' }, S.note || S.err),
      h('div', { class: 'stick' }, h('button', { class: 'btn', disabled: !picked || S.busy, onclick: doVote },
        picked ? 'Balsuoti už Nr. ' + picked.num : 'Pasirinkite kadrą'))
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

  function render(keepScroll) {
    var st = S.st, body, y = window.scrollY;
    if (!S.named) body = nameForm();
    else if (!st) body = [h('p', { class: 'mut' }, 'Jungiamasi…')];
    else if (st.error) body = [h('p', { class: 'err' }, 'Renginys nerastas. Nuskenuokite QR kodą dar kartą.')];
    else {
      var ph = st.event.phase;
      body = ph === 'collect' ? (st.my_photo && !S.change ? sent() : shoot()) : ph === 'vote' ? vote() :
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
    else if (e.phase === 'vote') k.push(st.my_vote, st.photos.map(function (p) { return p.id; }).join());
    else if (e.phase === 'results' || e.phase === 'reveal') k.push(JSON.stringify(st.photos));
    else k.push(st.my_photo && st.my_photo.path);
    return k.join('|');
  }
  function refresh(force) {
    return api.state(K.device).then(function (st) {
      var key = keyOf(st);
      if (st.event && st.event.round !== S.round) { S.round = st.event.round; S.file = null; S.prev = null; S.change = false; S.pick = null; S.revote = false; S.err = ''; S.note = ''; }
      S.st = st;
      if (force || key !== S.key) { S.key = key; if (S.named || force) render(); }
    });
  }

  render();
  K.poll(function () { return refresh(false); }, 2800);
})();
