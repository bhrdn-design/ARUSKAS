import { api, esc, toast, confirmAction } from './api.js';
export async function loadTelegram() {
  try {
    const result = await api('/api/telegram/status'); const status = document.getElementById('telegram-status'); const generate = document.getElementById('generate-pair'); const unlink = document.getElementById('unlink-telegram'); const area = document.getElementById('pair-code-area');
    if (result.linked) {
      status.innerHTML = '<span class="status-dot online"></span> Akun Telegram sudah terhubung';
      area.innerHTML = `<div class="pair-code-box"><b>TERHUBUNG</b><small>${result.link.telegram_username ? '@' + esc(result.link.telegram_username) : 'Chat Telegram terhubung'} · sejak ${new Date(result.link.linked_at).toLocaleDateString('id-ID')}</small></div>`;
      generate.classList.add('hidden'); unlink.classList.remove('hidden');
    } else {
      status.innerHTML = '<span class="status-dot"></span> Belum terhubung'; area.innerHTML = '';
      generate.classList.remove('hidden'); unlink.classList.add('hidden');
    }
  } catch (error) { toast(error.message, 'error'); }
}
export function initTelegramEvents() {
  document.getElementById('generate-pair').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true; button.textContent = 'Membuat kode...';
    try {
      const result = await api('/api/telegram/pair-code', { method: 'POST' });
      document.getElementById('pair-code-area').innerHTML = `<div class="pair-code-box"><b>${esc(result.code)}</b><small>Berlaku hingga ${new Date(result.expires_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · Sekali pakai</small><button class="text-button" id="copy-pair-code" style="margin-top:7px">Salin kode</button><p style="font-size:9px;color:#7e938b;margin:8px 0 0">Kirim ke bot: <strong>/hubungkan ${esc(result.code)}</strong></p></div>`;
      document.getElementById('copy-pair-code').onclick = async () => { await navigator.clipboard.writeText(result.instruction); toast('Perintah pairing disalin.'); };
      toast('Kode pairing berhasil dibuat.');
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; button.innerHTML = '<i data-lucide="link"></i> Buat kode pairing'; window.lucide?.createIcons?.(); }
  });
  document.getElementById('unlink-telegram').addEventListener('click', async () => {
    if (!confirmAction('Putuskan hubungan Telegram dari akun ARUSKAS ini?')) return;
    try { await api('/api/telegram/unlink', { method: 'POST' }); toast('Hubungan Telegram berhasil diputuskan.'); await loadTelegram(); }
    catch (error) { toast(error.message, 'error'); }
  });
}
