# VakaPay — Definición de Endpoints REST API

> **Convención:** `BASE_URL = /api/v1`  
> Todas las rutas devuelven `Content-Type: application/json`.  
> Autenticación: Bearer JWT en header `Authorization`.

---

## 👤 AUTH & PERFIL

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/auth/register` | Registro de nuevo usuario |
| `POST` | `/auth/login` | Login, devuelve JWT |
| `POST` | `/auth/logout` | Invalida el token |
| `GET` | `/users/me` | Obtiene perfil del usuario autenticado |
| `PATCH` | `/users/me` | Actualiza perfil (nombre, email, bio, tel) |
| `PUT` | `/users/me/avatar` | Sube o reemplaza foto de perfil (`multipart/form-data`) |

---

## 🗂️ GRUPOS

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/groups` | Lista todos los grupos del usuario |
| `POST` | `/groups` | Crea un grupo nuevo |
| `GET` | `/groups/:groupId` | Detalle de un grupo (incluye members y expenses) |
| `PATCH` | `/groups/:groupId` | Edita nombre, fechas o tipo del grupo |
| `DELETE` | `/groups/:groupId` | Elimina el grupo y todos sus gastos |

### Body `POST /groups`
```json
{
  "name":       "Viaje a Roma",
  "type":       "viaje",
  "date_start": "2025-06-01",
  "date_end":   "2025-06-10"
}
```

---

## 👥 PARTICIPANTES DE GRUPO

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/groups/:groupId/members` | Lista participantes y sus balances |
| `POST` | `/groups/:groupId/members` | Añade un participante (por nombre o user_id) |
| `DELETE` | `/groups/:groupId/members/:memberName` | Elimina un participante (solo si balance = 0) |

### Body `POST /groups/:groupId/members`
```json
{
  "display_name": "María",
  "user_id": null
}
```

---

## 💸 GASTOS

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/groups/:groupId/expenses` | Lista todos los gastos del grupo |
| `POST` | `/groups/:groupId/expenses` | Registra un nuevo gasto y actualiza balances |
| `GET` | `/groups/:groupId/expenses/:expenseId` | Detalle de un gasto |
| `PUT` | `/groups/:groupId/expenses/:expenseId` | Reemplaza un gasto (revierte y recalcula balances) |
| `DELETE` | `/groups/:groupId/expenses/:expenseId` | Elimina un gasto y revierte su impacto en balances |

### Body `POST /groups/:groupId/expenses`
```json
{
  "description":    "Cena en La Trattoria",
  "amount":         120.50,
  "category":       "food",
  "payer_name":     "Carlos",
  "expense_date":   "2025-06-03",
  "involved":       ["Carlos", "María", "Juan"]
}
```

### Response (incluye splits calculados)
```json
{
  "id": 42,
  "description": "Cena en La Trattoria",
  "amount": 120.50,
  "category": "food",
  "payer_name": "Carlos",
  "expense_date": "2025-06-03",
  "splits": [
    { "member_name": "Carlos", "share": 40.17 },
    { "member_name": "María",  "share": 40.17 },
    { "member_name": "Juan",   "share": 40.16 }
  ]
}
```

---

## 📊 BALANCES Y DEUDAS

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/groups/:groupId/balances` | Saldo neto de cada participante |
| `GET` | `/groups/:groupId/debts` | Transacciones mínimas para saldar el grupo (algoritmo greedy) |

### Response `GET /groups/:groupId/debts`
```json
{
  "transactions": [
    { "from": "Juan",  "to": "Carlos", "amount": 40.17 },
    { "from": "María", "to": "Carlos", "amount": 40.17 }
  ]
}
```

---

## 👫 AMIGOS

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/friends` | Lista de amigos del usuario |
| `POST` | `/friends` | Añade un nuevo amigo |
| `GET` | `/friends/:friendId` | Detalle de un amigo |
| `PATCH` | `/friends/:friendId` | Actualiza datos del amigo |
| `DELETE` | `/friends/:friendId` | Elimina un amigo |
| `PUT` | `/friends/:friendId/avatar` | Sube foto de perfil del amigo |

### Body `POST /friends`
```json
{
  "name":    "María García",
  "email":   "maria@example.com",
  "phone":   "+34 600 000 000",
  "notes":   "Compañera de trabajo"
}
```

---

## 🔔 ACTIVIDAD

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/activity` | Historial de actividad del usuario (últimas 40 entradas) |
| `DELETE` | `/activity` | Limpia el historial completo |

---

## 🔗 COMPARTIR GRUPO

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/groups/:groupId/share-link` | Genera un enlace de solo lectura para compartir |
| `GET` | `/shared/:token` | Vista pública del grupo (sin auth, solo lectura) |

---

## 📋 Códigos de respuesta utilizados

| Código | Significado |
|--------|-------------|
| `200` | OK |
| `201` | Recurso creado |
| `204` | Sin contenido (DELETE exitoso) |
| `400` | Bad Request (validación fallida) |
| `401` | No autenticado |
| `403` | Sin permisos sobre el recurso |
| `404` | Recurso no encontrado |
| `409` | Conflicto (ej: participante duplicado) |
| `422` | Entidad no procesable (ej: eliminar miembro con balance ≠ 0) |
| `500` | Error interno del servidor |

---

## 🗺️ Roadmap de migración sugerido

```
FASE 1 — localStorage (actual)
  └── VakaDataService con métodos async sobre localStorage

FASE 2 — API local (Node/FastAPI + SQLite)
  └── Reemplazar métodos de VakaDataService con fetch()
      sin tocar ningún otro código del frontend

FASE 3 — Producción (PostgreSQL + Auth)
  └── Añadir autenticación JWT
  └── Migrar a PostgreSQL
  └── Deploy en Railway / Render / Supabase
```
