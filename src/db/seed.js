// src/db/seed.js
// ================================================================
// Datos de prueba — ejecutar con: npm run seed
// ================================================================

const db      = require('./database');
const bcrypt  = require('bcryptjs');

console.log('🌱 Seeding VakaPay database…');

const insert = db.transaction(() => {
  // Limpiar tablas en orden correcto
  db.exec(`
    DELETE FROM activity_log;
    DELETE FROM expense_splits;
    DELETE FROM expenses;
    DELETE FROM group_members;
    DELETE FROM share_tokens;
    DELETE FROM groups;
    DELETE FROM friends;
    DELETE FROM users;
    DELETE FROM sqlite_sequence WHERE name IN
      ('users','groups','group_members','expenses','expense_splits','friends','activity_log','share_tokens');
  `);

  // ── Usuario demo ────────────────────────────────────────────
  const user = db.prepare(`
    INSERT INTO users (nombre, apellido, email, tel, bio)
    VALUES (?, ?, ?, ?, ?)
  `).run('Demo', 'User', 'demo@vakapay.app', '+34 600 000 000', 'Usuario de prueba VakaPay');

  const userId = user.lastInsertRowid;

  // ── Grupos ───────────────────────────────────────────────────
  const g1 = db.prepare(`
    INSERT INTO groups (owner_id, name, type, date_start, date_end)
    VALUES (?, 'Malaga', 'viaje', '2026-03-27', '2026-04-01')
  `).run(userId);

  const g2 = db.prepare(`
    INSERT INTO groups (owner_id, name, type, date_start, date_end)
    VALUES (?, 'bs.as', 'viaje', '2026-03-25', '2026-04-01')
  `).run(userId);

  const gMalaga = g1.lastInsertRowid;
  const gBsAs   = g2.lastInsertRowid;

  // ── Participantes Malaga ─────────────────────────────────────
  const addMember = db.prepare(`
    INSERT INTO group_members (group_id, display_name, balance)
    VALUES (?, ?, ?)
  `);

  addMember.run(gMalaga, 'Carlos',  120.50);
  addMember.run(gMalaga, 'Ana',      80.30);
  addMember.run(gMalaga, 'María',   -95.40);
  addMember.run(gMalaga, 'David',  -105.40);

  // ── Gastos Malaga ────────────────────────────────────────────
  const addExpense = db.prepare(`
    INSERT INTO expenses (group_id, description, amount, currency, amount_base, category, payer_name, expense_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const addSplit = db.prepare(`
    INSERT INTO expense_splits (expense_id, member_name, share)
    VALUES (?, ?, ?)
  `);

  const expensesData = [
    { desc:'Cena en El Patio',          amount:67.50,  cat:'food',      payer:'Carlos', date:'2026-03-28', involved:['Carlos','Ana','María','David'] },
    { desc:'Alquiler de coches',        amount:120.00, cat:'transport', payer:'Ana',    date:'2026-03-27', involved:['Carlos','Ana','María','David'] },
    { desc:'Taxi aeropuerto',           amount:34.00,  cat:'transport', payer:'María',  date:'2026-03-27', involved:['Carlos','Ana','María','David'] },
    { desc:'Mercado central',           amount:55.80,  cat:'food',      payer:'Carlos', date:'2026-03-29', involved:['Carlos','Ana','María','David'] },
    { desc:'Entradas Picasso Museum',   amount:28.00,  cat:'activity',  payer:'Ana',    date:'2026-03-30', involved:['Carlos','Ana','María','David'] },
  ];

  expensesData.forEach(ex => {
    const res = addExpense.run(gMalaga, ex.desc, ex.amount, 'EUR', ex.amount, ex.cat, ex.payer, ex.date);
    const share = +(ex.amount / ex.involved.length).toFixed(2);
    ex.involved.forEach(name => addSplit.run(res.lastInsertRowid, name, share));
  });

  // ── Amigos ───────────────────────────────────────────────────
  const addFriend = db.prepare(`
    INSERT INTO friends (owner_id, name, email, phone, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  addFriend.run(userId, 'Ana García',    'ana@ejemplo.com',    '+34 611 222 333', 'Amiga del cole');
  addFriend.run(userId, 'Carlos López',  'carlos@ejemplo.com', '+34 622 333 444', 'Compañero de trabajo');
  addFriend.run(userId, 'María Ruiz',    'maria@ejemplo.com',  '',                '');
  addFriend.run(userId, 'David Sánchez', '',                   '+34 644 555 666', 'Vecino');
  addFriend.run(userId, 'Elena Torres',  'elena@ejemplo.com',  '+34 655 666 777', 'Prima');

  // ── Actividad ────────────────────────────────────────────────
  const addActivity = db.prepare(`
    INSERT INTO activity_log (user_id, type, message) VALUES (?, ?, ?)
  `);

  addActivity.run(userId, 'group',   'Grupo "Malaga" creado');
  addActivity.run(userId, 'group',   'Grupo "bs.as" creado');
  addActivity.run(userId, 'member',  'David añadido al grupo Malaga');
  addActivity.run(userId, 'expense', 'Carlos registró "Cena en El Patio" · 67,50 € en Malaga');
  addActivity.run(userId, 'expense', 'Ana registró "Alquiler de coches" · 120,00 € en Malaga');
  addActivity.run(userId, 'friend',  'Elena Torres añadida a contactos');

  console.log(`✅ Usuario demo:   id=${userId}  email=demo@vakapay.app`);
  console.log(`✅ Grupos:         Malaga (id=${gMalaga}), bs.as (id=${gBsAs})`);
  console.log(`✅ Participantes:  4 en Malaga`);
  console.log(`✅ Gastos:         ${expensesData.length} en Malaga`);
  console.log(`✅ Amigos:         5`);
  console.log(`✅ Actividad:      6 entradas`);
});

insert();
console.log('\n🎉 Seed completado correctamente.\n');
