import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import worker from '../index.js';

globalThis.crypto ||= webcrypto;
const here = path.dirname(fileURLToPath(import.meta.url));
const schema = await readFile(path.join(here, '..', 'schema.sql'), 'utf8');

class Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.params = []; }
  bind(...params) { this.params = params; return this; }
  async first() { return this.database.prepare(this.sql).get(...this.params) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.params), success: true, meta: { changes: 0 } }; }
  async run() { const result = this.database.prepare(this.sql).run(...this.params); return { success: true, meta: { changes: Number(result.changes || 0) } }; }
}
class D1Mock {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.sqlite.exec('PRAGMA foreign_keys=ON'); this.sqlite.exec(schema); }
  prepare(sql) { return new Statement(this.sqlite, sql); }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map(statement => {
        const result = this.sqlite.prepare(statement.sql).run(...statement.params);
        return { success: true, meta: { changes: Number(result.changes || 0) } };
      });
      this.sqlite.exec('COMMIT'); return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

const r2Objects = new Map();
const env = {
  DB: new D1Mock(),
  BUCKET: {
    async put(key, value) { r2Objects.set(key, new Uint8Array(value)); },
    async get(key) { const value = r2Objects.get(key); return value ? { body: new Response(value).body } : null; },
    async delete(key) { r2Objects.delete(key); }
  },
  AUTH_PEPPER: 'test-only-long-auth-pepper-0123456789-abcdef',
  TELEGRAM_BOT_TOKEN: 'test-token',
  TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
  ALLOWED_ORIGINS: 'https://example.test'
};

async function call(pathname, options = {}) {
  const headers = new Headers(options.headers || {}); headers.set('Origin', 'https://example.test');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  let body;
  if (options.form) body = options.form;
  else if (options.body !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(options.body); }
  const request = new Request(`https://worker.test${pathname}`, { method: options.method || 'GET', headers, body });
  const response = await worker.fetch(request, env, { waitUntil() {} });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (options.expectedStatus) { assert.equal(response.status, options.expectedStatus, `${options.method || 'GET'} ${pathname}: ${JSON.stringify(data)}`); return data; }
  assert.equal(response.ok, true, `${options.method || 'GET'} ${pathname}: ${JSON.stringify(data)}`);
  return data;
}
const base64url = bytes => Buffer.from(bytes).toString('base64url');
async function derive(password, salt, iterations = 600000) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(salt, 'base64url'), iterations }, key, 256);
  return base64url(Buffer.from(bits));
}
async function register(username, password) {
  const salt = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const passwordDerived = await derive(password, salt);
  return call('/api/auth/register', { method: 'POST', body: { username, full_name: `Test ${username}`, password_derived: passwordDerived, password_salt: salt, password_length: password.length } });
}
async function login(username, password) {
  const saltInfo = await call('/api/auth/salt', { method: 'POST', body: { username } });
  const passwordDerived = await derive(password, saltInfo.salt, saltInfo.iterations);
  return call('/api/auth/login', { method: 'POST', body: { username, password_derived: passwordDerived, remember: false } });
}

const health = await call('/api/health'); assert.equal(health.service, 'ARUSKAS API');
const userA = await register('tester_a', 'password-test-kuat-123');
const me = await call('/api/auth/me', { token: userA.token }); assert.equal(me.user.username, 'tester_a');
const accountsA = await call('/api/accounts', { token: userA.token });
const categoriesA = await call('/api/categories', { token: userA.token });
const accountA = accountsA.items.find(account => account.type === 'cash');
const incomeCategory = categoriesA.items.find(category => category.kind === 'income');
const expenseCategory = categoriesA.items.find(category => category.kind === 'expense');

const income = await call('/api/transactions', { method: 'POST', token: userA.token, body: {
  kind: 'income', amount: 500000, category_id: incomeCategory.id, account_id: accountA.id,
  occurred_at: '2026-11-04T01:00:00.000Z', description: 'Gaji bulanan', counterparty: 'Kantor', notes: 'Tes'
} });
const receiptBefore = (await call(`/api/transactions/${income.id}`, { token: userA.token })).item.receipt_no;
await call(`/api/transactions/${income.id}`, { method: 'PUT', token: userA.token, body: {
  kind: 'income', amount: 550000, category_id: incomeCategory.id, account_id: accountA.id,
  occurred_at: '2026-11-04T01:00:00.000Z', description: 'Gaji bulanan diperbarui'
} });
const edited = (await call(`/api/transactions/${income.id}`, { token: userA.token })).item;
assert.equal(edited.amount, 550000); assert.equal(edited.receipt_no, receiptBefore);

const expense = await call('/api/transactions', { method: 'POST', token: userA.token, body: {
  kind: 'expense', amount: 25000, category_id: expenseCategory.id, account_id: accountA.id,
  occurred_at: '2026-11-04T02:00:00.000Z', description: 'Beli sarapan'
} });
const dashboard = await call('/api/dashboard', { token: userA.token }); assert.equal(dashboard.data.balance, 525000);
const report = await call('/api/reports?start=2026-11-01T00:00:00.000Z&end=2026-11-30T23:59:00.000Z', { token: userA.token });
assert.equal(report.data.totals.income, 550000); assert.equal(report.data.totals.expense, 25000); assert.ok(Array.isArray(report.data.trend));
const expenseOnly = await call('/api/reports?start=2026-11-01T00:00:00.000Z&end=2026-11-30T23:59:00.000Z&kind=expense', { token: userA.token }); assert.equal(expenseOnly.data.totals.income, 0); assert.equal(expenseOnly.data.totals.expense, 25000);

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'proof.png');
await call(`/api/transactions/${expense.id}/attachment`, { method: 'POST', token: userA.token, form });
const imageRequest = new Request(`https://worker.test/api/transactions/${expense.id}/attachment`, { headers: { Authorization: `Bearer ${userA.token}`, Origin: 'https://example.test' } });
const imageResponse = await worker.fetch(imageRequest, env, { waitUntil() {} }); assert.equal(imageResponse.status, 200); assert.equal(imageResponse.headers.get('content-type'), 'image/png');

const exportPage1 = await call('/api/backup/export?limit=1', { token: userA.token }); assert.equal(exportPage1.backup.transactions.length, 1); assert.ok(exportPage1.next_cursor);
const cursorParams = new URLSearchParams({ limit: '1', cursor_created_at: exportPage1.next_cursor.created_at, cursor_id: exportPage1.next_cursor.id });
const exportPage2 = await call(`/api/backup/export?${cursorParams.toString()}`, { token: userA.token }); assert.equal(exportPage2.backup.transactions.length, 1); assert.notEqual(exportPage1.backup.transactions[0].id, exportPage2.backup.transactions[0].id);
const backup = await call('/api/backup/export', { token: userA.token });
const sameUserImport = await call('/api/backup/import', { method: 'POST', token: userA.token, body: { backup: backup.backup } }); assert.equal(sameUserImport.imported, 0);
const pair = await call('/api/telegram/pair-code', { method: 'POST', token: userA.token }); assert.ok(pair.code.startsWith('ARS-'));
await call(`/api/accounts/${accountA.id}`, { method: 'PUT', token: userA.token, body: { name: accountA.name, type: accountA.type, opening_balance: accountA.opening_balance, color: accountA.color, archived: true } });
await call('/api/transactions', { method: 'POST', token: userA.token, expectedStatus: 400, body: { kind: 'expense', amount: 1000, category_id: expenseCategory.id, account_id: accountA.id, occurred_at: '2026-11-04T03:00:00.000Z', description: 'Akun arsip harus ditolak' } });

const userB = await register('tester_b', 'password-test-user-b-123');
const listB = await call('/api/transactions', { token: userB.token }); assert.equal(listB.total, 0);
await call(`/api/transactions/${income.id}`, { token: userB.token, expectedStatus: 404 });
const crossImport = await call('/api/backup/import', { method: 'POST', token: userB.token, body: { backup: backup.backup } }); assert.equal(crossImport.imported, 2);
const repeatImport = await call('/api/backup/import', { method: 'POST', token: userB.token, body: { backup: backup.backup } }); assert.equal(repeatImport.imported, 0);

const secondSession = await login('tester_a', 'password-test-kuat-123');
const currentSalt = await call('/api/auth/salt', { method: 'POST', body: { username: 'tester_a' } });
const currentDerived = await derive('password-test-kuat-123', currentSalt.salt, currentSalt.iterations);
const changedSalt = base64url(crypto.getRandomValues(new Uint8Array(16))); const changedPassword = 'password-sudah-diubah-789'; const changedDerived = await derive(changedPassword, changedSalt);
await call('/api/profile/password', { method: 'PUT', token: secondSession.token, body: { current_password_derived: currentDerived, new_password_derived: changedDerived, new_password_salt: changedSalt, password_length: changedPassword.length } });
await call('/api/auth/me', { token: userA.token, expectedStatus: 401 });
const recoveryCode = userA.recoveryCodes[0]; const newPassword = 'password-baru-yang-kuat-456';
const newSalt = base64url(crypto.getRandomValues(new Uint8Array(16))); const newDerived = await derive(newPassword, newSalt);
await call('/api/auth/recover', { method: 'POST', body: { username: 'tester_a', recovery_code: recoveryCode, new_password_derived: newDerived, new_password_salt: newSalt, password_length: newPassword.length } });
const newLogin = await login('tester_a', newPassword);
await call('/api/auth/logout', { method: 'POST', token: newLogin.token });
await call('/api/auth/me', { token: newLogin.token, expectedStatus: 401 });

console.log('PASS: ARUSKAS Worker smoke tests — health, registration, PBKDF2/HMAC login, sessions, transaction create/edit, stable receipt, dashboard balance, report trend, private R2 upload/read, backup idempotency and cross-user restore, Telegram pairing code, tenant isolation, recovery code, logout.');
console.log('NOTE: Telegram Bot API delivery and real Cloudflare deployment still require the user-owned Cloudflare and Telegram credentials.');
