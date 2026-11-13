// public/js/datos.js — Logo y servicio de datos (VakaDataService): llamadas al servidor, caché en el móvil
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ LOGO ════════════════════════════════════════════════════════════════
document.getElementById('logoImg').src = "logo_vakapay.png";


// ================================================================
// VakaDataService — Capa de abstracción de datos
// ================================================================
// Convierte el array de miembros que devuelve la API (fila por fila de Postgres)
// en el objeto {nombre: balance} que usa todo el frontend. Sin esto, cualquier
// merge con "..." vuelca los indices numericos del array como si fueran
// participantes reales (bug de "miembros fantasma 0,1,2...").
function normalizeMembersField(rawMembers, fallback) {
  if (Array.isArray(rawMembers)) {
    return Object.fromEntries(rawMembers.map(m => [m.display_name, Number(m.balance) || 0]));
  }
  return rawMembers || fallback || {};
}


// Traduce los gastos del servidor (description, category, payer_name...)
// a los nombres que usa el frontend (desc, cat, payer...). Sin esto, los iconos salen como 💡.
// Texto escrito por la gente → seguro para meterlo en HTML (también en atributos).
// Declarada aquí, al principio, para que exista desde la primera pantalla que se pinta.
function escaparHtml(t) { return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function normalizeExpensesField(rawExpenses) {
  return (rawExpenses || [])
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(e => ({
      ...e,
      desc:     e.description || e.desc || 'Sin descripción',
      payer:    e.payer_name || e.payer || 'Desconocido',
      date:     e.expense_date || e.date || '',
      baseAmt:  Number(e.amount_base || e.baseAmt || e.amount) || 0,
      cat:      e.category || e.cat || 'other',
      involved: e.splits ? e.splits.map(s => s.member_name) : (e.involved || [])
    }));
}

class VakaDataService {
  #KEYS    = { groups:'vp_groups', friends:'vp_friends', activity:'vp_activity', profile:'vp_profile', token:'vp_token' };
  #API_URL = 'https://vakapay-app.vercel.app/api/v1';
  #token   = null;

  constructor() {
    this.#token = localStorage.getItem('vp_token');
  }

  setToken(t) {
    this.#token = t;
    if (t) localStorage.setItem('vp_token', t);
    else   localStorage.removeItem('vp_token');
  }
  getToken() { return this.#token; }
  #read(k)       { return JSON.parse(localStorage.getItem(k)||'null'); }
  #write(k,data) { localStorage.setItem(k,JSON.stringify(data)); }

  async #req(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.#token) headers['Authorization'] = `Bearer ${this.#token}`;
    
    const res = await fetch(`${this.#API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return true;

    // Leemos el texto primero para evitar que res.json() explote con páginas HTML de error
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || 'Error de red o servidor' };
    }

    if (!res.ok) {
      throw Object.assign(new Error(data.error || 'Error del servidor'), { status: res.status, datos: data });
    }
    
    return data;
  }

  #normalize(g) {
    const normalizeExpense = e => ({
      ...e,
      desc:    e.desc    || e.description  || '',
      payer:   e.payer   || e.payer_name   || '',
      date:    e.date    || e.expense_date || '',
      baseAmt: Number(e.baseAmt || e.amount_base || e.amount) || 0,
      cat:     e.cat     || e.category     || 'other',
      involved: e.involved || (e.splits ? e.splits.map(s => s.member_name) : []),
    });
    return {
  id:        g.id,
  owner_id:  g.owner_id || null,
  name:      g.name,
  type:      g.type        || 'viaje',
  start:     g.date_start  || g.start || '',
  end:       g.date_end    || g.end   || '',
  members: Array.isArray(g.members)
    ? Object.fromEntries(g.members.map(m => [m.display_name, m.balance || 0]))
    : g.members || {},
  memberIds: Array.isArray(g.members)
    ? Object.fromEntries(g.members.filter(m => m.user_id).map(m => [m.display_name, m.user_id]))
    : g.memberIds || {},
  expenses: (g.expenses || []).map(normalizeExpense),
  createdAt: g.created_at || g.createdAt || new Date().toISOString(),
  currency:  g.currency || 'EUR',
};
  }

  async login({ email, password }) {
    const data = await this.#req('POST', '/auth/login', { email, password });
    this.setToken(data.token);
    this.#write(this.#KEYS.profile, data.user);
    return data;
  }

  async getGroups() {
    try {
      const data = await this.#req('GET', '/groups');
      if (!Array.isArray(data)) return this.#read(this.#KEYS.groups) ?? [];
      const detailed = await Promise.all(data.map(g => this.#req('GET', `/groups/${g.id}`).catch(() => g)));
      const normalized = detailed.map(g => this.#normalize(g));
      this.#write(this.#KEYS.groups, normalized);
      this.cargaFallida = false;
      return normalized;
    } catch(_) {
      this.cargaFallida = true;   // sin conexión: se usa lo guardado en el móvil
      return this.#read(this.#KEYS.groups) ?? [];
    }
  }

  async createGroup(data) {
    try {
      const res = await this.#req('POST', '/groups', { 
        name: data.name, 
        type: data.type, 
        date_start: data.start, 
        date_end: data.end 
      });
      const g = this.#normalize(res);
      const gs = this.#read(this.#KEYS.groups) ?? [];
      gs.unshift(g);
      this.#write(this.#KEYS.groups, gs);
      return g;
    } catch(err) {
      // Si el servidor no lo confirma, NO se crea un grupo solo en el móvil:
      // nunca llegaría a los demás y desaparecería al volver la conexión.
      console.error("Error servidor:", err.message);
      throw err;
    }
  }

  async addExpense(idx, {desc, amount, cat, payer, date, involved, currency, baseAmt, ticket}) {
    const gs = groups;
    const g = gs[idx];
    
    // ══ REFUERZO: Asegurar que los miembros existan en el grupo ══
    if (Array.isArray(involved)) {
        involved.forEach(name => {
            if (!Object.prototype.hasOwnProperty.call(g.members, name)) {
                g.members[name] = 0; // Crea el miembro localmente si falta
            }
        });
    }

    // 1. Aseguramos que existan gastos y el ID del grupo
    if (!g.expenses) g.expenses = [];
    const groupId = g.id || g._id; 
    
    const ba = Number(baseAmt || amount);
    const newExp = {desc, amount: Number(amount), cat, payer, date, involved, currency: currency || 'EUR', baseAmt: ba, ticket: ticket || null};
    
    // 2. Primero el servidor: si no lo confirma, se lanza el error y la pantalla
    //    no cambia (antes se guardaba solo en el móvil y luego desaparecía).
    if (!groupId) throw new Error("ID de grupo no encontrado");
    await this.#req('POST', `/groups/${groupId}/expenses`, {
        description: desc,
        amount: Number(amount),   // importe original en su moneda
        amount_base: ba,          // importe convertido con el tipo de cambio que eligió el usuario
        currency: currency || 'EUR',
        category: cat || 'other',
        payer_name: payer,
        expense_date: date,
        involved: involved,
        ticket: ticket || null    // comprobante (imagen reducida), visible para todo el grupo
    });

    // 3. Guardado: se muestra ya y se descarga el grupo actualizado
    g.expenses.unshift(newExp);
    if (typeof updateBalances === 'function') updateBalances();
    try {
      const resFresh = await fetch(`${API_BASE}/api/v1/groups/${g.id}`, {
        headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
      });
      if (resFresh.ok) {
        const freshData = await resFresh.json();
        groups[currentGroupIdx] = {
          ...groups[currentGroupIdx],
          ...freshData,
          members: normalizeMembersField(freshData.members, groups[currentGroupIdx].members),
          expenses: normalizeExpensesField(freshData.expenses)
        };
        renderAll();
      }
    } catch (e) {
      console.warn("Gasto guardado; no se pudo descargar el grupo actualizado:", e.message);
    }

    return newExp;
  }
  
  async deleteExpense(idx, eidx) {
    const gs = groups;
    const g = gs[idx];
    
    // Verificación de seguridad QA: Si el gasto no existe, salimos sin romper nada
    if (!g || !g.expenses || !g.expenses[eidx]) return false;

    const ex = g.expenses[eidx];
    const serverExpId = ex.id; 

    // 0. Primero el servidor: si no lo confirma, se lanza el error y el gasto sigue ahí
    if (serverExpId && g.id) {
      await this.#req('DELETE', `/groups/${g.id}/expenses/${serverExpId}`);
    }

    // 1. Borramos el gasto del array
    g.expenses.splice(eidx, 1);

    // 2. Recalculamos todos los saldos de forma automática
    if (typeof updateBalances === 'function') updateBalances();

    // Sincronización post-borrado
    try {
      const resFresh = await fetch(`${API_BASE}/api/v1/groups/${g.id}`, {
        headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
      });
      if (resFresh.ok) {
        const freshData = await resFresh.json();
        groups[currentGroupIdx] = {
          ...groups[currentGroupIdx],
          ...freshData,
                    members: normalizeMembersField(freshData.members, groups[currentGroupIdx].members),
                    expenses: normalizeExpensesField(freshData.expenses)
        };
        updateBalances();
        renderAll();
      }
    } catch (e) { console.error("Error sincronizando tras borrar:", e); }
    return true;
  }

  async getFriends() {
    try {
      const raw = await this.#req('GET', '/friends');
      if (Array.isArray(raw)) {
        // La foto guardada en el servidor (avatar_url) es la que se muestra (avatar)
        const data = raw.map(f => ({ ...f, avatar: (f.avatar_url && f.avatar_url.startsWith('data:')) ? f.avatar_url : (f.avatar || null) }));
        this.#write(this.#KEYS.friends, data);
        return data;
      }
    } catch(_) {}
    return this.#read(this.#KEYS.friends) ?? [];
  }
  async saveFriends(fs) { this.#write(this.#KEYS.friends,fs); return true; }
  async updateFriend(id, data) { return await this.#req('PATCH', `/friends/${id}`, data); }
  async addFriend(friendData) {
    const friend = await this.#req('POST', '/friends', friendData);
    return friend;
  }
  async getProfile() { return this.#read(this.#KEYS.profile)??{}; }
  // Lo último guardado en el móvil, sin esperar al servidor (para pintar al instante)
  cache(nombre) { try { return this.#read(this.#KEYS[nombre]); } catch (_) { return null; } }
  async saveProfile(data) {
    const cur = await this.getProfile(); const upd = { ...cur, ...data }; this.#write(this.#KEYS.profile, upd);
    const body = { nombre: data.nombre, apellido: data.apellido, email: data.email, tel: data.tel, bio: data.bio };
    if (data.pago_bizum !== undefined) body.pago_bizum = data.pago_bizum;
    if (data.pago_iban  !== undefined) body.pago_iban  = data.pago_iban;
    try { await this.#req('PATCH', '/users/me', body); }
    catch (err) { if (err.status === 400) throw err; } // datos no válidos (p. ej. IBAN): se avisa; sin conexión: se guarda en local
    return upd;
  }

  async getActivity() {
  try {
    const data = await this.#req('GET', '/activity');
    if (Array.isArray(data)) {
      const normalized = data.map(a => ({
        ...a,
        msg: a.message,
        time: a.created_at,
        groupName: a.group_name ?? null,
      }));
      this.#write(this.#KEYS.activity, normalized);
      return normalized;
    }
  } catch(_) {}
  return this.#read(this.#KEYS.activity) ?? [];
}
async logActivity(msg, groupName = null) {
  try {
    await this.#req('POST', '/activity', { message: msg, type: 'other', group_name: groupName });
  } catch(_) {}
  const act = this.#read(this.#KEYS.activity) ?? [];
  act.unshift({msg, message: msg, time: new Date().toISOString(), groupName});
  if(act.length > 40) act.pop();
  this.#write(this.#KEYS.activity, act);
  return act[0];
}
  
  async updateGroupName(idx, newName) {
    const gs = groups;
    const g = gs[idx];
    
    // Primero el servidor: si no lo confirma, se lanza el error y el nombre no cambia
    if (g.id) await this.#req('PATCH', `/groups/${g.id}`, { name: newName });
    g.name = newName;
    return true;
  }

  // Borrado en el servidor, en una sola operación (ver src/utils/borrado.js).
  // Si hay saldos pendientes en grupos compartidos, el servidor responde 409 y no borra nada.
  async deleteAllData() {
    return await this.#req('DELETE', '/users/me/datos');
  }

  async deleteAccount() {
    const r = await this.#req('DELETE', '/users/me');
    this.setToken(null);
    { const _tema = localStorage.getItem('vp_tema'); localStorage.clear(); if (_tema) localStorage.setItem('vp_tema', _tema); }
    return r;
  }
}

const vakaData = new VakaDataService();
