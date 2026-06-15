/* ============================================================
   iLabels API Worker
   ilabels-api.iosflowzy.workers.dev
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin': 'https://ilabels.iosflowzy.workers.dev',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    let res;
    const p = normalizePath(url.pathname);

    if (p === '/api/create-order'    && request.method === 'POST') res = await createOrder(request, env);
    else if (p === '/api/status'     && request.method === 'GET')  res = await getStatus(url, env);
    else if (p === '/api/download'   && request.method === 'GET')  res = await download(url, env);
    else if (p === '/api/plisio/webhook' && request.method === 'POST') res = await webhook(request, env);
    else if ((p === '/api/activate' || p === '/activate' || p === '/api/lease' || p === '/lease') && (request.method === 'POST' || request.method === 'GET')) res = await acquireLease(request, env);
    else if ((p === '/api/validate' || p === '/validate' || p === '/api/heartbeat' || p === '/heartbeat') && (request.method === 'POST' || request.method === 'GET')) res = await validate(request, env);
    else if ((p === '/api/release' || p === '/release') && (request.method === 'POST' || request.method === 'GET')) res = await releaseLease(request, env);
    else if (p === '/admin/reset'    && request.method === 'POST') res = await adminReset(request, env);
    else res = json({ error: 'Not found', path: url.pathname }, 404);

    // Добавляем CORS ко всем ответам
    const h = new Headers(res.headers);
    Object.entries(CORS).forEach(([k, v]) => h.set(k, v));
    return new Response(res.body, { status: res.status, headers: h });
  }
};

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

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
  const now           = Date.now();

  // Сохраняем лицензию в KV
  await env.KV.put(`license:${licenseKey}`, JSON.stringify({
    license:   licenseKey,
    licenseType: 'floating',
    maxSeats:  1,
    leases:    [],
    devices:   [],
    createdAt: now,
    status:    'active',
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
   GET/POST /api/activate|/api/lease  { license, device }
   Плагин вызывает при запуске панели: арендует плавающее место
   или продлевает уже существующую аренду этого устройства.
   Важно: Cloudflare KV не даёт атомарных операций, поэтому при
   одновременной аренде последних мест теоретически возможна гонка.
   ============================================================ */
async function acquireLease(request, env) {
  const { license, device } = await readLicenseRequest(request);
  if (!license || !device) return json({ success: false, error: 'Missing fields' }, 400);

  const key = license.trim().toUpperCase();
  const raw = await env.KV.get(`license:${key}`);
  if (!raw) return json({ success: false, valid: false, error: 'license_not_found', message: 'License not found' });

  const parsed = parseJsonRecord(raw);
  if (!parsed.ok) return json({ success: false, valid: false, error: 'invalid_license_record', message: 'License record is not valid JSON' }, 500);

  const data = normalizeLicenseData(parsed.value, key);
  if (data.status !== 'active') return json({ success: false, valid: false, error: 'license_disabled', message: 'License disabled' }, 403);

  const now = Date.now();
  const leaseMs = getLeaseMs(env);
  data.leases = pruneExpiredLeases(data.leases, now);

  const existingLease = data.leases.find(item => item.device === device);
  if (existingLease) {
    existingLease.updatedAt = now;
    existingLease.expiresAt = now + leaseMs;
    await env.KV.put(`license:${key}`, JSON.stringify(data));
    return json({ success: true, valid: true, floating: true, message: 'lease renewed', leaseExpiresAt: existingLease.expiresAt, remaining: Math.max(0, data.maxSeats - data.leases.length) });
  }

  if (data.leases.length >= data.maxSeats) {
    return json({ success: false, valid: false, floating: true, error: 'no_floating_seats', message: 'No floating seats available', seats: data.maxSeats, activeLeases: data.leases.length }, 423);
  }

  const lease = { device, acquiredAt: now, updatedAt: now, expiresAt: now + leaseMs };
  data.leases.push(lease);
  await env.KV.put(`license:${key}`, JSON.stringify(data));

  return json({ success: true, valid: true, floating: true, message: 'lease acquired', leaseExpiresAt: lease.expiresAt, remaining: Math.max(0, data.maxSeats - data.leases.length) });
}

/* ============================================================
   GET/POST /api/validate|/api/heartbeat  { license, device }
   Проверяет и продлевает активную плавающую аренду.
   ============================================================ */
async function validate(request, env) {
  const { license, device } = await readLicenseRequest(request);
  if (!license || !device) return json({ valid: false }, 400);

  const key = license.trim().toUpperCase();
  const raw = await env.KV.get(`license:${key}`);
  if (!raw) return json({ valid: false });

  const parsed = parseJsonRecord(raw);
  if (!parsed.ok) return json({ valid: false, error: 'invalid_license_record' }, 500);

  const data = normalizeLicenseData(parsed.value, key);
  if (data.status !== 'active') return json({ valid: false });

  const now = Date.now();
  data.leases = pruneExpiredLeases(data.leases, now);
  const lease = data.leases.find(item => item.device === device);
  if (!lease) {
    await env.KV.put(`license:${key}`, JSON.stringify(data));
    return json({ valid: false, floating: true, error: 'lease_expired' });
  }

  lease.updatedAt = now;
  lease.expiresAt = now + getLeaseMs(env);
  await env.KV.put(`license:${key}`, JSON.stringify(data));
  return json({ valid: true, floating: true, leaseExpiresAt: lease.expiresAt, remaining: Math.max(0, data.maxSeats - data.leases.length) });
}

async function releaseLease(request, env) {
  const { license, device } = await readLicenseRequest(request);
  if (!license || !device) return json({ ok: false, error: 'Missing fields' }, 400);

  const key = license.trim().toUpperCase();
  const raw = await env.KV.get(`license:${key}`);
  if (!raw) return json({ ok: true, released: false });

  const parsed = parseJsonRecord(raw);
  if (!parsed.ok) return json({ ok: false, error: 'Invalid license record' }, 500);

  const data = normalizeLicenseData(parsed.value, key);
  const before = data.leases.length;
  data.leases = data.leases.filter(item => item.device !== device);
  await env.KV.put(`license:${key}`, JSON.stringify(data));
  return json({ ok: true, released: data.leases.length !== before });
}

/* ============================================================
   POST /admin/reset
   Authorization: Bearer ADMIN_TOKEN
   { license }
   Ты вызываешь вручную если покупатель сменил ПК.
   ============================================================ */
async function adminReset(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const { license } = await request.json().catch(() => ({}));

  const key = String(license || '').trim().toUpperCase();
  const raw = await env.KV.get(`license:${key}`);
  if (!raw) return json({ ok: false, error: 'License not found' });

  const parsed = parseJsonRecord(raw);
  if (!parsed.ok) return json({ ok: false, error: 'Invalid license record' }, 500);

  const data = normalizeLicenseData(parsed.value, key);
  data.devices = [];
  data.leases = [];
  await env.KV.put(`license:${key}`, JSON.stringify(data));

  return json({ ok: true, message: `Reset: ${key}` });
}

/* ============================================================
   HELPERS
   ============================================================ */

async function readLicenseRequest(request) {
  const url = new URL(request.url);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  return {
    license: body.license || url.searchParams.get('license'),
    device: body.device || url.searchParams.get('device'),
  };
}

function getLeaseMs(env) {
  const minutes = Number(env.FLOATING_LEASE_MINUTES || 30);
  const safeMinutes = Number.isFinite(minutes) ? Math.min(Math.max(minutes, 5), 24 * 60) : 30;
  return safeMinutes * 60 * 1000;
}

function pruneExpiredLeases(leases, now) {
  return (Array.isArray(leases) ? leases : [])
    .map(lease => {
      if (typeof lease === 'string') return { device: lease, acquiredAt: null, updatedAt: null, expiresAt: 0 };
      if (lease && typeof lease === 'object' && (lease.device || lease.id)) {
        const device = String(lease.device || lease.id);
        return { ...lease, device, expiresAt: Number(lease.expiresAt || 0) };
      }
      return null;
    })
    .filter(lease => lease && lease.device && lease.expiresAt > now);
}

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
    licenseType: data.licenseType || 'floating',
    maxSeats: Math.max(1, Number(data.maxSeats || data.seats || data.maxActivations || 1)),
    leases: Array.isArray(data.leases) ? data.leases : [],
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

function parseJsonRecord(raw) {
  const text = normalizeKvText(raw);
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    const repaired = parseLooseKvObject(text);
    if (repaired) return { ok: true, value: repaired };
    return { ok: false, value: null };
  }
}

function normalizeKvText(raw) {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .trim();
}

function parseLooseKvObject(raw) {
  const text = normalizeKvText(raw);
  if (!text.startsWith('{') || !text.endsWith('}')) return null;

  const body = text.slice(1, -1).trim();
  if (!body) return {};

  const data = {};
  const parts = body.split(',');
  for (const part of parts) {
    const index = part.indexOf(':');
    if (index <= 0) return null;

    const key = part.slice(0, index).trim().replace(/^['"]|['"]$/g, '');
    const value = part.slice(index + 1).trim();
    if (!key) return null;

    if (value === '[]') data[key] = [];
    else if (value === '{}') data[key] = {};
    else if (value === 'true') data[key] = true;
    else if (value === 'false') data[key] = false;
    else if (value === 'null') data[key] = null;
    else if (/^-?\d+(\.\d+)?$/.test(value)) data[key] = Number(value);
    else data[key] = value.replace(/^['"]|['"]$/g, '');
  }

  return data;
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
