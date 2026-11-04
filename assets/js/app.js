import { api, getToken, setCurrentUser, getCurrentUser, clearSession, toast, iconRefresh, setDateFormat } from './api.js';
import { initAuth, showAuth, showApp } from './auth.js';
import { loadDashboard } from './dashboard.js';
import { mountTransactionForm, initTransactionEvents, loadHistory, populateHistoryAccounts } from './transactions.js';
import { initReportDefaults, loadReport } from './reports.js';
import { loadAccounts, loadCategories, loadProfileView, loadSettingsView, initSettingsEvents, applyTheme } from './settings.js';
import { loadTelegram, initTelegramEvents } from './telegram.js';

const titles = { dashboard: 'Dashboard', income: 'Pemasukan', expense: 'Pengeluaran', history: 'Riwayat transaksi', reports: 'Laporan', accounts: 'Akun keuangan', categories: 'Kategori', telegram: 'Integrasi Telegram', profile: 'Profil saya', settings: 'Pengaturan' };
let currentView = 'dashboard';
let initialized = false;
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; document.getElementById('install-app')?.classList.remove('hidden'); });
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; document.getElementById('install-app')?.classList.add('hidden'); toast('ARUSKAS berhasil dipasang di perangkat.'); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

function updateHeader() {
  const user = getCurrentUser(); if (!user) return;
  document.getElementById('top-name').textContent = user.full_name;
  document.getElementById('top-username').textContent = `@${user.username}`;
  const avatar = document.getElementById('top-avatar'); avatar.textContent = (user.full_name || 'A').slice(0, 1).toUpperCase();
  if (user.avatar_key) {
    api('/api/profile/avatar').then(response => response.blob()).then(blob => { const url = URL.createObjectURL(blob); avatar.innerHTML = `<img src="${url}" alt="Foto profil">`; }).catch(() => {});
  }
  const today = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: user.timezone || 'Asia/Jakarta' }).format(new Date());
  document.getElementById('today-label').textContent = today;
}
function showView(name) {
  if (!titles[name]) return;
  currentView = name;
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  document.getElementById('page-breadcrumb').textContent = titles[name];
  document.getElementById('sidebar').classList.remove('open');
  if (name === 'dashboard') { const period = document.getElementById('dashboard-period').value; if (period === 'custom') loadDashboard('custom', { start: document.getElementById('dashboard-custom-start').value, end: document.getElementById('dashboard-custom-end').value }); else loadDashboard(period); }
  if (name === 'income') mountTransactionForm('income', 'income-form-mount');
  if (name === 'expense') mountTransactionForm('expense', 'expense-form-mount');
  if (name === 'history') { populateHistoryAccounts().then(() => loadHistory(1)); }
  if (name === 'reports') loadReport();
  if (name === 'accounts') loadAccounts();
  if (name === 'categories') loadCategories();
  if (name === 'telegram') loadTelegram();
  if (name === 'profile') loadProfileView();
  if (name === 'settings') loadSettingsView();
  iconRefresh();
}
async function checkAPI() {
  const indicator = document.querySelector('.api-indicator');
  try { await api('/api/health', { auth: false }); indicator.innerHTML = '<i></i> Cloud sync aktif'; }
  catch { indicator.innerHTML = '<i style="background:#d99b43;box-shadow:0 0 0 3px #fff3e2"></i> API belum terhubung'; }
}
async function afterAuthenticated(user) {
  setCurrentUser(user); showApp(); updateHeader();
  if (!initialized) initializeAppEvents();
  try { const me = await api('/api/auth/me'); setCurrentUser(me.user); setDateFormat(me.settings?.date_format); updateHeader(); applyTheme(me.settings?.theme || 'light'); }
  catch {}
  showView('dashboard'); checkAPI();
}
function setDashboardCustomDefaults() {
  const user = getCurrentUser(); const zone = user?.timezone || 'Asia/Jakarta';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const p = Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  const today = `${p.year}-${p.month}-${p.day}`; const start = `${p.year}-${p.month}-01`;
  const startInput = document.getElementById('dashboard-custom-start'); const endInput = document.getElementById('dashboard-custom-end');
  if (!startInput.value) startInput.value = start; if (!endInput.value) endInput.value = today;
}

function initializeAppEvents() {
  initialized = true;
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-view]');
    if (target) { event.preventDefault(); showView(target.dataset.view); }
  });
  document.getElementById('mobile-menu').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('install-app').addEventListener('click', async () => { if (!deferredInstallPrompt) { toast('Gunakan menu browser lalu pilih Install app / Tambahkan ke layar utama.'); return; } deferredInstallPrompt.prompt(); const choice = await deferredInstallPrompt.userChoice; if (choice?.outcome === 'accepted') toast('Permintaan pemasangan diterima.'); deferredInstallPrompt = null; document.getElementById('install-app').classList.add('hidden'); });
  document.getElementById('modal-close').addEventListener('click', () => document.getElementById('modal-backdrop').classList.add('hidden'));
  document.getElementById('modal-backdrop').addEventListener('click', event => { if (event.target.id === 'modal-backdrop') event.currentTarget.classList.add('hidden'); });
  document.getElementById('dashboard-period').addEventListener('change', event => {
    const customBox = document.getElementById('dashboard-custom-range');
    if (event.target.value === 'custom') { customBox.classList.remove('hidden'); setDashboardCustomDefaults(); }
    else { customBox.classList.add('hidden'); loadDashboard(event.target.value); }
  });
  document.getElementById('dashboard-apply-custom').addEventListener('click', () => loadDashboard('custom', { start: document.getElementById('dashboard-custom-start').value, end: document.getElementById('dashboard-custom-end').value }));
  initTransactionEvents(); initReportDefaults(); initSettingsEvents(); initTelegramEvents();
  window.addEventListener('aruskas:logout', () => { showAuth(); toast('Kamu sudah keluar dari ARUSKAS.'); });
  window.addEventListener('aruskas:unauthorized', () => { showAuth(); toast('Sesi berakhir. Silakan login kembali.', 'error'); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') { document.getElementById('modal-backdrop').classList.add('hidden'); document.getElementById('sidebar').classList.remove('open'); } });
}

initAuth(afterAuthenticated);
(async function boot() {
  if (!getToken()) { showAuth(); iconRefresh(); return; }
  try {
    const me = await api('/api/auth/me'); setCurrentUser(me.user); setDateFormat(me.settings?.date_format); showApp(); updateHeader(); initializeAppEvents(); applyTheme(me.settings?.theme || localStorage.getItem('aruskas_theme') || 'light'); showView('dashboard'); checkAPI();
  } catch { clearSession(); showAuth(); }
  iconRefresh();
})();
