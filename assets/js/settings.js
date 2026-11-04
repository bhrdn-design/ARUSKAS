import { api, getCurrentUser, setCurrentUser, money, esc, toast, openModal, closeModal, confirmAction, imageUrl, clearSession, derivePassword, setDateFormat } from './api.js';

export async function loadAccounts() {
  try {
    const result = await api('/api/accounts'); const mount = document.getElementById('accounts-grid');
    if (!result.items.length) { mount.innerHTML = '<div class="empty-state"><h3>Belum ada akun</h3><p>Tambahkan akun pertama untuk mulai mencatat saldo.</p></div>'; return; }
    const icons = { cash: 'wallet', bank: 'landmark', ewallet: 'smartphone', other: 'credit-card' };
    const colors = { cash: ['#e5f4ed', '#168467'], bank: ['#eaf0fa', '#5277ae'], ewallet: ['#f2eefa', '#8a65b8'], other: ['#fff3e5', '#c1873e'] };
    mount.innerHTML = result.items.map(a => { const color = colors[a.type] || colors.other; return `<article class="account-card" style="--account-color:${color[0]};--account-ink:${color[1]}"><div class="account-card-top"><span class="account-icon"><i data-lucide="${icons[a.type] || 'credit-card'}"></i></span><button class="account-menu" data-account-edit="${esc(a.id)}" title="Edit akun"><i data-lucide="more-horizontal"></i></button></div><small>${a.archived ? 'AKUN DIARSIPKAN' : 'SALDO SAAT INI'}</small><h3>${money(a.balance)}</h3><p class="account-name">${esc(a.name)}</p><p>${a.type === 'cash' ? 'Tunai' : a.type === 'bank' ? 'Rekening bank' : a.type === 'ewallet' ? 'E-wallet' : 'Lainnya'} · Saldo awal ${money(a.opening_balance)}</p></article>`; }).join('');
    window.lucide?.createIcons?.();
  } catch (error) { toast(error.message, 'error'); }
}
function accountModal(account = null) {
  const data = account || { name: '', type: 'cash', opening_balance: 0, color: '#1D8A70', archived: 0 };
  openModal(account ? 'Edit akun keuangan' : 'Tambah akun keuangan', `<form id="account-form" class="form-grid"><label class="full">Nama akun<input name="name" required maxlength="50" placeholder="Contoh: Tunai, BCA, GoPay" value="${esc(data.name)}"></label><label>Jenis akun<select name="type"><option value="cash" ${data.type === 'cash' ? 'selected' : ''}>Tunai</option><option value="bank" ${data.type === 'bank' ? 'selected' : ''}>Rekening bank</option><option value="ewallet" ${data.type === 'ewallet' ? 'selected' : ''}>E-wallet</option><option value="other" ${data.type === 'other' ? 'selected' : ''}>Lainnya</option></select></label><label>Saldo awal (${esc(getCurrentUser()?.currency || 'IDR')})<input name="opening_balance" type="number" min="0" step="1" required value="${Number(data.opening_balance || 0)}"></label><label class="full">Warna identitas<input name="color" type="color" value="${esc(data.color || '#1D8A70')}" style="height:43px;padding:5px"></label>${account ? `<label class="full check-label"><input type="checkbox" name="archived" ${data.archived ? 'checked' : ''}> Arsipkan akun (akun tidak bisa dipilih untuk transaksi baru)</label>` : ''}<div class="full form-actions"><button type="button" class="btn btn-soft" id="account-cancel">Batal</button><button type="submit" class="btn btn-primary">Simpan akun</button></div></form>${account ? '<p class="muted" style="font-size:9px;margin-top:10px">Mengarsipkan akun tidak menghapus riwayat transaksi atau saldonya.</p>' : ''}`, 'MONEY SOURCE');
  document.getElementById('account-cancel').onclick = closeModal;
  document.getElementById('account-form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const v = Object.fromEntries(new FormData(form)); const payload = { name: v.name, type: v.type, opening_balance: Number(v.opening_balance), color: v.color, archived: form.elements.archived?.checked || false };
    try { await api(account ? `/api/accounts/${account.id}` : '/api/accounts', { method: account ? 'PUT' : 'POST', body: payload }); toast('Akun berhasil disimpan.'); closeModal(); await loadAccounts(); }
    catch (error) { toast(error.message, 'error'); }
  };
}
export async function loadCategories() {
  try {
    const result = await api('/api/categories');
    for (const kind of ['income', 'expense']) {
      const mount = document.getElementById(kind === 'income' ? 'income-categories' : 'expense-categories'); const rows = result.items.filter(c => c.kind === kind);
      mount.innerHTML = rows.map(c => `<div class="managed-category"><span class="category-swatch" style="background:${esc(c.color)}20;color:${esc(c.color)}"><i data-lucide="${esc(c.icon || 'circle')}" ></i></span><div><b>${esc(c.name)}</b><small>${c.is_default ? 'Kategori bawaan' : 'Kategori pribadi'}</small></div><button title="Edit kategori" data-category-edit="${esc(c.id)}"><i data-lucide="pencil"></i></button><button title="Hapus kategori" data-category-delete="${esc(c.id)}"><i data-lucide="trash-2"></i></button></div>`).join('') || '<p class="muted" style="font-size:10px;padding:10px 0">Belum ada kategori.</p>';
    }
    window.lucide?.createIcons?.();
  } catch (error) { toast(error.message, 'error'); }
}
function categoryModal(kind, category = null) {
  const data = category || { name: '', color: kind === 'income' ? '#168A68' : '#D85C66', icon: 'circle' };
  openModal(category ? 'Edit kategori' : 'Tambah kategori', `<form id="category-form" class="form-grid"><label class="full">Jenis kategori<select name="kind" ${category ? 'disabled' : ''}><option value="income" ${kind === 'income' ? 'selected' : ''}>Pemasukan</option><option value="expense" ${kind === 'expense' ? 'selected' : ''}>Pengeluaran</option></select></label><label class="full">Nama kategori<input name="name" maxlength="50" required value="${esc(data.name)}" placeholder="Contoh: Freelance / Langganan aplikasi"></label><label>Warna<input name="color" type="color" value="${esc(data.color)}" style="height:43px;padding:5px"></label><label>Ikon<select name="icon"><option value="circle">Umum</option><option value="wallet">Dompet</option><option value="gift">Hadiah</option><option value="shopping-bag">Belanja</option><option value="car">Transportasi</option><option value="utensils">Makanan</option><option value="book-open">Pendidikan</option><option value="heart">Kesehatan / hadiah</option><option value="house">Rumah</option><option value="briefcase">Pekerjaan</option><option value="laptop">Digital</option></select></label><div class="full form-actions"><button type="button" class="btn btn-soft" id="category-cancel">Batal</button><button type="submit" class="btn btn-primary">Simpan kategori</button></div></form>`, 'TRANSACTION LABEL');
  const form = document.getElementById('category-form'); form.elements.icon.value = data.icon || 'circle';
  document.getElementById('category-cancel').onclick = closeModal;
  form.onsubmit = async event => { event.preventDefault(); const v = Object.fromEntries(new FormData(form)); try { await api(category ? `/api/categories/${category.id}` : '/api/categories', { method: category ? 'PUT' : 'POST', body: { kind: category ? kind : v.kind, name: v.name, color: v.color, icon: v.icon } }); toast('Kategori berhasil disimpan.'); closeModal(); await loadCategories(); } catch (error) { toast(error.message, 'error'); } };
}
async function loadProfile() {
  const user = getCurrentUser(); const mount = document.getElementById('profile-form-mount'); let avatar = '';
  if (user?.avatar_key) { try { avatar = await imageUrl('/api/profile/avatar'); } catch {} }
  mount.innerHTML = `<div class="profile-layout"><article class="panel profile-card"><div class="profile-large" id="profile-avatar-large">${avatar ? `<img src="${avatar}" alt="Foto profil">` : esc((user.full_name || 'A').slice(0, 1).toUpperCase())}</div><h3>${esc(user.full_name)}</h3><p>@${esc(user.username)}</p><label class="btn btn-soft file-button"> <i data-lucide="camera"></i> Ganti foto profil<input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></label><p style="margin-top:12px">JPG, PNG, WEBP · Maksimal 5 MB</p></article><article class="panel form-card"><h3>Informasi akun</h3><p>Perubahan profil akan tersimpan di akun online.</p><form id="profile-form" class="form-grid"><label class="full">Nama lengkap<input name="full_name" maxlength="80" required value="${esc(user.full_name)}"></label><label class="full">Username<input name="username" maxlength="24" minlength="3" required value="${esc(user.username)}"></label><label>Mata uang<select name="currency"><option value="IDR" ${user.currency === 'IDR' ? 'selected' : ''}>IDR — Rupiah</option><option value="USD" ${user.currency === 'USD' ? 'selected' : ''}>USD — US Dollar</option><option value="SGD" ${user.currency === 'SGD' ? 'selected' : ''}>SGD — Singapore Dollar</option><option value="MYR" ${user.currency === 'MYR' ? 'selected' : ''}>MYR — Ringgit</option></select></label><label>Zona waktu<select name="timezone"><option value="Asia/Jakarta" ${user.timezone === 'Asia/Jakarta' ? 'selected' : ''}>Asia/Jakarta (WIB)</option><option value="Asia/Makassar" ${user.timezone === 'Asia/Makassar' ? 'selected' : ''}>Asia/Makassar (WITA)</option><option value="Asia/Jayapura" ${user.timezone === 'Asia/Jayapura' ? 'selected' : ''}>Asia/Jayapura (WIT)</option><option value="Asia/Singapore">Asia/Singapore</option><option value="UTC">UTC</option></select></label><div class="full form-actions"><button type="submit" class="btn btn-primary"><i data-lucide="save"></i> Simpan profil</button></div></form></article></div><article class="panel settings-section" style="margin-top:15px"><h3>Ubah password</h3><p>Gunakan password baru minimal 10 karakter.</p><form id="password-form" class="form-grid"><label>Password saat ini<input type="password" name="current_password" required autocomplete="current-password"></label><label>Password baru<input type="password" name="new_password" required minlength="10" autocomplete="new-password"></label><div class="full form-actions"><button class="btn btn-soft" type="submit">Perbarui password</button></div></form></article>`;
  window.lucide?.createIcons?.();
  document.getElementById('profile-form').onsubmit = async event => {
    event.preventDefault(); const v = Object.fromEntries(new FormData(event.currentTarget));
    try { const result = await api('/api/profile', { method: 'PUT', body: v }); setCurrentUser(result.user); updateTopProfile(); toast('Profil berhasil diperbarui.'); await loadProfile(); }
    catch (error) { toast(error.message, 'error'); }
  };
  document.getElementById('password-form').onsubmit = async event => {
    event.preventDefault(); const v = Object.fromEntries(new FormData(event.currentTarget)); const user = getCurrentUser();
    try { const saltInfo = await api('/api/auth/salt', { method: 'POST', auth: false, body: { username: user.username } }); const current = await derivePassword(v.current_password, saltInfo.salt, saltInfo.iterations); const next = await derivePassword(v.new_password); const result = await api('/api/profile/password', { method: 'PUT', body: { current_password_derived: current.derived, new_password_derived: next.derived, new_password_salt: next.salt, password_length: v.new_password.length } }); toast(result.message); event.currentTarget.reset(); }
    catch (error) { toast(error.message, 'error'); }
  };
  document.getElementById('avatar-file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Foto maksimal 5 MB.', 'error'); return; }
    const form = new FormData(); form.append('file', file);
    try { await api('/api/profile/avatar', { method: 'POST', body: form }); const me = await api('/api/auth/me'); setCurrentUser(me.user); toast('Foto profil diperbarui.'); await loadProfile(); updateTopProfile(); }
    catch (error) { toast(error.message, 'error'); }
  };
}
function updateTopProfile() {
  const user = getCurrentUser(); if (!user) return;
  document.getElementById('top-name').textContent = user.full_name; document.getElementById('top-username').textContent = `@${user.username}`;
  const avatar = document.getElementById('top-avatar'); avatar.textContent = (user.full_name || 'A').slice(0, 1).toUpperCase();
  if (user.avatar_key) imageUrl('/api/profile/avatar').then(url => { avatar.innerHTML = `<img src="${url}" alt="Foto profil">`; }).catch(() => {});
}
async function loadPreferences() {
  const result = await api('/api/settings'); const s = result.settings || {}; setDateFormat(s.date_format);
  document.getElementById('settings-mount').innerHTML = `<article class="panel settings-section"><h3>Tampilan aplikasi</h3><p>Sesuaikan pengalaman ARUSKAS dengan preferensimu.</p><form id="preferences-form" class="settings-form"><div class="form-grid"><label>Tema aplikasi<select name="theme"><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Terang</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Gelap</option><option value="system" ${s.theme === 'system' ? 'selected' : ''}>Ikuti perangkat</option></select></label><label>Format tanggal<select name="date_format"><option value="DD MMM YYYY" ${s.date_format === 'DD MMM YYYY' ? 'selected' : ''}>04 Nov 2026</option><option value="DD/MM/YYYY" ${s.date_format === 'DD/MM/YYYY' ? 'selected' : ''}>04/11/2026</option><option value="YYYY-MM-DD" ${s.date_format === 'YYYY-MM-DD' ? 'selected' : ''}>2026-11-04</option></select></label></div><div class="form-actions"><button class="btn btn-primary" type="submit">Simpan preferensi</button></div></form></article><article class="panel settings-section"><h3>Preferensi pengingat</h3><p>Pengingat dikirim melalui Telegram pada jadwal harian pukul 20.00 WIB, mingguan setiap Senin, atau bulanan pada tanggal 1. Akun Telegram harus sudah terhubung.</p>${[['daily','Pengingat pencatatan harian','Pengingat untuk mencatat transaksi setiap hari.'],['weekly','Rekap mingguan','Pengingat untuk memeriksa arus kas mingguan.'],['monthly','Rekap bulanan','Pengingat untuk mengevaluasi keuangan bulanan.']].map(([key,title,desc]) => `<div class="settings-option"><div><b>${title}</b><small>${desc}</small></div><label class="switch"><input type="checkbox" data-notification="${key}" ${s.notifications?.[key] ? 'checked' : ''}><span></span></label></div>`).join('')}<div class="form-actions"><button class="btn btn-soft" id="save-notifications">Simpan pengingat</button></div></article><article class="panel settings-section"><h3>Keamanan & sesi</h3><p>Keluar dari akun pada perangkat ini. Pastikan backup data dilakukan secara berkala.</p><button class="btn btn-danger-soft" id="logout-button"><i data-lucide="log-out"></i> Keluar dari ARUSKAS</button></article><article class="panel settings-section"><h3>Tentang ARUSKAS</h3><p>ARUSKAS versi 1.0.0 · Frontend GitHub Pages · API Cloudflare Workers · Database D1 · File R2.</p></article>`;
  document.getElementById('preferences-form').onsubmit = async event => { event.preventDefault(); const v = Object.fromEntries(new FormData(event.currentTarget)); try { await api('/api/settings', { method: 'PUT', body: { ...v, notifications: s.notifications || {} } }); setDateFormat(v.date_format); applyTheme(v.theme); toast('Preferensi berhasil disimpan.'); } catch (error) { toast(error.message, 'error'); } };
  document.getElementById('save-notifications').onclick = async () => { const notifications = Object.fromEntries([...document.querySelectorAll('[data-notification]')].map(input => [input.dataset.notification, input.checked])); try { await api('/api/settings', { method: 'PUT', body: { theme: s.theme || 'light', date_format: s.date_format || 'DD MMM YYYY', notifications } }); toast('Preferensi pengingat disimpan.'); } catch (error) { toast(error.message, 'error'); } };
  document.getElementById('logout-button').onclick = logout;
  window.lucide?.createIcons?.();
}
export function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', Boolean(dark)); localStorage.setItem('aruskas_theme', theme || 'light');
  const toggle = document.getElementById('theme-toggle'); if (toggle) toggle.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i>`;
  window.lucide?.createIcons?.();
}
export async function logout() {
  if (!confirmAction('Keluar dari akun ARUSKAS pada perangkat ini?')) return;
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  clearSession(); window.dispatchEvent(new CustomEvent('aruskas:logout'));
}
export async function loadSettingsView() { await loadPreferences(); }
export async function loadProfileView() { await loadProfile(); }
export function initSettingsEvents() {
  document.getElementById('add-account').addEventListener('click', () => accountModal());
  document.getElementById('accounts-grid').addEventListener('click', async event => { const button = event.target.closest('[data-account-edit]'); if (!button) return; try { const result = await api('/api/accounts'); const item = result.items.find(a => a.id === button.dataset.accountEdit); if (item) accountModal(item); } catch (error) { toast(error.message, 'error'); } });
  document.getElementById('add-category').addEventListener('click', () => categoryModal('expense'));
  document.getElementById('categories')?.addEventListener('click', () => {});
  document.getElementById('income-categories').addEventListener('click', categoryAction);
  document.getElementById('expense-categories').addEventListener('click', categoryAction);
  document.getElementById('profile-shortcut').addEventListener('click', () => document.querySelector('[data-view="profile"]').click());
  document.getElementById('theme-toggle').addEventListener('click', async () => { const next = document.body.classList.contains('dark') ? 'light' : 'dark'; applyTheme(next); try { const current = await api('/api/settings'); const s = current.settings || {}; await api('/api/settings', { method: 'PUT', body: { theme: next, date_format: s.date_format || 'DD MMM YYYY', notifications: s.notifications || { daily: false, weekly: false, monthly: false } } }); } catch (error) { toast(error.message, 'error'); } });
}
async function categoryAction(event) {
  const edit = event.target.closest('[data-category-edit]'); const del = event.target.closest('[data-category-delete]'); if (!edit && !del) return;
  try {
    const result = await api('/api/categories'); const item = result.items.find(c => c.id === (edit || del).dataset.categoryEdit || c.id === (edit || del).dataset.categoryDelete); if (!item) return;
    if (edit) categoryModal(item.kind, item);
    if (del && confirmAction(`Hapus kategori "${item.name}"? Kategori yang sudah digunakan transaksi tidak bisa dihapus.`)) { await api(`/api/categories/${item.id}`, { method: 'DELETE' }); toast('Kategori berhasil dihapus.'); await loadCategories(); }
  } catch (error) { toast(error.message, 'error'); }
}
