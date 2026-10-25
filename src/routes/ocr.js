// src/routes/ocr.js — Escaneo de tickets con Claude
// ================================================================
// La app envía la foto del ticket aquí y el servidor llama a la API
// de Anthropic con la clave guardada en Vercel (ANTHROPIC_API_KEY).
// Así la clave nunca viaja dentro de la app.
// ================================================================
const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BASE64 = 4 * 1024 * 1024; // ~3 MB de imagen (Vercel no admite peticiones mayores de 4,5 MB)

// ── POST /ocr ─────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'El escaneo de tickets no está configurado en el servidor' });
    }

    const { image, media_type = 'image/jpeg' } = req.body || {};
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }
    if (!TIPOS_PERMITIDOS.includes(media_type)) {
      return res.status(400).json({ error: 'Formato de imagen no admitido' });
    }
    if (image.length > MAX_BASE64) {
      return res.status(413).json({ error: 'La imagen es demasiado grande' });
    }

    const hoy = new Date().toISOString().split('T')[0];
    const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.OCR_MODEL || 'claude-haiku-5-5',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image } },
            {
              type: 'text',
              text: 'Analiza este ticket o factura y extrae: descripción del gasto (desc), importe total (amount como número), '
                  + `fecha (date en formato YYYY-MM-DD, si no se ve usa hoy ${hoy}), y divisa (currency: EUR, USD, GBP o ARS). `
                  + 'Responde SOLO con JSON sin markdown: {"desc":"...","amount":0.00,"date":"YYYY-MM-DD","currency":"EUR"}',
            },
          ],
        }],
      }),
    });

    const data = await respuesta.json();
    if (!respuesta.ok) {
      console.error('Error de la API de Anthropic:', respuesta.status, data?.error?.message);
      return res.status(502).json({ error: 'No se pudo analizar el ticket' });
    }
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
