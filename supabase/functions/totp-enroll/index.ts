// Cadastro do app autenticador para o usuário logado.
// Ações: status | start (gera segredo pendente) | confirm (valida código e ativa)
import { admin, checkCode, cors, json, newSecret, totpFor } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método não permitido' }, 405);

  const db = admin();
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u, error: uErr } = await db.auth.getUser(token);
  if (uErr || !u?.user?.email) return json({ ok: false, error: 'Sessão inválida. Entre novamente.' }, 401);
  const user = u.user;
  const email = user.email!.toLowerCase();

  let body: { action?: string; code?: string } = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }

  const { data: row } = await db.from('totp_secrets').select('*').eq('user_id', user.id).maybeSingle();

  if (body.action === 'status') {
    return json({ ok: true, enrolled: !!row?.confirmed });
  }

  if (body.action === 'start') {
    const secret = newSecret();
    const { error } = await db.from('totp_secrets').upsert({
      user_id: user.id,
      email,
      pending_secret: secret,
      confirmed: row?.confirmed ?? false,
      secret: row?.secret ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) return json({ ok: false, error: 'Não foi possível gerar a chave.' }, 500);
    return json({ ok: true, secret, uri: totpFor(secret, email).toString() });
  }

  if (body.action === 'confirm') {
    if (!row?.pending_secret) return json({ ok: false, error: 'Gere a chave novamente.' });
    const step = checkCode(row.pending_secret, email, String(body.code || ''));
    if (step === null) return json({ ok: false, error: 'Código incorreto. Confira o horário do celular e tente de novo.' });
    const { error } = await db.from('totp_secrets').update({
      secret: row.pending_secret,
      pending_secret: null,
      confirmed: true,
      email,
      last_used_step: step,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id);
    if (error) return json({ ok: false, error: 'Não foi possível ativar.' }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Ação inválida' }, 400);
});
