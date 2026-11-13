// Пульт ведущего (по-русски): фазы, задание, раунды, скрыть кадр, удалить всё после воркшопа.
(function () {
  var K = window.K, h = K.h, api = K.api;
  if (K.role !== 'host') return;
  var PK = 'kadras_pin_' + K.event;
  var S = { pin: '', st: null, key: '', err: '', busy: false, task: null, poll: null };
  try { S.pin = sessionStorage.getItem(PK) || ''; } catch (e) {}

  var PHASES = [['wait', 'Пауза'], ['collect', 'Сбор кадров'], ['vote', 'Голосование'], ['results', 'Результаты'], ['reveal', 'Раскрыть авторов']];
  var PRESETS = [
    ['Пробный кадр', 'Bandomasis kadras: nufotografuokite bet ką šalia savęs ir siųskite.'],
    ['Свет', 'Nufotografuokite šalia sėdintį žmogų veidu į langą. Siųskite geriausią kadrą.'],
    ['Место и ракурс', 'Tas pats žmogus – trys kampai: iš viršaus, akių lygyje, iš apačios. Siųskite geriausią.'],
    ['Момент', 'Nufotografuokite, kaip jūsų kaimynas nusijuokia. Prašyti nusijuokti – draudžiama.'],
    ['Общая сцена', 'Vienas įvykis, vienas dublis. Siųskite savo kadrą.'],
    ['Слепой тест №2', 'Jūsų geriausias šios dienos kadras.'],
    ['Эстафета (каждый по 5 с)', 'ESTAFETA: kiekvienas — 5 sekundės. Nustebinkite!'],
    ['Фильм зала (видео 5 с)', 'VIDEO: vienas įvykis, vienas dublis — nufilmuokite 5 sekundes ir siųskite.'],
    ['Фотодуэль', 'DVIKOVA! Nugara į nugarą, 3 žingsniai, atsisukite ir fotografuokite. Kas pirmas?']
  ];
  var ERR = { wrong_pin: 'Неверный код.', locked: 'Слишком много попыток — подождите 30 секунд.', bad_pin: 'Код — от 4 знаков.', no_event: 'Событие не найдено: ' + K.event };

  function call(action, arg) {
    S.busy = true;
    return api.host(S.pin, action, arg).then(function (r) {
      S.busy = false;
      if (r.error) { S.err = ERR[r.error] || ('Ошибка: ' + r.error); if (r.error === 'wrong_pin') S.st = null; render(); return null; }
      S.err = ''; S.st = r; S.key = JSON.stringify(r); render();
      return r;
    }).catch(function () { S.busy = false; S.err = 'Нет связи с базой. Проверьте интернет.'; render(); return null; });
  }
  function login(pin) {
    S.pin = pin; S.err = '';
    api.host(pin, 'state').then(function (r) {
      if (r.error === 'no_pin_yet') return api.host(pin, 'set_pin');
      return r;
    }).then(function (r) {
      if (r.error) { S.err = ERR[r.error] || ('Ошибка: ' + r.error); S.st = null; render(); return; }
      try { sessionStorage.setItem(PK, pin); } catch (e) {}
      S.st = r; S.key = JSON.stringify(r); render(); pollCall('state');
    }).catch(function () { S.err = 'Нет связи с базой. Проверьте интернет.'; render(); });
  }
  function purge() {
    if (!confirm('Удалить ВСЕ фото и голоса события «' + K.event + '»? Вернуть будет нельзя.')) return;
    call('purge_begin').then(function (r) {
      if (!r) return;
      return api.remove(r.paths || []).then(function () { return call('purge_end'); })
        .catch(function () { S.err = 'Файлы удалить не вышло — нажмите «Удалить все фото» ещё раз.'; render(); });
    });
  }
  function pollCall(action) {
    if (action === 'clear' && !confirm('Очистить все ответы опроса?')) return;
    api.pollHost(S.pin, action).then(function (r) {
      if (r.error) { S.err = ERR[r.error] || ('Опрос: ' + r.error); render(); return; }
      S.poll = r; render();
    }).catch(function () { S.err = 'Нет связи с базой.'; render(); });
  }
  function pollBox() {
    var P = S.poll;
    if (!P) return h('div', { class: 'box' }, h('p', null, 'Опрос на входе: загрузка…'));
    return h('div', { class: 'box' },
      h('p', null, 'Опрос «' + K.POLL.q + '» — ', h('b', null, P.open ? 'ОТКРЫТ' : 'закрыт'), ' · ответили: ', h('b', null, String(P.total)),
        P.open ? ' · большой экран показывает опрос' : ''),
      h('div', { class: 'line' },
        h('button', { class: P.open ? '' : 'on', onclick: function () { pollCall(P.open ? 'close' : 'open'); } }, P.open ? 'Закрыть опрос (экран — к кадрам)' : 'Открыть опрос'),
        h('button', { class: 'red', onclick: function () { pollCall('clear'); } }, 'Очистить ответы')),
      h('div', { style: 'font-size:15px;line-height:1.5' }, K.POLL.opts.map(function (o, i) { return h('div', null, (P.counts[i] || 0) + ' — ' + o); })),
      P.texts && P.texts.length ? h('p', { style: 'font-size:15px' }, 'Свои варианты: ' + P.texts.join(' · ')) : null);
  }
  function link(extra) {
    var p = [];
    if (K.event !== 'kufa') p.push('e=' + K.event);
    if (K.q.has('demo')) p.push('demo');
    if (extra) p.push(extra);
    return location.pathname + (p.length ? '?' + p.join('&') : '');
  }

  function render() {
    var st = S.st;
    if (!st) {
      var i = h('input', { type: 'password', placeholder: 'Код ведущего', autocomplete: 'off' });
      return K.mount(h('div', { class: 'host' },
        h('h1', null, 'Пульт · ' + K.event),
        h('div', { class: 'box' },
          h('p', null, 'Введите код ведущего. Если кода ещё нет — тот, что вы введёте первым, им и станет (от 4 знаков). Запомните его: кроме вас его никто не знает.'),
          i, h('div', { class: 'line' }, h('button', { class: 'on', onclick: function () { login(i.value.trim()); } }, 'Войти')),
          S.err && h('p', { style: 'color:var(--red);font-weight:700' }, S.err))));
    }
    var e = st.event, phName = '';
    PHASES.forEach(function (p) { if (p[0] === e.phase) phName = p[1]; });
    if (e.phase === 'purge') phName = 'Удаление…';
    var ta = h('textarea', { rows: 2, id: 'task', oninput: function () { S.task = ta.value; } });
    ta.value = S.task === null ? e.task : S.task;

    K.mount(h('div', { class: 'host' },
      h('h1', null, 'Пульт · ' + (e.title || e.id)),
      S.err && h('p', { style: 'color:var(--red);font-weight:700' }, S.err),
      pollBox(),
      /^ESTAFETA/i.test(e.task || '') && e.phase === 'collect' && h('div', { class: 'box' },
        h('p', null, 'Эстафета: все жмут «Prisijungti» (камера включается). Жми старт — номера раздадутся случайно, каждый снимет свои 5 секунд по очереди. Потом «Результаты» — общий фильм.'),
        h('div', { class: 'line' }, h('button', { class: 'on', style: 'font-size:22px;padding:18px 26px', onclick: function () {
          api.relayStart(S.pin, 5).then(function (r) { S.err = r.error ? (ERR[r.error] || ('Эстафета: ' + r.error)) : ('Эстафета пошла: участников ' + r.n); render(); });
        } }, '🎬 СТАРТ ЭСТАФЕТЫ'))),
      /^DVIKOVA/i.test(e.task || '') && e.phase === 'collect' && h('div', { class: 'box' },
        h('p', null, 'Фотодуэль: двое с открытой страницей нажали «Įjungti kamerą» → встали спиной к спине → жми старт. На «0» телефоны снимут сами.'),
        h('div', { class: 'line' }, h('button', { class: 'on', style: 'font-size:22px;padding:18px 26px', onclick: function () {
          api.duelStart(S.pin, 6).then(function (r) { if (r.error) { S.err = ERR[r.error] || ('Дуэль: ' + r.error); render(); } });
        } }, '🔫 СТАРТ ДУЭЛИ (5…1)'))),
      h('div', { class: 'box' },
        h('p', null, 'Раунд ', h('b', null, String(e.round)), ' · сейчас: ', h('b', null, phName), ' · кадров в раунде: ', h('b', null, String(st.photos.length)),
          ' · проголосовало: ', h('b', null, String(st.voters)), ' · всего кадров: ' + st.total),
        h('div', { class: 'line' }, PHASES.map(function (p) {
          return h('button', { class: e.phase === p[0] ? 'on' : '', onclick: function () { call('phase', { phase: p[0] }); } }, p[1]);
        })),
        h('p', { style: 'color:var(--mut);font-size:14px' }, 'Сбор кадров — зал снимает и шлёт. Голосование — приём закрыт, на телефонах все кадры. Результаты — столбики без имён. Раскрыть авторов — имена, телефоны, победитель.')),
      h('div', { class: 'box' },
        h('p', null, 'Задание (видят телефоны и экран):'), ta,
        h('div', { class: 'line' }, PRESETS.map(function (p) {
          return h('button', { onclick: function () { S.task = p[1]; ta.value = p[1]; } }, p[0]);
        })),
        h('div', { class: 'line' },
          h('button', { class: 'on', onclick: function () { var t = ta.value; S.task = null; call('task', { task: t }); } }, 'Обновить задание'),
          h('button', { class: 'on', onclick: function () { var t = ta.value; S.task = null; call('round', { task: t }); } }, 'Новый раунд с этим заданием →'),
          e.round > 1 && h('button', { onclick: function () { S.task = null; call('goto', { round: e.round - 1 }); } }, '← показать раунд ' + (e.round - 1)),
          e.round !== 1 && h('button', { onclick: function () { S.task = null; call('goto', { round: 1 }); } }, '⏮ Раунд 1 — селфи у входа'))),
      h('div', { class: 'box' },
        h('div', { class: 'line' },
          h('a', { href: link('ekranas'), target: '_blank' }, 'Открыть большой экран'), ' · ',
          h('a', { href: link(), target: '_blank' }, 'Страница участника')),
        h('p', { style: 'word-break:break-all;color:var(--mut)' }, 'Адрес для зала: ' + K.guestUrl())),
      h('div', { class: 'box' },
        h('p', null, 'Кадры раунда ' + e.round + ':'),
        st.photos.length ? h('div', { class: 'ph' }, st.photos.map(function (p) {
          return h('div', { class: 'p' + (p.hidden ? ' off' : '') },
            h('img', { src: api.url(K.thumb(p.path)), alt: '', loading: 'lazy' }),
            h('div', null, '№ ' + p.num + ' · ' + p.author + (p.phone ? ' · ' + p.phone : '') + ' · голосов: ' + p.votes),
            h('div', null, h('button', { onclick: function () { call('hide', { id: p.id, hidden: !p.hidden }); } }, p.hidden ? 'Вернуть' : 'Скрыть')));
        })) : h('p', { style: 'color:var(--mut)' }, 'Пока пусто.')),
      h('div', { class: 'box' },
        h('p', null, 'После воркшопа: фото участников удаляем — это чужие лица.'),
        h('div', { class: 'line' }, h('button', { class: 'red', onclick: purge }, 'Удалить все фото')))));
  }

  render();
  if (S.pin) login(S.pin);
  K.poll(function () {
    if (!S.st || S.busy) return;
    api.pollHost(S.pin, 'state').then(function (r) {
      if (r.error) return;
      if (JSON.stringify(r) !== JSON.stringify(S.poll) && document.activeElement && document.activeElement.id !== 'task') { S.poll = r; render(); }
    }).catch(function () {});
    return api.host(S.pin, 'state').then(function (r) {
      if (r.error) return;
      var key = JSON.stringify(r);
      // не перерисовываем, пока ведущий печатает задание
      if (key !== S.key && document.activeElement && document.activeElement.id !== 'task') { S.st = r; S.key = key; render(); }
    });
  }, 3000);
})();
