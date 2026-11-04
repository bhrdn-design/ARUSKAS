const API_BASE = String(window.ARUSKAS_CONFIG?.API_BASE_URL || '').replace(/\/$/, '');
let currentUser = null;
let currentDateFormat = 'DD MMM YYYY';

const CLIENT_KDF_ITERATIONS = 600000;
function encodeBase64Url(bytes) {
  let raw = ''; for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export async function derivePassword(password, saltB64 = null, iterations = CLIENT_KDF_ITERATIONS) {
  if (!window.crypto?.subtle) throw new Error('Browser tidak mendukung Web Crypto. Gunakan HTTPS atau browser terbaru.');
  const salt = saltB64 ? decodeBase64Url(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: Number(iterations || CLIENT_KDF_ITERATIONS) }, key, 256);
  return { derived: encodeBase64Url(new Uint8Array(bits)), salt: encodeBase64Url(salt) };
}
export function setCurrentUser(user) { currentUser = user; }
export function getCurrentUser() { return currentUser; }
export function setDateFormat(value) { currentDateFormat = ['DD MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].includes(value) ? value : 'DD MMM YYYY'; }
export function setToken(token, remember = false) {
  localStorage.removeItem('aruskas_token'); sessionStorage.removeItem('aruskas_token');
  (remember ? localStorage : sessionStorage).setItem('aruskas_token', token);
}
export function getToken() { return sessionStorage.getItem('aruskas_token') || localStorage.getItem('aruskas_token') || ''; }
export function clearSession() { localStorage.removeItem('aruskas_token'); sessionStorage.removeItem('aruskas_token'); currentUser = null; }
export function apiConfigured() { return API_BASE && !API_BASE.includes('example.workers.dev'); }
export async function api(path, options = {}) {
  if (!apiConfigured()) throw new Error('Alamat API belum diatur. Buka assets/js/config.js dan isi API_BASE_URL dari Cloudflare Worker kamu.');
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (options.auth !== false && token) headers.set('Authorization', `Bearer ${token}`);
  let body = options.body;
  if (body !== undefined && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json'); body = JSON.stringify(body);
  }
  const response = await fetch(`${API_BASE}${path}`, { method: options.method || 'GET', headers, body, cache: 'no-store' });
  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) data = await response.json();
  else if (response.ok) return response;
  else data = { error: await response.text() };
  if (response.status === 401 && options.auth !== false) {
    clearSession(); window.dispatchEvent(new CustomEvent('aruskas:unauthorized'));
  }
  if (!response.ok || data?.ok === false) throw new Error(data?.error || `Permintaan gagal (${response.status}).`);
  return data;
}
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
export function money(value, currency = currentUser?.currency || 'IDR') {
  try { return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0)); }
  catch { return `Rp${Number(value || 0).toLocaleString('id-ID')}`; }
}
export function dateParts(date = new Date(), timeZone = currentUser?.timezone || 'Asia/Jakarta') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
export function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value); if (Number.isNaN(date.getTime())) return '—';
  const zone = options.timeZone || currentUser?.timezone || 'Asia/Jakarta';
  const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', ...(options.time ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}), timeZone: zone }).formatToParts(date);
  const o = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  let formatted = currentDateFormat === 'YYYY-MM-DD' ? `${o.year}-${o.month}-${o.day}` : currentDateFormat === 'DD/MM/YYYY' ? `${o.day}/${o.month}/${o.year}` : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: zone }).format(date);
  if (options.time) formatted += `, ${o.hour}:${o.minute}`;
  return formatted;
}
export function zonedLocalToUtc(date, time, timeZone = currentUser?.timezone || 'Asia/Jakarta') {
  const [y, m, d] = date.split('-').map(Number); const [hh, mm, ss = 0] = time.split(':').map(Number);
  let guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  for (let i = 0; i < 4; i++) {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(guess);
    const o = Object.fromEntries(p.filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
    const represented = Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second);
    const target = Date.UTC(y, m - 1, d, hh, mm, ss);
    const delta = target - represented;
    if (!delta) break;
    guess = new Date(guess.getTime() + delta);
  }
  return guess.toISOString();
}
export function localDateTimeInput(value = new Date(), timeZone = currentUser?.timezone || 'Asia/Jakarta') {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  const o = Object.fromEntries(p.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}` };
}
export function getPeriodRange(period, timeZone = currentUser?.timezone || 'Asia/Jakarta') {
  const today = dateParts(new Date(), timeZone); const current = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day)));
  const fmt = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  let start = new Date(current); let end = new Date(current);
  if (period === 'yesterday') { start.setUTCDate(start.getUTCDate() - 1); end = new Date(start); }
  else if (period === 'week') { const day = (current.getUTCDay() + 6) % 7; start.setUTCDate(start.getUTCDate() - day); }
  else if (period === 'month') start.setUTCDate(1);
  else if (period === 'lastmonth') { start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() - 1); end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0); }
  else if (period === 'year') { start = new Date(Date.UTC(current.getUTCFullYear(), 0, 1)); }
  else if (period === 'all') return { start: null, end: null };
  const startDate = fmt(start); const endDate = fmt(end);
  return { start: zonedLocalToUtc(startDate, '00:00', timeZone), end: zonedLocalToUtc(endDate, '23:59:59', timeZone) };
}
export function toast(message, type = 'success') {
  const region = document.getElementById('toast-region'); if (!region) return;
  const node = document.createElement('div'); node.className = `toast ${type}`;
  const icon = type === 'error' ? 'alert-circle' : 'check-circle-2';
  node.innerHTML = `<i data-lucide="${icon}"></i><span>${esc(message)}</span>`;
  region.append(node); window.lucide?.createIcons?.(); setTimeout(() => node.remove(), 4200);
}
export function openModal(title, content, eyebrow = 'ARUSKAS') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-eyebrow').textContent = eyebrow;
  document.getElementById('modal-content').innerHTML = content;
  document.getElementById('modal-backdrop').classList.remove('hidden');
  window.lucide?.createIcons?.();
}
export function closeModal() { document.getElementById('modal-backdrop')?.classList.add('hidden'); }
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
export async function imageUrl(path) {
  const response = await api(path);
  const blob = await response.blob(); return URL.createObjectURL(blob);
}
export function iconRefresh() { window.lucide?.createIcons?.(); }
export function confirmAction(message = 'Yakin ingin melanjutkan?') { return window.confirm(message); }
