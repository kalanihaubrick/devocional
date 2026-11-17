/* Sincronização offline-first com o Supabase.
 * - Envia registros marcados como "dirty" (upsert por id).
 * - Baixa registros alterados desde o último pull e junta (vence o updatedAt mais recente). */
(function () {
  'use strict';

  var MARGIN_MS = 10 * 60 * 1000; // tolerância a relógios levemente diferentes entre aparelhos
  var running = null;
  var listeners = [];
  var status = { state: 'local', at: 0, error: null };

  function setStatus(s, err) {
    status = { state: s, at: Date.now(), error: err || null };
    listeners.forEach(function (fn) { try { fn(status); } catch (e) { /* noop */ } });
  }

  function toRowType(t, uid) {
    return { id: t.id, user_id: uid, name: t.name, goal_min: t.goalMin, color: t.color,
      archived: !!t.archived, updated_at: new Date(t.updatedAt).toISOString() };
  }
  function fromRowType(r) {
    return { id: r.id, name: r.name, goalMin: r.goal_min, color: r.color, archived: r.archived,
      updatedAt: Date.parse(r.updated_at) };
  }
  function toRowSession(s, uid) {
    return { id: s.id, user_id: uid, type_id: s.typeId, started_at: new Date(s.start).toISOString(),
      ended_at: new Date(s.end).toISOString(), duration_sec: s.durationSec, goal_min: s.goalMin,
      passage: s.passage || null, note: s.note || null, deleted: !!s.deleted,
      updated_at: new Date(s.updatedAt).toISOString() };
  }
  function fromRowSession(r) {
    return { id: r.id, typeId: r.type_id, start: Date.parse(r.started_at), end: Date.parse(r.ended_at),
      durationSec: r.duration_sec, goalMin: r.goal_min, passage: r.passage || '', note: r.note || '',
      deleted: r.deleted, updatedAt: Date.parse(r.updated_at) };
  }

  function pick(list, ids) {
    var set = {};
    ids.forEach(function (id) { set[id] = 1; });
    return list.filter(function (r) { return set[r.id]; });
  }

  async function doSync(client, uid) {
    var st = Store.state;
    if (!navigator.onLine) { setStatus('offline'); return false; }
    setStatus('syncing');

    // 1) Primeiro uso neste aparelho: se a nuvem já tem atividades, usa as de lá
    if (st.pristine && !st.lastPull) {
      var r0 = await client.from('activity_types').select('*');
      if (r0.error) throw r0.error;
      if (r0.data && r0.data.length) {
        st.types = r0.data.map(fromRowType);
        st.dirty.types = [];
      } else {
        st.types.forEach(function (t) { Store.markDirty('types', t.id); });
      }
      st.pristine = false;
    } else if (!st.lastPull) {
      // dados criados antes do login (modo local): enviar tudo
      st.types.forEach(function (t) { Store.markDirty('types', t.id); });
      st.sessions.forEach(function (s) { Store.markDirty('sessions', s.id); });
    }

    // 2) Enviar pendentes (tipos antes das sessões, por causa da chave estrangeira)
    var dirtyTypes = st.dirty.types.slice();
    if (dirtyTypes.length) {
      var rt = await client.from('activity_types').upsert(pick(st.types, dirtyTypes).map(function (t) { return toRowType(t, uid); }));
      if (rt.error) throw rt.error;
      st.dirty.types = st.dirty.types.filter(function (id) { return dirtyTypes.indexOf(id) < 0; });
    }
    var dirtySessions = st.dirty.sessions.slice();
    while (dirtySessions.length) {
      var chunk = dirtySessions.splice(0, 200);
      var rs = await client.from('sessions').upsert(pick(st.sessions, chunk).map(function (s) { return toRowSession(s, uid); }));
      if (rs.error) throw rs.error;
      st.dirty.sessions = st.dirty.sessions.filter(function (id) { return chunk.indexOf(id) < 0; });
    }
    Store.save();

    // 3) Baixar mudanças
    var since = new Date(Math.max(0, (st.lastPull || 0) - MARGIN_MS)).toISOString();
    var maxSeen = st.lastPull || 0;
    var pt = await client.from('activity_types').select('*').gt('updated_at', since);
    if (pt.error) throw pt.error;
    var ps = await client.from('sessions').select('*').gt('updated_at', since).order('updated_at').limit(5000);
    if (ps.error) throw ps.error;
    var types = (pt.data || []).map(fromRowType);
    var sessions = (ps.data || []).map(fromRowSession);
    types.concat(sessions).forEach(function (r) { if (r.updatedAt > maxSeen) maxSeen = r.updatedAt; });
    var changed = Store.mergeRecords('types', types, false) + Store.mergeRecords('sessions', sessions, false);
    st.lastPull = Math.max(maxSeen, Date.now() - MARGIN_MS);
    Store.save();

    setStatus('synced');
    return changed > 0;
  }

  /** Retorna true se algo novo chegou da nuvem. */
  function sync(client, uid) {
    if (!client || !uid) { setStatus('local'); return Promise.resolve(false); }
    if (running) return running;
    running = doSync(client, uid).catch(function (e) {
      console.warn('sync', e);
      setStatus(navigator.onLine ? 'error' : 'offline', e && (e.message || String(e)));
      return false;
    }).then(function (r) { running = null; return r; });
    return running;
  }

  function pending() {
    var d = Store.state.dirty;
    return d.types.length + d.sessions.length;
  }

  window.Sync = {
    sync: sync,
    pending: pending,
    onStatus: function (fn) { listeners.push(fn); fn(status); },
    get status() { return status; },
    setStatus: setStatus
  };
})();
