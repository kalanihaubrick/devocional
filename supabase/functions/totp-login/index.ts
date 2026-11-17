// Login sem senha: e-mail + código do app autenticador.
// Valida o código e devolve um token de uso único (hashed_token de um magic link gerado
// pelo servidor, sem enviar e-mail). O app troca esse token por uma sessão com verifyOtp.
import { admin, checkCode, cors, json } from '../_shared/common.ts';

const MAX_FAILS = 5;
const WINDOW_MIN = 15;
const GENERIC = 'E-mail ou código inválido.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método não permitido' }, 405);

  let body: { email?: string; code?: string } = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '').replace(/\D/g, '');
  if (!email || code.length !== 6) return json({ ok: false, error: GENERIC });

  const db = admin();

  // limpeza ocasional de tentativas antigas
  if (Math.random() < 0.05) {
    await db.from('login_attempts').delete().lt('at', new Date(Date.now() - 86400000).toISOString());
  }

  // limite de tentativas erradas por e-mail
  const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
  const { count } = await db.from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('email', email).eq('success', false).gte('at', since);
  if ((count ?? 0) >= MAX_FAILS) {
    return json({ ok: false, error: `Muitas tentativas. Aguarde ${WINDOW_MIN} minutos.` });
  }

  const fail = async () => {
    await db.from('login_attempts').insert({ email, success: false });
    return json({ ok: false, error: GENERIC });
  };

  const { data: row } = await db.from('totp_secrets')
    .select('user_id, secret, confirmed, last_used_step')
    .eq('email', email).eq('confirmed', true).maybeSingle();
  if (!row?.secret) return await fail();

  const step = checkCode(row.secret, email, code);
  if (step === null || step <= Number(row.last_used_step)) return await fail();

  // marca o passo como usado (impede reutilizar o mesmo código)
  const { data: upd } = await db.from('totp_secrets')
    .update({ last_used_step: step })
    .eq('user_id', row.user_id).lt('last_used_step', step)
    .select('user_id');
  if (!upd || !upd.length) return await fail();

  const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !link?.properties?.hashed_token) {
    return json({ ok: false, error: 'Não foi possível entrar agora. Tente novamente.' }, 500);
  }

  await db.from('login_attempts').delete().eq('email', email).eq('success', false);
  return json({ ok: true, token_hash: link.properties.hashed_token });
});
