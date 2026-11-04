import { api, money, formatDate, localDateTimeInput, zonedLocalToUtc, esc, toast, openModal, closeModal, confirmAction, imageUrl, getCurrentUser } from './api.js';

let historyPage = 1;
let historyTotalPages = 1;
let accountCache = [];
let categoryCache = [];

async function loadChoices(initial = null) {
  const [accounts, categories] = await Promise.all([api('/api/accounts'), api('/api/categories')]);
  accountCache = accounts.items.filter(a => !a.archived || a.id === initial?.account_id); categoryCache = categories.items;
  return { accounts: accountCache, categories: categoryCache };
}
export async function mountTransactionForm(kind, mountId, initial = null, onSaved = null) {
  const mount = document.getElementById(mountId); if (!mount) return;
  const { accounts, categories } = await loadChoices(initial);
  const relevant = categories.filter(c => c.kind === kind);
  const current = initial ? localDateTimeInput(new Date(initial.occurred_at)) : localDateTimeInput();
  mount.innerHTML = `<div class="transaction-form-layout"><article class="panel form-card"><h3>${initial ? 'Edit transaksi' : kind === 'income' ? 'Detail pemasukan baru' : 'Detail pengeluaran baru'}</h3><p>Lengkapi informasi transaksi. Foto bukti bersifat opsional.</p>
    <form id="transaction-form" class="form-grid">
      <label>Nominal (${esc(getCurrentUser()?.currency || 'IDR')})<input name="amount" inputmode="numeric" type="number" min="1" step="1" placeholder="Contoh: 50000" value="${initial ? Number(initial.amount) : ''}" required></label>
      <label>Kategori<select name="category_id" required><option value="">Pilih kategori</option>${relevant.map(c => `<option value="${esc(c.id)}" ${initial?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Akun keuangan<select name="account_id" required><option value="">Pilih akun</option>${accounts.map(a => `<option value="${esc(a.id)}" ${initial?.account_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label>Tanggal<input type="date" name="date" value="${current.date}" required></label>
      <label>Jam<input type="time" name="time" value="${current.time}" required></label>
      <label>${kind === 'income' ? 'Sumber pemasukan' : 'Penerima / tempat transaksi'}<input name="counterparty" maxlength="120" placeholder="Opsional" value="${esc(initial?.counterparty || '')}"></label>
      <label class="full">Keterangan<input name="description" maxlength="180" placeholder="Contoh: Gaji bulanan / Belanja kebutuhan rumah" value="${esc(initial?.description || '')}" required></label>
      <label class="full">Catatan tambahan<textarea name="notes" maxlength="1000" placeholder="Catatan opsional">${esc(initial?.notes || '')}</textarea></label>
      <label class="full">Foto bukti <span class="muted" style="font-weight:400">(opsional, maksimal 5 MB)</span><span class="file-drop"><span><i data-lucide="image-plus"></i></span><span><b>Pilih foto bukti transaksi</b><small>JPG, PNG, WEBP · Maksimal 5 MB</small></span><input type="file" name="file" accept="image/jpeg,image/png,image/webp"></span><span id="transaction-file-name" class="muted" style="font-size:10px">${initial?.attachment_id ? `Foto tersimpan: ${esc(initial.attachment_filename || 'bukti transaksi')}` : 'Belum ada foto yang dipilih.'}</span>${initial?.attachment_id ? '<button type="button" class="text-button" id="remove-attachment">Hapus foto tersimpan</button>' : ''}<img id="transaction-preview" class="image-preview ${initial?.attachment_id ? '' : 'hidden'}" alt="Preview foto bukti" ${initial?.attachment_id ? `src="${await imageUrl(`/api/transactions/${initial.id}/attachment`)}"` : ''}></label>
      <div class="full form-actions"><button type="reset" class="btn btn-soft">Reset</button><button type="submit" class="btn btn-primary"><i data-lucide="save"></i> ${initial ? 'Simpan perubahan' : 'Simpan transaksi'}</button></div>
    </form></article><aside class="form-side-note"><i data-lucide="shield-check"></i><b>Catatan aman dan tersinkronisasi</b><p>Transaksi tersimpan di database online. Kamu bisa membukanya dari perangkat lain atau melalui Telegram setelah akun terhubung.</p><p>Setiap transaksi otomatis mendapatkan nomor struk unik. Foto bukti hanya dapat dilihat setelah login sebagai pemilik akun.</p></aside></div>`;
  window.lucide?.createIcons?.();
  const form = mount.querySelector('#transaction-form'); const fileInput = form.querySelector('[name="file"]');
  const removeAttachment = form.querySelector('#remove-attachment');
  if (removeAttachment && initial) removeAttachment.addEventListener('click', async () => { if (!confirmAction('Hapus foto bukti dari transaksi ini?')) return; try { await api(`/api/transactions/${initial.id}/attachment`, { method: 'DELETE' }); removeAttachment.remove(); form.querySelector('#transaction-file-name').textContent = 'Foto bukti sudah dihapus.'; form.querySelector('#transaction-preview').classList.add('hidden'); toast('Foto bukti berhasil dihapus.'); } catch (error) { toast(error.message, 'error'); } });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0]; const preview = form.querySelector('#transaction-preview');
    if (!file) { form.querySelector('#transaction-file-name').textContent = 'Belum ada foto yang dipilih.'; return; }
    form.querySelector('#transaction-file-name').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
    if (file.size > 5 * 1024 * 1024) { toast('Ukuran foto maksimal 5 MB.', 'error'); fileInput.value = ''; return; }
    const url = URL.createObjectURL(file); preview.src = url; preview.classList.remove('hidden');
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'Menyimpan...';
    try {
      const data = Object.fromEntries(new FormData(form)); const amount = Number(data.amount);
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Nominal harus berupa bilangan bulat lebih dari nol.');
      const payload = { kind, amount, category_id: data.category_id, account_id: data.account_id, occurred_at: zonedLocalToUtc(data.date, data.time), counterparty: data.counterparty, description: data.description, notes: data.notes };
      let saved;
      if (initial) { saved = await api(`/api/transactions/${initial.id}`, { method: 'PUT', body: payload }); }
      else { saved = await api('/api/transactions', { method: 'POST', body: payload }); }
      const file = fileInput.files[0]; let photoError = null;
      if (file) { const upload = new FormData(); upload.append('file', file); try { await api(`/api/transactions/${saved.id || initial.id}/attachment`, { method: 'POST', body: upload }); } catch (error) { photoError = error; } }
      toast(initial ? 'Transaksi berhasil diperbarui.' : 'Transaksi berhasil disimpan.');
      if (photoError) toast(`Transaksi tersimpan, tetapi foto gagal diunggah: ${photoError.message}`, 'error');
      if (onSaved) await onSaved(saved);
      else { form.reset(); const preview = form.querySelector('#transaction-preview'); preview.classList.add('hidden'); form.querySelector('#transaction-file-name').textContent = 'Belum ada foto yang dipilih.'; }
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; button.innerHTML = `<i data-lucide="save"></i> ${initial ? 'Simpan perubahan' : 'Simpan transaksi'}`; window.lucide?.createIcons?.(); }
  });
}

export async function loadHistory(page = 1) {
  historyPage = page;
  const q = document.getElementById('history-search')?.value.trim() || '';
  const kind = document.getElementById('history-kind')?.value || '';
  const account = document.getElementById('history-account')?.value || '';
  const category = document.getElementById('history-category')?.value || '';
  const sort = document.getElementById('history-sort')?.value || 'newest';
  const start = document.getElementById('history-start')?.value || '';
  const end = document.getElementById('history-end')?.value || '';
  const params = new URLSearchParams({ page, limit: 15, sort });
  if (q) params.set('q', q); if (kind) params.set('kind', kind); if (account) params.set('account_id', account); if (category) params.set('category_id', category);
  if (start) params.set('start', zonedLocalToUtc(start, '00:00')); if (end) params.set('end', zonedLocalToUtc(end, '23:59:59'));
  try {
    const result = await api(`/api/transactions?${params}`); historyTotalPages = result.pages;
    document.getElementById('history-count').textContent = `${Number(result.total).toLocaleString('id-ID')} transaksi ditemukan`;
    const wrap = document.getElementById('history-table-wrap');
    if (!result.items.length) { wrap.innerHTML = '<div class="empty-state" style="border:0"><span class="empty-icon"><i data-lucide="receipt"></i></span><h3>Transaksi tidak ditemukan</h3><p>Coba ubah kata kunci atau filter tanggal.</p></div>'; }
    else wrap.innerHTML = `<table class="data-table"><thead><tr><th>TRANSAKSI</th><th>KATEGORI / AKUN</th><th>TANGGAL</th><th>JENIS</th><th>NOMINAL</th><th>AKSI</th></tr></thead><tbody>${result.items.map(row => `<tr><td data-label="Transaksi"><div class="table-primary">${esc(row.description)}</div><div class="table-secondary">${esc(row.receipt_no)}</div></td><td data-label="Kategori / akun"><div class="table-primary">${esc(row.category_name)}</div><div class="table-secondary">${esc(row.account_name)}</div></td><td data-label="Tanggal">${formatDate(row.occurred_at, { time: true })}</td><td data-label="Jenis"><span class="kind-pill ${row.kind}">${row.kind === 'income' ? '↙ Pemasukan' : '↗ Pengeluaran'}</span></td><td data-label="Nominal" class="amount-cell ${row.kind}">${row.kind === 'income' ? '+' : '−'}${money(row.amount)}</td><td data-label="Aksi"><div class="table-actions"><button title="Lihat struk" data-action="receipt" data-id="${row.id}"><i data-lucide="receipt-text"></i></button>${row.attachment_id ? `<button title="Lihat foto" data-action="photo" data-id="${row.id}"><i data-lucide="image"></i></button>` : ''}<button title="Edit" data-action="edit" data-id="${row.id}"><i data-lucide="pencil"></i></button><button title="Hapus" data-action="delete" data-id="${row.id}"><i data-lucide="trash-2"></i></button></div></td></tr>`).join('')}</tbody></table>`;
    const pagination = document.getElementById('history-pagination');
    pagination.innerHTML = `<button ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">‹ Sebelumnya</button><span>Halaman ${page} dari ${historyTotalPages}</span><button ${page >= historyTotalPages ? 'disabled' : ''} data-page="${page + 1}">Berikutnya ›</button>`;
    window.lucide?.createIcons?.();
  } catch (error) { toast(error.message, 'error'); }
}
export async function populateHistoryAccounts() {
  const [result, categories] = await Promise.all([api('/api/accounts'), api('/api/categories')]); const select = document.getElementById('history-account'); const categorySelect = document.getElementById('history-category');
  if (select) select.innerHTML = '<option value="">Semua akun</option>' + result.items.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  if (categorySelect) categorySelect.innerHTML = '<option value="">Semua kategori</option>' + categories.items.map(c => `<option value="${esc(c.id)}">${esc(c.name)} · ${c.kind === 'income' ? 'Masuk' : 'Keluar'}</option>`).join('');
}
export async function showReceipt(id) {
  try {
    const result = await api(`/api/transactions/${id}`); const t = result.item;
    const receipt = `<div class="receipt" id="print-receipt"><div class="receipt-head"><h2>ARUSKAS</h2><p>FINANCIAL TRANSACTION RECEIPT</p><p style="margin-top:8px">${esc(t.receipt_no)}</p></div><div class="receipt-line"><span>Jenis</span><b>${t.kind === 'income' ? 'PEMASUKAN' : 'PENGELUARAN'}</b></div><div class="receipt-line"><span>Tanggal</span><b>${formatDate(t.occurred_at, { time: true })}</b></div><div class="receipt-line"><span>Kategori</span><b>${esc(t.category_name)}</b></div><div class="receipt-line"><span>Akun</span><b>${esc(t.account_name)}</b></div>${t.counterparty ? `<div class="receipt-line"><span>${t.kind === 'income' ? 'Sumber' : 'Penerima'}</span><b>${esc(t.counterparty)}</b></div>` : ''}<div class="receipt-line"><span>Keterangan</span><b>${esc(t.description)}</b></div>${t.notes ? `<div class="receipt-line"><span>Catatan</span><b>${esc(t.notes)}</b></div>` : ''}<div class="receipt-line receipt-total"><span>TOTAL</span><b>${money(t.amount)}</b></div><div class="receipt-line"><span>Bukti foto</span><b>${t.attachment_id ? 'Tersedia' : 'Tidak ada'}</b></div><div class="receipt-line"><span>Status</span><b style="color:#188467">BERHASIL</b></div>${t.attachment_id ? `<div style="text-align:center;margin-top:12px"><img src="${await imageUrl(`/api/transactions/${id}/attachment`)}" alt="Foto bukti transaksi" style="max-width:100%;max-height:180px;object-fit:contain;border-radius:7px"><div style="font-size:8px;color:#94a1a7;margin-top:4px">Foto bukti transaksi</div></div>` : ''}<div class="receipt-foot">Dicatat melalui ARUSKAS<br>Terima kasih telah menggunakan ARUSKAS.</div></div><div class="receipt-actions"><select id="receipt-paper-size" class="select-control" aria-label="Ukuran kertas struk"><option value="a4">A4</option><option value="thermal">Thermal 80 mm</option></select><button class="btn btn-primary" id="receipt-print"><i data-lucide="printer"></i> Cetak / Simpan PDF</button><button class="btn btn-soft" id="receipt-share"><i data-lucide="share-2"></i> Bagikan</button></div>`;
    openModal('Struk transaksi', receipt, 'DIGITAL RECEIPT');
    document.getElementById('receipt-print').onclick = () => { document.body.classList.toggle('print-thermal', document.getElementById('receipt-paper-size').value === 'thermal'); window.print(); };
    document.getElementById('receipt-share').onclick = async () => { const text = `ARUSKAS ${t.kind === 'income' ? 'PEMASUKAN' : 'PENGELUARAN'}\n${t.receipt_no}\n${t.description}\n${money(t.amount)}\n${formatDate(t.occurred_at, { time: true })}`; if (navigator.share) await navigator.share({ title: 'Struk ARUSKAS', text }); else { await navigator.clipboard.writeText(text); toast('Ringkasan struk disalin.'); } };
  } catch (error) { toast(error.message, 'error'); }
}
async function editTransaction(id) {
  try {
    const result = await api(`/api/transactions/${id}`); const t = result.item;
    openModal('Edit transaksi', '<div id="edit-transaction-mount"></div>', 'UPDATE RECORD');
    await mountTransactionForm(t.kind, 'edit-transaction-mount', t, async () => { closeModal(); await loadHistory(historyPage); });
  } catch (error) { toast(error.message, 'error'); }
}
async function viewPhoto(id) {
  try { const url = await imageUrl(`/api/transactions/${id}/attachment`); openModal('Foto bukti transaksi', `<div style="text-align:center"><img src="${url}" alt="Foto bukti transaksi" style="max-width:100%;max-height:65vh;object-fit:contain;border-radius:10px"><p class="muted" style="font-size:10px">Foto hanya dapat dilihat oleh pemilik akun.</p></div>`, 'PRIVATE ATTACHMENT'); }
  catch (error) { toast(error.message, 'error'); }
}
export function initTransactionEvents() {
  window.addEventListener('afterprint', () => document.body.classList.remove('print-thermal'));
  document.getElementById('history-table-wrap').addEventListener('click', async event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'receipt') await showReceipt(id);
    if (action === 'photo') await viewPhoto(id);
    if (action === 'edit') await editTransaction(id);
    if (action === 'delete' && confirmAction('Hapus transaksi ini? Saldo dan laporan akan dihitung ulang.')) {
      try { await api(`/api/transactions/${id}`, { method: 'DELETE' }); toast('Transaksi berhasil dihapus.'); await loadHistory(historyPage); }
      catch (error) { toast(error.message, 'error'); }
    }
  });
  document.getElementById('history-pagination').addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (button && !button.disabled) loadHistory(Number(button.dataset.page)); });
  document.getElementById('history-filter').addEventListener('click', () => loadHistory(1));
  document.getElementById('history-reset').addEventListener('click', () => { ['history-search', 'history-kind', 'history-account', 'history-category', 'history-start', 'history-end'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; }); document.getElementById('history-sort').value = 'newest'; loadHistory(1); });
  document.getElementById('history-search').addEventListener('keydown', event => { if (event.key === 'Enter') loadHistory(1); });
  document.getElementById('history-add').addEventListener('click', () => document.querySelector('[data-view="expense"]').click());
  document.getElementById('quick-add').addEventListener('click', () => document.querySelector('[data-view="expense"]').click());
}
