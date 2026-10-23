'use strict';
/* Recursos del podcast: quien deja su mail recibe acceso de lectura a la carpeta de Drive
   (Google le manda el aviso) y la página le muestra el link. El mail queda en la lista. */
const almacen = require('./_almacen');
const drive = require('./_drive');
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
  if (b.sitio) return res.status(200).json({ ok: true }); // campo trampa para robots
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Revisá el email.' });

  try {
    let url = null;
    try {
      url = await drive.darAcceso(email);
    } catch (e) {
      console.error('recursos drive', e && e.message, e && e.razon);
      if (e.estado === 400 || e.estado === 403) {
        return res.status(400).json({ error: 'No pudimos darte acceso con ese mail. Probá con tu cuenta de Gmail.' });
      }
      throw e;
    }
    if (!url && !process.env.AVISOS_URL) {
      return res.status(503).json({ error: 'La suscripción todavía no está habilitada. Probá de nuevo en unos días.' });
    }
    await almacen.agregarSuscripto(email);
    if (process.env.AVISOS_URL) await avisar({ tipo: 'recursos', email, origen: String(req.headers.referer || '').slice(0, 200) });
    return res.status(200).json({ ok: true, url });
  } catch (e) {
    console.error('recursos', e && e.message);
    return res.status(502).json({ error: 'No pudimos registrar tu email. Probá de nuevo en un rato.' });
  }
};
