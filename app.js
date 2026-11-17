/* Interface: tela Hoje, timer, histórico, conquistas e ajustes. */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var $ = function (id) { return document.getElementById(id); };
  var stats = null;
  var tickTimer = null;
  var audioCtx = null;
  var calMonth = null; // Date do 1º dia do mês exibido
  var selectedDay = null;
  var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  // ---------- utilidades ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = (m < 10 ? '0' : '') + m, ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }
  function fmtMin(sec) { return Math.floor(sec / 60) + ' min'; }
  function fmtHours(sec) {
    var h = sec / 3600;
    return h < 1 ? Math.floor(sec / 60) + ' min' : (Math.round(h * 10) / 10).toString().replace('.', ',') + ' h';
  }
  function toast(text, ms) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 2600);
  }

  // ---------- modal ----------
  function openModal(html, onBind) {
    $('modal-card').innerHTML = html;
    $('modal').classList.remove('hidden');
    if (onBind) onBind($('modal-card'));
  }
  function closeModal() { $('modal').classList.add('hidden'); $('modal-card').innerHTML = ''; }
  function confirmModal(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      openModal('<h3>' + esc(title) + '</h3><p class="muted">' + esc(text) + '</p>' +
        '<button class="btn ' + (danger ? 'danger' : 'primary') + '" data-ok>' + esc(okLabel || 'Confirmar') + '</button>' +
        '<button class="btn ghost" data-cancel>Cancelar</button>', function (c) {
        c.querySelector('[data-ok]').onclick = function () { closeModal(); resolve(true); };
        c.querySelector('[data-cancel]').onclick = function () { closeModal(); resolve(false); };
      });
    });
  }

  // ---------- som ----------
  function unlockAudio() {
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* noop */ }
  }
  function chime() {
    if (!audioCtx) return;
    var notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach(function (f, i) {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      var t = audioCtx.currentTime + i * 0.14;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.55);
    });
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  // ---------- cálculo ----------
  function recompute() {
    stats = Game.compute(Store.state.types, Store.state.sessions);
    return stats;
  }
  function todaySecFor(typeId) {
    var d = stats.days[stats.today];
    return d && d.byType[typeId] ? d.byType[typeId].sec : 0;
  }
  function activeElapsedSec() {
    var a = Store.state.active;
    if (!a) return 0;
    var end = a.pausedAt || Date.now();
    return Math.max(0, (end - a.startedAt - (a.pausedMs || 0)) / 1000);
  }

  /** Verifica novas conquistas e subida de nível (comparando com o que já foi mostrado). */
  function celebrateNews(xpGained) {
    var st = Store.state;
    var unlocked = Game.unlocked(stats);
    var fresh = unlocked.filter(function (id) { return st.seenAch.indexOf(id) < 0; });
    var leveled = stats.level > (st.seenLevel || 1);
    st.seenAch = unlocked;
    st.seenLevel = stats.level;
    Store.save();
    if (!fresh.length && !leveled && !xpGained) return;

    var html = '<div class="celebrate">';
    if (leveled) {
      html += '<div class="big-emoji">' + stats.title.icon + '</div><h3>Nível ' + stats.level + '!</h3>' +
        '<p class="muted">Você agora é <b>' + esc(stats.title.name) + '</b>.</p>';
    } else {
      html += '<div class="big-emoji">🙌</div><h3>Sessão concluída!</h3>';
    }
    if (xpGained) html += '<p><b>+' + xpGained + ' XP</b></p>';
    if (stats.streak) html += '<p class="muted">🔥 Sequência: ' + stats.streak + (stats.streak === 1 ? ' dia' : ' dias') + '</p>';
    fresh.forEach(function (id) {
      var a = Game.ACHIEVEMENTS.filter(function (x) { return x.id === id; })[0];
      if (a) html += '<p>' + a.icon + ' Conquista: <b>' + esc(a.name) + '</b></p>';
    });
    html += '<button class="btn primary" data-ok>Amém!</button></div>';
    openModal(html, function (c) { c.querySelector('[data-ok]').onclick = closeModal; });
    if (leveled || fresh.length) chime();
  }

  // ---------- render: Hoje ----------
  function renderHero() {
    $('level-title').textContent = stats.title.icon + ' ' + stats.title.name;
    $('level-num').textContent = stats.level;
    $('streak-num').textContent = stats.streak;
    $('streak-best').textContent = stats.bestStreak;
    $('xp-fill').style.width = Math.min(100, (stats.levelInto / stats.levelNeed) * 100) + '%';
    $('xp-text').textContent = stats.levelInto + ' / ' + stats.levelNeed + ' XP';
    $('xp-total').textContent = stats.xp + ' XP no total';
  }

  function renderToday() {
    var d = new Date();
    $('today-date').textContent = WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
    var types = Store.activeTypes();
    var html = '';
    types.forEach(function (t) {
      var sec = todaySecFor(t.id);
      var goal = t.goalMin * 60;
      var pct = Math.min(100, goal ? (sec / goal) * 100 : 0);
      var met = sec >= goal;
      html += '<div class="card" style="border-left-color:' + esc(t.color) + '">' +
        '<div class="card-head"><div class="card-title">' + esc(t.name) + '</div><div class="card-check">' + (met ? '✅' : '') + '</div></div>' +
        '<div class="card-sub">Meta <b>' + t.goalMin + ' min</b> · Feito <b>' + Math.floor(sec / 60) + ' min</b></div>' +
        '<div class="progress"><div style="width:' + pct + '%;background:' + esc(t.color) + '"></div></div>' +
        '<button class="btn ' + (met ? '' : 'primary') + '" data-start="' + esc(t.id) + '">' + (met ? 'Fazer mais' : 'Iniciar') + '</button>' +
        '</div>';
    });
    $('today-cards').innerHTML = html;
    var dd = stats.days[stats.today];
    var hint = '';
    if (dd && dd.allMet) hint = '🏆 Todas as metas de hoje concluídas!';
    else if (!dd || !dd.valid) hint = stats.streak ? 'Bata uma meta hoje para manter sua sequência de ' + stats.streak + ' dias 🔥' : 'Bata uma meta hoje para começar sua sequência.';
    $('today-hint').textContent = hint;
  }

  // ---------- render: Histórico ----------
  function renderCalendar() {
    if (!calMonth) { var n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
    $('cal-title').textContent = MONTHS[calMonth.getMonth()] + ' ' + calMonth.getFullYear();
    var first = calMonth.getDay();
    var daysIn = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
    var html = '';
    for (var i = 0; i < first; i++) html += '<span class="cal-day empty"></span>';
    for (var day = 1; day <= daysIn; day++) {
      var key = Game.dayKey(new Date(calMonth.getFullYear(), calMonth.getMonth(), day).getTime());
      var info = stats.days[key];
      var cls = 'cal-day';
      if (info) cls += info.allMet ? ' l3' : info.valid ? ' l2' : ' l1';
      if (key === stats.today) cls += ' today';
      if (key === selectedDay) cls += ' sel';
      html += '<button class="' + cls + '" data-day="' + key + '">' + day + '</button>';
    }
    $('cal-grid').innerHTML = html;
    renderDayDetail();
    renderStats();
  }

  function renderDayDetail() {
    var el = $('day-detail');
    if (!selectedDay) { el.innerHTML = ''; return; }
    var info = stats.days[selectedDay];
    var dt = Game.keyToDate(selectedDay);
    var html = '<h2 class="section-title">' + WEEKDAYS[dt.getDay()] + ', ' + dt.getDate() + ' de ' + MONTHS[dt.getMonth()] + '</h2>';
    if (!info) html += '<p class="muted">Nenhuma atividade neste dia.</p>';
    else {
      if (info.xp) html += '<p class="muted tiny">' + info.xp + ' XP' + (info.streak ? ' · sequência de ' + info.streak : '') + '</p>';
      info.sessions.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (s) {
        var t = Store.typeById(s.typeId);
        var hr = new Date(s.start);
        html += '<div class="item"><div class="card-head"><b>' + esc(t ? t.name : 'Atividade') + ' · ' + fmtMin(s.durationSec) + '</b>' +
          '<button class="link tiny" data-del="' + esc(s.id) + '">remover</button></div>' +
          '<div class="tiny muted">' + (hr.getHours() < 10 ? '0' : '') + hr.getHours() + ':' + (hr.getMinutes() < 10 ? '0' : '') + hr.getMinutes() +
          (s.passage ? ' · ' + esc(s.passage) : '') + '</div>' +
          (s.note ? '<div class="note">' + esc(s.note) + '</div>' : '') + '</div>';
      });
    }
    if (selectedDay <= stats.today) html += '<button class="btn ghost" id="manual-add">+ Registrar manualmente</button>';
    el.innerHTML = html;
    var m = $('manual-add');
    if (m) m.onclick = function () { manualEntry(selectedDay); };
  }

  function renderStats() {
    var weekSec = 0;
    for (var i = 0; i < 7; i++) {
      var d = stats.days[Game.addDays(stats.today, -i)];
      if (d) weekSec += d.totalSec;
    }
    $('stats').innerHTML =
      '<div class="stat"><b>' + fmtHours(stats.totalSec) + '</b><span class="tiny muted">tempo total</span></div>' +
      '<div class="stat"><b>' + stats.sessionCount + '</b><span class="tiny muted">sessões</span></div>' +
      '<div class="stat"><b>' + stats.activeDays + '</b><span class="tiny muted">dias com atividade</span></div>' +
      '<div class="stat"><b>' + fmtMin(weekSec / 7) + '</b><span class="tiny muted">média/dia (7 dias)</span></div>';
  }

  // ---------- render: Conquistas ----------
  function renderAchievements() {
    var un = Game.unlocked(stats);
    $('ach-count').textContent = un.length + ' de ' + Game.ACHIEVEMENTS.length;
    $('ach-list').innerHTML = Game.ACHIEVEMENTS.map(function (a) {
      var ok = un.indexOf(a.id) >= 0;
      return '<div class="ach' + (ok ? '' : ' locked') + '"><div class="icon">' + a.icon + '</div>' +
        '<div class="name">' + esc(a.name) + '</div><div class="tiny muted">' + esc(a.desc) + '</div></div>';
    }).join('');
  }

  // ---------- render: Ajustes ----------
  function renderSettings() {
    $('types-list').innerHTML = Store.activeTypes().map(function (t) {
      return '<div class="type-row"><span class="sw" style="background:' + esc(t.color) + '"></span>' +
        '<div class="info"><b>' + esc(t.name) + '</b><div class="tiny muted">meta diária: ' + t.goalMin + ' min</div></div>' +
        '<button class="btn ghost small" data-edit="' + esc(t.id) + '">Editar</button></div>';
    }).join('');
    var info;
    if (!Auth.enabled) info = 'Modo local: os dados ficam só neste aparelho. Configure o Supabase em config.js para ter login e sincronização.';
    else info = 'Conectado como ' + esc((Auth.user && Auth.user.email) || '') + '.';
    $('account-info').innerHTML = info;
    $('sync-now').classList.toggle('hidden', !Auth.enabled);
    $('logout').classList.toggle('hidden', !Auth.enabled);
    $('version').textContent = 'Devocional v' + VERSION;
  }

  function renderSyncBadge(s) {
    var el = $('sync-badge');
    if (!Auth.enabled) { el.textContent = ''; return; }
    var p = Sync.pending();
    var map = {
      syncing: '⟳ Sincronizando…',
      synced: p ? '⟳ ' + p + ' pendente(s)' : '☁️ Sincronizado',
      offline: '📴 Offline' + (p ? ' · ' + p + ' pendente(s)' : ''),
      error: '⚠️ Erro ao sincronizar' + (p ? ' · ' + p + ' pendente(s)' : ''),
      local: ''
    };
    el.textContent = map[s.state] || '';
  }

  function renderAll() {
    recompute();
    renderHero();
    renderToday();
    renderCalendar();
    renderAchievements();
    renderSettings();
    renderSyncBadge(Sync.status);
  }

  // ---------- navegação ----------
  function showView(name) {
    ['today', 'history', 'achievements', 'settings'].forEach(function (v) {
      $('view-' + v).classList.toggle('hidden', v !== name);
    });
    document.querySelectorAll('#tabbar button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === name);
    });
    window.scrollTo(0, 0);
  }

  // ---------- timer ----------
  function startTimer(typeId) {
    unlockAudio();
    var t = Store.typeById(typeId);
    var already = todaySecFor(typeId);
    Store.state.active = { typeId: typeId, startedAt: Date.now(), pausedAt: null, pausedMs: 0,
      goalNotified: already >= t.goalMin * 60 };
    Store.save();
    openTimer();
  }

  function openTimer() {
    $('timer').classList.remove('hidden');
    $('tabbar').classList.add('hidden');
    tick();
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 500);
  }

  function closeTimer() {
    clearInterval(tickTimer);
    $('timer').classList.add('hidden');
    $('tabbar').classList.remove('hidden');
  }

  var CIRC = 2 * Math.PI * 52;
  function tick() {
    var a = Store.state.active;
    if (!a) return closeTimer();
    var t = Store.typeById(a.typeId);
    if (!t) { Store.state.active = null; Store.save(); return closeTimer(); }
    var el = activeElapsedSec();
    var before = todaySecFor(t.id);
    var goal = t.goalMin * 60;
    var total = before + el;
    var frac = goal ? Math.min(1, total / goal) : 1;
    var done = total >= goal;

    $('timer-type').textContent = t.name;
    $('timer-clock').textContent = fmtClock(el);
    $('timer-goal').textContent = 'hoje ' + Math.floor(total / 60) + ' / ' + t.goalMin + ' min';
    var ring = $('ring-fg');
    ring.style.strokeDasharray = CIRC;
    ring.style.strokeDashoffset = CIRC * (1 - frac);
    ring.style.stroke = done ? '' : t.color;
    ring.classList.toggle('done', done);
    var status = $('timer-status');
    status.className = 'timer-status' + (done ? ' done' : '');
    status.textContent = a.pausedAt ? '⏸ Pausado' : done ? '🎉 Meta batida! Continue para ganhar bônus' : 'Faltam ' + fmtClock(goal - total);
    $('timer-pause').textContent = a.pausedAt ? 'Continuar' : 'Pausar';
    $('timer-xp').textContent = '+' + Math.floor(el / 60) + ' min nesta sessão';

    if (done && !a.goalNotified) {
      a.goalNotified = true;
      Store.save();
      chime();
      toast('🎯 Meta de ' + t.name + ' batida! +20 XP');
    }
  }

  function togglePause() {
    var a = Store.state.active;
    if (!a) return;
    if (a.pausedAt) { a.pausedMs += Date.now() - a.pausedAt; a.pausedAt = null; }
    else a.pausedAt = Date.now();
    Store.save();
    tick();
  }

  async function stopTimer() {
    var a = Store.state.active;
    if (!a) return;
    if (!a.pausedAt) { a.pausedAt = Date.now(); Store.save(); }
    var el = Math.floor(activeElapsedSec());
    if (el < 60) {
      var keep = await confirmModal('Sessão muito curta', 'Sessões com menos de 1 minuto não dão XP. Deseja descartar?', 'Descartar', true);
      if (keep) { Store.state.active = null; Store.save(); closeTimer(); renderAll(); }
      else { togglePause(); }
      return;
    }
    var t = Store.typeById(a.typeId);
    openModal('<h3>' + esc(t.name) + ' · ' + fmtClock(el) + '</h3>' +
      '<label>O que você leu? (opcional)<input id="f-passage" placeholder="Ex.: Salmos 23" maxlength="120"></label>' +
      '<label>Anotação / reflexão (opcional)<textarea id="f-note" maxlength="4000" placeholder="O que Deus falou com você hoje?"></textarea></label>' +
      '<button class="btn primary" data-save>Salvar sessão</button>' +
      '<button class="btn ghost" data-back>Voltar ao timer</button>', function (c) {
      c.querySelector('[data-back]').onclick = function () { closeModal(); togglePause(); };
      c.querySelector('[data-save]').onclick = function () {
        saveSession(a, el, $('f-passage').value.trim(), $('f-note').value.trim());
      };
    });
  }

  function saveSession(a, el, passage, note) {
    var t = Store.typeById(a.typeId);
    var xpBefore = stats.xp;
    Store.addSession({ typeId: a.typeId, start: a.startedAt, end: a.startedAt + el * 1000 + (a.pausedMs || 0),
      durationSec: el, goalMin: t.goalMin, passage: passage, note: note });
    Store.state.active = null;
    Store.save();
    closeModal();
    closeTimer();
    renderAll();
    celebrateNews(stats.xp - xpBefore);
    syncNow();
  }

  function manualEntry(dayKeyStr) {
    var types = Store.activeTypes();
    openModal('<h3>Registrar manualmente</h3><p class="muted tiny">Para quando você esqueceu de iniciar o timer.</p>' +
      '<label>Atividade<select id="m-type">' + types.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'; }).join('') + '</select></label>' +
      '<label>Minutos<input id="m-min" type="number" inputmode="numeric" min="1" max="600" value="10"></label>' +
      '<label>O que você leu? (opcional)<input id="m-passage" maxlength="120"></label>' +
      '<label>Anotação (opcional)<textarea id="m-note" maxlength="4000"></textarea></label>' +
      '<button class="btn primary" data-save>Salvar</button><button class="btn ghost" data-cancel>Cancelar</button>', function (c) {
      c.querySelector('[data-cancel]').onclick = closeModal;
      c.querySelector('[data-save]').onclick = function () {
        var min = Math.max(1, Math.min(600, parseInt($('m-min').value, 10) || 0));
        var t = Store.typeById($('m-type').value);
        var base = Game.keyToDate(dayKeyStr);
        var nowD = new Date();
        base.setHours(dayKeyStr === stats.today ? nowD.getHours() : 12, dayKeyStr === stats.today ? nowD.getMinutes() : 0, 0, 0);
        var start = base.getTime() - (dayKeyStr === stats.today ? min * 60000 : 0);
        if (Game.dayKey(start) !== dayKeyStr) start = Game.keyToDate(dayKeyStr).getTime();
        var xpBefore = stats.xp;
        Store.addSession({ typeId: t.id, start: start, end: start + min * 60000, durationSec: min * 60,
          goalMin: t.goalMin, passage: $('m-passage').value.trim(), note: $('m-note').value.trim() });
        closeModal();
        renderAll();
        celebrateNews(stats.xp - xpBefore);
        syncNow();
      };
    });
  }

  // ---------- tipos ----------
  function editType(id) {
    var t = id ? Store.typeById(id) : { id: Store.uuid(), name: '', goalMin: 10, color: Store.COLORS[Store.state.types.length % Store.COLORS.length], archived: false };
    var color = t.color;
    openModal('<h3>' + (id ? 'Editar atividade' : 'Nova atividade') + '</h3>' +
      '<label>Nome<input id="t-name" maxlength="40" value="' + esc(t.name) + '" placeholder="Ex.: Oração"></label>' +
      '<label>Meta diária (minutos)<input id="t-goal" type="number" inputmode="numeric" min="1" max="600" value="' + t.goalMin + '"></label>' +
      '<div class="tiny muted">Cor</div><div class="colors">' + Store.COLORS.map(function (c) {
        return '<button type="button" data-color="' + c + '" class="' + (c === color ? 'sel' : '') + '" style="background:' + c + '"></button>';
      }).join('') + '</div>' +
      '<button class="btn primary" data-save>Salvar</button>' +
      (id ? '<button class="btn danger" data-archive>Remover atividade</button>' : '') +
      '<button class="btn ghost" data-cancel>Cancelar</button>', function (c) {
      c.querySelectorAll('[data-color]').forEach(function (b) {
        b.onclick = function () {
          color = b.getAttribute('data-color');
          c.querySelectorAll('[data-color]').forEach(function (x) { x.classList.toggle('sel', x === b); });
        };
      });
      c.querySelector('[data-cancel]').onclick = closeModal;
      c.querySelector('[data-save]').onclick = function () {
        var name = $('t-name').value.trim();
        var goal = Math.max(1, Math.min(600, parseInt($('t-goal').value, 10) || 0));
        if (!name) { $('t-name').focus(); return; }
        Store.upsertType({ id: t.id, name: name, goalMin: goal, color: color, archived: false });
        closeModal(); renderAll(); syncNow();
      };
      var arch = c.querySelector('[data-archive]');
      if (arch) arch.onclick = async function () {
        if (Store.activeTypes().length <= 1) { toast('Mantenha pelo menos uma atividade.'); return; }
        closeModal();
        var ok = await confirmModal('Remover "' + t.name + '"?', 'O histórico dessa atividade continua guardado e contando para seu XP.', 'Remover', true);
        if (!ok) return;
        Store.upsertType(Object.assign({}, t, { archived: true }));
        renderAll(); syncNow();
      };
    });
  }

  // ---------- sincronização ----------
  function syncNow() {
    if (!Auth.enabled || !Auth.user) return Promise.resolve();
    return Sync.sync(Auth.client, Auth.user.id).then(function (changed) {
      if (changed) {
        renderAll();
        // não celebra conquistas antigas vindas de outro aparelho
        Store.state.seenAch = Game.unlocked(stats);
        Store.state.seenLevel = Math.max(Store.state.seenLevel || 1, stats.level);
        Store.save();
      }
      renderSyncBadge(Sync.status);
    });
  }

  // ---------- eventos ----------
  function bindEvents() {
    document.querySelectorAll('#tabbar button').forEach(function (b) {
      b.addEventListener('click', function () { showView(b.getAttribute('data-view')); });
    });
    $('today-cards').addEventListener('click', function (e) {
      var b = e.target.closest('[data-start]');
      if (b) startTimer(b.getAttribute('data-start'));
    });
    $('timer-pause').addEventListener('click', togglePause);
    $('timer-stop').addEventListener('click', stopTimer);
    $('timer-cancel').addEventListener('click', async function () {
      var ok = await confirmModal('Descartar sessão?', 'O tempo desta sessão não será salvo.', 'Descartar', true);
      if (ok) { Store.state.active = null; Store.save(); closeTimer(); renderAll(); }
    });

    $('cal-prev').addEventListener('click', function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); });
    $('cal-next').addEventListener('click', function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); });
    $('cal-grid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-day]');
      if (!b) return;
      selectedDay = b.getAttribute('data-day');
      renderCalendar();
    });
    $('day-detail').addEventListener('click', async function (e) {
      var b = e.target.closest('[data-del]');
      if (!b) return;
      var ok = await confirmModal('Remover sessão?', 'Os pontos dessa sessão serão descontados.', 'Remover', true);
      if (!ok) return;
      Store.deleteSession(b.getAttribute('data-del'));
      renderAll(); syncNow();
    });

    $('types-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-edit]');
      if (b) editType(b.getAttribute('data-edit'));
    });
    $('type-add').addEventListener('click', function () { editType(null); });

    $('sync-now').addEventListener('click', function () {
      Store.state.lastPull = 0; Store.save();
      syncNow().then(function () { toast(Sync.status.state === 'synced' ? 'Sincronizado ☁️' : 'Não foi possível sincronizar agora'); });
    });
    $('logout').addEventListener('click', async function () {
      await syncNow();
      var p = Sync.pending();
      var ok = await confirmModal('Sair deste aparelho?',
        p ? 'Atenção: ' + p + ' registro(s) ainda não foram enviados para a nuvem e serão perdidos.' : 'Seus dados estão salvos na nuvem. Para entrar de novo, use o e-mail e o código do autenticador.',
        'Sair', !!p);
      if (ok) Auth.logout();
    });

    $('export').addEventListener('click', function () {
      var blob = new Blob([Store.exportData()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'devocional-backup-' + Game.dayKey(Date.now()) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
    $('import').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var n = Store.importData(reader.result);
          renderAll(); syncNow();
          toast(n + ' registro(s) importado(s)');
        } catch (e) { toast('Não foi possível importar: ' + e.message); }
      };
      reader.readAsText(f);
      this.value = '';
    });
    $('reset').addEventListener('click', async function () {
      var ok = await confirmModal('Apagar dados deste aparelho?',
        Auth.enabled ? 'Os dados locais serão apagados. O que já foi sincronizado volta na próxima sincronização.' : 'Todo o seu histórico e progresso serão apagados. Exporte um backup antes se quiser guardar.',
        'Apagar', true);
      if (!ok) return;
      Store.reset(true);
      renderAll(); syncNow();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        renderAll();
        if (Store.state.active) tick();
        syncNow();
      }
    });
    window.addEventListener('online', syncNow);
    window.addEventListener('offline', function () { Sync.setStatus('offline'); renderSyncBadge(Sync.status); });
    Sync.onStatus(renderSyncBadge);
  }

  // ---------- início ----------
  function start() {
    Store.load();
    bindEvents();
    Auth.init(function () {
      renderAll();
      // não celebra conquistas já existentes ao abrir o app
      if (!Store.state.seenAch.length) { Store.state.seenAch = Game.unlocked(stats); Store.state.seenLevel = stats.level; Store.save(); }
      if (Store.state.active) openTimer();
      syncNow();
    }).catch(function (e) {
      console.error(e);
      toast('Erro ao iniciar: ' + e.message, 5000);
      $('app').classList.remove('hidden');
      renderAll();
    });

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW', e); });
    }
  }

  window.App = { renderAll: renderAll, version: VERSION };
  start();
})();
