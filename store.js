/* Armazenamento local (localStorage). O aparelho é sempre a fonte primária;
 * a nuvem (sync.js) recebe e envia as mudanças marcadas como "dirty". */
(function () {
  'use strict';

  var KEY = 'devocional.v1';
  var COLORS = ['#6d4fd8', '#e8a91c', '#2fa66a', '#d6455d', '#2d8fd6', '#d65fb0', '#7a8a99'];

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = [];
    for (var i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
    return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') + '-' +
      h.slice(8, 10).join('') + '-' + h.slice(10).join('');
  }

  function now() { return Date.now(); }

  function defaults() {
    var t = now();
    return {
      version: 1,
      ownerId: null,
      pristine: true,          // ainda não houve uso (permite trocar pelos tipos da nuvem)
      types: [
        { id: uuid(), name: 'Leitura', goalMin: 10, color: COLORS[0], archived: false, updatedAt: t },
        { id: uuid(), name: 'Reflexão', goalMin: 10, color: COLORS[1], archived: false, updatedAt: t }
      ],
      sessions: [],
      active: null,
      seenAch: [],
      seenLevel: 1,
      lastPull: 0,
      dirty: { types: [], sessions: [] },
      totpOk: false
    };
  }

  var state;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : null;
    } catch (e) { state = null; }
    if (!state || state.version !== 1) state = defaults();
    if (!state.dirty) state.dirty = { types: [], sessions: [] };
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('Falha ao salvar', e); }
  }

  function markDirty(kind, id) {
    if (state.dirty[kind].indexOf(id) < 0) state.dirty[kind].push(id);
  }

  function reset(keepOwner) {
    var owner = state && state.ownerId;
    state = defaults();
    if (keepOwner) state.ownerId = owner;
    save();
    return state;
  }

  function activeTypes() { return state.types.filter(function (t) { return !t.archived; }); }
  function typeById(id) {
    for (var i = 0; i < state.types.length; i++) if (state.types[i].id === id) return state.types[i];
    return null;
  }

  function upsertType(t) {
    t.updatedAt = now();
    var existing = typeById(t.id);
    if (existing) Object.assign(existing, t); else state.types.push(t);
    state.pristine = false;
    markDirty('types', t.id);
    save();
  }

  function addSession(s) {
    s.id = s.id || uuid();
    s.updatedAt = now();
    s.deleted = false;
    state.sessions.push(s);
    state.pristine = false;
    markDirty('sessions', s.id);
    save();
    return s;
  }

  function deleteSession(id) {
    state.sessions.forEach(function (s) {
      if (s.id === id) { s.deleted = true; s.updatedAt = now(); markDirty('sessions', id); }
    });
    save();
  }

  /** Junta registros vindos de fora (nuvem ou backup). Vence o mais recente (updatedAt). */
  function mergeRecords(kind, incoming, markAsDirty) {
    var list = state[kind];
    var idx = {};
    list.forEach(function (r, i) { idx[r.id] = i; });
    var changed = 0;
    incoming.forEach(function (r) {
      var i = idx[r.id];
      if (i === undefined) { list.push(r); idx[r.id] = list.length - 1; changed++; }
      else if ((r.updatedAt || 0) > (list[i].updatedAt || 0)) { list[i] = r; changed++; }
      else return;
      if (markAsDirty) markDirty(kind, r.id);
    });
    return changed;
  }

  function exportData() {
    return JSON.stringify({ app: 'devocional', version: 1, exportedAt: new Date().toISOString(),
      types: state.types, sessions: state.sessions }, null, 2);
  }

  function importData(json) {
    var data = JSON.parse(json);
    if (!data || !Array.isArray(data.types) || !Array.isArray(data.sessions)) throw new Error('Arquivo inválido');
    if (state.pristine && data.types.length) { state.types = []; }
    var n = mergeRecords('types', data.types, true) + mergeRecords('sessions', data.sessions, true);
    state.pristine = false;
    save();
    return n;
  }

  window.Store = {
    COLORS: COLORS,
    uuid: uuid,
    load: load,
    save: save,
    reset: reset,
    get state() { return state; },
    activeTypes: activeTypes,
    typeById: typeById,
    upsertType: upsertType,
    addSession: addSession,
    deleteSession: deleteSession,
    mergeRecords: mergeRecords,
    markDirty: markDirty,
    exportData: exportData,
    importData: importData
  };
})();
