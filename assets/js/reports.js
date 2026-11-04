import { api, money, formatDate, esc, toast, downloadBlob, openModal, zonedLocalToUtc, getCurrentUser } from './api.js';
let currentReport = null;
let reportChart = null;
function localISODate(date) { const p = new Intl.DateTimeFormat('en-CA', { timeZone: getCurrentUser()?.timezone || 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date); const o = Object.fromEntries(p.filter(x => x.type !== 'literal').map(x => [x.type, x.value])); return `${o.year}-${o.month}-${o.day}`; }
export function initReportDefaults() {
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById('report-start').value = localISODate(start);
  document.getElementById('report-end').value = localISODate(now);
  document.getElementById('report-apply').addEventListener('click', loadReport);
  populateReportFilters();
  document.getElementById('export-csv').addEventListener('click', exportCSV);
  document.getElementById('export-xlsx').addEventListener('click', exportXLSX);
  document.getElementById('export-pdf').addEventListener('click', exportPDF);
  document.getElementById('backup-export').addEventListener('click', exportBackup);
  document.getElementById('backup-import-file').addEventListener('change', importBackup);
}
async function populateReportFilters() {
  try {
    const [categories, accounts] = await Promise.all([api('/api/categories'), api('/api/accounts')]);
    const category = document.getElementById('report-category'); const account = document.getElementById('report-account');
    if (category) category.innerHTML = '<option value="">Semua kategori</option>' + categories.items.map(c => `<option value="${esc(c.id)}">${esc(c.name)} · ${c.kind === 'income' ? 'Masuk' : 'Keluar'}</option>`).join('');
    if (account) account.innerHTML = '<option value="">Semua akun</option>' + accounts.items.map(a => `<option value="${esc(a.id)}">${esc(a.name)}${a.archived ? ' · Arsip' : ''}</option>`).join('');
  } catch (error) { toast(error.message, 'error'); }
}

export async function loadReport() {
  const start = document.getElementById('report-start').value; const end = document.getElementById('report-end').value;
  if (!start || !end || start > end) { toast('Pilih rentang tanggal yang benar.', 'error'); return; }
  const startDate = zonedLocalToUtc(start, '00:00'); const endDate = zonedLocalToUtc(end, '23:59:59');
  try {
    const kind = document.getElementById('report-kind').value; const category = document.getElementById('report-category').value; const account = document.getElementById('report-account').value;
    const params = new URLSearchParams({ start: startDate, end: endDate }); if (kind) params.set('kind', kind); if (category) params.set('category_id', category); if (account) params.set('account_id', account);
    const result = await api(`/api/reports?${params.toString()}`);
    currentReport = result.data; renderReport(currentReport);
  } catch (error) { toast(error.message, 'error'); }
}
function renderReport(d) {
  const t = d.totals; const net = Number(t.income) - Number(t.expense); const maxCategory = Math.max(1, ...d.categories.map(c => Number(c.total)));
  const categoryHTML = d.categories.length ? d.categories.map(c => `<div class="report-list-item"><span>${esc(c.name)} <small>(${c.kind === 'income' ? 'Masuk' : 'Keluar'})</small></span><b>${money(c.total)}</b><div class="progress-track"><i style="width:${Math.max(2, Number(c.total) / maxCategory * 100)}%;background:${esc(c.color || '#239879')}"></i></div></div>`).join('') : '<p class="muted" style="font-size:10px">Belum ada data kategori.</p>';
  const accountHTML = d.accounts.length ? d.accounts.map(a => `<div class="report-list-item"><span>${esc(a.name)}</span><b>${money(Number(a.income) + Number(a.expense))}</b><div class="progress-track"><i style="width:${Math.max(2, (Number(a.income) + Number(a.expense)) / Math.max(1, ...d.accounts.map(x => Number(x.income) + Number(x.expense))) * 100)}%"></i></div></div>`).join('') : '<p class="muted" style="font-size:10px">Belum ada aktivitas akun.</p>';
  const rows = d.transactions;
  document.getElementById('report-results').innerHTML = `${d.truncated ? `<div class="panel" style="margin-bottom:12px;border-color:#f0d9ad;background:#fffaf0;color:#8a682f;font-size:10px">Laporan memuat ${rows.length.toLocaleString('id-ID')} dari ${Number(t.count).toLocaleString('id-ID')} transaksi. Rincian dan file ekspor pada layar ini belum mencakup seluruh data. Persempit rentang tanggal untuk mengambil laporan yang lebih kecil.</div>` : ''}<div class="report-summary-grid"><div class="report-summary"><small>TOTAL PEMASUKAN</small><b style="color:#188467">${money(t.income)}</b></div><div class="report-summary"><small>TOTAL PENGELUARAN</small><b style="color:#d35f68">${money(t.expense)}</b></div><div class="report-summary"><small>SELISIH PERIODE</small><b>${money(net)}</b></div><div class="report-summary"><small>SALDO AKHIR</small><b>${money(d.balance)}</b></div></div><article class="panel report-chart-panel" style="margin-bottom:15px"><div class="panel-heading"><div><h3>Grafik laporan</h3><p>Perbandingan pemasukan dan pengeluaran ${d.trendGranularity === 'day' ? 'per hari' : 'per bulan'}</p></div></div><div class="report-chart-wrap"><canvas id="report-chart" aria-label="Grafik laporan keuangan"></canvas></div></article><div class="report-columns"><article class="panel"><div class="panel-heading"><div><h3>Ringkasan kategori</h3><p>Nilai transaksi berdasarkan kategori</p></div></div><div class="report-list">${categoryHTML}</div></article><article class="panel"><div class="panel-heading"><div><h3>Aktivitas akun</h3><p>Volume transaksi per akun</p></div></div><div class="report-list">${accountHTML}</div><div style="border-top:1px solid #eef1f1;margin-top:16px;padding-top:13px"><small class="muted">Transaksi pengeluaran terbesar</small><b style="display:block;font:700 13px var(--display);margin-top:6px">${d.largestExpense ? `${money(d.largestExpense.amount)} · ${esc(d.largestExpense.description)}` : 'Belum ada pengeluaran'}</b><small class="muted" style="display:block;margin-top:12px">Kategori pengeluaran terbesar</small><b style="display:block;font:700 13px var(--display);margin-top:6px">${d.largestExpenseCategory ? `${esc(d.largestExpenseCategory.name)} · ${money(d.largestExpenseCategory.total)}` : 'Belum ada pengeluaran'}</b></div></article></div><article class="panel report-table-panel"><div class="table-meta"><b style="color:#53646d">Rincian transaksi</b><span>${rows.length.toLocaleString('id-ID')} transaksi</span></div><div class="table-responsive">${rows.length ? `<table class="data-table"><thead><tr><th>TANGGAL</th><th>KETERANGAN</th><th>KATEGORI</th><th>AKUN</th><th>JENIS</th><th>NOMINAL</th></tr></thead><tbody>${rows.map(r => `<tr><td data-label="Tanggal">${formatDate(r.occurred_at, { time: true })}</td><td data-label="Transaksi"><div class="table-primary">${esc(r.description)}</div><div class="table-secondary">${esc(r.receipt_no)}</div></td><td data-label="Kategori">${esc(r.category_name)}</td><td data-label="Akun">${esc(r.account_name)}</td><td data-label="Jenis"><span class="kind-pill ${r.kind}">${r.kind === 'income' ? 'Pemasukan' : 'Pengeluaran'}</span></td><td data-label="Nominal" class="amount-cell ${r.kind}">${r.kind === 'income' ? '+' : '−'}${money(r.amount)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state" style="border:0"><h3>Tidak ada transaksi pada periode ini</h3><p>Ubah tanggal laporan untuk melihat periode lain.</p></div>'}</div></article>`;
  renderReportChart(d.trend || [], d.trendGranularity || 'month');
}
function renderReportChart(rows, granularity) {
  const canvas = document.getElementById('report-chart'); if (!canvas || !window.Chart) return;
  if (reportChart) reportChart.destroy();
  const labels = rows.map(row => {
    const date = new Date(`${row.period}${granularity === 'day' ? 'T12:00:00Z' : '-01T12:00:00Z'}`);
    return granularity === 'day' ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(date) : new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' }).format(date);
  });
  reportChart = new Chart(canvas, { type: 'line', data: { labels, datasets: [
    { label: 'Pemasukan', data: rows.map(r => Number(r.income)), borderColor: '#239879', backgroundColor: 'rgba(35,152,121,.10)', fill: true, tension: .3, pointRadius: 2 },
    { label: 'Pengeluaran', data: rows.map(r => Number(r.expense)), borderColor: '#df7d83', backgroundColor: 'rgba(223,125,131,.08)', fill: true, tension: .3, pointRadius: 2 }
  ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, color: '#829198', font: { size: 9 } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.raw)}` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#9ba7ad', font: { size: 9 }, maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, grid: { color: '#f0f3f3' }, ticks: { color: '#9ba7ad', font: { size: 8 }, callback: value => value >= 1000000 ? `${(value/1000000).toFixed(1)} jt` : value >= 1000 ? `${Math.round(value/1000)} rb` : value } } } } });
}
function reportRows() {
  if (!currentReport) throw new Error('Tampilkan laporan terlebih dahulu.');
  if (currentReport.truncated) throw new Error('Laporan melebihi 1.000 transaksi. Persempit rentang tanggal agar ekspor mencakup semua transaksi.');
  return currentReport.transactions.map(r => ({
    'Tanggal': formatDate(r.occurred_at, { time: true }), 'Nomor Transaksi': r.receipt_no, 'Jenis': r.kind === 'income' ? 'Pemasukan' : 'Pengeluaran',
    [`Nominal (${getCurrentUser()?.currency || 'IDR'})`]: Number(r.amount), 'Kategori': r.category_name, 'Akun': r.account_name, 'Penerima/Sumber': r.counterparty || '', 'Keterangan': r.description, 'Catatan': r.notes || ''
  }));
}
function exportCSV() {
  try {
    const rows = reportRows(); const columns = Object.keys(rows[0] || { 'Tanggal': '', 'Nomor Transaksi': '', 'Jenis': '', [`Nominal (${getCurrentUser()?.currency || 'IDR'})`]: '', 'Kategori': '', 'Akun': '', 'Penerima/Sumber': '', 'Keterangan': '', 'Catatan': '' });
    const csv = [columns, ...rows.map(row => columns.map(key => row[key]))].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), 'arus kas-laporan.csv'); toast('File CSV berhasil dibuat.');
  } catch (error) { toast(error.message, 'error'); }
}
function exportXLSX() {
  try {
    const rows = reportRows(); if (!window.XLSX) throw new Error('Library Excel belum termuat. Periksa koneksi internet lalu muat ulang halaman.');
    const summary = [{ 'Periode mulai': currentReport.start, 'Periode akhir': currentReport.end, 'Total pemasukan': currentReport.totals.income, 'Total pengeluaran': currentReport.totals.expense, 'Selisih': Number(currentReport.totals.income) - Number(currentReport.totals.expense), 'Saldo akhir': currentReport.balance }];
    const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(summary), 'Ringkasan'); window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(rows), 'Transaksi');
    window.XLSX.writeFile(wb, 'arus kas-laporan.xlsx'); toast('File Excel berhasil dibuat.');
  } catch (error) { toast(error.message, 'error'); }
}
function exportPDF() {
  if (!currentReport) { toast('Tampilkan laporan terlebih dahulu.', 'error'); return; }
  if (currentReport.truncated) { toast('Persempit rentang tanggal. PDF ini belum mencakup semua transaksi.', 'error'); return; }
  const d = currentReport; const rows = reportRows(); const chartImage = document.getElementById('report-chart')?.toDataURL('image/png') || '';
  const content = `<div class="receipt" style="font-family:Arial,sans-serif;width:100%;border:0"><div class="receipt-head"><h2>ARUSKAS</h2><p>LAPORAN KEUANGAN</p><p>${formatDate(d.start)} — ${formatDate(d.end)}</p></div><div class="receipt-line"><span>Total pemasukan</span><b>${money(d.totals.income)}</b></div><div class="receipt-line"><span>Total pengeluaran</span><b>${money(d.totals.expense)}</b></div><div class="receipt-line"><span>Selisih</span><b>${money(Number(d.totals.income) - Number(d.totals.expense))}</b></div><div class="receipt-line"><span>Saldo akhir</span><b>${money(d.balance)}</b></div>${chartImage ? `<h3 style="font-size:13px;margin:22px 0 8px">Grafik pemasukan dan pengeluaran</h3><img src="${chartImage}" alt="Grafik laporan" style="width:100%;max-height:210px;object-fit:contain">` : ''}<h3 style="font-size:13px;margin:22px 0 8px">Rincian transaksi</h3><table style="width:100%;border-collapse:collapse;font-size:9px"><thead><tr>${['Tanggal','Keterangan','Kategori','Jenis','Nominal'].map(x => `<th style="text-align:left;padding:7px;border-bottom:1px solid #bbb">${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${[r['Tanggal'], r['Keterangan'], r['Kategori'], r['Jenis'], money(r[`Nominal (${getCurrentUser()?.currency || 'IDR'})`])].map(x => `<td style="padding:7px;border-bottom:1px solid #eee">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="receipt-foot">Dibuat dengan ARUSKAS · Data bersumber dari akun pengguna</div></div><div class="receipt-actions"><button class="btn btn-primary" id="print-report-now"><i data-lucide="printer"></i> Cetak / Simpan PDF</button></div>`;
  openModal('Cetak laporan', content, 'REPORT EXPORT'); document.getElementById('print-report-now').onclick = () => window.print();
}
async function exportBackup() {
  try {
    const first = await api('/api/backup/export?limit=1000');
    if (Number(first.total || 0) > 10000) throw new Error('Backup berisi lebih dari 10.000 transaksi. Unduh laporan dalam beberapa rentang tanggal dan simpan salinan foto R2 secara terpisah.');
    const backup = first.backup; let transactions = [...(backup.transactions || [])]; let cursor = first.next_cursor;
    while (cursor) {
      const params = new URLSearchParams({ limit: '1000', cursor_created_at: cursor.created_at, cursor_id: cursor.id });
      const page = await api(`/api/backup/export?${params.toString()}`);
      transactions.push(...(page.backup.transactions || [])); cursor = page.next_cursor;
    }
    backup.transactions = transactions;
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `arus kas-backup-${new Date().toISOString().slice(0, 10)}.json`);
    toast(`Backup ${transactions.length.toLocaleString('id-ID')} transaksi berhasil diunduh. Foto bukti tidak termasuk dalam file ini.`);
  } catch (error) { toast(error.message, 'error'); }
}
async function importBackup(event) {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 8 * 1024 * 1024) { toast('Ukuran file backup maksimal 8 MB.', 'error'); event.target.value = ''; return; }
  if (!window.confirm('Impor backup akan menambahkan transaksi ke akun ini. Data lama tidak dihapus. Lanjutkan?')) { event.target.value = ''; return; }
  try {
    const backup = JSON.parse(await file.text());
    if (backup.app !== 'ARUSKAS' || backup.version !== 1 || !Array.isArray(backup.transactions)) throw new Error('File bukan backup ARUSKAS yang valid.');
    if (backup.transactions.length > 10000) throw new Error('Backup berisi lebih dari 10.000 transaksi. Pecah file backup sebelum impor.');
    const chunks = backup.transactions.length ? Array.from({ length: Math.ceil(backup.transactions.length / 90) }, (_, i) => backup.transactions.slice(i * 90, (i + 1) * 90)) : [[]];
    let totalImported = 0;
    for (let i = 0; i < chunks.length; i++) {
      const result = await api('/api/backup/import', { method: 'POST', body: { backup: { ...backup, transactions: chunks[i] } } });
      totalImported += Number(result.imported || 0);
    }
    toast(`${totalImported} transaksi baru berhasil diimpor. Data yang sudah ada dilewati.`); await loadReport();
  }
  catch (error) { toast(`${error.message} Data lama tidak dihapus. Jika impor terhenti di tengah jalan, jalankan ulang backup yang sama; transaksi yang sudah masuk akan dilewati.`, 'error'); }
  finally { event.target.value = ''; }
}
