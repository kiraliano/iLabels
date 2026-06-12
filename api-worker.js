/* ============================================================
   iLabels API Worker
   ilabels-api.iosflowzy.workers.dev
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin': 'https://ilabels.iosflowzy.workers.dev',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
    else if (p === '/admin/reset'    && request.method === 'POST') res = await adminReset(request, env);
    else res = new Response('Not found', { status: 404 });

    // Добавляем CORS ко всем ответам
    const h = new Headers(res.headers);
    Object.entries(CORS).forEach(([k, v]) => h.set(k, v));
    return new Response(res.body, { status: res.status, headers: h });
  }
};

/* ============================================================
   POST /api/create-order
   JS на сайте вызывает это когда юзер жмёт Buy.
   Создаём order в KV, создаём Plisio invoice, возвращаем invoiceUrl.
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

  // Сохраняем заказ в KV со статусом pending
  await env.KV.put(`order:${orderNumber}`, JSON.stringify({
    status:    'pending',
    createdAt: new Date().toISOString(),
  }), { expirationTtl: 86400 }); // 24 часа

  return json({ invoiceUrl: plisioJson.data.invoice_url, orderNumber });
}

/* ============================================================
   GET /api/status?order=ORDER_NUMBER
   success.html делает polling сюда каждые 3 сек.
   Когда статус paid — возвращаем licenseKey и downloadToken.
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
   Одноразовая ссылка на скачивание. Редиректит на Google Drive.
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

  // Помечаем как использованный
  record.used = true;
  await env.KV.put(`dl:${token}`, JSON.stringify(record), { expirationTtl: 3600 });

  return Response.redirect(env.GOOGLE_DRIVE_URL, 302);
}

/* ============================================================
   POST /api/plisio/webhook
   Plisio стучится сюда после подтверждения транзакции.
   ============================================================ */
async function webhook(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

  // Верифицируем подпись
  if (env.PLISIO_SECRET_KEY && body.verify_hash) {
    const valid = await verifyPlisio(body, env.PLISIO_SECRET_KEY);
    if (!valid) return new Response('Unauthorized', { status: 401 });
  }

  const status = mapStatus(body.status);
  if (status !== 'paid') return json({ ok: true, skipped: true });

  const orderNumber = String(body.order_number || '');
  if (!orderNumber) return json({ error: 'No order_number' }, 400);

  const existingOrderRaw = await env.KV.get(`order:${orderNumber}`);
  if (!existingOrderRaw) return json({ error: 'Order not found' }, 404);

  let existingOrder;
  try { existingOrder = JSON.parse(existingOrderRaw); } catch { return json({ error: 'Invalid order record' }, 500); }

  if (existingOrder.status === 'paid') {
    return json({ ok: true, duplicate: true });
  }

  if (existingOrder.status !== 'pending') {
    return json({ error: 'Order is not pending', status: existingOrder.status || 'unknown' }, 409);
  }

  // Генерируем лицензионный ключ
  const licenseKey    = generateLicenseKey();
  const downloadToken = generateToken();
  const now           = new Date().toISOString();

  // Сохраняем лицензию в KV
  await env.KV.put(`license:${licenseKey}`, JSON.stringify({
    status:         'active',
    activations:    0,
    maxActivations: 2,
    devices:        [],
    createdAt:      now,
    orderNumber,
  }));

  // Сохраняем download token (24 часа, одноразовый)
  await env.KV.put(`dl:${downloadToken}`, JSON.stringify({
    licenseKey,
    used:    false,
    expires: Date.now() + 24 * 60 * 60 * 1000,
  }), { expirationTtl: 86400 });

  // Обновляем заказ — статус paid
  await env.KV.put(`order:${orderNumber}`, JSON.stringify({
    status:        'paid',
    licenseKey,
    downloadToken,
    createdAt:     now,
  }), { expirationTtl: 7 * 86400 }); // храним 7 дней

  console.log(`Paid: ${orderNumber} → ${licenseKey}`);
  return json({ ok: true });
}

/* ============================================================
   POST /api/activate  { license, device }
   Плагин вызывает при первом запуске.
   ============================================================ */
async function activate(request, env) {
  const { license, device } = await request.json().catch(() => ({}));
  if (!license || !device) return json({ success: false, error: 'Missing fields' }, 400);

  const key = license.trim().toUpperCase();
  const raw = await env.KV.get(`license:${key}`);
  if (!raw) return json({ success: false, error: 'License not found' });

  const data = normalizeLicenseData(JSON.parse(raw), key);

  if (data.status !== 'active') {
    return json({ success: false, error: 'License is not active' });
  }

  // Уже активировано на этом устройстве
  if (data.devices.some(d => d.id === device)) {
    return json({ success: true, message: 'Already active' });
  }

  // Лимит достигнут
  if (data.activations >= data.maxActivations) {
    return json({
      success: false,
      error: "activation_limit_reached",
      message: "activation limit reached"
    }, 403);
  if (data.devices.length >= 2) {
    return json({ success: false, error: 'activation limit reached' });
  }

  data.devices.push({ id: device, activatedAt: Date.now() });
  await env.KV.put(`license:${key}`, JSON.stringify(data));

  return json({ success: true });
}

/* ============================================================
   POST /api/validate  { license, device }
   Плагин вызывает раз в неделю тихо.
   ============================================================ */
async function validate(request, env) {
  const { license, device } = await request.json().catch(() => ({}));
  if (!license || !device) return json({ valid: false }, 400);

  const key = license.trim().toUpperCase();
  const raw = await env.KV.get(`license:${key}`);
  if (!raw) return json({ valid: false });

  const data = JSON.parse(raw);
  if (data.status !== 'active') return json({ valid: false });

  const devices = Array.isArray(data.devices) ? data.devices : [];
  const registered = devices.some(d => typeof d === 'string' ? d === device : d && d.id === device);
  return json({ valid: registered });
}

/* ============================================================
   POST /admin/reset  { token, license }
   Ты вызываешь вручную если покупатель сменил ПК.
   ============================================================ */
async function adminReset(request, env) {
  const { token, license } = await request.json().catch(() => ({}));
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ ok: false, error: 'Unauthorized' }, 401);

  const key = String(license || '').trim().toUpperCase();
  const raw = await env.KV.get(`license:${key}`);
  if (!raw) return json({ ok: false, error: 'License not found' });

  const data = normalizeLicenseData(JSON.parse(raw), key);
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

function normalizeLicenseData(data, licenseKey) {
  const normalized = {
    ...data,
    license: data.license || licenseKey,
    status: data.status || 'active',
    devices: Array.isArray(data.devices) ? data.devices : [],
  };

  normalized.devices = normalized.devices
    .map(device => {
      if (typeof device === 'string') return { id: device, activatedAt: null };
      if (device && typeof device === 'object' && device.id) {
        return {
          ...device,
          activatedAt: device.activatedAt ?? null,
        };
      }
      return null;
    })
    .filter(Boolean);

  delete normalized.activations;
  delete normalized.maxActivations;

  return normalized;
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


function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
