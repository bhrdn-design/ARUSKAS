const APP_VERSION = '1.0.0';
const SESSION_LONG_DAYS = 30;
const SESSION_SHORT_HOURS = 12;
const PASSWORD_ITERATIONS = 600000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const INCOME_CATEGORIES = [
  ['Gaji', '#168A68', 'wallet'], ['Hasil usaha', '#0D9488', 'store'], ['Penjualan', '#0891B2', 'shopping-bag'],
  ['Bonus', '#7C3AED', 'gift'], ['Hadiah', '#D97706', 'heart'], ['Transfer masuk', '#2563EB', 'arrow-down-left'],
  ['Investasi', '#4F46E5', 'trending-up'], ['Pendapatan lainnya', '#64748B', 'plus-circle']
];
const EXPENSE_CATEGORIES = [
  ['Makanan dan minuman', '#E07843', 'utensils'], ['Transportasi', '#3984C6', 'car'], ['Belanja', '#B76AAB', 'shopping-bag'],
  ['Kebutuhan rumah', '#8B7B54', 'house'], ['Tagihan listrik', '#D69A2D', 'zap'], ['Internet', '#4776A8', 'wifi'],
  ['Pendidikan', '#557A62', 'book-open'], ['Kesehatan', '#C65D6A', 'heart-pulse'], ['Hiburan', '#8B6BC2', 'clapperboard'],
  ['Cicilan', '#64748B', 'calendar-clock'], ['Sedekah', '#299B83', 'hand-heart'], ['Lain-lain', '#64748B', 'circle-ellipsis']
];

function nowISO() { return new Date().toISOString(); }
function uuid() { return crypto.randomUUID(); }
function bytesToB64(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64ToBytes(value) {
  const s = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function randomToken(length = 32) { return bytesToB64(crypto.getRandomValues(new Uint8Array(length))); }
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToB64(new Uint8Array(digest));
}
async function passwordVerifier(derivedB64, env) {
  if (!env.AUTH_PEPPER) throw Object.assign(new Error('Secret AUTH_PEPPER belum dikonfigurasi pada Worker.'), { status: 503, code: 'AUTH_NOT_CONFIGURED' });
  if (typeof derivedB64 !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(derivedB64)) throw new Error('Data autentikasi tidak valid.');
  const derived = b64ToBytes(derivedB64);
  if (derived.byteLength !== 32) throw new Error('Data autentikasi tidak valid.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.AUTH_PEPPER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, derived);
  return bytesToB64(new Uint8Array(signature));
}
function validPasswordSalt(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value) && b64ToBytes(value).byteLength === 16; }
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}
function fail(message, status = 400, code = 'BAD_REQUEST') { return json({ ok: false, error: message, code }, status); }
async function readJSON(request) {
  try { return await request.json(); } catch { throw new Error('Format data JSON tidak valid.'); }
}
function cleanText(value, max = 180) { return String(value ?? '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, max); }
function safeColor(value, fallback = '#64748B') { const color = cleanText(value, 7); return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback; }
function isValidDate(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }
function isDateOnly(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(`${value}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === value; }
function isPositiveInteger(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0; }
function makeReceiptNo(date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `ARS-${ymd}-${randomToken(5).toUpperCase().replace(/[-_]/g, '').slice(0, 7)}`;
}
function parsePathId(path, prefix) { return decodeURIComponent(path.slice(prefix.length)).split('/')[0]; }

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const headers = { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With', 'Access-Control-Max-Age': '86400' };
  if (allowed.includes('*')) headers['Access-Control-Allow-Origin'] = '*';
  else if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  if (headers['Access-Control-Allow-Origin'] && headers['Access-Control-Allow-Origin'] !== '*') headers['Access-Control-Allow-Credentials'] = 'true';
  return headers;
}
function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request, env))) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function getUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id,u.username,u.full_name,u.currency,u.timezone,u.avatar_key,s.id AS session_id,s.expires_at,s.last_seen_at
    FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? LIMIT 1`).bind(tokenHash, nowISO()).first();
  if (!row) return null;
  if (!row.last_seen_at || Date.now() - Date.parse(row.last_seen_at) > 10 * 60000) await env.DB.prepare('UPDATE user_sessions SET last_seen_at=? WHERE id=?').bind(nowISO(), row.session_id).run();
  return row;
}
async function requireUser(request, env) {
  const user = await getUser(request, env);
  if (!user) throw Object.assign(new Error('Sesi tidak valid atau sudah berakhir. Silakan login kembali.'), { status: 401, code: 'UNAUTHORIZED' });
  return user;
}
async function createSession(userId, request, env, remember) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const created = new Date();
  const expires = new Date(created.getTime() + (remember ? SESSION_LONG_DAYS * 86400000 : SESSION_SHORT_HOURS * 3600000));
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare(`INSERT INTO user_sessions(id,user_id,token_hash,created_at,expires_at,last_seen_at,user_agent,ip_hash)
    VALUES(?,?,?,?,?,?,?,?)`).bind(uuid(), userId, tokenHash, created.toISOString(), expires.toISOString(), created.toISOString(), cleanText(request.headers.get('User-Agent'), 250), await sha256(ip)).run();
  return { token, expiresAt: expires.toISOString() };
}
function publicUser(user) {
  return { id: user.id, username: user.username, full_name: user.full_name, currency: user.currency, timezone: user.timezone, avatar_key: user.avatar_key || null };
}
async function getTransaction(userId, id, env) {
  return env.DB.prepare(`SELECT t.*,c.name AS category_name,c.color AS category_color,c.icon AS category_icon,a.name AS account_name,a.type AS account_type,
    x.id AS attachment_id,x.filename AS attachment_filename,x.mime_type AS attachment_mime
    FROM transactions t JOIN categories c ON c.id=t.category_id AND c.user_id=t.user_id
    JOIN accounts a ON a.id=t.account_id AND a.user_id=t.user_id
    LEFT JOIN transaction_attachments x ON x.transaction_id=t.id AND x.user_id=t.user_id
    WHERE t.id=? AND t.user_id=? AND t.deleted_at IS NULL LIMIT 1`).bind(id, userId).first();
}
async function validateTransactionInput(input, userId, env, allowArchived = false) {
  const kind = input.kind;
  const amount = Number(input.amount);
  const categoryId = cleanText(input.category_id, 80);
  const accountId = cleanText(input.account_id, 80);
  const description = cleanText(input.description, 180);
  const occurredAt = input.occurred_at;
  if (!['income', 'expense'].includes(kind)) throw new Error('Jenis transaksi harus pemasukan atau pengeluaran.');
  if (!isPositiveInteger(amount) || amount > 999999999999) throw new Error('Nominal harus berupa bilangan bulat rupiah yang lebih besar dari nol.');
  if (!description) throw new Error('Keterangan transaksi wajib diisi.');
  if (!isValidDate(occurredAt)) throw new Error('Tanggal dan jam transaksi tidak valid.');
  const category = await env.DB.prepare('SELECT id FROM categories WHERE id=? AND user_id=? AND kind=?').bind(categoryId, userId, kind).first();
  if (!category) throw new Error('Kategori tidak ditemukan atau tidak sesuai jenis transaksi.');
  const account = await env.DB.prepare(`SELECT id FROM accounts WHERE id=? AND user_id=? ${allowArchived ? '' : 'AND archived=0'}`).bind(accountId, userId).first();
  if (!account) throw new Error('Akun keuangan tidak ditemukan atau sudah diarsipkan.');
  return {
    kind, amount, categoryId, accountId, occurredAt: new Date(occurredAt).toISOString(),
    counterparty: cleanText(input.counterparty, 120), description,
    notes: cleanText(input.notes, 1000)
  };
}
async function listTransactions(userId, url, env) {
  const p = url.searchParams;
  const page = Math.max(1, Math.min(100000, Number(p.get('page') || 1)));
  const limit = Math.max(1, Math.min(100, Number(p.get('limit') || 20)));
  const where = ['t.user_id=?', 't.deleted_at IS NULL']; const values = [userId];
  const kind = p.get('kind'); if (['income', 'expense'].includes(kind)) { where.push('t.kind=?'); values.push(kind); }
  const category = p.get('category_id'); if (category) { where.push('t.category_id=?'); values.push(category); }
  const account = p.get('account_id'); if (account) { where.push('t.account_id=?'); values.push(account); }
  const start = p.get('start'); if (isValidDate(start)) { where.push('t.occurred_at>=?'); values.push(new Date(start).toISOString()); }
  const end = p.get('end'); if (isValidDate(end)) { where.push('t.occurred_at<=?'); values.push(new Date(end).toISOString()); }
  const q = cleanText(p.get('q'), 100); if (q) { where.push('(t.description LIKE ? OR t.counterparty LIKE ? OR t.receipt_no LIKE ?)'); values.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const sort = p.get('sort') === 'oldest' ? 'ASC' : 'DESC';
  const clause = where.join(' AND ');
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM transactions t WHERE ${clause}`).bind(...values).first();
  const rows = await env.DB.prepare(`SELECT t.id,t.receipt_no,t.kind,t.amount,t.occurred_at,t.counterparty,t.description,t.notes,t.source,t.created_at,
    c.name AS category_name,c.color AS category_color,c.icon AS category_icon,a.name AS account_name,
    x.id AS attachment_id,x.filename AS attachment_filename
    FROM transactions t JOIN categories c ON c.id=t.category_id AND c.user_id=t.user_id
    JOIN accounts a ON a.id=t.account_id AND a.user_id=t.user_id
    LEFT JOIN transaction_attachments x ON x.transaction_id=t.id AND x.user_id=t.user_id
    WHERE ${clause} ORDER BY t.occurred_at ${sort},t.created_at ${sort} LIMIT ? OFFSET ?`).bind(...values, limit, (page - 1) * limit).all();
  return { items: rows.results || [], page, limit, total: count?.total || 0, pages: Math.max(1, Math.ceil((count?.total || 0) / limit)) };
}
async function uploadImage(file, userId, prefix, env) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('File foto tidak ditemukan.');
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) throw new Error('Ukuran foto maksimal 5 MB.');
  const data = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(data);
  if (!mime) throw new Error('Format foto harus JPG, PNG, atau WEBP yang valid.');
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
  const key = `${prefix}/${userId}/${uuid()}.${ext}`;
  await env.BUCKET.put(key, data, { httpMetadata: { contentType: mime, cacheControl: 'private, no-store' }, customMetadata: { owner: userId } });
  return { key, mime, size: data.byteLength, filename: cleanText(file.name || `bukti.${ext}`, 120) };
}
function sniffImage(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
async function dashboardData(user, url, env) {
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const filters = ['user_id=?', 'deleted_at IS NULL']; const vals = [user.id];
  if (isValidDate(start)) { filters.push('occurred_at>=?'); vals.push(new Date(start).toISOString()); }
  if (isValidDate(end)) { filters.push('occurred_at<=?'); vals.push(new Date(end).toISOString()); }
  const where = filters.join(' AND ');
  const period = await env.DB.prepare(`SELECT
    COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE 0 END),0) AS income,
    COALESCE(SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END),0) AS expense,
    COUNT(*) AS count FROM transactions WHERE ${where}`).bind(...vals).first();
  const opening = await env.DB.prepare('SELECT COALESCE(SUM(opening_balance),0) AS total FROM accounts WHERE user_id=?').bind(user.id).first();
  const lifetime = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE -amount END),0) AS movement FROM transactions WHERE user_id=? AND deleted_at IS NULL AND occurred_at<=?`).bind(user.id, nowISO()).first();
  const categories = await env.DB.prepare(`SELECT c.name,c.color,c.icon,SUM(t.amount) AS total FROM transactions t JOIN categories c ON c.id=t.category_id
    WHERE t.user_id=? AND t.deleted_at IS NULL AND t.kind='expense' ${isValidDate(start) ? 'AND t.occurred_at>=?' : ''} ${isValidDate(end) ? 'AND t.occurred_at<=?' : ''}
    GROUP BY c.id ORDER BY total DESC LIMIT 8`).bind(...[user.id, ...(isValidDate(start) ? [new Date(start).toISOString()] : []), ...(isValidDate(end) ? [new Date(end).toISOString()] : [])]).all();
  const trend = await env.DB.prepare(`SELECT substr(occurred_at,1,7) AS month,
    SUM(CASE WHEN kind='income' THEN amount ELSE 0 END) AS income,
    SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END) AS expense
    FROM transactions WHERE user_id=? AND deleted_at IS NULL AND occurred_at>=? GROUP BY substr(occurred_at,1,7) ORDER BY month`).bind(user.id, new Date(Date.now() - 180 * 86400000).toISOString()).all();
  const tz = user.timezone || 'Asia/Jakarta';
  const todayParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const todayDate = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const todayStart = localTimeToUTC(todayDate, '00:00', tz); const todayEnd = localTimeToUTC(todayDate, '23:59:59', tz);
  const todayCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM transactions WHERE user_id=? AND deleted_at IS NULL AND occurred_at>=? AND occurred_at<=?').bind(user.id, todayStart, todayEnd).first();
  const latest = await env.DB.prepare(`SELECT t.id,t.receipt_no,t.kind,t.amount,t.occurred_at,t.description,c.name AS category_name,a.name AS account_name
    FROM transactions t JOIN categories c ON c.id=t.category_id JOIN accounts a ON a.id=t.account_id
    WHERE t.user_id=? AND t.deleted_at IS NULL ORDER BY t.occurred_at DESC LIMIT 6`).bind(user.id).all();
  return { period: period || { income: 0, expense: 0, count: 0 }, balance: Number(opening?.total || 0) + Number(lifetime?.movement || 0), openingBalance: Number(opening?.total || 0), todayCount: Number(todayCount?.count || 0), categories: categories.results || [], trend: trend.results || [], latest: latest.results || [] };
}
async function reportData(user, url, env) {
  const start = url.searchParams.get('start'); const end = url.searchParams.get('end');
  if (!isValidDate(start) || !isValidDate(end)) throw new Error('Rentang tanggal laporan tidak valid.');
  const from = new Date(start).toISOString(); const to = new Date(end).toISOString();
  if (from > to) throw new Error('Tanggal awal laporan tidak boleh setelah tanggal akhir.');
  const base = ['t.user_id=?', 't.deleted_at IS NULL', 't.occurred_at>=?', 't.occurred_at<=?'];
  const params = [user.id, from, to];
  const kind = url.searchParams.get('kind') || '';
  const categoryId = url.searchParams.get('category_id') || '';
  const accountId = url.searchParams.get('account_id') || '';
  if (kind && !['income','expense'].includes(kind)) throw new Error('Filter jenis transaksi tidak valid.');
  if (categoryId) { const owned = await env.DB.prepare('SELECT id FROM categories WHERE id=? AND user_id=?').bind(categoryId, user.id).first(); if (!owned) throw new Error('Kategori laporan tidak ditemukan.'); base.push('t.category_id=?'); params.push(categoryId); }
  if (accountId) { const owned = await env.DB.prepare('SELECT id FROM accounts WHERE id=? AND user_id=?').bind(accountId, user.id).first(); if (!owned) throw new Error('Akun laporan tidak ditemukan.'); base.push('t.account_id=?'); params.push(accountId); }
  if (kind) { base.push('t.kind=?'); params.push(kind); }
  const clause = base.join(' AND ');
  const totals = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE 0 END),0) AS income,
    COALESCE(SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END),0) AS expense,COUNT(*) AS count
    FROM transactions t WHERE ${clause}`).bind(...params).first();
  const opening = await env.DB.prepare('SELECT COALESCE(SUM(opening_balance),0) AS total FROM accounts WHERE user_id=?').bind(user.id).first();
  const movement = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE -amount END),0) AS total FROM transactions WHERE user_id=? AND deleted_at IS NULL AND occurred_at<=?`).bind(user.id, to).first();
  const categoryRows = await env.DB.prepare(`SELECT c.name,c.kind,c.color,SUM(t.amount) AS total,COUNT(*) AS count FROM transactions t JOIN categories c ON c.id=t.category_id
    WHERE ${clause} GROUP BY c.id ORDER BY total DESC`).bind(...params).all();
  const accountRows = await env.DB.prepare(`SELECT a.name,SUM(CASE WHEN t.kind='income' THEN t.amount ELSE 0 END) AS income,
    SUM(CASE WHEN t.kind='expense' THEN t.amount ELSE 0 END) AS expense FROM transactions t JOIN accounts a ON a.id=t.account_id
    WHERE ${clause} GROUP BY a.id ORDER BY (income+expense) DESC`).bind(...params).all();
  const largest = await env.DB.prepare(`SELECT t.*,c.name AS category_name,a.name AS account_name FROM transactions t JOIN categories c ON c.id=t.category_id
    JOIN accounts a ON a.id=t.account_id WHERE ${clause} AND t.kind='expense' ORDER BY t.amount DESC LIMIT 1`).bind(...params).first();
  const largestExpenseCategory = await env.DB.prepare(`SELECT c.name,SUM(t.amount) AS total FROM transactions t JOIN categories c ON c.id=t.category_id
    WHERE ${clause} AND t.kind='expense' GROUP BY c.id ORDER BY total DESC LIMIT 1`).bind(...params).first();
  const tz = user.timezone || 'Asia/Jakarta'; const instant = new Date(from);
  const zoneParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const offsetMinutes = Math.round((Date.UTC(zoneParts.year,zoneParts.month-1,zoneParts.day,zoneParts.hour,zoneParts.minute,zoneParts.second)-instant.getTime())/60000);
  const modifier = `${offsetMinutes >= 0 ? '+' : ''}${offsetMinutes} minutes`;
  const shortRange = (Date.parse(to)-Date.parse(from)) <= 62*86400000;
  const trendExpr = shortRange ? `strftime('%Y-%m-%d',datetime(t.occurred_at,?))` : `strftime('%Y-%m',datetime(t.occurred_at,?))`;
  const trendRows = await env.DB.prepare(`SELECT ${trendExpr} AS period,COALESCE(SUM(CASE WHEN t.kind='income' THEN t.amount ELSE 0 END),0) AS income,
    COALESCE(SUM(CASE WHEN t.kind='expense' THEN t.amount ELSE 0 END),0) AS expense FROM transactions t WHERE ${clause} GROUP BY period ORDER BY period`).bind(modifier,...params).all();
  const rows = await env.DB.prepare(`SELECT t.id,t.receipt_no,t.kind,t.amount,t.occurred_at,t.counterparty,t.description,t.notes,c.name AS category_name,a.name AS account_name
    FROM transactions t JOIN categories c ON c.id=t.category_id JOIN accounts a ON a.id=t.account_id WHERE ${clause}
    ORDER BY t.occurred_at DESC LIMIT 1000`).bind(...params).all();
  const transactionItems = rows.results || [];
  return { start: from, end: to, totals: totals || { income: 0, expense: 0, count: 0 }, balance: Number(opening?.total || 0) + Number(movement?.total || 0), categories: categoryRows.results || [], accounts: accountRows.results || [], largestExpense: largest || null, largestExpenseCategory: largestExpenseCategory || null, trend: trendRows.results || [], trendGranularity: shortRange ? 'day' : 'month', filters: { kind, category_id: categoryId, account_id: accountId }, transactions: transactionItems, truncated: Number(totals?.count || 0) > transactionItems.length };
}

async function apiHandler(request, env, ctx) {
  const url = new URL(request.url); const path = url.pathname; const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (path === '/api/health' && method === 'GET') {
    await env.DB.prepare('SELECT 1 AS ok').first();
    return json({ ok: true, service: 'ARUSKAS API', version: APP_VERSION, time: nowISO() });
  }

  if (path === '/api/auth/salt' && method === 'POST') {
    const body = await readJSON(request); const username = cleanText(body.username, 24).toLowerCase();
    const user = await env.DB.prepare('SELECT password_salt FROM users WHERE username=?').bind(username).first();
    const salt = user?.password_salt || bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
    return json({ ok: true, salt, iterations: PASSWORD_ITERATIONS });
  }

  if (path === '/api/auth/register' && method === 'POST') {
    const body = await readJSON(request);
    const username = cleanText(body.username, 24).toLowerCase();
    const fullName = cleanText(body.full_name, 80);
    const passwordDerived = String(body.password_derived || ''); const passwordSalt = String(body.password_salt || ''); const passwordLength = Number(body.password_length || 0);
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return fail('Username harus 3–24 karakter, hanya huruf kecil, angka, dan garis bawah.', 400);
    if (fullName.length < 2) return fail('Nama lengkap minimal 2 karakter.', 400);
    if (passwordLength < 10 || passwordLength > 128 || !validPasswordSalt(passwordSalt)) return fail('Password harus 10–128 karakter dan data autentikasi valid.', 400);
    const exists = await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first();
    if (exists) return fail('Username sudah digunakan. Silakan pilih username lain.', 409, 'USERNAME_TAKEN');
    const userId = uuid(); const created = nowISO(); const passHash = await passwordVerifier(passwordDerived, env);
    const codes = Array.from({ length: 8 }, () => `ARUS-${randomToken(6).toUpperCase().replace(/[-_]/g, '').slice(0, 8)}`);
    const statements = [
      env.DB.prepare(`INSERT INTO users(id,username,full_name,password_hash,password_salt,currency,timezone,created_at,updated_at) VALUES(?,?,?,?,?,'IDR','Asia/Jakarta',?,?)`).bind(userId, username, fullName, passHash, passwordSalt, created, created),
      env.DB.prepare(`INSERT INTO user_settings(user_id,date_format,theme,notifications_json,updated_at) VALUES(?,'DD MMM YYYY','light','{"daily":false,"weekly":false,"monthly":false}',?)`).bind(userId, created)
    ];
    for (const [name, type] of [['Tunai', 'cash'], ['Rekening Bank', 'bank'], ['E-Wallet', 'ewallet']]) statements.push(env.DB.prepare(`INSERT INTO accounts(id,user_id,name,type,opening_balance,color,created_at,updated_at) VALUES(?,?,?,?,0,?,?,?)`).bind(uuid(), userId, name, type, type === 'cash' ? '#168A68' : type === 'bank' ? '#3974B8' : '#8B6BC2', created, created));
    for (const [kind, list] of [['income', INCOME_CATEGORIES], ['expense', EXPENSE_CATEGORIES]]) for (const [name, color, icon] of list) statements.push(env.DB.prepare(`INSERT INTO categories(id,user_id,kind,name,color,icon,is_default,created_at) VALUES(?,?,?,?,?,?,1,?)`).bind(uuid(), userId, kind, name, color, icon, created));
    for (const code of codes) statements.push(env.DB.prepare('INSERT INTO recovery_codes(id,user_id,code_hash,created_at) VALUES(?,?,?,?)').bind(uuid(), userId, await sha256(code), created));
    await env.DB.batch(statements);
    const session = await createSession(userId, request, env, true);
    const user = await env.DB.prepare('SELECT id,username,full_name,currency,timezone,avatar_key FROM users WHERE id=?').bind(userId).first();
    return json({ ok: true, user: publicUser(user), token: session.token, expiresAt: session.expiresAt, recoveryCodes: codes, message: 'Akun berhasil dibuat. Simpan kode pemulihan di tempat aman.' }, 201);
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const body = await readJSON(request); const username = cleanText(body.username, 24).toLowerCase(); const passwordDerived = String(body.password_derived || '');
    if (!username || !passwordDerived) return fail('Username dan password wajib diisi.', 400);
    const ipHash = await sha256(request.headers.get('CF-Connecting-IP') || 'unknown');
    const attempts = await env.DB.prepare('SELECT COUNT(*) AS total FROM auth_attempts WHERE username=? AND attempted_at>?').bind(username, new Date(Date.now() - 15 * 60000).toISOString()).first();
    if (Number(attempts?.total || 0) >= 8) return fail('Terlalu banyak percobaan login. Coba lagi 15 menit kemudian.', 429, 'RATE_LIMITED');
    const user = await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
    let valid = false;
    if (user) { const candidate = await passwordVerifier(passwordDerived, env); valid = safeEqual(candidate, user.password_hash); }
    if (!valid) {
      await env.DB.prepare('INSERT INTO auth_attempts(id,username,ip_hash,attempted_at) VALUES(?,?,?,?)').bind(uuid(), username, ipHash, nowISO()).run();
      return fail('Username atau password tidak cocok.', 401, 'INVALID_CREDENTIALS');
    }
    await env.DB.prepare('DELETE FROM auth_attempts WHERE username=?').bind(username).run();
    const session = await createSession(user.id, request, env, Boolean(body.remember));
    return json({ ok: true, user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
  }

  if (path === '/api/auth/recover' && method === 'POST') {
    const body = await readJSON(request); const username = cleanText(body.username, 24).toLowerCase(); const code = cleanText(body.recovery_code, 32).toUpperCase(); const passwordDerived = String(body.new_password_derived || ''); const passwordSalt = String(body.new_password_salt || ''); const passwordLength = Number(body.password_length || 0);
    if (passwordLength < 10 || passwordLength > 128 || !validPasswordSalt(passwordSalt)) return fail('Password baru harus 10–128 karakter dan data autentikasi valid.', 400);
    const user = await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first();
    if (!user) return fail('Username atau kode pemulihan tidak valid.', 400);
    const codeHash = await sha256(code);
    const record = await env.DB.prepare('SELECT id FROM recovery_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL').bind(user.id, codeHash).first();
    if (!record) return fail('Username atau kode pemulihan tidak valid / sudah digunakan.', 400);
    const passHash = await passwordVerifier(passwordDerived, env); const stamp = nowISO();
    await env.DB.batch([
      env.DB.prepare('UPDATE recovery_codes SET used_at=? WHERE id=? AND used_at IS NULL').bind(stamp, record.id),
      env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?').bind(passHash, passwordSalt, stamp, user.id),
      env.DB.prepare('DELETE FROM user_sessions WHERE user_id=?').bind(user.id)
    ]);
    return json({ ok: true, message: 'Password berhasil diubah. Silakan login kembali.' });
  }

  const user = await requireUser(request, env);

  if (path === '/api/auth/logout' && method === 'POST') {
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (token) await env.DB.prepare('DELETE FROM user_sessions WHERE token_hash=?').bind(await sha256(token)).run();
    return json({ ok: true });
  }
  if (path === '/api/auth/me' && method === 'GET') {
    const settings = await env.DB.prepare('SELECT date_format,theme,notifications_json FROM user_settings WHERE user_id=?').bind(user.id).first();
    return json({ ok: true, user: publicUser(user), settings: settings ? { ...settings, notifications: JSON.parse(settings.notifications_json || '{}') } : {} });
  }
  if (path === '/api/profile' && method === 'PUT') {
    const body = await readJSON(request); const fullName = cleanText(body.full_name, 80); const username = cleanText(body.username, 24).toLowerCase();
    const currency = cleanText(body.currency || 'IDR', 3).toUpperCase(); const timezone = cleanText(body.timezone || 'Asia/Jakarta', 64);
    if (fullName.length < 2 || !/^[a-z0-9_]{3,24}$/.test(username)) return fail('Nama atau username tidak valid.');
    if (!/^[A-Z]{3}$/.test(currency)) return fail('Kode mata uang harus 3 huruf.');
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { return fail('Zona waktu tidak dikenali.'); }
    const duplicate = await env.DB.prepare('SELECT id FROM users WHERE username=? AND id<>?').bind(username, user.id).first();
    if (duplicate) return fail('Username sudah dipakai pengguna lain.', 409);
    await env.DB.prepare('UPDATE users SET username=?,full_name=?,currency=?,timezone=?,updated_at=? WHERE id=?').bind(username, fullName, currency, timezone, nowISO(), user.id).run();
    const updated = await env.DB.prepare('SELECT id,username,full_name,currency,timezone,avatar_key FROM users WHERE id=?').bind(user.id).first();
    return json({ ok: true, user: publicUser(updated) });
  }
  if (path === '/api/profile/password' && method === 'PUT') {
    const body = await readJSON(request); const currentDerived = String(body.current_password_derived || ''); const nextDerived = String(body.new_password_derived || ''); const nextSalt = String(body.new_password_salt || ''); const passwordLength = Number(body.password_length || 0);
    if (passwordLength < 10 || passwordLength > 128 || !validPasswordSalt(nextSalt)) return fail('Password baru harus 10–128 karakter dan data autentikasi valid.');
    const full = await env.DB.prepare('SELECT password_hash,password_salt FROM users WHERE id=?').bind(user.id).first();
    const check = await passwordVerifier(currentDerived, env);
    if (!safeEqual(check, full.password_hash)) return fail('Password saat ini salah.', 401);
    const nextHash = await passwordVerifier(nextDerived, env);
    await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?').bind(nextHash, nextSalt, nowISO(), user.id), env.DB.prepare('DELETE FROM user_sessions WHERE user_id=? AND id<>?').bind(user.id, user.session_id)]);
    return json({ ok: true, message: 'Password berhasil diperbarui.' });
  }
  if (path === '/api/profile/avatar' && method === 'POST') {
    const form = await request.formData(); const file = form.get('file');
    const uploaded = await uploadImage(file, user.id, 'avatars', env);
    try { await env.DB.prepare('UPDATE users SET avatar_key=?,updated_at=? WHERE id=?').bind(uploaded.key, nowISO(), user.id).run(); }
    catch (error) { await env.BUCKET.delete(uploaded.key); throw error; }
    if (user.avatar_key) await env.BUCKET.delete(user.avatar_key);
    return json({ ok: true, avatar: '/api/profile/avatar' });
  }
  if (path === '/api/profile/avatar' && method === 'GET') {
    if (!user.avatar_key) return fail('Foto profil belum tersedia.', 404);
    const obj = await env.BUCKET.get(user.avatar_key); if (!obj) return fail('Foto profil tidak ditemukan.', 404);
    return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }

  if (path === '/api/settings' && method === 'GET') {
    const row = await env.DB.prepare('SELECT date_format,theme,notifications_json FROM user_settings WHERE user_id=?').bind(user.id).first();
    return json({ ok: true, settings: row ? { date_format: row.date_format, theme: row.theme, notifications: JSON.parse(row.notifications_json || '{}') } : {} });
  }
  if (path === '/api/settings' && method === 'PUT') {
    const body = await readJSON(request); const theme = ['light', 'dark', 'system'].includes(body.theme) ? body.theme : 'light';
    const dateFormat = ['DD MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].includes(body.date_format) ? body.date_format : 'DD MMM YYYY';
    const notifications = body.notifications && typeof body.notifications === 'object' ? { daily: !!body.notifications.daily, weekly: !!body.notifications.weekly, monthly: !!body.notifications.monthly } : { daily: false, weekly: false, monthly: false };
    await env.DB.prepare(`INSERT INTO user_settings(user_id,date_format,theme,notifications_json,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET date_format=excluded.date_format,theme=excluded.theme,notifications_json=excluded.notifications_json,updated_at=excluded.updated_at`).bind(user.id, dateFormat, theme, JSON.stringify(notifications), nowISO()).run();
    return json({ ok: true });
  }

  if (path === '/api/accounts' && method === 'GET') {
    const rows = await env.DB.prepare(`SELECT a.id,a.name,a.type,a.opening_balance,a.color,a.archived,
      a.opening_balance + COALESCE(SUM(CASE WHEN t.kind='income' THEN t.amount WHEN t.kind='expense' THEN -t.amount ELSE 0 END),0) AS balance
      FROM accounts a LEFT JOIN transactions t ON t.account_id=a.id AND t.user_id=a.user_id AND t.deleted_at IS NULL AND t.occurred_at<=?
      WHERE a.user_id=? GROUP BY a.id ORDER BY a.archived,a.created_at`).bind(nowISO(), user.id).all();
    return json({ ok: true, items: rows.results || [] });
  }
  if (path === '/api/accounts' && method === 'POST') {
    const body = await readJSON(request); const name = cleanText(body.name, 50); const type = body.type;
    const opening = Number(body.opening_balance || 0);
    if (!name || !['cash', 'bank', 'ewallet', 'other'].includes(type) || !Number.isSafeInteger(opening) || opening < 0) return fail('Data akun tidak valid.');
    const id = uuid(); const stamp = nowISO();
    try { await env.DB.prepare('INSERT INTO accounts(id,user_id,name,type,opening_balance,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id, user.id, name, type, opening, safeColor(body.color, '#1D8A70'), stamp, stamp).run(); }
    catch { return fail('Nama akun sudah digunakan atau data tidak valid.', 409); }
    return json({ ok: true, id }, 201);
  }
  if (path.startsWith('/api/accounts/') && method === 'PUT') {
    const id = parsePathId(path, '/api/accounts/'); const body = await readJSON(request); const name = cleanText(body.name, 50); const type = body.type; const opening = Number(body.opening_balance);
    if (!name || !['cash', 'bank', 'ewallet', 'other'].includes(type) || !Number.isSafeInteger(opening) || opening < 0) return fail('Data akun tidak valid.');
    try { const archived = body.archived === true ? 1 : 0; const result = await env.DB.prepare('UPDATE accounts SET name=?,type=?,opening_balance=?,color=?,archived=?,updated_at=? WHERE id=? AND user_id=?').bind(name, type, opening, safeColor(body.color, '#1D8A70'), archived, nowISO(), id, user.id).run(); if (!result.meta.changes) return fail('Akun tidak ditemukan.', 404); }
    catch { return fail('Nama akun sudah digunakan.', 409); }
    return json({ ok: true });
  }
  if (path.startsWith('/api/accounts/') && method === 'DELETE') {
    const id = parsePathId(path, '/api/accounts/');
    const used = await env.DB.prepare('SELECT COUNT(*) AS total FROM transactions WHERE account_id=? AND user_id=?').bind(id, user.id).first();
    if (Number(used?.total || 0)) return fail('Akun sudah memiliki transaksi. Arsipkan akun agar riwayat tetap aman.', 409);
    const result = await env.DB.prepare('DELETE FROM accounts WHERE id=? AND user_id=?').bind(id, user.id).run();
    if (!result.meta.changes) return fail('Akun tidak ditemukan.', 404);
    return json({ ok: true });
  }

  if (path === '/api/categories' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT id,kind,name,color,icon,is_default FROM categories WHERE user_id=? ORDER BY kind,is_default DESC,name').bind(user.id).all();
    return json({ ok: true, items: rows.results || [] });
  }
  if (path === '/api/categories' && method === 'POST') {
    const body = await readJSON(request); const kind = body.kind; const name = cleanText(body.name, 50);
    if (!['income', 'expense'].includes(kind) || name.length < 2) return fail('Jenis dan nama kategori tidak valid.');
    const id = uuid();
    try { await env.DB.prepare('INSERT INTO categories(id,user_id,kind,name,color,icon,is_default,created_at) VALUES(?,?,?,?,?,?,0,?)').bind(id, user.id, kind, name, safeColor(body.color, '#64748B'), cleanText(body.icon || 'circle', 40), nowISO()).run(); }
    catch { return fail('Kategori dengan nama tersebut sudah ada.', 409); }
    return json({ ok: true, id }, 201);
  }
  if (path.startsWith('/api/categories/') && method === 'PUT') {
    const id = parsePathId(path, '/api/categories/'); const body = await readJSON(request); const name = cleanText(body.name, 50);
    const existing = await env.DB.prepare('SELECT is_default FROM categories WHERE id=? AND user_id=?').bind(id, user.id).first();
    if (!existing) return fail('Kategori tidak ditemukan.', 404);
    if (name.length < 2) return fail('Nama kategori minimal 2 karakter.');
    try { await env.DB.prepare('UPDATE categories SET name=?,color=?,icon=? WHERE id=? AND user_id=?').bind(name, safeColor(body.color, '#64748B'), cleanText(body.icon || 'circle', 40), id, user.id).run(); }
    catch { return fail('Nama kategori sudah digunakan.', 409); }
    return json({ ok: true });
  }
  if (path.startsWith('/api/categories/') && method === 'DELETE') {
    const id = parsePathId(path, '/api/categories/'); const existing = await env.DB.prepare('SELECT is_default FROM categories WHERE id=? AND user_id=?').bind(id, user.id).first();
    if (!existing) return fail('Kategori tidak ditemukan.', 404);
    const used = await env.DB.prepare('SELECT COUNT(*) AS total FROM transactions WHERE category_id=? AND user_id=?').bind(id, user.id).first();
    if (Number(used?.total || 0)) return fail('Kategori sudah digunakan transaksi dan tidak dapat dihapus.', 409);
    await env.DB.prepare('DELETE FROM categories WHERE id=? AND user_id=?').bind(id, user.id).run();
    return json({ ok: true });
  }

  if (path === '/api/dashboard' && method === 'GET') return json({ ok: true, data: await dashboardData(user, url, env) });
  if (path === '/api/reports' && method === 'GET') return json({ ok: true, data: await reportData(user, url, env) });
  if (path === '/api/transactions' && method === 'GET') return json({ ok: true, ...await listTransactions(user.id, url, env) });
  if (path === '/api/transactions' && method === 'POST') {
    const body = await readJSON(request); const v = await validateTransactionInput(body, user.id, env); const id = uuid(); const stamp = nowISO(); const receipt = makeReceiptNo(new Date(v.occurredAt));
    await env.DB.prepare(`INSERT INTO transactions(id,user_id,receipt_no,kind,amount,category_id,account_id,occurred_at,counterparty,description,notes,source,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?, 'web',?,?)`).bind(id, user.id, receipt, v.kind, v.amount, v.categoryId, v.accountId, v.occurredAt, v.counterparty, v.description, v.notes, stamp, stamp).run();
    return json({ ok: true, id, receipt_no: receipt, message: 'Transaksi berhasil disimpan.' }, 201);
  }
  if (path.startsWith('/api/transactions/') && method === 'GET' && path.split('/').length === 4 && !path.endsWith('/attachment')) {
    const id = parsePathId(path, '/api/transactions/'); const item = await getTransaction(user.id, id, env); return item ? json({ ok: true, item }) : fail('Transaksi tidak ditemukan.', 404);
  }
  if (path.startsWith('/api/transactions/') && method === 'PUT' && path.split('/').length === 4) {
    const id = parsePathId(path, '/api/transactions/'); const old = await getTransaction(user.id, id, env); if (!old) return fail('Transaksi tidak ditemukan.', 404);
    const body = await readJSON(request); const v = await validateTransactionInput(body, user.id, env, true);
    await env.DB.prepare(`UPDATE transactions SET kind=?,amount=?,category_id=?,account_id=?,occurred_at=?,counterparty=?,description=?,notes=?,updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL`).bind(v.kind, v.amount, v.categoryId, v.accountId, v.occurredAt, v.counterparty, v.description, v.notes, nowISO(), id, user.id).run();
    return json({ ok: true, message: 'Transaksi berhasil diperbarui.' });
  }
  if (path.startsWith('/api/transactions/') && method === 'DELETE' && path.split('/').length === 4) {
    const id = parsePathId(path, '/api/transactions/'); const item = await getTransaction(user.id, id, env); if (!item) return fail('Transaksi tidak ditemukan.', 404);
    const att = await env.DB.prepare('SELECT object_key FROM transaction_attachments WHERE transaction_id=? AND user_id=?').bind(id, user.id).first();
    await env.DB.batch([env.DB.prepare('UPDATE transactions SET deleted_at=?,updated_at=? WHERE id=? AND user_id=?').bind(nowISO(), nowISO(), id, user.id), env.DB.prepare('DELETE FROM transaction_attachments WHERE transaction_id=? AND user_id=?').bind(id, user.id)]);
    if (att) await env.BUCKET.delete(att.object_key);
    return json({ ok: true });
  }
  if (path.startsWith('/api/transactions/') && path.endsWith('/attachment') && method === 'POST') {
    const id = path.split('/')[3]; const item = await getTransaction(user.id, id, env); if (!item) return fail('Transaksi tidak ditemukan.', 404);
    const form = await request.formData(); const file = form.get('file'); const uploaded = await uploadImage(file, user.id, `transactions/${id}`, env);
    const old = await env.DB.prepare('SELECT object_key FROM transaction_attachments WHERE transaction_id=? AND user_id=?').bind(id, user.id).first();
    try { await env.DB.batch([env.DB.prepare('DELETE FROM transaction_attachments WHERE transaction_id=? AND user_id=?').bind(id, user.id), env.DB.prepare('INSERT INTO transaction_attachments(id,user_id,transaction_id,object_key,filename,mime_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(uuid(), user.id, id, uploaded.key, uploaded.filename, uploaded.mime, uploaded.size, nowISO())]); }
    catch (error) { await env.BUCKET.delete(uploaded.key); throw error; }
    if (old) await env.BUCKET.delete(old.object_key);
    return json({ ok: true, filename: uploaded.filename });
  }
  if (path.startsWith('/api/transactions/') && path.endsWith('/attachment') && method === 'GET') {
    const id = path.split('/')[3]; const att = await env.DB.prepare(`SELECT x.* FROM transaction_attachments x JOIN transactions t ON t.id=x.transaction_id
      WHERE x.transaction_id=? AND x.user_id=? AND t.user_id=? AND t.deleted_at IS NULL`).bind(id, user.id, user.id).first();
    if (!att) return fail('Foto bukti tidak ditemukan.', 404);
    const object = await env.BUCKET.get(att.object_key); if (!object) return fail('File foto tidak tersedia di penyimpanan.', 404);
    return new Response(object.body, { headers: { 'Content-Type': att.mime_type, 'Content-Disposition': `inline; filename="${att.filename.replace(/["\\\r\n]/g, '')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (path.startsWith('/api/transactions/') && path.endsWith('/attachment') && method === 'DELETE') {
    const id = path.split('/')[3]; const att = await env.DB.prepare('SELECT object_key FROM transaction_attachments WHERE transaction_id=? AND user_id=?').bind(id, user.id).first();
    if (!att) return fail('Foto bukti tidak ditemukan.', 404);
    await env.DB.prepare('DELETE FROM transaction_attachments WHERE transaction_id=? AND user_id=?').bind(id, user.id).run(); await env.BUCKET.delete(att.object_key);
    return json({ ok: true });
  }

  if (path === '/api/backup/export' && method === 'GET') {
    const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get('limit') || 1000)));
    const cursorCreated = url.searchParams.get('cursor_created_at'); const cursorId = url.searchParams.get('cursor_id');
    const accounts = await env.DB.prepare('SELECT id,name,type,opening_balance,color,archived FROM accounts WHERE user_id=?').bind(user.id).all();
    const categories = await env.DB.prepare('SELECT id,kind,name,color,icon,is_default FROM categories WHERE user_id=?').bind(user.id).all();
    const total = await env.DB.prepare('SELECT COUNT(*) AS count FROM transactions WHERE user_id=? AND deleted_at IS NULL').bind(user.id).first();
    const transactions = cursorCreated && cursorId
      ? await env.DB.prepare(`SELECT id,receipt_no,kind,amount,category_id,account_id,occurred_at,counterparty,description,notes,source,created_at,updated_at FROM transactions WHERE user_id=? AND deleted_at IS NULL AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?`).bind(user.id,cursorCreated,cursorCreated,cursorId,limit+1).all()
      : await env.DB.prepare(`SELECT id,receipt_no,kind,amount,category_id,account_id,occurred_at,counterparty,description,notes,source,created_at,updated_at FROM transactions WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT ?`).bind(user.id,limit+1).all();
    const settings = await env.DB.prepare('SELECT date_format,theme,notifications_json FROM user_settings WHERE user_id=?').bind(user.id).first();
    const transactionItems = transactions.results || []; const hasMore = transactionItems.length > limit; if (hasMore) transactionItems.pop();
    const last = transactionItems[transactionItems.length - 1];
    const nextCursor = hasMore && last ? { created_at: last.created_at, id: last.id } : null;
    return json({ ok: true, total: Number(total?.count || 0), next_cursor: nextCursor, backup: { app: 'ARUSKAS', version: 1, exported_at: nowISO(), user: { username: user.username, full_name: user.full_name, currency: user.currency, timezone: user.timezone }, accounts: accounts.results || [], categories: categories.results || [], transactions: transactionItems, settings, note: 'Backup ini berisi data transaksi dan metadata, bukan file foto bukti. Simpan file backup secara pribadi.' } });
  }
  if (path === '/api/backup/import' && method === 'POST') {
    const body = await readJSON(request); const backup = body.backup || body;
    if (backup.app !== 'ARUSKAS' || backup.version !== 1 || !Array.isArray(backup.accounts) || !Array.isArray(backup.categories) || !Array.isArray(backup.transactions)) return fail('Format backup ARUSKAS tidak valid.');
    if (backup.transactions.length > 90 || backup.accounts.length > 50 || backup.categories.length > 100) return fail('Satu bagian impor maksimal 90 transaksi, 50 akun, dan 100 kategori. Website membagi backup besar menjadi beberapa bagian.');
    const accountMap = new Map(); const categoryMap = new Map(); const statements = []; const transactionStatementIndexes = []; const stamp = nowISO();
    const existingAccountRows = await env.DB.prepare('SELECT id,name FROM accounts WHERE user_id=?').bind(user.id).all();
    const existingAccounts = new Map((existingAccountRows.results || []).map(a => [a.name.toLowerCase(), a.id]));
    for (const a of backup.accounts) {
      const name = cleanText(a.name, 50); if (!name) continue;
      const existingId = existingAccounts.get(name.toLowerCase()); const id = existingId || uuid(); accountMap.set(a.id, id);
      if (!existingId) { statements.push(env.DB.prepare('INSERT INTO accounts(id,user_id,name,type,opening_balance,color,archived,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, user.id, name, ['cash','bank','ewallet','other'].includes(a.type) ? a.type : 'other', Math.max(0, Number(a.opening_balance) || 0), safeColor(a.color, '#1D8A70'), a.archived ? 1 : 0, stamp, stamp)); existingAccounts.set(name.toLowerCase(), id); }
    }
    const existingCategoryRows = await env.DB.prepare('SELECT id,kind,name FROM categories WHERE user_id=?').bind(user.id).all();
    const existingCategories = new Map((existingCategoryRows.results || []).map(c => [`${c.kind}:${c.name.toLowerCase()}`, c.id]));
    for (const c of backup.categories) {
      const name = cleanText(c.name, 50); if (!name || !['income','expense'].includes(c.kind)) continue;
      const key = `${c.kind}:${name.toLowerCase()}`; const existingId = existingCategories.get(key); const id = existingId || uuid(); categoryMap.set(c.id, id);
      if (!existingId) { statements.push(env.DB.prepare('INSERT INTO categories(id,user_id,kind,name,color,icon,is_default,created_at) VALUES(?,?,?,?,?,?,0,?)').bind(id, user.id, c.kind, name, safeColor(c.color, '#64748B'), cleanText(c.icon || 'circle', 40), stamp)); existingCategories.set(key, id); }
    }
    if (backup.user && typeof backup.user === 'object') {
      const currency = String(backup.user.currency || '').toUpperCase(); const timezone = String(backup.user.timezone || '');
      if (/^[A-Z]{3}$/.test(currency)) { try { new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(1); statements.push(env.DB.prepare('UPDATE users SET currency=? WHERE id=?').bind(currency, user.id)); } catch {} }
      if (timezone) { try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date()); statements.push(env.DB.prepare('UPDATE users SET timezone=? WHERE id=?').bind(timezone, user.id)); } catch {} }
    }
    if (backup.settings && typeof backup.settings === 'object') {
      const theme = ['light','dark','system'].includes(backup.settings.theme) ? backup.settings.theme : 'light';
      const dateFormat = ['DD MMM YYYY','DD/MM/YYYY','YYYY-MM-DD'].includes(backup.settings.date_format) ? backup.settings.date_format : 'DD MMM YYYY';
      let notifications = {}; try { const n = JSON.parse(backup.settings.notifications_json || '{}'); notifications = { daily: Boolean(n.daily), weekly: Boolean(n.weekly), monthly: Boolean(n.monthly) }; } catch {}
      statements.push(env.DB.prepare('UPDATE user_settings SET theme=?,date_format=?,notifications_json=?,updated_at=? WHERE user_id=?').bind(theme, dateFormat, JSON.stringify(notifications), stamp, user.id));
    }
    let imported = 0;
    const validSourceReceipts = backup.transactions.map(t => cleanText(t.receipt_no, 64)).filter(value => /^ARS-[A-Z0-9-]{8,48}$/i.test(value));
    const receiptMap = new Map(); const importedSourceRows = new Set();
    if (validSourceReceipts.length) {
      const placeholders = validSourceReceipts.map(() => '?').join(',');
      const [globalRows, ownRows, mappedRows] = await Promise.all([
        env.DB.prepare(`SELECT receipt_no,user_id FROM transactions WHERE receipt_no IN (${placeholders})`).bind(...validSourceReceipts).all(),
        env.DB.prepare(`SELECT receipt_no FROM transactions WHERE user_id=? AND receipt_no IN (${placeholders})`).bind(user.id, ...validSourceReceipts).all(),
        env.DB.prepare(`SELECT source_receipt_no FROM backup_import_map WHERE user_id=? AND source_receipt_no IN (${placeholders})`).bind(user.id, ...validSourceReceipts).all()
      ]);
      for (const row of globalRows.results || []) receiptMap.set(row.receipt_no, row.user_id);
      for (const row of ownRows.results || []) importedSourceRows.add(row.receipt_no);
      for (const row of mappedRows.results || []) importedSourceRows.add(row.source_receipt_no);
    }
    const seenSourceReceipts = new Set();
    for (const t of backup.transactions) {
      const amount = Number(t.amount); const categoryId = categoryMap.get(t.category_id); const accountId = accountMap.get(t.account_id);
      if (!isPositiveInteger(amount) || !categoryId || !accountId || !['income','expense'].includes(t.kind) || !isValidDate(t.occurred_at)) continue;
      const id = uuid(); const originalReceipt = cleanText(t.receipt_no, 64); const validReceipt = /^ARS-[A-Z0-9-]{8,48}$/i.test(originalReceipt);
      if (validReceipt && (importedSourceRows.has(originalReceipt) || seenSourceReceipts.has(originalReceipt))) continue;
      const receipt = validReceipt && (!receiptMap.has(originalReceipt) || receiptMap.get(originalReceipt) === user.id) ? originalReceipt : makeReceiptNo(new Date(t.occurred_at));
      const txIndex = statements.length;
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO transactions(id,user_id,receipt_no,kind,amount,category_id,account_id,occurred_at,counterparty,description,notes,source,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'import',?,?)`).bind(id, user.id, receipt, t.kind, amount, categoryId, accountId, new Date(t.occurred_at).toISOString(), cleanText(t.counterparty, 120), cleanText(t.description || 'Transaksi impor', 180), cleanText(t.notes, 1000), stamp, stamp));
      transactionStatementIndexes.push(txIndex);
      if (validReceipt) { statements.push(env.DB.prepare('INSERT INTO backup_import_map(user_id,source_receipt_no,transaction_id,imported_at) VALUES(?,?,?,?)').bind(user.id, originalReceipt, id, stamp)); seenSourceReceipts.add(originalReceipt); }
    }
    try {
      const results = statements.length ? await env.DB.batch(statements) : [];
      imported = transactionStatementIndexes.reduce((sum, index) => sum + Number(results[index]?.meta?.changes || 0), 0);
    } catch { return fail('Impor dibatalkan karena ada data yang tidak cocok. Tidak ada data lama yang dihapus dan batch impor ini dibatalkan seluruhnya.', 400, 'IMPORT_FAILED'); }
    return json({ ok: true, imported, message: `${imported} transaksi baru berhasil diimpor. Transaksi yang sudah ada dilewati agar backup yang sama tidak menggandakan data.` });
  }

  if (path === '/api/telegram/status' && method === 'GET') {
    const link = await env.DB.prepare('SELECT telegram_username,linked_at FROM telegram_links WHERE user_id=?').bind(user.id).first();
    return json({ ok: true, linked: Boolean(link), link: link || null });
  }
  if (path === '/api/telegram/pair-code' && method === 'POST') {
    const active = await env.DB.prepare('SELECT chat_id FROM telegram_links WHERE user_id=?').bind(user.id).first();
    if (active) return fail('Akun sudah terhubung ke Telegram. Putuskan hubungan terlebih dahulu jika ingin mengganti chat.', 409);
    const code = `ARS-${randomToken(7).toUpperCase().replace(/[-_]/g, '').slice(0, 9)}`; const expires = new Date(Date.now() + 5 * 60000).toISOString();
    await env.DB.prepare('DELETE FROM telegram_pairing_codes WHERE user_id=? AND used_at IS NULL').bind(user.id).run();
    await env.DB.prepare('INSERT INTO telegram_pairing_codes(id,user_id,code_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind(uuid(), user.id, await sha256(code), expires, nowISO()).run();
    return json({ ok: true, code, expires_at: expires, instruction: `/hubungkan ${code}` });
  }
  if (path === '/api/telegram/unlink' && method === 'POST') {
    const pending = await env.DB.prepare('SELECT state_json FROM telegram_pending_states WHERE user_id=?').bind(user.id).all();
    for (const row of pending.results || []) { try { const state = JSON.parse(row.state_json); if (state.photoKey) await env.BUCKET.delete(state.photoKey); } catch {} }
    await env.DB.prepare('DELETE FROM telegram_links WHERE user_id=?').bind(user.id).run();
    await env.DB.prepare('DELETE FROM telegram_pending_states WHERE user_id=?').bind(user.id).run();
    await env.DB.prepare('DELETE FROM telegram_pairing_codes WHERE user_id=?').bind(user.id).run();
    return json({ ok: true });
  }

  return fail('Endpoint tidak ditemukan.', 404, 'NOT_FOUND');
}

async function telegramAPI(env, method, payload) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Token Telegram belum dikonfigurasi.');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || 'Telegram API error.');
  return data.result;
}
async function tgSend(env, chatId, text, keyboard) {
  const payload = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (keyboard) payload.reply_markup = { inline_keyboard: keyboard };
  return telegramAPI(env, 'sendMessage', payload);
}
function tgEscape(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
function rupiah(value, currency = 'IDR') { try { return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0)); } catch { return `Rp${Number(value || 0).toLocaleString('id-ID')}`; } }
function tgFormatDate(value, timezone = 'Asia/Jakarta') { const date = new Date(value); if (Number.isNaN(date.getTime())) return '—'; return new Intl.DateTimeFormat('id-ID', { timeZone: timezone, day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date); }
function localTimeToUTC(date, time, timeZone = 'Asia/Jakarta') {
  const [y,m,d] = date.split('-').map(Number); const [hh,mm,ss=0] = time.split(':').map(Number); let guess = new Date(Date.UTC(y,m-1,d,hh,mm,ss));
  for (let i=0;i<4;i++) { const p = new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(guess); const o=Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)])); const actual=Date.UTC(o.year,o.month-1,o.day,o.hour,o.minute,o.second); const target=Date.UTC(y,m-1,d,hh,mm,ss); const delta=target-actual; if(!delta) break; guess=new Date(guess.getTime()+delta); } return guess.toISOString();
}
async function getTgLink(chatId, env) { return env.DB.prepare('SELECT l.user_id,u.timezone,u.currency,u.username FROM telegram_links l JOIN users u ON u.id=l.user_id WHERE l.chat_id=?').bind(String(chatId)).first(); }
async function saveTgState(chatId, userId, state, env) {
  const stamp = nowISO(); const expires = new Date(Date.now() + 30 * 60000).toISOString();
  await env.DB.prepare(`INSERT INTO telegram_pending_states(chat_id,user_id,state_json,updated_at,expires_at) VALUES(?,?,?,?,?)
    ON CONFLICT(chat_id) DO UPDATE SET user_id=excluded.user_id,state_json=excluded.state_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at`).bind(String(chatId), userId, JSON.stringify(state), stamp, expires).run();
}
async function getTgState(chatId, env) {
  const row = await env.DB.prepare('SELECT * FROM telegram_pending_states WHERE chat_id=? AND expires_at>?').bind(String(chatId), nowISO()).first();
  if (!row) return null;
  try { return { ...JSON.parse(row.state_json), userId: row.user_id }; } catch { return null; }
}
async function clearTgState(chatId, env, removePhoto = false) {
  const state = removePhoto ? await getTgState(chatId, env) : null;
  await env.DB.prepare('DELETE FROM telegram_pending_states WHERE chat_id=?').bind(String(chatId)).run();
  if (state?.photoKey) await env.BUCKET.delete(state.photoKey);
}
async function tgMenu(chatId, env) {
  return tgSend(env, chatId, '💰 <b>ARUSKAS BOT</b>\n\nPilih layanan yang ingin kamu gunakan.', [
    [{ text: '➕ Tambah Pemasukan', callback_data: 'menu:income' }, { text: '➖ Tambah Pengeluaran', callback_data: 'menu:expense' }],
    [{ text: '💳 Cek Saldo', callback_data: 'menu:balance' }, { text: '📋 Riwayat', callback_data: 'menu:history' }],
    [{ text: '📊 Laporan Keuangan', callback_data: 'menu:report' }],
    [{ text: '⚙️ Pengaturan', callback_data: 'menu:settings' }, { text: '❓ Bantuan', callback_data: 'menu:help' }]
  ]);
}
async function startTgFlow(chatId, userId, kind, env) {
  await clearTgState(chatId, env, true);
  const profile = await env.DB.prepare('SELECT currency,timezone FROM users WHERE id=?').bind(userId).first();
  await saveTgState(chatId, userId, { kind, step: 'amount', data: { currency: profile?.currency || 'IDR', timezone: profile?.timezone || 'Asia/Jakarta' } }, env);
  await tgSend(env, chatId, `${kind === 'income' ? '➕ PEMASUKAN' : '➖ PENGELUARAN'}\n\nBerapa nominal transaksinya?\nContoh: <code>25000</code> atau <code>25.000</code>\n\nKetik /batal untuk membatalkan.`);
}
function parseAmount(value) {
  const digits = String(value).replace(/[^0-9]/g, '');
  const n = Number(digits); return Number.isSafeInteger(n) && n > 0 ? n : null;
}
async function quickTgTransaction(chatId, userId, kind, raw, env) {
  const parts = raw.trim().split(/\s+/); const amount = parseAmount(parts.shift() || '');
  if (!amount || !parts.length) { await tgSend(env, chatId, `Format: <code>/${kind === 'income' ? 'masuk' : 'keluar'} 25000 Kategori Keterangan</code>\nContoh: <code>/keluar 25000 Makanan Beli sarapan</code>`); return; }
  const categoryName = parts.shift(); const description = parts.join(' ') || categoryName;
  const category = await env.DB.prepare(`SELECT id,name FROM categories WHERE user_id=? AND kind=? AND (lower(name)=lower(?) OR lower(name) LIKE lower(?) || '%') ORDER BY length(name) LIMIT 1`).bind(userId, kind, categoryName, categoryName).first();
  const account = await env.DB.prepare(`SELECT id,name FROM accounts WHERE user_id=? AND archived=0 ORDER BY CASE type WHEN 'cash' THEN 0 ELSE 1 END,created_at LIMIT 1`).bind(userId).first();
  if (!category) { await tgSend(env, chatId, `Kategori <b>${tgEscape(categoryName)}</b> tidak ditemukan. Ketik /menu lalu pilih input bertahap, atau gunakan nama kategori yang tersedia di website.`); return; }
  if (!account) { await tgSend(env, chatId, 'Belum ada akun keuangan aktif. Tambahkan akun melalui website terlebih dahulu.'); return; }
  const id = uuid(); const stamp = nowISO(); const receipt = makeReceiptNo();
  await env.DB.prepare(`INSERT INTO transactions(id,user_id,receipt_no,kind,amount,category_id,account_id,occurred_at,description,source,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,'telegram',?,?)`).bind(id, userId, receipt, kind, amount, category.id, account.id, stamp, cleanText(description, 180), stamp, stamp).run();
  await tgSend(env, chatId, `✅ <b>Transaksi berhasil dicatat</b>\nJenis: ${kind === 'income' ? 'Pemasukan' : 'Pengeluaran'}\nNominal: <b>${rupiah(amount, (await env.DB.prepare('SELECT currency FROM users WHERE id=?').bind(userId).first())?.currency || 'IDR')}</b>\nKategori: ${tgEscape(category.name)}\nAkun: ${tgEscape(account.name)}\nKeterangan: ${tgEscape(description)}\nNo. transaksi: <code>${receipt}</code>`);
}
async function tgBalance(chatId, userId, env) {
  const dash = await dashboardData({ id: userId }, new URL('https://local/api/dashboard'), env);
  const profile = await env.DB.prepare('SELECT timezone,currency FROM users WHERE id=?').bind(userId).first();
  const tz = profile?.timezone || 'Asia/Jakarta';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const monthStart = localTimeToUTC(`${p.year}-${p.month}-01`, '00:00', tz);
  const current = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE 0 END),0) AS income,
    COALESCE(SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END),0) AS expense FROM transactions WHERE user_id=? AND deleted_at IS NULL AND occurred_at>=? AND occurred_at<=?`).bind(userId, monthStart, nowISO()).first();
  await tgSend(env, chatId, `💳 <b>RINGKASAN KEUANGAN</b>\n\nSaldo saat ini: <b>${rupiah(dash.balance, profile?.currency || 'IDR')}</b>\nPemasukan bulan ini: ${rupiah(current.income, profile?.currency || 'IDR')}\nPengeluaran bulan ini: ${rupiah(current.expense, profile?.currency || 'IDR')}\nSelisih bulan ini: <b>${rupiah(Number(current.income) - Number(current.expense), profile?.currency || 'IDR')}</b>`);
}
async function tgHistory(chatId, userId, env) {
  const profile = await env.DB.prepare('SELECT currency FROM users WHERE id=?').bind(userId).first();
  const rows = await env.DB.prepare(`SELECT t.id,t.receipt_no,t.kind,t.amount,t.description,t.occurred_at,c.name AS category_name FROM transactions t JOIN categories c ON c.id=t.category_id
    WHERE t.user_id=? AND t.deleted_at IS NULL ORDER BY t.occurred_at DESC LIMIT 5`).bind(userId).all();
  if (!rows.results?.length) { await tgSend(env, chatId, 'Belum ada transaksi yang tercatat.'); return; }
  const lines = rows.results.map((r, i) => `${i + 1}. ${r.kind === 'income' ? '🟢' : '🔴'} <b>${rupiah(r.amount, profile?.currency || 'IDR')}</b> — ${tgEscape(r.category_name)}\n   ${tgEscape(r.description)}\n   <code>${tgEscape(r.receipt_no)}</code>`);
  const keyboard = rows.results.map(r => [{ text: `Detail ${r.receipt_no}`, callback_data: `history:${r.id}` }]);
  await tgSend(env, chatId, `📋 <b>5 TRANSAKSI TERBARU</b>\n\n${lines.join('\n\n')}\n\nPilih transaksi untuk melihat detail:`, keyboard);
}
async function tgReportMenu(chatId, env) {
  await tgSend(env, chatId, '📊 <b>PILIH PERIODE LAPORAN</b>\nPilih periode yang ingin kamu lihat.', [
    [{ text: 'Hari ini', callback_data: 'report:today' }, { text: 'Minggu ini', callback_data: 'report:week' }],
    [{ text: 'Bulan ini', callback_data: 'report:month' }, { text: 'Bulan sebelumnya', callback_data: 'report:lastmonth' }],
    [{ text: 'Tahun ini', callback_data: 'report:year' }, { text: 'Pilih tanggal', callback_data: 'report:custom' }]
  ]);
}
async function tgReportRange(chatId, userId, startDate, endDate, label, env) {
  const profile = await env.DB.prepare('SELECT timezone,currency FROM users WHERE id=?').bind(userId).first(); const tz = profile?.timezone || 'Asia/Jakarta';
  const start = localTimeToUTC(startDate, '00:00', tz); const end = localTimeToUTC(endDate, '23:59:59', tz);
  const data = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE 0 END),0) AS income,
    COALESCE(SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END),0) AS expense,COUNT(*) AS count FROM transactions WHERE user_id=? AND deleted_at IS NULL AND occurred_at>=? AND occurred_at<=?`).bind(userId, start, end).first();
  const currency = profile?.currency || 'IDR';
  await tgSend(env, chatId, `📊 <b>LAPORAN ${tgEscape(label.toUpperCase())}</b>\nPeriode: ${tgEscape(startDate)} sampai ${tgEscape(endDate)}\n\nPemasukan: ${rupiah(data.income, currency)}\nPengeluaran: ${rupiah(data.expense, currency)}\nSelisih: <b>${rupiah(Number(data.income) - Number(data.expense), currency)}</b>\nJumlah transaksi: ${data.count}`);
}
async function tgReport(chatId, userId, period, env) {
  const profile = await env.DB.prepare('SELECT timezone FROM users WHERE id=?').bind(userId).first(); const tz = profile?.timezone || 'Asia/Jakarta';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const current = new Date(Date.UTC(Number(p.year), Number(p.month)-1, Number(p.day)));
  const fmt = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  let start = new Date(current); let end = new Date(current); let label = 'Hari ini';
  if (period === 'week') { const day=(current.getUTCDay()+6)%7; start.setUTCDate(start.getUTCDate()-day); label='Minggu ini'; }
  else if (period === 'month') { start.setUTCDate(1); label='Bulan ini'; }
  else if (period === 'lastmonth') { start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth()-1); end=new Date(start); end.setUTCMonth(end.getUTCMonth()+1); end.setUTCDate(0); label='Bulan sebelumnya'; }
  else if (period === 'year') { start=new Date(Date.UTC(current.getUTCFullYear(),0,1)); label='Tahun ini'; }
  await tgReportRange(chatId, userId, fmt(start), fmt(end), label, env);
}
async function tgFinishConfirmation(chatId, state, env) {
  const d = state.data;
  await tgSend(env, chatId, `🧾 <b>KONFIRMASI ${state.kind === 'income' ? 'PEMASUKAN' : 'PENGELUARAN'}</b>\n\nNominal: <b>${rupiah(d.amount, d.currency || 'IDR')}</b>\nKategori: ${tgEscape(d.categoryName)}\nAkun: ${tgEscape(d.accountName)}\nKeterangan: ${tgEscape(d.description)}\nTanggal: ${tgEscape(tgFormatDate(d.occurredAt, d.timezone || 'Asia/Jakarta'))}\nFoto: ${d.photoKey ? 'Terlampir' : 'Tidak ada'}\n\nSimpan transaksi ini?`, [[{ text: '✅ Simpan Transaksi', callback_data: 'flow:confirm' }, { text: '✖️ Batalkan', callback_data: 'flow:cancel' }]]);
}
async function quickTgTransactionWithPhoto(message, link, env) {
  const caption = String(message.caption || '').trim(); const match = caption.match(/^\/(masuk|keluar)(?:\s+|$)(.*)$/i);
  if (!match) return false;
  const kind = match[1].toLowerCase() === 'masuk' ? 'income' : 'expense'; const parts = match[2].trim().split(/\s+/); const amount = parseAmount(parts.shift() || '');
  if (!amount || !parts.length) { await tgSend(env, message.chat.id, 'Format caption foto: <code>/keluar 25000 Makanan Beli sarapan</code>.'); return true; }
  const categoryName = parts.shift(); const description = parts.join(' ') || categoryName;
  const category = await env.DB.prepare(`SELECT id,name FROM categories WHERE user_id=? AND kind=? AND (lower(name)=lower(?) OR lower(name) LIKE lower(?) || '%') ORDER BY length(name) LIMIT 1`).bind(link.user_id, kind, categoryName, categoryName).first();
  const account = await env.DB.prepare(`SELECT id,name FROM accounts WHERE user_id=? AND archived=0 ORDER BY CASE type WHEN 'cash' THEN 0 ELSE 1 END,created_at LIMIT 1`).bind(link.user_id).first();
  if (!category || !account) { await tgSend(env, message.chat.id, 'Kategori atau akun default tidak ditemukan. Gunakan input bertahap melalui /menu.'); return true; }
  const photos = message.photo || []; const photo = photos[photos.length - 1]; const info = await telegramAPI(env, 'getFile', { file_id: photo.file_id });
  if (Number(info.file_size || 0) > MAX_IMAGE_BYTES) { await tgSend(env, message.chat.id, 'Foto terlalu besar. Maksimal 5 MB.'); return true; }
  const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${info.file_path}`); if (!res.ok) throw new Error('Tidak dapat mengunduh foto dari Telegram.'); const bytes = new Uint8Array(await res.arrayBuffer()); const mime = sniffImage(bytes);
  if (!mime || bytes.byteLength > MAX_IMAGE_BYTES) { await tgSend(env, message.chat.id, 'Format foto tidak valid atau lebih dari 5 MB.'); return true; }
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'; const key = `transactions/${link.user_id}/${uuid()}.${ext}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime, cacheControl: 'private, no-store' }, customMetadata: { owner: link.user_id } });
  const id = uuid(); const stamp = nowISO(); const receipt = makeReceiptNo();
  try { await env.DB.batch([
    env.DB.prepare(`INSERT INTO transactions(id,user_id,receipt_no,kind,amount,category_id,account_id,occurred_at,description,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'telegram',?,?)`).bind(id, link.user_id, receipt, kind, amount, category.id, account.id, stamp, cleanText(description,180), stamp, stamp),
    env.DB.prepare('INSERT INTO transaction_attachments(id,user_id,transaction_id,object_key,filename,mime_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(uuid(), link.user_id, id, key, `telegram-${Date.now()}.${ext}`, mime, bytes.byteLength, stamp)
  ]); } catch (error) { await env.BUCKET.delete(key); throw error; }
  await tgSend(env, message.chat.id, `✅ <b>Transaksi dan foto berhasil dicatat</b>\n${kind === 'income' ? 'Pemasukan' : 'Pengeluaran'}: <b>${rupiah(amount, link.currency || 'IDR')}</b>\nKategori: ${tgEscape(category.name)}\nKeterangan: ${tgEscape(description)}\nNo. transaksi: <code>${receipt}</code>`);
  return true;
}

async function handleTgPhoto(message, link, state, env) {
  if (!state || state.step !== 'photo') { const handled = await quickTgTransactionWithPhoto(message, link, env); if (!handled) await tgSend(env, message.chat.id, 'Foto diterima, tetapi tidak ada transaksi yang sedang menunggu foto. Mulai dari /menu atau kirim foto dengan caption perintah, misalnya /keluar 25000 Makanan Beli sarapan.'); return; }
  const photos = message.photo || []; const photo = photos[photos.length - 1];
  const fileInfo = await telegramAPI(env, 'getFile', { file_id: photo.file_id });
  if (Number(fileInfo.file_size || 0) > MAX_IMAGE_BYTES) { await tgSend(env, message.chat.id, 'Ukuran foto maksimal 5 MB. Kirim foto yang lebih kecil atau ketik <code>lewati</code>.'); return; }
  const token = env.TELEGRAM_BOT_TOKEN;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`);
  if (!fileRes.ok) throw new Error('Tidak dapat mengunduh foto dari Telegram.');
  const buffer = new Uint8Array(await fileRes.arrayBuffer()); const mime = sniffImage(buffer);
  if (!mime || buffer.byteLength > MAX_IMAGE_BYTES) { await tgSend(env, message.chat.id, 'Format foto tidak didukung atau ukuran melebihi 5 MB. Gunakan JPG, PNG, atau WEBP.'); return; }
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'; const key = `transactions/${state.userId}/${uuid()}.${ext}`;
  await env.BUCKET.put(key, buffer, { httpMetadata: { contentType: mime, cacheControl: 'private, no-store' }, customMetadata: { owner: state.userId } });
  state.data.photoKey = key; state.data.photoMime = mime; state.data.photoSize = buffer.byteLength; state.data.photoName = `telegram-${Date.now()}.${ext}`; state.step = 'confirm';
  await saveTgState(message.chat.id, state.userId, state, env); await tgFinishConfirmation(message.chat.id, state, env);
}
function parseIndonesianAmount(text) {
  const match = String(text).match(/(?:rp\s*)?(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb|k)?/i);
  if (!match) return null;
  const raw = match[1]; const unit = (match[2] || '').toLowerCase();
  let amount;
  if (unit) { const numeric = Number(raw.replace(',', '.')); const multiplier = ['juta','jt'].includes(unit) ? 1000000 : 1000; amount = Math.round(numeric * multiplier); }
  else amount = Number(raw.replace(/[^0-9]/g, ''));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 999999999999 ? amount : null;
}
function inferNaturalCategory(text, kind) {
  const value = text.toLowerCase();
  const patterns = kind === 'expense' ? [
    [/kopi|makan|sarapan|minum|restoran|warung|jajan/, 'Makanan dan minuman'],
    [/bensin|transport|ojek|taksi|taxi|kereta|parkir/, 'Transportasi'],
    [/belanja|supermarket|minimarket|pasar/, 'Belanja'],
    [/listrik|token listrik/, 'Tagihan listrik'], [/internet|wifi|kuota/, 'Internet'],
    [/obat|dokter|rumah sakit|klinik/, 'Kesehatan'], [/sekolah|kuliah|buku|kursus/, 'Pendidikan'],
    [/film|bioskop|game|hiburan/, 'Hiburan'], [/cicilan|angsuran/, 'Cicilan'], [/sedekah|donasi|zakat/, 'Sedekah']
  ] : [
    [/gaji|salary/, 'Gaji'], [/usaha|bisnis/, 'Hasil usaha'], [/penjualan|menjual|jual/, 'Penjualan'],
    [/bonus|insentif/, 'Bonus'], [/hadiah|kado/, 'Hadiah'], [/transfer/, 'Transfer masuk'], [/investasi|dividen/, 'Investasi']
  ];
  return patterns.find(([regex]) => regex.test(value))?.[1] || null;
}
async function handleNaturalLanguage(message, link, env) {
  const text = String(message.text || '').trim(); const lower = text.toLowerCase();
  const income = /pemasukan|menerima|terima|dapat uang|mendapat|gaji|penjualan|uang masuk/.test(lower);
  const expense = /pengeluaran|mengeluarkan|membeli|beli |bayar|membayar|belanja/.test(lower);
  if (income === expense) {
    const amountHint = parseIndonesianAmount(text);
    if (amountHint) await tgSend(env, message.chat.id, `Aku menemukan nominal <b>${rupiah(amountHint, link.currency || 'IDR')}</b>. Ini termasuk pemasukan atau pengeluaran? Gunakan /masuk atau /keluar, atau pilih dari /menu.`);
    else await tgSend(env, message.chat.id, 'Aku belum bisa memastikan jenis dan nominal transaksi. Tulis misalnya <code>Pengeluaran 20 ribu untuk beli kopi</code>, <code>Menerima 500 ribu dari gaji</code>, atau gunakan /menu.');
    return true;
  }
  const kind = income ? 'income' : 'expense'; const amount = parseIndonesianAmount(text);
  if (!amount) { await tgSend(env, message.chat.id, 'Aku belum menemukan nominalnya. Coba tulis misalnya <code>Pengeluaran 20 ribu untuk beli kopi</code> atau gunakan /masuk dan /keluar.'); return true; }
  const profile = await env.DB.prepare('SELECT currency FROM users WHERE id=?').bind(link.user_id).first();
  const account = await env.DB.prepare(`SELECT id,name FROM accounts WHERE user_id=? AND archived=0 ORDER BY CASE type WHEN 'cash' THEN 0 ELSE 1 END,created_at LIMIT 1`).bind(link.user_id).first();
  if (!account) { await tgSend(env, message.chat.id, 'Belum ada akun keuangan aktif. Tambahkan akun melalui website terlebih dahulu.'); return true; }
  const categoryName = inferNaturalCategory(text, kind);
  const state = { kind, step: categoryName ? 'confirm' : 'category', data: { amount, accountId: account.id, accountName: account.name, description: cleanText(text, 180), occurredAt: nowISO(), currency: profile?.currency || 'IDR', timezone: link.timezone || 'Asia/Jakarta' } };
  if (categoryName) {
    const category = await env.DB.prepare('SELECT id,name FROM categories WHERE user_id=? AND kind=? AND lower(name)=lower(?)').bind(link.user_id, kind, categoryName).first();
    if (category) { state.data.categoryId = category.id; state.data.categoryName = category.name; }
    else state.step = 'category';
  }
  await saveTgState(message.chat.id, link.user_id, state, env);
  if (state.step === 'category') {
    const cats = await env.DB.prepare('SELECT name FROM categories WHERE user_id=? AND kind=? ORDER BY name').bind(link.user_id, kind).all();
    await tgSend(env, message.chat.id, `Aku menemukan nominal ${rupiah(amount, profile?.currency || 'IDR')}, tetapi kategorinya belum jelas. Pilih kategori dengan mengetik namanya:\n${(cats.results || []).map(x => `• ${tgEscape(x.name)}`).join('\n')}`);
  } else await tgFinishConfirmation(message.chat.id, state, env);
  return true;
}

async function handleTgText(message, link, env) {
  const chatId = String(message.chat.id); const text = String(message.text || '').trim(); const [commandRaw, ...rest] = text.split(/\s+/); const command = commandRaw.split('@')[0].toLowerCase(); const args = rest.join(' ');
  if (command === '/hubungkan') {
    const code = cleanText(args, 32).toUpperCase(); if (!code) { await tgSend(env, chatId, 'Gunakan: <code>/hubungkan KODE</code>. Buat kode dari menu Integrasi Telegram di website.'); return; }
    const codeHash = await sha256(code); const pair = await env.DB.prepare('SELECT id,user_id FROM telegram_pairing_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>?').bind(codeHash, nowISO()).first();
    if (!pair) { await tgSend(env, chatId, 'Kode pairing tidak valid atau sudah kedaluwarsa. Buat kode baru dari website.'); return; }
    const existing = await env.DB.prepare('SELECT user_id FROM telegram_links WHERE chat_id=?').bind(chatId).first();
    if (existing && existing.user_id !== pair.user_id) { await tgSend(env, chatId, 'Chat Telegram ini sudah terhubung ke akun lain. Putuskan hubungan terlebih dahulu.'); return; }
    const already = await env.DB.prepare('SELECT chat_id FROM telegram_links WHERE user_id=?').bind(pair.user_id).first();
    if (already && already.chat_id !== chatId) { await tgSend(env, chatId, 'Akun ARUSKAS ini sudah terhubung ke chat Telegram lain. Putuskan hubungan dari website terlebih dahulu.'); return; }
    await env.DB.batch([
      env.DB.prepare('UPDATE telegram_pairing_codes SET used_at=? WHERE id=?').bind(nowISO(), pair.id),
      env.DB.prepare(`INSERT INTO telegram_links(id,user_id,chat_id,telegram_username,linked_at) VALUES(?,?,?,?,?)
        ON CONFLICT(chat_id) DO UPDATE SET user_id=excluded.user_id,telegram_username=excluded.telegram_username,linked_at=excluded.linked_at`).bind(uuid(), pair.user_id, chatId, cleanText(message.from?.username || '', 64), nowISO())
    ]);
    await tgSend(env, chatId, '✅ <b>Akun ARUSKAS berhasil dihubungkan!</b>\nKetik /menu untuk mulai menggunakan bot.'); return;
  }
  if (command === '/start') {
    if (link) await tgMenu(chatId, env);
    else await tgSend(env, chatId, '👋 <b>Selamat datang di ARUSKAS Bot!</b>\n\nUntuk menghubungkan akun:\n1. Login ke website ARUSKAS.\n2. Buka Integrasi Telegram.\n3. Buat kode pairing.\n4. Kirim <code>/hubungkan KODE</code> ke bot ini.\n\nKode berlaku 5 menit dan hanya dapat digunakan sekali.');
    return;
  }
  if (!link) { await tgSend(env, chatId, 'Akun Telegram belum terhubung. Ketik /start untuk melihat panduan.'); return; }
  if (command === '/menu') { await tgMenu(chatId, env); return; }
  if (command === '/bantuan') { await tgSend(env, chatId, 'Perintah ARUSKAS:\n/menu — menu utama\n/masuk 500000 Gaji — catat pemasukan\n/keluar 25000 Makanan Beli sarapan — catat pengeluaran\n/saldo — lihat saldo\n/riwayat — 5 transaksi terakhir\n/laporan — pilih periode laporan\n/batal — batalkan input aktif'); return; }
  if (command === '/saldo') { await tgBalance(chatId, link.user_id, env); return; }
  if (command === '/riwayat') { await tgHistory(chatId, link.user_id, env); return; }
  if (command === '/laporan') { await tgReportMenu(chatId, env); return; }
  if (command === '/batal') { await clearTgState(chatId, env, true); await tgSend(env, chatId, 'Input transaksi dibatalkan. Ketik /menu untuk kembali.'); return; }
  if (command === '/masuk' || command === '/keluar') { const kind = command === '/masuk' ? 'income' : 'expense'; if (args) await quickTgTransaction(chatId, link.user_id, kind, args, env); else await startTgFlow(chatId, link.user_id, kind, env); return; }

  let state = await getTgState(chatId, env);
  if (!state) { const handled = await handleNaturalLanguage(message, link, env); if (!handled) await tgSend(env, chatId, 'Perintah tidak dikenali. Ketik /menu atau /bantuan.'); return; }
  if (state.type === 'report') {
    if (!isDateOnly(text)) { await tgSend(env, chatId, 'Format tanggal tidak valid. Gunakan YYYY-MM-DD, misalnya <code>2026-11-01</code>.'); return; }
    if (state.step === 'start') { state.data.start = text; state.step = 'end'; await saveTgState(chatId, link.user_id, state, env); await tgSend(env, chatId, 'Sekarang masukkan tanggal akhir dengan format <code>YYYY-MM-DD</code>.'); return; }
    if (state.step === 'end') {
      if (text < state.data.start) { await tgSend(env, chatId, 'Tanggal akhir tidak boleh lebih awal dari tanggal mulai. Masukkan tanggal akhir lagi.'); return; }
      await clearTgState(chatId, env, false); await tgReportRange(chatId, link.user_id, state.data.start, text, 'Rentang tanggal', env); return;
    }
  }
  if (state.step === 'amount') {
    const amount = parseAmount(text); if (!amount) { await tgSend(env, chatId, 'Nominal tidak valid. Masukkan angka, contoh <code>25000</code>.'); return; }
    state.data.amount = amount; state.step = 'category'; await saveTgState(chatId, link.user_id, state, env);
    const cats = await env.DB.prepare('SELECT name FROM categories WHERE user_id=? AND kind=? ORDER BY name').bind(link.user_id, state.kind).all();
    await tgSend(env, chatId, `Pilih kategori dengan mengetik namanya:\n${(cats.results || []).map(x => `• ${tgEscape(x.name)}`).join('\n')}`); return;
  }
  if (state.step === 'category') {
    const cat = await env.DB.prepare('SELECT id,name FROM categories WHERE user_id=? AND kind=? AND lower(name)=lower(?)').bind(link.user_id, state.kind, text).first();
    if (!cat) { await tgSend(env, chatId, 'Kategori tidak ditemukan. Ketik salah satu nama kategori dari daftar sebelumnya.'); return; }
    state.data.categoryId = cat.id; state.data.categoryName = cat.name; state.step = 'account'; await saveTgState(chatId, link.user_id, state, env);
    const accounts = await env.DB.prepare('SELECT id,name FROM accounts WHERE user_id=? AND archived=0 ORDER BY created_at').bind(link.user_id).all();
    await tgSend(env, chatId, `Pilih akun dengan mengetik namanya:\n${(accounts.results || []).map(x => `• ${tgEscape(x.name)}`).join('\n')}`); return;
  }
  if (state.step === 'account') {
    const account = await env.DB.prepare('SELECT id,name FROM accounts WHERE user_id=? AND archived=0 AND lower(name)=lower(?)').bind(link.user_id, text).first();
    if (!account) { await tgSend(env, chatId, 'Akun tidak ditemukan. Ketik salah satu nama akun dari daftar sebelumnya.'); return; }
    state.data.accountId = account.id; state.data.accountName = account.name; state.step = 'description'; await saveTgState(chatId, link.user_id, state, env);
    await tgSend(env, chatId, 'Masukkan keterangan transaksi. Contoh: <code>Makan siang bersama teman</code>.'); return;
  }
  if (state.step === 'description') {
    if (text.length < 2) { await tgSend(env, chatId, 'Keterangan minimal 2 karakter.'); return; }
    state.data.description = cleanText(text, 180); state.step = 'datetime'; await saveTgState(chatId, link.user_id, state, env);
    await tgSend(env, chatId, 'Masukkan tanggal dan jam dengan format <code>YYYY-MM-DD HH:mm</code>, atau ketik <code>sekarang</code>.'); return;
  }
  if (state.step === 'datetime') {
    if (text.toLowerCase() === 'sekarang') state.data.occurredAt = nowISO();
    else {
      const m = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
      if (!m || Number.isNaN(new Date(`${m[1]}T${m[2]}:00+07:00`).getTime())) { await tgSend(env, chatId, 'Format tanggal tidak sesuai. Gunakan <code>2026-11-04 09:30</code> atau ketik <code>sekarang</code>.'); return; }
      state.data.occurredAt = localTimeToUTC(m[1], m[2], link.timezone || 'Asia/Jakarta');
    }
    state.step = 'photo'; await saveTgState(chatId, link.user_id, state, env);
    await tgSend(env, chatId, 'Kirim foto bukti transaksi sekarang, atau ketik <code>lewati</code> jika tidak ada foto.'); return;
  }
  if (state.step === 'photo') {
    if (['lewati', 'skip', 'tidak'].includes(text.toLowerCase())) { state.step = 'confirm'; await saveTgState(chatId, link.user_id, state, env); await tgFinishConfirmation(chatId, state, env); return; }
    await tgSend(env, chatId, 'Kirim foto sebagai lampiran atau ketik <code>lewati</code>.'); return;
  }
  if (state.step === 'confirm') { await tgSend(env, chatId, 'Gunakan tombol Simpan Transaksi atau Batalkan pada pesan konfirmasi.'); }
}
async function handleTgCallback(callback, env) {
  if (callback.message?.chat?.type !== 'private') return;
  const chatId = String(callback.message.chat.id); const data = callback.data || ''; const link = await getTgLink(chatId, env);
  await telegramAPI(env, 'answerCallbackQuery', { callback_query_id: callback.id });
  if (!link) { await tgSend(env, chatId, 'Akun belum terhubung. Ketik /start.'); return; }
  if (data === 'menu:income') return startTgFlow(chatId, link.user_id, 'income', env);
  if (data === 'menu:expense') return startTgFlow(chatId, link.user_id, 'expense', env);
  if (data === 'menu:balance') return tgBalance(chatId, link.user_id, env);
  if (data === 'menu:history') return tgHistory(chatId, link.user_id, env);
  if (data === 'menu:report') return tgReportMenu(chatId, env);
  if (data === 'menu:settings') {
    const profile = await env.DB.prepare(`SELECT u.username,u.full_name,u.currency,u.timezone,s.notifications_json FROM users u JOIN user_settings s ON s.user_id=u.id WHERE u.id=?`).bind(link.user_id).first();
    let n = {}; try { n = JSON.parse(profile.notifications_json || '{}'); } catch {}
    await tgSend(env, chatId, `⚙️ <b>PENGATURAN ARUSKAS</b>\nNama: ${tgEscape(profile.full_name)}\nUsername: @${tgEscape(profile.username)}\nMata uang: ${tgEscape(profile.currency)}\nZona waktu: ${tgEscape(profile.timezone)}\n\nPengingat Telegram: harian ${n.daily ? 'aktif' : 'nonaktif'}, mingguan ${n.weekly ? 'aktif' : 'nonaktif'}, bulanan ${n.monthly ? 'aktif' : 'nonaktif'}.\nUbah profil dan pengingat melalui menu Pengaturan di website.`, [[{ text: 'Putuskan hubungan Telegram', callback_data: 'tg:unlink:ask' }]]);
    return;
  }
  if (data === 'tg:unlink:ask') { await tgSend(env, chatId, 'Yakin ingin memutuskan hubungan bot ini dari akun ARUSKAS?', [[{ text: 'Ya, putuskan', callback_data: 'tg:unlink:yes' }, { text: 'Tidak', callback_data: 'tg:unlink:no' }]]); return; }
  if (data === 'tg:unlink:no') { await tgSend(env, chatId, 'Hubungan Telegram tetap aktif.'); return; }
  if (data === 'tg:unlink:yes') {
    const pending = await env.DB.prepare('SELECT state_json FROM telegram_pending_states WHERE user_id=?').bind(link.user_id).all();
    for (const row of pending.results || []) { try { const state = JSON.parse(row.state_json); if (state.photoKey) await env.BUCKET.delete(state.photoKey); } catch {} }
    await env.DB.prepare('DELETE FROM telegram_pending_states WHERE user_id=?').bind(link.user_id).run();
    await env.DB.prepare('DELETE FROM telegram_pairing_codes WHERE user_id=?').bind(link.user_id).run();
    await env.DB.prepare('DELETE FROM telegram_links WHERE user_id=?').bind(link.user_id).run();
    await tgSend(env, chatId, 'Hubungan Telegram sudah diputuskan. Untuk menghubungkan kembali, buat kode baru dari menu Integrasi Telegram di website.'); return;
  }
  if (data === 'menu:help') return tgSend(env, chatId, 'Gunakan /masuk dan /keluar untuk mencatat transaksi, /saldo untuk saldo, /riwayat untuk transaksi terbaru, dan /laporan untuk memilih periode laporan.');
  if (data.startsWith('report:')) {
    const period = data.slice('report:'.length);
    if (period === 'custom') { await saveTgState(chatId, link.user_id, { type: 'report', step: 'start', data: {} }, env); await tgSend(env, chatId, 'Masukkan tanggal mulai laporan dengan format <code>YYYY-MM-DD</code>.'); return; }
    if (['today','week','month','lastmonth','year'].includes(period)) return tgReport(chatId, link.user_id, period, env);
  }
  if (data.startsWith('history:')) {
    const id = data.slice('history:'.length);
    const row = await env.DB.prepare(`SELECT t.receipt_no,t.kind,t.amount,t.occurred_at,t.counterparty,t.description,t.notes,c.name AS category_name,a.name AS account_name,u.currency,u.timezone
      FROM transactions t JOIN categories c ON c.id=t.category_id JOIN accounts a ON a.id=t.account_id JOIN users u ON u.id=t.user_id
      WHERE t.id=? AND t.user_id=? AND t.deleted_at IS NULL LIMIT 1`).bind(id, link.user_id).first();
    if (!row) { await tgSend(env, chatId, 'Transaksi tidak ditemukan.'); return; }
    await tgSend(env, chatId, `🧾 <b>DETAIL TRANSAKSI</b>\nNo: <code>${tgEscape(row.receipt_no)}</code>\nJenis: ${row.kind === 'income' ? 'Pemasukan' : 'Pengeluaran'}\nNominal: <b>${rupiah(row.amount,row.currency || 'IDR')}</b>\nKategori: ${tgEscape(row.category_name)}\nAkun: ${tgEscape(row.account_name)}\nTanggal: ${tgEscape(tgFormatDate(row.occurred_at, row.timezone || 'Asia/Jakarta'))}\nKeterangan: ${tgEscape(row.description)}${row.counterparty ? `\nSumber/Penerima: ${tgEscape(row.counterparty)}` : ''}${row.notes ? `\nCatatan: ${tgEscape(row.notes)}` : ''}`); return;
  }
  const state = await getTgState(chatId, env);
  if (data === 'flow:cancel') { await clearTgState(chatId, env, true); await tgSend(env, chatId, 'Transaksi dibatalkan.'); return; }
  if (data === 'flow:confirm') {
    if (!state || state.step !== 'confirm') { await tgSend(env, chatId, 'Sesi input sudah berakhir. Mulai lagi dari /menu.'); return; }
    const d = state.data; const id = uuid(); const stamp = nowISO(); const receipt = makeReceiptNo(new Date(d.occurredAt));
    const statements = [env.DB.prepare(`INSERT INTO transactions(id,user_id,receipt_no,kind,amount,category_id,account_id,occurred_at,description,source,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'telegram',?,?)`).bind(id, link.user_id, receipt, state.kind, d.amount, d.categoryId, d.accountId, d.occurredAt, d.description, stamp, stamp)];
    if (d.photoKey) statements.push(env.DB.prepare('INSERT INTO transaction_attachments(id,user_id,transaction_id,object_key,filename,mime_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(uuid(), link.user_id, id, d.photoKey, d.photoName || 'bukti-telegram', d.photoMime || 'image/jpeg', d.photoSize || 0, stamp));
    await env.DB.batch(statements);
    await clearTgState(chatId, env, false);
    await tgSend(env, chatId, `✅ <b>Transaksi berhasil disimpan!</b>\nNominal: <b>${rupiah(d.amount, d.currency || 'IDR')}</b>\nKategori: ${tgEscape(d.categoryName)}\nNo. transaksi: <code>${receipt}</code>\n\nData ini sudah tersimpan dan akan muncul di website ARUSKAS.`); return;
  }
}
async function telegramWebhook(request, env) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !safeEqual(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '', secret)) return new Response('Forbidden', { status: 403 });
  let update; try { update = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }
  try {
    if (update.update_id !== undefined) { const marker = await env.DB.prepare('INSERT OR IGNORE INTO telegram_updates(update_id,received_at) VALUES(?,?)').bind(String(update.update_id), nowISO()).run(); if (!marker.meta.changes) return new Response('OK'); }
    if (update.callback_query) await handleTgCallback(update.callback_query, env);
    else if (update.message) {
      const msg = update.message; const chatId = String(msg.chat.id);
      if (msg.chat.type !== 'private') { await tgSend(env, chatId, 'Demi keamanan, ARUSKAS Bot hanya dapat digunakan melalui chat pribadi (private chat).'); return new Response('OK'); }
      if (msg.photo) {
        const link = await getTgLink(chatId, env); if (!link) await tgSend(env, chatId, 'Akun belum terhubung. Ketik /start untuk panduan.');
        else { const state = await getTgState(chatId, env); await handleTgPhoto(msg, link, state, env); }
      } else if (msg.text) {
        const link = await getTgLink(chatId, env); await handleTgText(msg, link, env);
      }
    }
  } catch (error) {
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) { try { await tgSend(env, chatId, `Maaf, terjadi kendala saat memproses pesan. ${tgEscape(error.message || '')}`); } catch {} }
  }
  return new Response('OK');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/telegram/webhook' && request.method === 'POST') return telegramWebhook(request, env);
    try {
      const response = await apiHandler(request, env, ctx);
      return withCors(response, request, env);
    } catch (error) {
      const status = error.status || 400;
      return withCors(fail(error.message || 'Terjadi kesalahan pada server.', status, error.code || 'REQUEST_FAILED'), request, env);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const stamp = nowISO();
      const expiredPending = await env.DB.prepare('SELECT state_json FROM telegram_pending_states WHERE expires_at<?').bind(stamp).all();
      for (const row of expiredPending.results || []) { try { const state = JSON.parse(row.state_json); if (state.photoKey) await env.BUCKET.delete(state.photoKey); } catch {} }
      await Promise.all([
        env.DB.prepare('DELETE FROM user_sessions WHERE expires_at<?').bind(stamp).run(),
        env.DB.prepare('DELETE FROM telegram_pairing_codes WHERE expires_at<? OR used_at IS NOT NULL').bind(stamp).run(),
        env.DB.prepare('DELETE FROM telegram_pending_states WHERE expires_at<?').bind(stamp).run(),
        env.DB.prepare('DELETE FROM auth_attempts WHERE attempted_at<?').bind(new Date(Date.now() - 24 * 3600000).toISOString()).run(),
        env.DB.prepare('DELETE FROM telegram_updates WHERE received_at<?').bind(new Date(Date.now() - 7 * 86400000).toISOString()).run()
      ]);
      const users = await env.DB.prepare(`SELECT u.id,u.timezone,s.notifications_json,l.chat_id FROM users u
        JOIN user_settings s ON s.user_id=u.id JOIN telegram_links l ON l.user_id=u.id`).all();
      const now = new Date();
      for (const row of users.results || []) {
        let prefs = {}; try { prefs = JSON.parse(row.notifications_json || '{}'); } catch {}
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: row.timezone || 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: '2-digit', year: 'numeric' }).formatToParts(now);
        const local = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
        const dateKey = `${local.year}-${local.month}-${String(local.day).padStart(2,'0')}`;
        const jobs = [];
        if (prefs.daily) jobs.push(['daily', `🌿 <b>Pengingat ARUSKAS</b>\nLuangkan sebentar untuk mencatat transaksi hari ini. Catatan kecil membantu menjaga arus keuangan tetap jelas.`]);
        if (prefs.weekly && local.weekday === 'Mon') jobs.push(['weekly', `📊 <b>Rekap mingguan ARUSKAS</b>\nSaatnya meninjau pemasukan dan pengeluaran minggu lalu. Ketik /laporan untuk melihat ringkasan bulan ini.`]);
        if (prefs.monthly && local.day === '1') jobs.push(['monthly', `🗓️ <b>Evaluasi bulanan ARUSKAS</b>\nBuka laporan untuk mengevaluasi arus kas dan merencanakan bulan yang baru.`]);
        for (const [type, message] of jobs) {
          const key = `reminder_${type}_${dateKey}`;
          const exists = await env.DB.prepare('SELECT id FROM notifications WHERE user_id=? AND type=? LIMIT 1').bind(row.id, key).first();
          if (exists) continue;
          await env.DB.prepare('INSERT INTO notifications(id,user_id,type,title,message,created_at) VALUES(?,?,?,?,?,?)').bind(uuid(), row.id, key, 'Pengingat ARUSKAS', message.replace(/<[^>]+>/g,''), stamp).run();
          try { await tgSend(env, row.chat_id, message); } catch {}
        }
      }
    })());
  }
};
