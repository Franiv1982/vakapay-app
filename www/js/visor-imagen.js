// public/js/visor-imagen.js — Visor de imágenes con zoom (comprobantes y fotos del chat)
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ ZOOM EN LOS VISORES DE IMAGEN (comprobantes y fotos del chat) ═══
// Pellizcar con dos dedos amplía (hasta 5x), arrastrar con un dedo mueve la imagen
// ampliada y un doble toque alterna entre 2,5x y el tamaño normal. En ordenador,
// la rueda del ratón también amplía.
function activarZoom(img) {
  if (!img || img.__zoom) return;
  const z = img.__zoom = { escala: 1, x: 0, y: 0, punteros: new Map(), inicio: null, ultimoToque: 0, movido: false };
  img.style.touchAction = 'none';
  img.style.transformOrigin = 'center center';
  img.style.transition = 'transform .15s';
  img.draggable = false;
  const aplicar = () => { img.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.escala})`; };
  const limitar = () => {
    z.escala = Math.min(5, Math.max(1, z.escala));
    if (z.escala === 1) { z.x = 0; z.y = 0; return; }
    const mx = img.offsetWidth * (z.escala - 1) / 2, my = img.offsetHeight * (z.escala - 1) / 2;
    z.x = Math.min(mx, Math.max(-mx, z.x));
    z.y = Math.min(my, Math.max(-my, z.y));
  };
  const reanclar = () => {
    const ps = [...z.punteros.values()];
    if (ps.length >= 2) {
      const [a, b] = ps;
      z.inicio = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, escala: z.escala, x: z.x, y: z.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    } else if (ps.length === 1) {
      z.inicio = { px: ps[0].x, py: ps[0].y, x: z.x, y: z.y };
    } else z.inicio = null;
  };
  img.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { img.setPointerCapture(e.pointerId); } catch (_) {}
    z.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (z.punteros.size === 1) z.movido = false;
    img.style.transition = 'none';
    reanclar();
  });
  img.addEventListener('pointermove', e => {
    if (!z.punteros.has(e.pointerId) || !z.inicio) return;
    z.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...z.punteros.values()];
    if (ps.length >= 2 && z.inicio.d) {
      const [a, b] = ps;
      z.escala = z.inicio.escala * Math.hypot(a.x - b.x, a.y - b.y) / z.inicio.d;
      z.x = z.inicio.x + ((a.x + b.x) / 2 - z.inicio.cx);
      z.y = z.inicio.y + ((a.y + b.y) / 2 - z.inicio.cy);
      z.movido = true;
    } else if (ps.length === 1 && z.escala > 1 && z.inicio.px !== undefined) {
      z.x = z.inicio.x + (e.clientX - z.inicio.px);
      z.y = z.inicio.y + (e.clientY - z.inicio.py);
      if (Math.abs(e.clientX - z.inicio.px) + Math.abs(e.clientY - z.inicio.py) > 6) z.movido = true;
    } else return;
    limitar(); aplicar();
  });
  const soltar = e => {
    const eraToque = z.punteros.size === 1 && !z.movido;
    z.punteros.delete(e.pointerId);
    img.style.transition = 'transform .15s';
    reanclar();
    if (e.type !== 'pointerup' || !eraToque) return;
    const ahora = Date.now();
    if (ahora - z.ultimoToque < 320) {          // doble toque: amplía donde se toca
      if (z.escala > 1) { z.escala = 1; z.x = 0; z.y = 0; }
      else {
        const r = img.getBoundingClientRect();
        z.escala = 2.5;
        z.x = (r.left + r.width / 2 - e.clientX) * (z.escala - 1);
        z.y = (r.top + r.height / 2 - e.clientY) * (z.escala - 1);
        limitar();
      }
      aplicar(); z.ultimoToque = 0;
    } else z.ultimoToque = ahora;
  };
  img.addEventListener('pointerup', soltar);
  img.addEventListener('pointercancel', soltar);
  img.addEventListener('wheel', e => {
    e.preventDefault();
    z.escala *= e.deltaY < 0 ? 1.15 : 1 / 1.15;
    limitar(); aplicar();
  }, { passive: false });
}
function reiniciarZoom(img) {
  activarZoom(img);
  const z = img.__zoom;
  z.escala = 1; z.x = 0; z.y = 0; z.punteros.clear(); z.inicio = null;
  img.style.transform = '';
}
document.addEventListener('DOMContentLoaded', () => {
  activarZoom(document.getElementById('visorTicketImg'));
  activarZoom(document.getElementById('chatVisorImg'));
});

function cerrarVisorTicket() {
  document.getElementById('visorTicketModal').style.display = 'none';
}

async function downloadTicket(idx) {
  const g = groups[currentGroupIdx];
  const e = g.expenses[idx];
  const t = await cargarTicket(idx);
  if (!t) { toast('No se pudo cargar el comprobante', 'e'); return; }
  const nombre = `comprobante_${String(e.desc || 'gasto').replace(/[^\w\-]+/g, '_')}_${String(e.date || '').slice(0, 10)}.jpg`;
  return guardarImagenDataUrl(t, nombre, 'Guardar o compartir comprobante');
}

// Guarda una imagen (data:image/...) en el móvil o la descarga en el navegador
async function guardarImagenDataUrl(t, nombre, titulo) {
  // En la APK un <a download> no hace nada: se guarda en el móvil y se abre el menú
  // para compartir, desde donde se puede guardar en Archivos, Drive, WhatsApp...
  const isNative = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  if (isNative && Capacitor.Plugins && Capacitor.Plugins.Filesystem && Capacitor.Plugins.Share) {
    try {
      const { Filesystem, Share } = Capacitor.Plugins;
      await Filesystem.writeFile({ path: nombre, data: t.split(',')[1], directory: 'CACHE', recursive: true });
      const { uri } = await Filesystem.getUri({ directory: 'CACHE', path: nombre });
      await Share.share({ title: nombre, url: uri, dialogTitle: titulo });
      return;
    } catch (err) {
      if (/cancel/i.test(err?.message || '')) return; // el usuario cerró el menú
      console.warn('No se pudo compartir la imagen:', err);
      toast('No se pudo descargar la imagen', 'e');
      return;
    }
  }
  const a = document.createElement('a');
  a.href = t;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Guarda el comprobante en el servidor directamente desde la ficha (sin pasar por Editar)
async function guardarTicketServidor(idx, ticket) {
  const g = groups[currentGroupIdx];
  const e = g.expenses[idx];
  const expId = e.id || e._id;
  if (!expId) throw new Error('El gasto aún no está sincronizado');
  const res = await fetch(`${API_BASE}/api/v1/groups/${g.id}/expenses/${expId}/ticket`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
    body: JSON.stringify({ ticket })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar el comprobante');
  e.ticket = ticket;
  e.has_ticket = !!ticket;
  save();
}

async function attachGastoTicket(ev, idx) {
  const file = ev.target.files[0];
  if (!file) return;
  toast('Guardando comprobante...', 'i');
  try {
    const ticket = 'data:image/jpeg;base64,' + await fileToBase64(file);
    await guardarTicketServidor(idx, ticket);
    openGasto(idx); // refrescar la pantalla
    toast('Comprobante guardado', 's');
    if (typeof refrescarActividad === 'function') refrescarActividad();
  } catch (err) {
    toast(textoError(err, 'No se pudo guardar el comprobante'), 'e');
  }
}

// Pide confirmación con el modal de la app (no el del sistema)
let comprobanteAQuitarIdx = null;
function removeGastoTicket(idx) {
  comprobanteAQuitarIdx = idx;
  const e = groups[currentGroupIdx]?.expenses[idx];
  document.getElementById('quitar-comp-desc').textContent = e ? e.desc : '';
  const img = document.getElementById('quitar-comp-img');
  img.src = (e && e.ticket) || '';
  img.style.display = (e && e.ticket) ? 'block' : 'none';
  document.getElementById('modal-quitar-comprobante').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function cerrarModalQuitarComprobante() {
  document.getElementById('modal-quitar-comprobante').style.display = 'none';
  document.body.style.overflow = '';
  comprobanteAQuitarIdx = null;
}
async function confirmarQuitarComprobante() {
  const idx = comprobanteAQuitarIdx;
  cerrarModalQuitarComprobante();
  if (idx === null) return;
  try {
    await guardarTicketServidor(idx, null);
    openGasto(idx);
    toast('Comprobante eliminado', 's');
    if (typeof refrescarActividad === 'function') refrescarActividad();
  } catch (err) {
    toast(textoError(err, 'No se pudo eliminar el comprobante'), 'e');
  }
}

function toggleEditOcrPopover() {
  const popover = document.getElementById('editOcrPopover');
  const hasFile = document.getElementById('editOcrFile').files?.length > 0;
  if (!hasFile) {
    document.getElementById('editOcrFile').click();
    return;
  }
  const isOpen = popover.style.display !== 'none';
  popover.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(() => document.addEventListener('click', closeEditOcrOnOutside), 10);
  }
}

function closeEditOcrOnOutside(e) {
  const popover = document.getElementById('editOcrPopover');
  const btn = document.getElementById('editOcrBtn');
  if (!popover.contains(e.target) && !btn.contains(e.target)) {
    popover.style.display = 'none';
    document.removeEventListener('click', closeEditOcrOnOutside);
  }
}

function handleEditOCRFile(ev) {
  const file = ev.target.files[0];
  if (file) processEditOCRFile(file);
}

async function processEditOCRFile(file) {
  // Al editar un gasto, el ticket se guarda como comprobante y solo se toma
  // de él el importe total; la descripción y la fecha no se cambian.
  const loading = document.getElementById('editOcrLoading');
  const success = document.getElementById('editOcrSuccess');
  if (loading) loading.style.display = 'none';
  if (success) success.style.display = 'none';

  const b64 = await fileToBase64(file); // imagen reducida
  const ticket = 'data:image/jpeg;base64,' + b64;
  window._editTicketNuevo = ticket;
  window._editTicketDeleted = false;

  const preview = document.getElementById('editOcrPreview');
  if (preview) { preview.src = ticket; preview.style.display = 'block'; }
  document.getElementById('editOcrFileName').textContent = 'Comprobante nuevo';
  document.getElementById('editOcrDot').style.display = 'block';
  document.getElementById('editOcrClearBtn').style.display = 'block';
  document.getElementById('editOcrBtn').classList.add('has-file');

  // Del ticket solo se toma el importe total (descripción y fecha no se tocan)
  if (loading) loading.style.display = 'block';
  try {
    const data = await escanearTicket(b64, 'image/jpeg');
    const text = data.content?.map(c => c.text || '').join('') || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, ''));
    if (parsed.amount) {
      document.getElementById('editAmount').value = parsed.amount;
      toast(`Importe del ticket: ${parsed.amount} — revisa y guarda`, 's');
    }
  } catch (_) {
    toast('No se pudo leer el importe; el comprobante se guardará igualmente', 'i');
  }
  if (loading) loading.style.display = 'none';
  if (success) { success.innerHTML = icono('ok',12) + ' Se guarda al pulsar Guardar'; success.style.display = 'block'; }
}

function clearEditOCR() {
  document.getElementById('editOcrFile').value = '';
  document.getElementById('editOcrPreview').src = '';
  document.getElementById('editOcrPreview').style.display = 'none';
  document.getElementById('editOcrFileName').textContent = 'Sin comprobante';
  document.getElementById('editOcrLoading').style.display = 'none';
  document.getElementById('editOcrSuccess').style.display = 'none';
  document.getElementById('editOcrDot').style.display = 'none';
  document.getElementById('editOcrClearBtn').style.display = 'none';
  document.getElementById('editOcrBtn').classList.remove('has-file');
  window._editTicketDeleted = true;
  window._editTicketNuevo = null;
}

// Convierte la foto en JPEG de como máximo 1600 px (base64 sin cabecera).
// Las fotos del móvil pueden pesar varios MB y Vercel no admite peticiones de más de 4,5 MB.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = () => resolve(e.target.result.split(',')[1]);
      img.onload = () => {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
