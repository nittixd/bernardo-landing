'use strict';
/* GET /api/agenda  (header "x-clave: <ADMIN_PASSWORD>") → estado de la conexión y turnos reservados.
   Es la vista de José: con qué cuenta quedó conectado Bernardo y qué consultas hay por delante. */
const almacen = require('./_almacen');
const { mismoTexto } = require('./_seguridad');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const clave = String(req.headers['x-clave'] || '');
  if (!process.env.ADMIN_PASSWORD || !clave || !mismoTexto(clave, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const d = await almacen.datos();
  const ahora = new Date().toISOString();
  return res.status(200).json({
    google: d.google ? { conectado: true, email: d.google.email, desde: d.google.conectadoEn } : { conectado: false },
    proximas: d.reservas.filter((r) => r.estado === 'confirmada' && r.fin > ahora)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map((r) => ({ inicio: r.inicio, nombre: r.nombre, email: r.email, whatsapp: r.whatsapp, meet: r.meetUrl || '', pago: r.pagoId })),
  });
};
