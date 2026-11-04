import { api, money, formatDate, getPeriodRange, esc, toast, zonedLocalToUtc, getCurrentUser } from './api.js';
let cashChart = null; let categoryChart = null;
export async function loadDashboard(period = 'month', customDates = null) {
  let range;
  if (period === 'custom') {
    if (!customDates?.start || !customDates?.end || customDates.start > customDates.end) { toast('Pilih rentang tanggal yang valid.', 'error'); return; }
    const zone = getCurrentUser()?.timezone || 'Asia/Jakarta';
    range = { start: zonedLocalToUtc(customDates.start, '00:00', zone), end: zonedLocalToUtc(customDates.end, '23:59:59', zone) };
  } else range = getPeriodRange(period);
  const params = new URLSearchParams(); if (range.start) params.set('start', range.start); if (range.end) params.set('end', range.end);
  try {
    const result = await api(`/api/dashboard?${params}`); const d = result.data;
    document.getElementById('dashboard-balance').textContent = money(d.balance);
    document.getElementById('dashboard-today-count').textContent = Number(d.todayCount || 0).toLocaleString('id-ID');
    document.getElementById('dashboard-income').textContent = money(d.period.income);
    document.getElementById('dashboard-expense').textContent = money(d.period.expense);
    const net = Number(d.period.income) - Number(d.period.expense);
    document.getElementById('dashboard-net').textContent = money(net);
    document.getElementById('dashboard-net').style.color = net < 0 ? '#d35f68' : '#188467';
    document.getElementById('dashboard-count').textContent = Number(d.period.count || 0).toLocaleString('id-ID');
    renderCashflow(d.trend || []); renderCategories(d.categories || []); renderRecent(d.latest || []);
  } catch (error) { toast(error.message, 'error'); }
}
function renderCashflow(rows) {
  const ctx = document.getElementById('cashflow-chart'); if (!ctx || !window.Chart) return;
  if (cashChart) cashChart.destroy();
  const months = rows.map(row => {
    const [year, month] = row.month.split('-'); return new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(new Date(Number(year), Number(month) - 1, 1));
  });
  cashChart = new Chart(ctx, { type: 'bar', data: { labels: months, datasets: [
    { label: 'Pemasukan', data: rows.map(r => Number(r.income)), backgroundColor: '#239879', borderRadius: 5, maxBarThickness: 17 },
    { label: 'Pengeluaran', data: rows.map(r => Number(r.expense)), backgroundColor: '#e28b8e', borderRadius: 5, maxBarThickness: 17 }
  ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, padding: 18, color: '#829198', font: { size: 9, family: 'DM Sans' } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.raw)}` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#9ba7ad', font: { size: 9 } }, border: { display: false } }, y: { beginAtZero: true, grid: { color: '#f0f3f3' }, ticks: { color: '#9ba7ad', font: { size: 8 }, callback: value => value >= 1000000 ? `${(value / 1000000).toFixed(1)} jt` : value >= 1000 ? `${Math.round(value / 1000)} rb` : value }, border: { display: false } } } } });
}
function renderCategories(rows) {
  const canvas = document.getElementById('category-chart'); const legend = document.getElementById('category-legend');
  const total = rows.reduce((sum, row) => sum + Number(row.total), 0); document.getElementById('category-total').textContent = money(total);
  if (categoryChart) categoryChart.destroy();
  const colors = rows.map(row => row.color || '#64748B');
  if (canvas && window.Chart) categoryChart = new Chart(canvas, { type: 'doughnut', data: { labels: rows.map(r => r.name), datasets: [{ data: rows.map(r => Number(r.total)), backgroundColor: colors, borderWidth: 0, hoverOffset: 5 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '76%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.label}: ${money(c.raw)}` } } } } });
  legend.innerHTML = rows.length ? rows.slice(0, 6).map(row => `<div class="legend-item"><i style="background:${esc(row.color || '#64748B')}"></i><span>${esc(row.name)}</span><b>${Math.round(Number(row.total) / (total || 1) * 100)}%</b></div>`).join('') : '<div class="muted" style="font-size:10px;grid-column:1/-1;text-align:center;padding:8px">Belum ada pengeluaran pada periode ini.</div>';
}
function renderRecent(rows) {
  const mount = document.getElementById('recent-transactions');
  if (!rows.length) { mount.innerHTML = '<div class="empty-state" style="border:0;padding:25px"><span class="empty-icon"><i data-lucide="receipt"></i></span><h3>Belum ada transaksi</h3><p>Mulai catat pemasukan atau pengeluaran pertamamu.</p></div>'; window.lucide?.createIcons?.(); return; }
  mount.innerHTML = rows.map(row => `<div class="recent-row"><span class="transaction-symbol ${row.kind}"><i data-lucide="${row.kind === 'income' ? 'arrow-down-left' : 'arrow-up-right'}"></i></span><div class="recent-info"><b>${esc(row.description)}</b><small>${esc(row.category_name)} · ${esc(row.account_name)} · ${formatDate(row.occurred_at, { time: true })}</small></div><strong class="recent-amount ${row.kind}">${row.kind === 'income' ? '+' : '−'}${money(row.amount)}</strong></div>`).join('');
  window.lucide?.createIcons?.();
}
