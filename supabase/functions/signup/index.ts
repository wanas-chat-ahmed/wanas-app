// ونس signup: creates an ordinary Supabase Auth user for a Wanas ID + password.
// Email is a synthetic address (never mailed), so no SMTP is involved. The user is marked
// confirmed through the admin API; project-wide email verification stays on.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'server' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'server' }, 400); }
  const wanasId = String(body.wanasId ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim().slice(0, 40);
  const password = String(body.password ?? '');
  if (!/^[a-z0-9_.]{3,20}$/.test(wanasId)) return json({ error: 'bad_id' }, 400);
  if (!name) return json({ error: 'bad_name' }, 400);
  if (password.length < 6 || password.length > 72) return json({ error: 'bad_password' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: taken } = await admin.from('profiles').select('id').eq('wanas_id', wanasId).maybeSingle();
  if (taken) return json({ error: 'id_taken' }, 409);
  const { error } = await admin.auth.admin.createUser({
    email: `${wanasId}@wanas-users.example.com`,
    password,
    email_confirm: true,
    user_metadata: { wanas_id: wanasId, name },
  });
  if (error) {
    const dup = /already|exists|registered|duplicate/i.test(error.message);
    return json({ error: dup ? 'id_taken' : 'server' }, dup ? 409 : 500);
  }
  return json({ ok: true });
});
