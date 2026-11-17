/* Login sem senha: e-mail + código do app autenticador (TOTP).
 * - Primeiro acesso / recuperação: código enviado por e-mail (Supabase OTP) e depois cadastro do autenticador.
 * - Login normal: Edge Function "totp-login" valida o código e devolve um token de uso único,
 *   trocado por uma sessão com verifyOtp. A sessão fica salva no aparelho (continua logado). */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var client = null, user = null, onReadyCb = null;
  var recovering = false, pendingEmail = '';

  function configured() {
    var c = window.APP_CONFIG || {};
    return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && window.supabase);
  }

  function msg(text, ok) {
    var el = $('auth-msg');
    el.textContent = text || '';
    el.className = 'auth-msg' + (ok ? ' ok' : '');
  }

  function show(step) {
    ['login', 'email', 'emailcode', 'enroll'].forEach(function (s) {
      $('auth-' + s).classList.toggle('hidden', s !== step);
    });
    $('auth').classList.remove('hidden');
    $('app').classList.add('hidden');
    msg('');
    var first = $('auth-' + step).querySelector('input');
    if (first && !first.value) setTimeout(function () { try { first.focus(); } catch (e) { /* noop */ } }, 50);
  }

  function busy(form, on) {
    var b = form.querySelector('button[type=submit]');
    if (b) { b.disabled = on; }
  }

  async function invoke(name, body) {
    var r = await client.functions.invoke(name, { body: body });
    if (r.error) {
      var detail = null;
      try { detail = await r.error.context.json(); } catch (e) { /* noop */ }
      if (detail && detail.error) throw new Error(detail.error);
      throw new Error(/send a request|fetch|network/i.test(r.error.message || '')
        ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
        : (r.error.message || 'Falha de conexão'));
    }
    if (r.data && r.data.ok === false) throw new Error(r.data.error || 'Erro');
    return r.data;
  }

  function cleanCode(v) { return String(v || '').replace(/\D/g, ''); }
  function cleanEmail(v) { return String(v || '').trim().toLowerCase(); }

  function adoptOwner(uid) {
    var st = Store.state;
    if (st.ownerId && st.ownerId !== uid) Store.reset();
    Store.state.ownerId = uid;
    Store.save();
  }

  function ready(u) {
    user = u;
    $('auth').classList.add('hidden');
    $('app').classList.remove('hidden');
    if (onReadyCb) onReadyCb(u);
  }

  async function afterSession(u, forceEnroll) {
    adoptOwner(u.id);
    if (!forceEnroll && Store.state.totpOk) return ready(u);
    if (!forceEnroll) {
      try {
        var s = await invoke('totp-enroll', { action: 'status' });
        if (s.enrolled) { Store.state.totpOk = true; Store.save(); return ready(u); }
      } catch (e) {
        if (!navigator.onLine) return ready(u); // offline: segue e verifica depois
        console.warn(e);
      }
    }
    startEnroll();
  }

  async function startEnroll() {
    show('enroll');
    $('enroll-qr').innerHTML = '';
    $('enroll-secret').textContent = '…';
    try {
      var d = await invoke('totp-enroll', { action: 'start' });
      $('enroll-secret').textContent = d.secret.replace(/(.{4})/g, '$1 ').trim();
      $('enroll-link').href = d.uri;
      if (window.qrcode) {
        var qr = qrcode(0, 'M');
        qr.addData(d.uri);
        qr.make();
        $('enroll-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      }
      $('enroll-copy').onclick = function () {
        var txt = d.secret;
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { msg('Chave copiada.', true); });
        else window.prompt('Copie a chave:', txt);
      };
    } catch (e) {
      msg(e.message);
    }
  }

  function bind() {
    document.querySelectorAll('#auth [data-goto]').forEach(function (b) {
      b.addEventListener('click', function () {
        var to = b.getAttribute('data-goto');
        if (to === 'email') {
          recovering = !!b.getAttribute('data-recover') || (recovering && b.closest('#auth-emailcode'));
          $('email-step-text').textContent = recovering
            ? 'Para recuperar o acesso, enviaremos um código para o seu e-mail. Depois você cadastra um novo autenticador.'
            : 'Vamos confirmar seu e-mail. Enviaremos um código de 6 dígitos.';
          if (!$('signup-email').value) $('signup-email').value = $('login-email').value;
        }
        show(to);
      });
    });

    $('auth-login').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var email = cleanEmail($('login-email').value), code = cleanCode($('login-code').value);
      if (!email || code.length !== 6) return msg('Informe o e-mail e o código de 6 dígitos.');
      busy(this, true); msg('Entrando…', true);
      try {
        var d = await invoke('totp-login', { email: email, code: code });
        var r = await client.auth.verifyOtp({ token_hash: d.token_hash, type: 'magiclink' });
        if (r.error) throw r.error;
        adoptOwner(r.data.user.id);
        Store.state.totpOk = true; Store.save();
        $('login-code').value = '';
        ready(r.data.user);
      } catch (e) {
        msg(e.message || 'Não foi possível entrar.');
      } finally { busy(this, false); }
    });

    $('auth-email').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var email = cleanEmail($('signup-email').value);
      if (!email || email.indexOf('@') < 1) return msg('Informe um e-mail válido.');
      busy(this, true); msg('Enviando…', true);
      try {
        var r = await client.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } });
        if (r.error) throw r.error;
        pendingEmail = email;
        $('emailcode-target').textContent = email;
        show('emailcode');
        msg('Código enviado! Confira também a caixa de spam.', true);
      } catch (e) {
        var m = e.message || '';
        if (/rate|seconds|limit/i.test(m)) m = 'Muitos envios seguidos. Aguarde um pouco e tente de novo.';
        msg(m || 'Não foi possível enviar o código.');
      } finally { busy(this, false); }
    });

    $('auth-emailcode').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var code = cleanCode($('emailcode').value);
      if (code.length < 6) return msg('Digite o código recebido.');
      busy(this, true); msg('Verificando…', true);
      try {
        var r = await client.auth.verifyOtp({ email: pendingEmail, token: code, type: 'email' });
        if (r.error) throw r.error;
        $('emailcode').value = '';
        if (recovering) Store.state.totpOk = false;
        await afterSession(r.data.user, recovering);
      } catch (e) {
        msg(/expired|invalid/i.test(e.message || '') ? 'Código inválido ou expirado.' : (e.message || 'Erro'));
      } finally { busy(this, false); }
    });

    $('auth-enroll').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var code = cleanCode($('enroll-code').value);
      if (code.length !== 6) return msg('Digite o código de 6 dígitos do app.');
      busy(this, true);
      try {
        await invoke('totp-enroll', { action: 'confirm', code: code });
        Store.state.totpOk = true; Store.save();
        recovering = false;
        $('enroll-code').value = '';
        var s = await client.auth.getUser();
        ready(s.data.user);
      } catch (e) {
        msg(e.message || 'Código incorreto.');
      } finally { busy(this, false); }
    });
  }

  async function init(onReady) {
    onReadyCb = onReady;
    if (!configured()) { ready(null); return; }
    bind();
    var cfg = window.APP_CONFIG;
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'devocional.auth' }
    });
    var r = await client.auth.getSession();
    var session = r.data && r.data.session;
    if (session) await afterSession(session.user, false);
    else show('login');
  }

  async function logout() {
    if (client) { try { await client.auth.signOut({ scope: 'local' }); } catch (e) { /* noop */ } }
    Store.reset();
    location.reload();
  }

  window.Auth = {
    init: init,
    logout: logout,
    get client() { return client; },
    get user() { return user; },
    get enabled() { return !!client; }
  };
})();
