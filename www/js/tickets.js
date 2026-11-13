// public/js/tickets.js — Divisas y escaneo de tickets
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ DIVISAS ═════════════════════════════════════════════════════════════
const RATES = { EUR:1, USD:1.09, GBP:0.86, ARS:1050 };
const SYMBOLS = { EUR:'€', USD:'$', GBP:'£', ARS:'$' };

// «Por persona» igual en la app, el PDF y el resumen de texto: el total se reparte
// entre quienes participan en al menos un gasto. Los miembros que no comparten
// ningún gasto (p. ej. se apuntaron y al final no fueron) no cuentan.
function resumenPorPersona(g) {
  const gastos = (g.expenses || []).filter(e => !e.es_pago);
  const total = gastos.reduce((s, e) => s + (Number(e.baseAmt || e.amount_base) || 0), 0);
  const participantes = new Set();
  gastos.forEach(e => (e.involved || (e.splits ? e.splits.map(x => x.member_name) : [])).forEach(n => participantes.add(n)));
  const n = participantes.size;
  return { total, participantes: n, miembros: Object.keys(g.members || {}).length, porPersona: n ? total / n : 0 };
}

function convertToBase(amount, fromCurrency) {
  // Postgres devuelve las columnas NUMERIC/DECIMAL como STRING (ej. "45.50"),
  // no como number. Si no se fuerza aquí, sumas como total += e.baseAmt
  // hacen concatenación de texto en vez de suma ("0" + "45.50" = "045.50"),
  // y el resultado final ya no es un number, por lo que total.toFixed()
  // revienta con "total.toFixed is not a function" (bug de Estadísticas).
  const n = Number(amount) || 0;
  if(!fromCurrency || fromCurrency===getBase()) return n;
  const inEUR = n / (RATES[fromCurrency] || 1);
  return +(inEUR * (RATES[getBase()] || 1)).toFixed(2);
}
function getBase() {
  return document.getElementById('baseCurrency')?.value || 'EUR';
}
function formatAmountBase(amount, currency) {
  const sym = SYMBOLS[currency || getBase()] || '€';
  return sym + amount.toFixed(2);
}
function onBaseCurrencyChange() {
  renderExpenses();
  renderBalances();
}

// ═══ TICKETS (OCR) ═══════════════════════════════════════════════════════
function handleOCRFile(ev) {
  const file = ev.target.files[0];
  if(file) processOCRFile(file);
}
async function processOCRFile(file) {
  const preview = document.getElementById('ocrPreview');
  const loading = document.getElementById('ocrLoading');
  const success = document.getElementById('ocrSuccess');
  const fileName = document.getElementById('ocrFileName');
  const ticketPreview = document.getElementById('ocrTicketPreview');

  const reader = new FileReader();
  
  reader.onload = e => {
    if (preview) { preview.src = e.target.result; }
    if (fileName) fileName.textContent = file.name;
    document.getElementById('ocrDot').style.display = 'block';
    document.getElementById('ocrBtn').classList.add('has-file');
    document.getElementById('ocrPopover').style.display = 'block';
    if (loading) loading.style.display = 'block';
    if (success) success.style.display = 'none';
  };
  
  reader.readAsDataURL(file);

  const b64 = await fileToBase64(file);
  const mediaType = 'image/jpeg'; // fileToBase64 siempre devuelve JPEG reducido
  window._ticketNuevo = 'data:image/jpeg;base64,' + b64; // se guardará como comprobante del gasto

  try {
    const data = await escanearTicket(b64, mediaType);
    const text = data.content?.map(c => c.text || '').join('') || '';
    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g, '')); } catch(e) { throw new Error('No se pudo parsear la respuesta'); }
    // Del ticket solo se toma el importe total; el resto lo completa el usuario
    if (parsed.amount) document.getElementById('expAmount').value = parsed.amount;
    if (loading) loading.style.display = 'none';
    if (success) success.style.display = 'block';
    toast(parsed.amount ? `Importe del ticket: ${parsed.amount} — revisa y confirma` : 'Ticket adjuntado', 's');
  } catch(err) {
    if (loading) loading.style.display = 'none';
    toast(textoError(err, 'No se pudo leer el ticket.'), 'e');
  }
}

function toggleOcrPopover() {
  const popover = document.getElementById('ocrPopover');
  const hasFile = document.getElementById('ocrFile').files?.length > 0;
  if (!hasFile) {
    document.getElementById('ocrFile').click();
    return;
  }
  const isOpen = popover.style.display !== 'none';
  popover.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(() => document.addEventListener('click', closeOcrOnOutside), 10);
  }
}

function closeOcrOnOutside(e) {
  const popover = document.getElementById('ocrPopover');
  const btn = document.getElementById('ocrBtn');
  if (!popover.contains(e.target) && !btn.contains(e.target)) {
    popover.style.display = 'none';
    document.removeEventListener('click', closeOcrOnOutside);
  }
}

function clearOCR() {
  window._ticketNuevo = null;
  document.getElementById('ocrFile').value = '';
  document.getElementById('ocrPreview').src = '';
  document.getElementById('ocrFileName').textContent = '';
  document.getElementById('ocrLoading').style.display = 'none';
  document.getElementById('ocrSuccess').style.display = 'none';
  document.getElementById('ocrDot').style.display = 'none';
  document.getElementById('ocrPopover').style.display = 'none';
  document.getElementById('ocrBtn').classList.remove('has-file');
  document.removeEventListener('click', closeOcrOnOutside);
}

// Descarga del servidor la imagen del comprobante de un gasto (y la guarda en memoria)
async function cargarTicket(idx) {
  const g = groups[currentGroupIdx];
  const e = g && g.expenses[idx];
  if (!e) return null;
  if (e.ticket) return e.ticket;
  const expId = e.id || e._id;
  if (!expId || !e.has_ticket) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/groups/${g.id}/expenses/${expId}`, {
      headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    e.ticket = data.ticket || null;
    return e.ticket;
  } catch (_) { return null; }
}

// Muestra el comprobante a pantalla completa
async function verTicket(idx) {
  const t = await cargarTicket(idx);
  if (!t) { toast('No se pudo cargar el comprobante', 'e'); return; }
  document.getElementById('visorTicketImg').src = t;
  reiniciarZoom(document.getElementById('visorTicketImg'));
  document.getElementById('visorTicketModal').dataset.idx = idx;
  document.getElementById('visorTicketModal').style.display = 'flex';
}

// ═══ ESCANEO DE TICKETS ═══════════════════════════════════════════════
// 'local'    → se lee en el propio móvil con Tesseract.js (gratis, sin servidor)
// 'servidor' → se envía a /api/v1/ocr, que usa Claude (más preciso, de pago; requiere ANTHROPIC_API_KEY en Vercel)
const OCR_MODO = 'local';

// Devuelve la respuesta con la misma forma que la API de Claude ({content:[{text}]}),
// así el resto del código no cambia sea cual sea el modo.
async function escanearTicket(b64, mediaType) {
  if (OCR_MODO === 'servidor') {
    const res = await fetch(`${API_BASE}/api/v1/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
      body: JSON.stringify({ image: b64, media_type: mediaType })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo analizar el ticket');
    return data;
  }
  const texto = await leerTextoTicket(`data:${mediaType};base64,${b64}`);
  const datos = interpretarTicket(texto);
  if (!datos.amount) throw new Error('No se encontró el importe. Prueba con una foto más nítida y recta.');
  return { content: [{ type: 'text', text: JSON.stringify(datos) }] };
}

// Carga Tesseract.js solo la primera vez que se escanea (no ralentiza el arranque de la app)
let _tesseractWorker = null;
async function leerTextoTicket(imagen) {
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      sc.onload = resolve;
      sc.onerror = () => reject(new Error('No se pudo cargar el lector de tickets. Revisa tu conexión.'));
      document.head.appendChild(sc);
    });
  }
  if (!_tesseractWorker) _tesseractWorker = await Tesseract.createWorker('spa');
  const { data } = await _tesseractWorker.recognize(imagen);
  return data.text || '';
}

// Convierte "1.234,56", "1,234.56", "12,50" o "12.50" en número
function _numeroTicket(txt) {
  let t = String(txt).replace(/\s/g, '');
  const ultComa = t.lastIndexOf(','), ultPunto = t.lastIndexOf('.');
  if (ultComa > -1 && ultPunto > -1) {
    t = ultComa > ultPunto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (ultComa > -1) {
    t = t.replace(',', '.');
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// Extrae descripción (comercio), importe total, fecha y divisa del texto leído
function interpretarTicket(texto) {
  const lineas = String(texto).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const reImporte = /(\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?!\d)/g;

  // 1. Importe: la línea de TOTAL (no subtotal); si no la hay, el importe más alto del ticket
  let amount = null;
  const reTotal = /(total|importe|a pagar|a cobrar|tarjeta|efectivo)/i;
  for (let i = lineas.length - 1; i >= 0 && amount === null; i--) {
    const l = lineas[i];
    if (!reTotal.test(l) || /sub\s*-?\s*total|base\s+imp|iva|i\.v\.a|cambio|devol/i.test(l)) continue;
    let nums = l.match(reImporte);
    if (!nums && lineas[i + 1]) nums = lineas[i + 1].match(reImporte); // el importe a veces va en la línea siguiente
    if (nums) amount = _numeroTicket(nums[nums.length - 1]);
  }
  if (amount === null) {
    const todos = (texto.match(reImporte) || []).map(_numeroTicket).filter(n => n !== null && n < 100000);
    if (todos.length) amount = Math.max(...todos);
  }

  // 2. Fecha: dd/mm/aaaa, dd-mm-aa, dd.mm.aaaa o aaaa-mm-dd
  let date = new Date().toISOString().slice(0, 10);
  const mf = texto.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/) || null;
  const mi = texto.match(/\b(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/) || null;
  let d, m, y;
  if (mi) { [, y, m, d] = mi; } else if (mf) { [, d, m, y] = mf; if (y.length === 2) y = '20' + y; }
  if (y && +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // 3. Divisa
  let currency = getBase();
  if (/€|\bEUR\b|EUROS?\b/i.test(texto)) currency = 'EUR';
  else if (/£|\bGBP\b/i.test(texto)) currency = 'GBP';
  else if (/\bARS\b|PESOS?\b/i.test(texto)) currency = 'ARS';
  else if (/US\$|\bUSD\b|\$/i.test(texto)) currency = 'USD';

  // 4. Descripción: la primera línea con aspecto de nombre de comercio
  const ignorar = /(\bfactura\b|\bticket\b|simplificada|\bcif\b|\bnif\b|n\.i\.f|c\.i\.f|\btel[fé.:]?\b|\btel[eé]fono|www|http|@|\bfecha\b|\bhora\b|\bcalle\b|\bc\/|\bavda|direcci|n[ºo°]\s*\d)/i;
  const tieneImporte = l => new RegExp(reImporte.source).test(l);
  const nombre = lineas.slice(0, 8).find(l => /[a-záéíóúñ]{3,}/i.test(l) && !ignorar.test(l) && !tieneImporte(l) && l.length <= 40);
  const desc = nombre ? nombre.replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ&'.\- ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30) : 'Ticket';

  return { desc, amount: amount !== null ? +amount.toFixed(2) : null, date, currency };
}
