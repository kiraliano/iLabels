/* ============================================================
   iLabels API Worker
   ilabels-api.iosflowzy.workers.dev
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin': 'https://ilabels.iosflowzy.workers.dev',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const UNLOCK_SECRET = "ilabels-unlock-v1-9f3k2"; // должен совпадать со значением в iLabels.jsx

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    let res;
    const p = url.pathname;

    if (p === '/api/create-order'    && request.method === 'POST') res = await createOrder(request, env);
    else if (p === '/api/status'     && request.method === 'GET')  res = await getStatus(url, env);
    else if (p === '/api/download'   && request.method === 'GET')  res = await download(url, env);
    else if (p === '/api/plisio/webhook' && request.method === 'POST') res = await webhook(request, env);
    else if (p === '/api/activate'   && request.method === 'POST') res = await activate(request, env);
    else if (p === '/api/validate'   && request.method === 'POST') res = await validate(request, env);
    else if (p === '/api/deactivate' && request.method === 'POST') res = await deactivate(request, env);
    else if (p === '/admin/reset'    && request.method === 'POST') res = await adminReset(request, env);
    else if (p === '/api/test' && request.method === 'GET') res = await createTestOrder(url, env);
    else res = new Response('Not found', { status: 404 });

    const h = new Headers(res.headers);
    Object.entries(CORS).forEach(([k, v]) => h.set(k, v));
    return new Response(res.body, { status: res.status, headers: h });
  }
};

/* ============================================================
   POST /api/create-order
   ============================================================ */
async function createOrder(request, env) {
  const orderNumber = generateOrderId();
  const siteDomain  = env.SITE_DOMAIN;
  const apiDomain   = env.API_DOMAIN;

  const params = new URLSearchParams({
    source_currency:     'USD',
    source_amount:       '10',
    order_number:        orderNumber,
    order_name:          'iLabels Plugin',
    description:         'iLabels — After Effects label script',
    callback_url:        `https://${apiDomain}/api/plisio/webhook?json=true`,
    success_invoice_url: `https://${siteDomain}/success.html?order=${orderNumber}`,
    fail_invoice_url:    `https://${siteDomain}/?payment=failed`,
    api_key:             env.PLISIO_API_KEY,
    expire_min:          '60',
  });

  const plisioRes = await fetch(`https://api.plisio.net/api/v1/invoices/new?${params}`);
  const plisioJson = await plisioRes.json().catch(() => ({}));

  if (!plisioJson.data?.invoice_url) {
    return json({ error: 'Plisio error', details: plisioJson }, 502);
  }

  await env.KV.put(`order:${orderNumber}`, JSON.stringify({
    status:    'pending',
    createdAt: new Date().toISOString(),
  }), { expirationTtl: 86400 });

  return json({ invoiceUrl: plisioJson.data.invoice_url, orderNumber });
}

/* ============================================================
   GET /api/status?order=ORDER_NUMBER
   ============================================================ */
async function getStatus(url, env) {
  const orderNumber = url.searchParams.get('order');
  if (!orderNumber) return json({ error: 'Missing order' }, 400);

  const raw = await env.KV.get(`order:${orderNumber}`);
  if (!raw) return json({ status: 'not_found' });

  const order = JSON.parse(raw);
  if (order.status !== 'paid') return json({ status: order.status });

  return json({
    status:        'paid',
    licenseKey:    order.licenseKey,
    downloadToken: order.downloadToken,
  });
}

/* ============================================================
   GET /api/download?token=TOKEN
   ============================================================ */
async function download(url, env) {
  const token = url.searchParams.get('token');
  if (!token) return new Response('Missing token', { status: 400 });

  const raw = await env.KV.get(`dl:${token}`);
  if (!raw) return new Response('Link expired or invalid', { status: 410 });

  const record = JSON.parse(raw);

  if (record.used) return new Response('Link already used', { status: 410 });
  if (Date.now() > record.expires) {
    await env.KV.delete(`dl:${token}`);
    return new Response('Link expired', { status: 410 });
  }

  record.used = true;
  await env.KV.put(`dl:${token}`, JSON.stringify(record), { expirationTtl: 3600 });

  return Response.redirect(env.GOOGLE_DRIVE_URL, 302);
}

/* ============================================================
   POST /api/plisio/webhook
   ============================================================ */
async function webhook(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

  if (env.PLISIO_SECRET_KEY && body.verify_hash) {
    const valid = await verifyPlisio(body, env.PLISIO_SECRET_KEY);
    if (!valid) return new Response('Unauthorized', { status: 401 });
  }

  const status = mapStatus(body.status);
  if (status !== 'paid') return json({ ok: true, skipped: true });

  const orderNumber = String(body.order_number || '');
  if (!orderNumber) return json({ error: 'No order_number' }, 400);

  const licenseKey    = generateLicenseKey();
  const downloadToken = generateToken();
  const now           = new Date().toISOString();

  await env.KV.put(`license:${licenseKey}`, JSON.stringify({
    devices:   [],
    createdAt: now,
    status:    'active',
    orderNumber,
  }));

  await env.KV.put(`dl:${downloadToken}`, JSON.stringify({
    licenseKey,
    used:    false,
    expires: Date.now() + 24 * 60 * 60 * 1000,
  }), { expirationTtl: 86400 });

  await env.KV.put(`order:${orderNumber}`, JSON.stringify({
    status:        'paid',
    licenseKey,
    downloadToken,
    createdAt:     now,
  }), { expirationTtl: 7 * 86400 });

  console.log(`Paid: ${orderNumber} → ${licenseKey}`);
  return json({ ok: true });
}

/* ============================================================
   POST /api/activate  { license, device }
   Вызывается со страницы activate.html на сайте (не из плагина!)
   Возвращает unlockCode который пользователь вводит в плагин.
   ============================================================ */
async function activate(request, env) {
  const { license, device } = await request.json().catch(() => ({}));
  if (!license || !device) return json({ success: false, error: 'Missing fields' }, 400);

  if (!/^dev-[0-9a-f]+$/i.test(String(device).trim())) {
    return json({ success: false, error: 'Invalid Device ID format. Copy it exactly from the iLabels panel inside After Effects.' }, 400);
  }

  const key = String(license).trim().toUpperCase();
  const raw = await env.KV.get(`license:${key}`);
  if (!raw) return json({ success: false, error: 'License not found' });

  const data = JSON.parse(raw);
  if (!data.devices) data.devices = [];

  const existing = data.devices.find(d => d.id === device);

  if (!existing) {
    if (data.devices.length >= 2) {
      return json({ success: false, error: 'Activation limit reached (2/2)' });
    }
    data.devices.push({ id: device, activatedAt: Date.now() });
    await env.KV.put(`license:${key}`, JSON.stringify(data));
  }

  const unlockCode = await computeUnlockCode(key, device);

  return json({
    success: true,
    unlockCode,
    remaining: 2 - data.devices.length
  });
}

/* ============================================================
   POST /api/validate  { license, device }
   ============================================================ */
async function validate(request, env) {
  const { license, device } = await request.json().catch(() => ({}));
  if (!license || !device) return json({ valid: false }, 400);

  const key = String(license).trim().toUpperCase();
  const raw = await env.KV.get(`license:${key}`);
  if (!raw) return json({ valid: false });

  const data = JSON.parse(raw);
  if (data.status !== 'active') return json({ valid: false });

  const exists = (data.devices || []).some(d => d.id === device);
  return json({ valid: exists });
}

/* ============================================================
   POST /api/deactivate  { license, device }
   ============================================================ */
async function deactivate(request, env) {
  const { license, device } = await request.json().catch(() => ({}));
  if (!license || !device) return json({ success: false }, 400);

  const key = String(license).trim().toUpperCase();
  const raw = await env.KV.get(`license:${key}`);
  if (!raw) return json({ success: false, error: 'Not found' });

  const data = JSON.parse(raw);
  data.devices = (data.devices || []).filter(d => d.id !== device);
  await env.KV.put(`license:${key}`, JSON.stringify(data));

  return json({ success: true, remaining: 2 - data.devices.length });
}

/* ============================================================
   POST /admin/reset  { token, license }
   ============================================================ */
async function adminReset(request, env) {
  const { token, license } = await request.json().catch(() => ({}));
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ ok: false, error: 'Unauthorized' }, 401);

  const key = String(license || '').trim().toUpperCase();
  const raw = await env.KV.get(`license:${key}`);
  if (!raw) return json({ ok: false, error: 'License not found' });

  const data = JSON.parse(raw);
  data.devices = [];
  await env.KV.put(`license:${key}`, JSON.stringify(data));

  return json({ ok: true, message: `Reset: ${key}` });
}

/* ============================================================
   HELPERS
   ============================================================ */
function generateOrderId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function seg() {
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  return `ILBL-${seg()}-${seg()}-${seg()}`;
}

async function verifyPlisio(body, secret) {
  try {
    const expected = String(body.verify_hash || '');
    const data = { ...body };
    delete data.verify_hash;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(JSON.stringify(data)));
    const hex  = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex === expected;
  } catch { return false; }
}

function mapStatus(s) {
  return ['completed', 'success', 'paid'].includes(String(s || '').toLowerCase()) ? 'paid' : 'other';
}

async function createTestOrder(url, env) {
  const token = url.searchParams.get('token');
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response('Not found', { status: 404 });
  }

  const orderId = 'test-' + Date.now();
  const licenseKey = 'ILBL-TEST-AAAA-BBBB';
  const downloadToken = 'testtoken123';

  const existing = await env.KV.get(`license:${licenseKey}`);
  if (!existing) {
    await env.KV.put(`license:${licenseKey}`, JSON.stringify({
      devices: [],
      createdAt: new Date().toISOString(),
      status: 'active',
      orderNumber: orderId,
    }));
  }

  // Пересоздаём dl-запись при каждом тестовом заказе, иначе /api/download
  // будет 410 "already used" после первого же теста (downloadToken фиксированный).
  await env.KV.put(`dl:${downloadToken}`, JSON.stringify({
    licenseKey,
    used: false,
    expires: Date.now() + 24 * 60 * 60 * 1000,
  }), { expirationTtl: 86400 });

  await env.KV.put(`order:${orderId}`, JSON.stringify({
    status: 'paid',
    licenseKey,
    downloadToken,
    createdAt: new Date().toISOString()
  }), { expirationTtl: 3600 });

  return Response.redirect(`https://ilabels.iosflowzy.workers.dev/success.html?order=${orderId}`, 302);
}

// ─── djb2 hash, ДОЛЖЕН СОВПАДАТЬ С iLabels.jsx ──────────────────────────────
async function computeUnlockCode(license, device) {
  const raw = license + ":" + device + ":" + UNLOCK_SECRET;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = (((hash << 5) + hash) + raw.charCodeAt(i)) & 0xffffffff;
  }
  hash = hash >>> 0;
  let s = hash.toString(36).toUpperCase();
  while (s.length < 8) s = "0" + s;
  return s.substring(0, 8);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
