'use strict';
/* Suscripción a los recursos del podcast: guarda el email en la planilla de Bernardo (Apps Script). */
const { avisar } = require('./_mp');

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
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Revisá el email.' });

  if (!process.env.AVISOS_URL) {
    return res.status(503).json({ error: 'La suscripción todavía no está habilitada. Probá de nuevo en unos días.' });
  }
  const ok = await avisar({ tipo: 'recursos', email, origen: String(req.headers.referer || '').slice(0, 200) });
  if (!ok) return res.status(502).json({ error: 'No pudimos registrar tu email. Probá de nuevo en un rato.' });
  return res.status(200).json({ ok: true });
};
