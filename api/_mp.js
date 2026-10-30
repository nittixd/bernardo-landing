/* Lógica compartida de las funciones de /api (el guion bajo hace que Vercel no la publique como ruta).
   Variables de entorno (en Vercel, nunca en el repo):
     MP_ACCESS_TOKEN        token de producción de Mercado Pago de Bernardo (obligatoria)
     PRECIO_USD             valor de la consulta en dólares (200 por defecto)
     COTIZACION_CASA        cotización de dolarapi.com: oficial (defecto), bolsa (MEP) o blue
     PRECIO_ARS_RESPALDO    monto fijo en pesos si dolarapi no responde
     PUBLIC_ORIGIN          dominio para volver de Mercado Pago (por defecto, el host del pedido)
     AVISOS_URL             URL del Apps Script de Bernardo (docs/apps-script.gs): guarda en su planilla y le manda el mail
     AVISOS_CLAVE           la misma clave que figura en el Apps Script */
'use strict';

const crypto = require('crypto');
// el mismo módulo que usa el formulario (js/telefono.js): cualquier código de país
const Telefono = require('../js/telefono');

async function precio() {
  const usd = Number(process.env.PRECIO_USD || 200);
  const casa = process.env.COTIZACION_CASA || 'oficial';
  try {
    const r = await fetch('https://dolarapi.com/v1/dolares/' + encodeURIComponent(casa), { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error('dolarapi ' + r.status);
    const j = await r.json();
    const venta = Number(j.venta);
    if (!(venta > 0)) throw new Error('cotización inválida');
    // redondeo hacia arriba a los mil pesos
    return { usd, casa, venta, ars: Math.ceil((usd * venta) / 1000) * 1000, fecha: j.fechaActualizacion || null };
  } catch (e) {
    const fijo = Number(process.env.PRECIO_ARS_RESPALDO || 0);
    if (fijo > 0) return { usd, casa: 'respaldo', venta: null, ars: fijo, fecha: null };
    throw e;
  }
}

function limpiar(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validar(b) {
  const d = {
    dedicacion: limpiar(b.dedicacion, 140),
    tema: limpiar(b.tema, 600),
    decisiones: limpiar(b.decisiones, 80),
    nombre: limpiar(b.nombre, 100),
    email: limpiar(b.email, 120).toLowerCase(),
    whatsapp: limpiar(b.whatsapp, 30),
  };
  const opciones = ['Las tomo yo', 'Las comparto con mi pareja, familiares o socios', 'Estoy consultando para otra persona'];
  if (d.dedicacion.length < 2) return { error: 'Falta a qué te dedicás.', campo: 'dedicacion' };
  if (d.tema.length < 3) return { error: 'Falta sobre qué querés conversar.', campo: 'tema' };
  if (!opciones.includes(d.decisiones)) return { error: 'Falta cómo se toman las decisiones.', campo: 'decisiones' };
  if (d.nombre.length < 3) return { error: 'Falta tu nombre y apellido.', campo: 'nombre' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return { error: 'Revisá el email.', campo: 'email' };
  // sin país (formulario viejo en caché o sin JS) se toma Argentina; con + adelante, el número manda
  const pais = limpiar(b.pais, 2).toUpperCase() || 'AR';
  const tel = Telefono.normalizar(pais, d.whatsapp);
  if (!tel.ok) return { error: tel.error, campo: 'whatsapp' };
  d.whatsapp = tel.e164;
  return { datos: d };
}

function origen(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (!host || /^(localhost|127\.0\.0\.1)(:|$)/.test(host)) return 'https://bernardovasquez.com.ar';
  return 'https://' + host;
}

async function crearPreferencia(d, p, base) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('Falta MP_ACCESS_TOKEN');
  const ref = 'bv-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  const partes = d.nombre.split(' ');
  const body = {
    items: [{
      id: 'consulta-1h',
      title: 'Consulta patrimonial · 1 hora',
      description: 'Consulta con Bernardo Vásquez (USD ' + p.usd + ')',
      category_id: 'services',
      quantity: 1,
      currency_id: 'ARS',
      unit_price: p.ars,
    }],
    payer: { name: partes[0], surname: partes.slice(1).join(' ') || undefined, email: d.email },
    external_reference: ref,
    metadata: {
      dedicacion: d.dedicacion,
      tema: d.tema,
      decisiones: d.decisiones,
      nombre: d.nombre,
      email: d.email,
      whatsapp: d.whatsapp,
      precio_usd: p.usd,
      cotizacion: p.casa,
      cotizacion_venta: p.venta,
    },
    back_urls: {
      success: base + '/gracias',
      pending: base + '/gracias',
      failure: base + '/gracias',
    },
    // Mercado Pago avisa acá cada pago; si está aprobado, le llega a Bernardo con las respuestas
    notification_url: base + '/api/mp-aviso?source_news=webhooks',
    auto_return: 'approved',
    // sin efectivo (Rapipago, Pago Fácil): quedan pendientes días y traban la reserva
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
    statement_descriptor: 'BERNARDO VASQUEZ',
  };
  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': ref,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.init_point) {
    const err = new Error('Mercado Pago ' + r.status + ': ' + (j.message || j.error || 'sin detalle'));
    err.status = r.status;
    throw err;
  }
  return { ref, url: j.init_point, id: j.id };
}

/* Manda una fila al Apps Script de Bernardo. Devuelve false si no está configurado o falla. */
async function avisar(datos) {
  const url = process.env.AVISOS_URL;
  if (!url) return false;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script lee el cuerpo crudo
      body: JSON.stringify(Object.assign({ clave: process.env.AVISOS_CLAVE || '' }, datos)),
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.ok === true;
  } catch (e) {
    console.error('avisar', e && e.message);
    return false;
  }
}

async function leerPago(id) {
  const r = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(id), {
    headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('pago ' + id + ': ' + r.status);
  return r.json();
}

module.exports = { precio, validar, origen, crearPreferencia, avisar, leerPago };
