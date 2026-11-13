// Большой экран: QR для входа → стена кадров с номерами → столбики голосов → имена и телефоны.
(function () {
  var K = window.K, h = K.h, api = K.api;
  if (K.role !== 'screen') return;
  var S = { st: null, key: '', poll: null }, SEEN = {}, FIRST = false;

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

  function render() {
    var st = S.st;
    if (S.poll && S.poll.open && st && !st.error) return pollScreen(S.poll, st.event);
    if (!st) return K.mount(h('div', { class: 'screen' }, h('h1', null, 'Jungiamasi…')));
    if (st.error) return K.mount(h('div', { class: 'screen' }, h('h1', null, 'Renginys nerastas: ' + K.event)));
    var e = st.event, ph = e.phase, P = st.photos, votes = ph === 'results' || ph === 'reveal';
    var max = 0, total = 0;
    P.forEach(function (p) { max = Math.max(max, p.votes || 0); total += p.votes || 0; });
    var winners = votes && max > 0 ? P.filter(function (p) { return (p.votes || 0) === max; }) : [];

    var title = ph === 'collect' ? (e.task || 'Siųskite savo kadrą') : ph === 'vote' ? 'Kuris kadras geriausias? Balsuokite telefone' :
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
          h('img', { src: api.url(small ? K.thumb(p.path) : p.path), alt: '' }), h('span', { class: 'n' }, String(p.num)), cap,
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
