/* Regras do jogo: XP, níveis, sequência e conquistas.
 * Tudo é recalculado a partir das sessões, então qualquer aparelho que
 * tenha as mesmas sessões chega exatamente no mesmo resultado. */
(function () {
  'use strict';

  var XP_PER_MIN = 1;
  var XP_GOAL = 20;       // bateu a meta de uma atividade no dia
  var XP_ALL_GOALS = 10;  // bateu todas as metas do dia
  var STREAK_STEP = 0.05; // +5% a cada 7 dias de sequência
  var STREAK_MAX = 0.5;   // até +50%

  var TITLES = [
    [1, 'Semente', '🌱'],
    [3, 'Broto', '🌿'],
    [5, 'Raiz', '🪴'],
    [8, 'Muda', '🌳'],
    [12, 'Árvore', '🌳'],
    [17, 'Árvore Frutífera', '🍇'],
    [23, 'Oliveira', '🫒'],
    [30, 'Cedro do Líbano', '🌲'],
    [40, 'Junto às Águas', '💧']
  ];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function dayKey(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function keyToDate(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function addDays(key, n) {
    var d = keyToDate(key);
    d.setDate(d.getDate() + n);
    return dayKey(d.getTime());
  }

  function xpForNext(level) { return Math.round(100 * Math.pow(level, 1.5)); }

  function levelFromXp(xp) {
    var level = 1, rest = xp, need = xpForNext(1);
    while (rest >= need) { rest -= need; level++; need = xpForNext(level); }
    return { level: level, into: rest, need: need };
  }

  function titleFor(level) {
    var t = TITLES[0];
    for (var i = 0; i < TITLES.length; i++) if (level >= TITLES[i][0]) t = TITLES[i];
    return { name: t[1], icon: t[2] };
  }

  function streakMult(streak) {
    return 1 + Math.min(STREAK_MAX, Math.floor(streak / 7) * STREAK_STEP);
  }

  /**
   * types: [{id, goalMin, archived}]
   * sessions: [{id, typeId, start, durationSec, goalMin, deleted}]
   */
  function compute(types, sessions, nowMs) {
    nowMs = nowMs || Date.now();
    var activeTypes = types.filter(function (t) { return !t.archived; });
    var typeGoal = {};
    types.forEach(function (t) { typeGoal[t.id] = t.goalMin; });

    var days = {};          // key -> {byType:{id:{sec,goal}}, totalSec, sessions:[]}
    var totalSec = 0, count = 0, longest = 0;

    sessions.forEach(function (s) {
      if (s.deleted) return;
      var k = dayKey(s.start);
      var d = days[k] || (days[k] = { byType: {}, totalSec: 0, sessions: [] });
      var bt = d.byType[s.typeId] || (d.byType[s.typeId] = { sec: 0, goal: 0 });
      bt.sec += s.durationSec;
      bt.goal = Math.max(bt.goal, s.goalMin || typeGoal[s.typeId] || 10);
      d.totalSec += s.durationSec;
      d.sessions.push(s);
      totalSec += s.durationSec;
      count++;
      if (s.durationSec > longest) longest = s.durationSec;
    });

    var keys = Object.keys(days).sort();
    var xp = 0, streak = 0, best = 0, prevValid = null;
    var allStreak = 0, bestAllStreak = 0, prevAll = null;
    var allMetDays = 0;

    keys.forEach(function (k) {
      var d = days[k];
      var met = 0, base = 0;
      Object.keys(d.byType).forEach(function (tid) {
        var bt = d.byType[tid];
        base += Math.floor(bt.sec / 60) * XP_PER_MIN;
        bt.met = bt.sec >= bt.goal * 60;
        if (bt.met) { met++; base += XP_GOAL; }
      });
      var allMet = activeTypes.length > 0 && activeTypes.every(function (t) {
        var bt = d.byType[t.id];
        return bt && bt.met;
      });
      if (allMet) { base += XP_ALL_GOALS; allMetDays++; }

      d.met = met;
      d.allMet = allMet;
      d.valid = met > 0;

      if (d.valid) {
        streak = (prevValid && addDays(prevValid, 1) === k) ? streak + 1 : 1;
        prevValid = k;
        if (streak > best) best = streak;
      }
      if (allMet) {
        allStreak = (prevAll && addDays(prevAll, 1) === k) ? allStreak + 1 : 1;
        prevAll = k;
        if (allStreak > bestAllStreak) bestAllStreak = allStreak;
      }
      d.streak = d.valid ? streak : 0;
      d.xp = Math.round(base * (d.valid ? streakMult(streak) : 1));
      xp += d.xp;
    });

    // sequência atual: vale hoje ou ontem (o dia de hoje ainda pode ser cumprido)
    var today = dayKey(nowMs), yesterday = addDays(today, -1);
    var current = 0;
    if (days[today] && days[today].valid) current = days[today].streak;
    else if (days[yesterday] && days[yesterday].valid) current = days[yesterday].streak;

    var lv = levelFromXp(xp);
    return {
      days: days,
      xp: xp,
      level: lv.level,
      levelInto: lv.into,
      levelNeed: lv.need,
      title: titleFor(lv.level),
      streak: current,
      bestStreak: best,
      bestAllStreak: bestAllStreak,
      allMetDays: allMetDays,
      activeDays: keys.length,
      totalSec: totalSec,
      sessionCount: count,
      longestSec: longest,
      today: today
    };
  }

  var ACHIEVEMENTS = [
    { id: 'first', icon: '✨', name: 'Primeiro passo', desc: 'Concluir a primeira sessão', test: function (s) { return s.sessionCount >= 1; } },
    { id: 'goal1', icon: '🎯', name: 'Na mosca', desc: 'Bater uma meta diária', test: function (s) { return s.bestStreak >= 1; } },
    { id: 'all1', icon: '🏆', name: 'Dia completo', desc: 'Bater todas as metas em um dia', test: function (s) { return s.allMetDays >= 1; } },
    { id: 'streak3', icon: '🔥', name: 'Aquecendo', desc: '3 dias seguidos', test: function (s) { return s.bestStreak >= 3; } },
    { id: 'streak7', icon: '📆', name: 'Uma semana', desc: '7 dias seguidos', test: function (s) { return s.bestStreak >= 7; } },
    { id: 'streak30', icon: '🌙', name: 'Um mês fiel', desc: '30 dias seguidos', test: function (s) { return s.bestStreak >= 30; } },
    { id: 'streak100', icon: '💎', name: 'Cem dias', desc: '100 dias seguidos', test: function (s) { return s.bestStreak >= 100; } },
    { id: 'all7', icon: '👑', name: 'Semana completa', desc: 'Todas as metas por 7 dias seguidos', test: function (s) { return s.bestAllStreak >= 7; } },
    { id: 'long30', icon: '⏳', name: 'Mergulho profundo', desc: '30 minutos em uma única sessão', test: function (s) { return s.longestSec >= 1800; } },
    { id: 'hours10', icon: '📚', name: '10 horas', desc: '10 horas no total', test: function (s) { return s.totalSec >= 36000; } },
    { id: 'hours50', icon: '📜', name: '50 horas', desc: '50 horas no total', test: function (s) { return s.totalSec >= 180000; } },
    { id: 'level5', icon: '⭐', name: 'Nível 5', desc: 'Alcançar o nível 5', test: function (s) { return s.level >= 5; } },
    { id: 'level10', icon: '🌟', name: 'Nível 10', desc: 'Alcançar o nível 10', test: function (s) { return s.level >= 10; } }
  ];

  function unlocked(stats) {
    return ACHIEVEMENTS.filter(function (a) { return a.test(stats); }).map(function (a) { return a.id; });
  }

  window.Game = {
    compute: compute,
    unlocked: unlocked,
    ACHIEVEMENTS: ACHIEVEMENTS,
    dayKey: dayKey,
    keyToDate: keyToDate,
    addDays: addDays,
    levelFromXp: levelFromXp,
    xpForNext: xpForNext,
    titleFor: titleFor
  };
})();
