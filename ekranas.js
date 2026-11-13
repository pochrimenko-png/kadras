// Большой экран: QR для входа → стена кадров с номерами → столбики голосов → имена и телефоны.
(function () {
  var K = window.K, h = K.h, api = K.api;
  if (K.role !== 'screen') return;
  var S = { st: null, key: '', poll: null, ds: null, rs: null }, SEEN = {}, FIRST = false;

  function qr(text) {
    var el = h('div', { class: 'qr' });
    if (!window.qrcode) return el;
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), d = '', r, c;
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges"><path fill="#141412" d="' + d + '"/></svg>';
    return el;
  }
  function adr() { return K.guestUrl().replace(/^https?:\/\//, ''); }
  function balsai(n) {
    var a = n % 10, b = n % 100;
    return n + ' ' + (a === 1 && b !== 11 ? 'balsas' : (a >= 2 && (b < 10 || b >= 20) ? 'balsai' : 'balsų'));
  }

  function layout() {
    var w = document.getElementById('wall');
    if (!w) return;
    var n = w.children.length, W = w.clientWidth, H = w.clientHeight, best = 1, size = 0, c, r, s;
    for (c = 1; c <= n; c++) {
      r = Math.ceil(n / c); s = Math.min(W / c, (H / r) * 4 / 3);
      if (s > size) { size = s; best = c; }
    }
    w.style.gridTemplateColumns = 'repeat(' + best + ',1fr)';
    w.style.gridTemplateRows = 'repeat(' + Math.ceil(n / best) + ',1fr)';
  }

  function pollScreen(ps, e) {
    var max = Math.max.apply(null, ps.counts.concat([1]));
    return K.mount(h('div', { class: 'screen' },
      h('header', null, h('div', null, h('p', { class: 'kicker' }, e.title || 'Kadras'), h('h1', null, K.POLL.q)),
        h('div', { class: 'cnt', id: 'cnt' }, 'Atsakė: ' + ps.total)),
      h('div', { class: 'body pollscr' },
        h('div', { class: 'pbars big' }, K.POLL.opts.map(function (o, i) {
          var c = ps.counts[i] || 0;
          return h('div', { class: 'prow' }, h('span', null, o), h('b', null, String(c)),
            h('i', { style: 'width:' + Math.round(100 * c / max) + '%' }));
        })),
        h('div', { class: 'join' }, qr(K.guestUrl()), h('p', { class: 'adr' }, adr())))));
  }

  // «Фильм зала»: ролики раунда подряд на весь экран со звуком, в конце — титры.
  var film = { key: '', i: 0 };
  function filmScreen(st) {
    var V = st.photos.filter(function (p) { return p.kind === 'video' || K.isVideo(p.path); });
    var key = V.map(function (p) { return p.id; }).join();
    if (film.key === key && document.getElementById('film')) return;
    film.key = key; film.i = 0;
    var v = h('video', { id: 'filmv', playsinline: true, class: 'filmv' }), cap = h('div', { class: 'filmcap', id: 'filmcap' }), btn = h('button', { class: 'filmbtn', id: 'filmbtn' }, '▶ Paleisti filmą');
    // фон: то же видео, размытое и растянутое — вертикальный кадр занимает весь экран
    var bg = h('video', { id: 'filmbg', playsinline: true, class: 'filmbg' }); bg.muted = true;
    K.mount(h('div', { class: 'film', id: 'film' }, bg, v, cap, btn));
    function credits() {
      K.mount(h('div', { class: 'film credits' }, h('p', { class: 'kicker' }, e0.title || 'Kadras'), h('h1', null, 'Mūsų salės filmas 🎬'),
        h('p', null, 'Filmavo: ' + V.map(function (p) { return p.author || ('Nr. ' + p.num); }).join(' · '))));
    }
    var e0 = st.event;
    function play(i) {
      if (i >= V.length) return credits();
      film.i = i; v.src = api.url(V[i].path); bg.src = v.src; bg.play().catch(function () {});
      cap.textContent = 'Nr. ' + V[i].num + (V[i].author ? ' · ' + V[i].author : '') + '   ' + (i + 1) + ' / ' + V.length;
      var pr = v.play(); if (pr && pr.catch) pr.catch(function () { v.muted = true; v.play().catch(function () {}); btn.textContent = '🔊 Įjungti garsą'; btn.style.display = 'block'; });
    }
    v.onended = function () { play(film.i + 1); };
    btn.onclick = function () { btn.style.display = 'none'; v.muted = false; if (v.paused) play(film.i); };
    play(0);
  }

  function render() {
    var st = S.st;
    if (S.poll && S.poll.open && st && !st.error) return pollScreen(S.poll, st.event);
    if (st && !st.error && st.event.phase === 'results' && (K.isVideoTask(st.event) || /^ESTAFETA/i.test(st.event.task || '')) && st.photos.some(function (p) { return p.kind === 'video' || K.isVideo(p.path); })) return filmScreen(st);
    film.key = '';
    if (!st) return K.mount(h('div', { class: 'screen' }, h('h1', null, 'Jungiamasi…')));
    if (st.error) return K.mount(h('div', { class: 'screen' }, h('h1', null, 'Renginys nerastas: ' + K.event)));
    var e = st.event, ph = e.phase, P = st.photos, votes = ph === 'results' || ph === 'reveal';
    var max = 0, total = 0;
    P.forEach(function (p) { max = Math.max(max, p.votes || 0); total += p.votes || 0; });
    var winners = votes && max > 0 ? P.filter(function (p) { return (p.votes || 0) === max; }) : [];

    var title = ph === 'collect' ? (e.task || 'Siųskite savo kadrą') : ph === 'vote' ? 'Kurie kadrai patinka? Širdelės — telefone ❤️' :
      ph === 'results' ? 'Rezultatai' : ph === 'reveal' ? (winners.length ? (winners.length > 1 ? 'Nugalėtojai – Nr. ' : 'Nugalėtojas – Nr. ') + winners.map(function (p) { return p.num + (p.author ? ' · ' + p.author : ''); }).join(', Nr. ') : 'Kieno kadras?') :
      (e.title || 'Kadras');
    var cnt = ph === 'vote' ? 'Balsavo: ' + st.voters : votes ? 'Balsų: ' + total : 'Kadrų: ' + P.length;

    var body;
    if (!P.length) {
      body = h('div', { class: 'join full' }, qr(K.guestUrl()),
        h('div', { class: 'steps' },
          h('p', null, h('b', null, '1'), 'Nukreipkite telefono kamerą į kodą'),
          h('p', null, h('b', null, '2'), 'Įrašykite savo vardą'),
          h('p', null, h('b', null, '3'), 'Fotografuokite ir siųskite'),
          h('p', { class: 'adr' }, adr())));
    } else {
      var small = P.length > 12;
      var wall = h('div', { class: 'wall', id: 'wall' }, P.map(function (p) {
        var cap = null;
        if (/^DVIKOVA/i.test(e.task || '') && p.num === 1 && ph === 'collect') cap = h('div', { class: 'cap duel' }, h('span', null, '⚡ PIRMAS!'), h('b', null, '1'));
        else if (ph === 'reveal') cap = h('div', { class: 'cap' }, h('span', null, (p.author || '') + (p.phone ? ' · ' + p.phone : '')), h('b', null, String(p.votes || 0)));
        else if (ph === 'results') cap = h('div', { class: 'cap' }, h('span', null, balsai(p.votes || 0)), h('b', null, String(p.votes || 0)));
        var fresh = !SEEN[p.id]; SEEN[p.id] = 1;
        return h('div', { class: 'tile' + (winners.indexOf(p) >= 0 ? ' win' : '') + (fresh && FIRST ? ' pop' : '') },
          p.kind === 'video' || K.isVideo(p.path) ? h('video', { src: api.url(p.path), poster: api.url(K.thumb(p.path)), muted: true, autoplay: true, loop: true, playsinline: true, class: 'tv' }) : h('img', { src: api.url(small ? K.thumb(p.path) : p.path), alt: '' }), h('span', { class: 'n' }, String(p.num)), cap,
          ph === 'results' && max > 0 && h('i', { class: 'vb', style: 'width:' + Math.round(100 * (p.votes || 0) / max) + '%' }));
      }));
      body = [wall, (ph === 'collect' || ph === 'vote') && h('div', { class: 'join' }, qr(K.guestUrl()), h('p', { class: 'adr' }, adr()))];
    }
    K.mount(h('div', { class: 'screen' },
      h('header', null,
        h('div', null, h('p', { class: 'kicker' }, (e.title || 'Kadras') + (e.round > 1 ? ' · ' + e.round + ' raundas' : '')), h('h1', null, title)),
        h('div', { class: 'cnt', id: 'cnt' }, cnt)),
      h('div', { class: 'body' }, body)));
    layout();
    if (P.length) FIRST = true;
    if (K.isDuel(e)) duelOverlay();
    if (K.isRelay(e)) relayOverlay();
  }
  // Эстафета на большом экране: «Dabar filmuoja Nr. X» и отсчёт
  var rtimer = null;
  function relayOverlay() {
    if (rtimer) return;
    rtimer = setInterval(function () {
      if (!S.st || !K.isRelay(S.st.event)) { clearInterval(rtimer); rtimer = null; var o = document.getElementById('rov'); if (o) o.remove(); return; }
      K.relayFetch('').then(function (rs) { S.rs = rs; rdraw(); }).catch(function () {});
    }, 1000);
  }
  function rdraw() {
    var rs = S.rs, o = document.getElementById('rov');
    if (!o) { o = h('div', { class: 'rov', id: 'rov' }); document.body.appendChild(o); }
    if (!rs.relay_at) { o.innerHTML = '<b>Estafeta 🎬</b><span>Prisijungė: ' + rs.n + '</span>'; return; }
    var now = K.relayNow(rs), t0 = new Date(rs.relay_at).getTime(), sec = (rs.sec || 5) * 1000;
    if (now < t0) { o.innerHTML = '<b>' + Math.ceil((t0 - now) / 1000) + '</b><span>Estafeta prasideda · ' + rs.n + ' dalyviai</span>'; setTimeout(rdraw, 250); return; }
    var k = Math.floor((now - t0) / sec) + 1;
    if (k > rs.n) { o.remove(); return; }
    o.innerHTML = '<b>Nr. ' + k + '</b><span>dabar filmuoja · liko ' + Math.ceil((t0 + k * sec - now) / 1000) + ' s · ' + k + ' / ' + rs.n + '</span>';
    setTimeout(rdraw, 250);
  }
  // Фотодуэль на большом экране: огромный отсчёт 5-4-3-2-1 и вспышка
  var dtimer = null;
  function duelOverlay() {
    if (dtimer) return;
    dtimer = setInterval(function () {
      if (!S.st || !K.isDuel(S.st.event)) { clearInterval(dtimer); dtimer = null; var o = document.getElementById('dov'); if (o) o.remove(); return; }
      K.duelFetch().then(function (ds) { S.ds = ds; dtick(); }).catch(function () {});
    }, 900);
  }
  function dtick() {
    var left = K.duelLeft(S.ds), o = document.getElementById('dov');
    if (left === null || left < -1500) { if (o) o.remove(); return; }
    if (!o) { o = h('div', { class: 'dov', id: 'dov' }); document.body.appendChild(o); }
    if (left > 0) { o.textContent = String(Math.ceil(left / 1000)); o.className = 'dov'; setTimeout(dtick, Math.min(250, left)); }
    else { o.textContent = '📸'; o.className = 'dov flash'; setTimeout(dtick, 400); }
  }

  function refresh() {
    return Promise.all([api.state(''), api.pollState('').catch(function () { return null; })]).then(function (rr) {
      var st = rr[0]; S.st = st; S.poll = rr[1] && !rr[1].error ? rr[1] : null;
      var key = st.error ? 'x' : JSON.stringify([st.event, st.photos, S.poll]);
      if (key !== S.key) { S.key = key; render(); }
      else { var c = document.getElementById('cnt'); if (c && st.event && st.event.phase === 'vote') c.textContent = 'Balsavo: ' + st.voters; }
    });
  }

  window.addEventListener('resize', layout);
  render();
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  s.onload = function () { S.key = ''; refresh(); };
  document.head.appendChild(s);
  K.poll(refresh, 2500);
})();
