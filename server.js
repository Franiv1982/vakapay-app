const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const port = 3000;

// Configuración básica
app.use(cors());
app.use(express.json());

// 1. Conexión a la Base de Datos que creamos antes
const db = new sqlite3.Database('./vakapay.db', (err) => {
    if (err) return console.error("Error al abrir DB:", err.message);
    console.log('✓ Conectado a la base de datos SQLite (vakapay.db)');
});

// 2. Ruta para ver los grupos guardados (GET)
app.get('/api/groups', (req, res) => {
    db.all("SELECT * FROM groups", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 3. Ruta para guardar un nuevo grupo (POST)
app.post('/api/groups', (req, res) => {
    const { name, type, date_start, date_end } = req.body;
    const sql = `INSERT INTO groups (name, type, date_start, date_end) VALUES (?, ?, ?, ?)`;
    db.run(sql, [name, type, date_start, date_end], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, type });
    });
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`\n====================================`);
    console.log(`¡SERVIDOR VAKAPAY ACTIVO!`);
    console.log(`Puerto: ${port}`);
    console.log(`Esperando conexiones...`);
    console.log(`====================================\n`);
});