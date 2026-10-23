'use strict';
/* POST /api/reservar { pago_id, inicio } → reserva el turno de una consulta YA PAGA.
   Comprueba el pago contra Mercado Pago, que el turno exista en el horario y que siga libre en Google,
   crea el evento con Meet en el calendario de Bernardo e invita al cliente. Un pago = un turno. */
const almacen = require('./_almacen');
const google = require('./_google');
const { descifrar, nuevoId } = require('./_seguridad');
const turnos = require('./_turnos');
const { leerPago, avisar } = require('./_mp');

const parte = (opts) => (d) => new Intl.DateTimeFormat('es-AR', Object.assign({ timeZone: 'America/Argentina/Buenos_Aires' }, opts)).format(d);
const fechaLarga = (d) => parte({ weekday: 'long' })(d) + ' ' + parte({ day: 'numeric' })(d) + ' de ' + parte({ month: 'long' })(d) +
  ' a las ' + parte({ hour: '2-digit', minute: '2-digit', hour12: false })(d);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    // la página de gracias pregunta si ese pago ya tiene turno (por si vuelve a entrar)
    const id = new URL(req.url, 'http://x').searchParams.get('pago_id') || '';
    if (!/^\d{5,20}$/.test(id)) return res.status(200).json({ reserva: null });
    try {
      const d = await almacen.datos();
      const r = d.reservas.find((x) => x.pagoId === id && x.estado === 'confirmada');
      return res.status(200).json({ reserva: r ? publica(r) : null });
    } catch (e) {
      return res.status(200).json({ reserva: null });
    }
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Método no permitido' }); }
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const pagoId = String(b.pago_id || '').trim();
  if (!/^\d{5,20}$/.test(pagoId)) return res.status(400).json({ error: 'Falta el número de pago.' });

  try {
    const d = await almacen.datos();
    const yaReservada = d.reservas.find((x) => x.pagoId === pagoId && x.estado === 'confirmada');
    if (yaReservada) return res.status(200).json({ ok: true, reserva: publica(yaReservada) });

    if (!d.google || !d.google.refreshToken || !google.credenciales()) {
      return res.status(503).json({ error: 'La agenda todavía no está conectada. Te escribimos para coordinar el horario.' });
    }

    const pago = await leerPago(pagoId);
    if (pago.status !== 'approved' || !String(pago.external_reference || '').startsWith('bv-')) {
      return res.status(402).json({ error: 'No encontramos un pago aprobado con ese número.' });
    }

    const ahora = new Date();
    const turno = turnos.turnoValido(ahora, b.inicio);
    if (!turno) return res.status(400).json({ error: 'Ese horario ya no está disponible. Elegí otro.' });

    const token = await google.tokenDesdeRefresh(descifrar(d.google.refreshToken));
    const calendarId = d.google.calendarId || 'primary';
    const ocupados = await google.horariosOcupados(token, calendarId, turno.inicio, turno.fin, turnos.IGNORAR_TITULOS);
    if (ocupados.some((o) => turno.inicio < o.fin && o.inicio < turno.fin)) {
      return res.status(409).json({ error: 'Ese horario se acaba de ocupar. Elegí otro.' });
    }

    const m = pago.metadata || {};
    const reserva = {
      id: nuevoId(),
      pagoId,
      estado: 'confirmada',
      inicio: turno.inicio.toISOString(),
      fin: turno.fin.toISOString(),
      nombre: m.nombre || [pago.payer && pago.payer.first_name, pago.payer && pago.payer.last_name].filter(Boolean).join(' '),
      email: m.email || (pago.payer && pago.payer.email) || '',
      whatsapp: m.whatsapp || '',
      creada: ahora.toISOString(),
    };
    let r;
    try {
      r = await almacen.crearReserva(reserva);
    } catch (e) {
      if (e instanceof almacen.TurnoTomado) return res.status(409).json({ error: 'Ese horario se acaba de ocupar. Elegí otro.' });
      throw e;
    }
    if (r.previa) return res.status(200).json({ ok: true, reserva: publica(r.previa) });

    let ev;
    try {
      ev = await google.crearEvento(token, calendarId, {
        titulo: 'Consulta patrimonial · ' + reserva.nombre,
        descripcion: [
          'Consulta reservada y paga desde bernardovasquez.com.ar.',
          '',
          'Nombre: ' + reserva.nombre,
          'Email: ' + reserva.email,
          'WhatsApp: ' + reserva.whatsapp,
          '',
          'A qué se dedica: ' + (m.dedicacion || ''),
          'Sobre qué quiere conversar: ' + (m.tema || ''),
          'Decisiones sobre el patrimonio: ' + (m.decisiones || ''),
          '',
          'Pago de Mercado Pago N.º ' + pagoId,
        ].join('\n'),
        inicio: turno.inicio,
        fin: turno.fin,
        invitado: reserva.email ? { email: reserva.email, nombre: reserva.nombre } : null,
        reservaId: reserva.id,
      });
    } catch (e) {
      await almacen.quitarReserva(reserva.id); // si Google falla, el horario vuelve a quedar libre
      throw e;
    }
    const final = await almacen.actualizarReserva(reserva.id, { eventoId: ev.id, meetUrl: ev.meetUrl });

    await avisar({
      tipo: 'turno', pago_id: pagoId, nombre: reserva.nombre, email: reserva.email, whatsapp: reserva.whatsapp,
      turno: fechaLarga(turno.inicio), meet: ev.meetUrl,
    });
    return res.status(200).json({ ok: true, reserva: publica(final || reserva) });
  } catch (e) {
    console.error('reservar', e && e.message);
    return res.status(502).json({ error: 'No pudimos reservar el turno. Probá de nuevo en un momento.' });
  }
};

function publica(r) {
  return { inicio: r.inicio, fin: r.fin, meetUrl: r.meetUrl || '', email: r.email };
}
