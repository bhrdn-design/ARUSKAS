import { api, setToken, setCurrentUser, toast, esc, derivePassword } from './api.js';

function showAuthView(view) {
  for (const name of ['login', 'register', 'recover']) document.getElementById(`${name}-panel`).classList.toggle('hidden', name !== view);
}
export function initAuth(onAuthenticated) {
  document.querySelectorAll('[data-auth-view]').forEach(button => button.addEventListener('click', () => showAuthView(button.dataset.authView)));
  document.querySelectorAll('.password-toggle').forEach(button => button.addEventListener('click', () => {
    const input = button.parentElement.querySelector('input'); input.type = input.type === 'password' ? 'text' : 'password';
    button.innerHTML = `<i data-lucide="${input.type === 'password' ? 'eye' : 'eye-off'}"></i>`; window.lucide?.createIcons?.();
  }));
  document.getElementById('login-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Memeriksa akun...';
    try {
      const saltInfo = await api('/api/auth/salt', { method: 'POST', auth: false, body: { username: data.username } });
      const derived = await derivePassword(data.password, saltInfo.salt, saltInfo.iterations);
      const result = await api('/api/auth/login', { method: 'POST', auth: false, body: { username: data.username, password_derived: derived.derived, remember: data.remember === 'on' } });
      setToken(result.token, data.remember === 'on'); setCurrentUser(result.user); toast('Login berhasil. Selamat datang kembali.'); await onAuthenticated(result.user);
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; button.innerHTML = 'Masuk <i data-lucide="arrow-right"></i>'; window.lucide?.createIcons?.(); }
  });
  document.getElementById('register-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); const button = form.querySelector('button[type="submit"]');
    if (data.password !== data.confirm_password) { toast('Konfirmasi password belum sama.', 'error'); return; }
    button.disabled = true; button.textContent = 'Membuat akun...';
    try {
      const derived = await derivePassword(data.password);
      const result = await api('/api/auth/register', { method: 'POST', auth: false, body: { full_name: data.full_name, username: data.username, password_derived: derived.derived, password_salt: derived.salt, password_length: data.password.length } });
      setToken(result.token, true); setCurrentUser(result.user);
      document.getElementById('recovery-codes').innerHTML = result.recoveryCodes.map(code => `<code>${esc(code)}</code>`).join('');
      document.getElementById('recovery-backdrop').classList.remove('hidden');
      document.getElementById('copy-recovery').onclick = async () => { await navigator.clipboard.writeText(result.recoveryCodes.join('\n')); toast('Recovery code berhasil disalin.'); };
      document.getElementById('recovery-done').onclick = async () => { document.getElementById('recovery-backdrop').classList.add('hidden'); toast('Akun berhasil dibuat.'); await onAuthenticated(result.user); };
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; button.innerHTML = 'Buat akun <i data-lucide="arrow-right"></i>'; window.lucide?.createIcons?.(); }
  });
  document.getElementById('recover-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Memproses...';
    try { const derived = await derivePassword(data.new_password); const result = await api('/api/auth/recover', { method: 'POST', auth: false, body: { username: data.username, recovery_code: data.recovery_code, new_password_derived: derived.derived, new_password_salt: derived.salt, password_length: data.new_password.length } }); toast(result.message); form.reset(); showAuthView('login'); }
    catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; button.textContent = 'Atur ulang password'; }
  });
}
export function showAuth() { document.getElementById('auth-screen').classList.remove('hidden'); document.getElementById('app-shell').classList.add('hidden'); showAuthView('login'); }
export function showApp() { document.getElementById('auth-screen').classList.add('hidden'); document.getElementById('app-shell').classList.remove('hidden'); }
