/* Lógica compartida de las funciones de /api (el guion bajo hace que Vercel no la publique como ruta).
   Variables de entorno (en Vercel, nunca en el repo):
     MP_ACCESS_TOKEN        token de producción de Mercado Pago de Bernardo (obligatoria)
     PRECIO_USD             valor de la consulta en dólares (200 por defecto)
     COTIZACION_CASA        cotización de dolarapi.com: oficial (defecto), bolsa (MEP) o blue
     PRECIO_ARS_RESPALDO    monto fijo en pesos si dolarapi no responde
     PUBLIC_ORIGIN          dominio para volver de Mercado Pago (por defecto, el host del pedido) */
'use strict';

const crypto = require('crypto');

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
  const dig = d.whatsapp.replace(/\D/g, '');
  if (dig.length < 8 || dig.length > 15) return { error: 'Revisá el WhatsApp.', campo: 'whatsapp' };
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

module.exports = { precio, validar, origen, crearPreferencia };
