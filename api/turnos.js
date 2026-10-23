'use strict';
/* GET /api/turnos → turnos libres de Bernardo, agrupados por día.
   Sin Google conectado no ofrece nada: mejor eso que un turno que no le llegue. */
const almacen = require('./_almacen');
const google = require('./_google');
const { descifrar } = require('./_seguridad');
const turnos = require('./_turnos');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const d = await almacen.datos();
    if (!d.google || !d.google.refreshToken || !google.credenciales()) {
      return res.status(200).json({ disponible: false, motivo: 'sin-calendario', dias: [] });
    }
    const ahora = new Date();
    const r = turnos.rango(ahora);
    if (!r) return res.status(200).json({ disponible: true, dias: [] });
    const token = await google.tokenDesdeRefresh(descifrar(d.google.refreshToken));
    const ocupados = await google.horariosOcupados(token, d.google.calendarId || 'primary', r.desde, r.hasta);
    const lista = turnos.libres(ahora, ocupados, d.reservas);
    const dias = [];
    for (const t of lista) {
      let dia = dias.find((x) => x.fecha === t.fecha);
      if (!dia) { dia = { fecha: t.fecha, turnos: [] }; dias.push(dia); }
      dia.turnos.push(t.inicio.toISOString());
    }
    return res.status(200).json({ disponible: true, duracionMin: turnos.DURACION_MIN, dias });
  } catch (e) {
    console.error('turnos', e && e.message);
    return res.status(200).json({ disponible: false, motivo: 'error', dias: [] });
  }
};
