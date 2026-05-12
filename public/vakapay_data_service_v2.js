// ================================================================
// VakaDataService — Fase 2: API REST real + fallback offline
// ================================================================
// Todos los métodos son async. En online llama a la API.
// En offline encola la operación y la ejecuta al reconectar.
// El frontend no necesita cambiar ninguna llamada.
// ================================================================

class VakaDataService {

  // ─── CONFIG ──────────────────────────────────────────────────
  #baseUrl = `${window.location.origin}/api/v1`;
  #token   = null;
  #queue   = [];   // operaciones pendientes offline
  #KEYS    = {
    groups:   'vp_groups',
    friends:  'vp_friends',
    activity: 'vp_activity',
    profile:  'vp_profile',
    queue:    'vp_queue',
    token:    'vp_token',
  };

  constructor() {
    this.#token = localStorage.getItem(this.#KEYS.token);
    this.#queue = JSON.parse(localStorage.getItem(this.#KEYS.queue) || '[]');

    // Sincronizar cuando se recupera la conexión
    window.addEventListener('online', () => this.#flushQueue());
  }

  // ─── AUTH ─────────────────────────────────────────────────────
  setToken(token) {
    this.#token = token;
    if (token) localStorage.setItem(this.#KEYS.token, token);
    else        localStorage.removeItem(this.#KEYS.token);
  }

  // ─── HTTP HELPERS ─────────────────────────────────────────────
  #headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.#token) h['Authorization'] = `Bearer ${this.#token}`;
    return h;
  }

  async #fetch(method, path, body) {
    const res = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: this.#headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return true;
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Error del servidor'), { status: res.status });
    return data;
  }

  // Si estamos offline, guarda en cola y devuelve el dato local
  async #fetchWithFallback(method, path, body, localFallback) {
    if (!navigator.onLine) {
      this.#enqueue({ method, path, body });
      return localFallback;
    }
    return this.#fetch(method, path, body);
  }

  // ─── COLA OFFLINE ─────────────────────────────────────────────
  #enqueue(op) {
    op.id = Date.now();
    this.#queue.push(op);
    localStorage.setItem(this.#KEYS.queue, JSON.stringify(this.#queue));
  }

  async #flushQueue() {
    if (!this.#queue.length) return;
    const pending = [...this.#queue];
    this.#queue = [];
    localStorage.setItem(this.#KEYS.queue, '[]');

    for (const op of pending) {
      try {
        await this.#fetch(op.method, op.path, op.body);
      } catch (err) {
        console.warn('[VakaDataService] Error al sincronizar operación:', op, err.message);
        this.#enqueue(op); // re-encolar si falla
      }
    }
    console.log('[VakaDataService] Cola sincronizada');
  }

  getPendingQueue() { return [...this.#queue]; }

  // ─── CACHÉ LOCAL ─────────────────────────────────────────────
  #read(key)        { return JSON.parse(localStorage.getItem(key) || 'null'); }
  #write(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

  // ================================================================
  //  AUTH
  // ================================================================

  async register({ nombre, apellido, email, password, tel = '' }) {
    const data = await this.#fetch('POST', '/auth/register', { nombre, apellido, email, password, tel });
    this.setToken(data.token);
    this.#write(this.#KEYS.profile, data.user);
    return data;
  }

  async login({ email, password }) {
    const data = await this.#fetch('POST', '/auth/login', { email, password });
    this.setToken(data.token);
    this.#write(this.#KEYS.profile, data.user);
    return data;
  }

  async logout() {
    try { await this.#fetch('POST', '/auth/logout'); } catch (_) {}
    this.setToken(null);
    this.clearAll();
  }

  async deleteAllData() {
  try {
    const g = await this.#fetch('GET', '/groups');
    for (const gr of g) await this.#fetch('DELETE', `/groups/${gr.id}`);
  } catch(_) {}
  try {
    const f = await this.#fetch('GET', '/friends');
    for (const fr of f) await this.#fetch('DELETE', `/friends/${fr.id}`);
  } catch(_) {}
  try { await this.#fetch('DELETE', '/activity'); } catch(_) {}
  Object.values(this.#KEYS).forEach(k => localStorage.removeItem(k));
}

async deleteAccount() {
  await this.deleteAllData();
  try { await this.#fetch('DELETE', '/users/me'); } catch(_) {}
  this.setToken(null);
  localStorage.clear();
}

  // ================================================================
  //  PERFIL
  // ================================================================

  async getProfile() {
    try {
      const data = await this.#fetch('GET', '/users/me');
      this.#write(this.#KEYS.profile, data);
      return data;
    } catch (_) {
      return this.#read(this.#KEYS.profile) ?? {};
    }
  }

  async saveProfile(profileData) {
    const updated = await this.#fetchWithFallback(
      'PATCH', '/users/me', profileData,
      { ...this.#read(this.#KEYS.profile), ...profileData }
    );
    this.#write(this.#KEYS.profile, updated);
    return updated;
  }

  // ================================================================
  //  GRUPOS
  // ================================================================

  async getGroups() {
    try {
      const data = await this.#fetch('GET', '/groups');
      this.#write(this.#KEYS.groups, data);
      return data;
    } catch (_) {
      return this.#read(this.#KEYS.groups) ?? [];
    }
  }

  async getGroup(groupId) {
    return this.#fetch('GET', `/groups/${groupId}`);
  }

  async createGroup({ name, type = 'viaje', date_start, date_end }) {
    const newGroup = await this.#fetchWithFallback(
      'POST', '/groups', { name, type, date_start, date_end },
      { id: Date.now(), name, type, date_start, date_end, member_count: 0, expense_count: 0, total: 0 }
    );
    // Actualizar caché local
    const groups = this.#read(this.#KEYS.groups) ?? [];
    groups.unshift(newGroup);
    this.#write(this.#KEYS.groups, groups);
    return newGroup;
  }

  async updateGroup(groupId, data) {
    return this.#fetchWithFallback('PATCH', `/groups/${groupId}`, data, data);
  }

  async deleteGroup(groupId) {
    await this.#fetchWithFallback('DELETE', `/groups/${groupId}`, null, true);
    const groups = (this.#read(this.#KEYS.groups) ?? []).filter(g => g.id !== groupId);
    this.#write(this.#KEYS.groups, groups);
    return true;
  }

  // ── Balances y deudas
  async getBalances(groupId)  { return this.#fetch('GET', `/groups/${groupId}/balances`); }
  async getDebts(groupId)     { return this.#fetch('GET', `/groups/${groupId}/debts`); }
  async getShareLink(groupId) { return this.#fetch('POST', `/groups/${groupId}/share-link`); }

  // ================================================================
  //  MIEMBROS
  // ================================================================

  async getMembers(groupId) {
    return this.#fetch('GET', `/groups/${groupId}/members`);
  }

  async addMember(groupId, displayName) {
    return this.#fetchWithFallback(
      'POST', `/groups/${groupId}/members`,
      { display_name: displayName },
      { display_name: displayName, balance: 0 }
    );
  }

  async removeMember(groupId, displayName) {
    return this.#fetchWithFallback('DELETE', `/groups/${groupId}/members/${encodeURIComponent(displayName)}`, null, true);
  }

  // ================================================================
  //  GASTOS
  // ================================================================

  async getExpenses(groupId) {
    return this.#fetch('GET', `/groups/${groupId}/expenses`);
  }

  async addExpense(groupId, { desc, amount, currency = 'EUR', cat, payer, date, involved }) {
    return this.#fetchWithFallback(
      'POST', `/groups/${groupId}/expenses`,
      { description: desc, amount, currency, category: cat, payer_name: payer, expense_date: date, involved },
      { description: desc, amount, currency, category: cat, payer_name: payer, expense_date: date, involved }
    );
  }

  async updateExpense(groupId, expenseId, data) {
    const body = {
      description: data.desc, amount: data.amount, currency: data.currency || 'EUR',
      category: data.cat, payer_name: data.payer, expense_date: data.date, involved: data.involved,
    };
    return this.#fetchWithFallback('PUT', `/groups/${groupId}/expenses/${expenseId}`, body, data);
  }

  async deleteExpense(groupId, expenseId) {
    return this.#fetchWithFallback('DELETE', `/groups/${groupId}/expenses/${expenseId}`, null, true);
  }

  // ================================================================
  //  AMIGOS
  // ================================================================

  async getFriends() {
    try {
      const data = await this.#fetch('GET', '/friends');
      this.#write(this.#KEYS.friends, data);
      return data;
    } catch (_) {
      return this.#read(this.#KEYS.friends) ?? [];
    }
  }

  async addFriend({ name, email = '', phone = '', notes = '' }) {
    const friend = await this.#fetchWithFallback(
      'POST', '/friends', { name, email, phone, notes },
      { name, email, phone, notes, id: Date.now() }
    );
    const friends = this.#read(this.#KEYS.friends) ?? [];
    friends.push(friend);
    this.#write(this.#KEYS.friends, friends);
    return friend;
  }

  async updateFriend(friendId, data) {
    return this.#fetchWithFallback('PATCH', `/friends/${friendId}`, data, data);
  }

  async deleteFriend(friendId) {
    await this.#fetchWithFallback('DELETE', `/friends/${friendId}`, null, true);
    const friends = (this.#read(this.#KEYS.friends) ?? []).filter(f => f.id !== friendId);
    this.#write(this.#KEYS.friends, friends);
    return true;
  }

  // ================================================================
  //  ACTIVIDAD
  // ================================================================

  async getActivity() {
    try {
      const data = await this.#fetch('GET', '/activity');
      this.#write(this.#KEYS.activity, data);
      return data;
    } catch (_) {
      return this.#read(this.#KEYS.activity) ?? [];
    }
  }

  async clearActivity() {
    await this.#fetchWithFallback('DELETE', '/activity', null, true);
    this.#write(this.#KEYS.activity, []);
    return true;
  }

  // ================================================================
  //  UTILIDADES
  // ================================================================

  async clearAll() {
    Object.values(this.#KEYS).forEach(k => localStorage.removeItem(k));
    return true;
  }
}

// ─── Instancia global ────────────────────────────────────────────
const vakaData = new VakaDataService();


