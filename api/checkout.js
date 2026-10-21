'use strict';
/* Recibe las tres respuestas y los datos, crea el pago de Checkout Pro y devuelve el link.
   Acepta JSON (el formulario con JS) o un POST común (sin JS: redirige directo a Mercado Pago). */
const { precio, validar, origen, crearPreferencia } = require('./_mp');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  let b = req.body || {};
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch (e) { b = Object.fromEntries(new URLSearchParams(b)); }
  }
  const quiereJson = /json/.test(String(req.headers['content-type'] || '')) || /json/.test(String(req.headers.accept || ''));

  const v = validar(b);
  if (v.error) {
    if (!quiereJson) { res.setHeader('Location', '/#reservar'); return res.status(303).end(); }
    return res.status(400).json({ error: v.error, campo: v.campo });
  }

  try {
    const p = await precio();
    const pref = await crearPreferencia(v.datos, p, origen(req));
    console.log('checkout ok', pref.ref, p.ars, p.casa);
    if (!quiereJson) { res.setHeader('Location', pref.url); return res.status(303).end(); }
    return res.status(200).json({ url: pref.url, ref: pref.ref });
  } catch (e) {
    console.error('checkout error', e && e.message);
    return res.status(502).json({ error: 'No pudimos iniciar el pago.' });
  }
};
