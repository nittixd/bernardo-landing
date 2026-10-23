'use strict';
/* Horario de atención de Bernardo y cálculo de turnos libres.
   Argentina no tiene horario de verano: siempre UTC-3. */

// Lo que pasó Bernardo el 23/10/2026. Día: 0 domingo … 6 sábado.
const HORARIO = {
  2: [['12:00', '14:00'], ['15:00', '17:00']], // martes
  3: [['12:00', '14:00'], ['15:00', '17:00']], // miércoles
  4: [['12:00', '14:00'], ['15:00', '17:00']], // jueves
  5: [['12:00', '16:00']],                     // viernes
};
const DURACION_MIN = 60;
const AVISO_MINIMO_H = 12;   // no se ofrecen turnos que empiecen antes de 12 horas
const DIAS_ADELANTE = 21;
const OFFSET_H = 3;          // UTC-3

const min = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/* Fecha local (AAAA-MM-DD) y día de la semana de un instante, en hora de Argentina. */
function local(d) {
  const x = new Date(d.getTime() - OFFSET_H * 3600e3);
  return { fecha: x.toISOString().slice(0, 10), dia: x.getUTCDay() };
}

/* Instante UTC para una fecha local y minutos desde la medianoche local. */
function instante(fecha, minutos) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minutos) + OFFSET_H * 3600e3);
}

/* Todos los turnos del horario entre ahora (+ aviso mínimo) y los próximos días. */
function turnosDelHorario(ahora) {
  const desde = new Date(ahora.getTime() + AVISO_MINIMO_H * 3600e3);
  const salida = [];
  const hoy = local(ahora).fecha;
  for (let i = 0; i <= DIAS_ADELANTE; i++) {
    const fecha = new Date(instante(hoy, 12 * 60).getTime() + i * 86400e3);
    const { fecha: f, dia } = local(fecha);
    for (const [a, b] of HORARIO[dia] || []) {
      for (let t = min(a); t + DURACION_MIN <= min(b); t += DURACION_MIN) {
        const inicio = instante(f, t);
        if (inicio < desde) continue;
        salida.push({ inicio, fin: new Date(inicio.getTime() + DURACION_MIN * 60e3), fecha: f });
      }
    }
  }
  return salida;
}

function rango(ahora) {
  const t = turnosDelHorario(ahora);
  return t.length ? { desde: t[0].inicio, hasta: t[t.length - 1].fin } : null;
}

/* Turnos que no se pisan con lo ocupado en Google ni con reservas ya tomadas. */
function libres(ahora, ocupados, reservas) {
  const tomados = ocupados.concat((reservas || []).filter((r) => r.estado === 'confirmada').map((r) => ({ inicio: new Date(r.inicio), fin: new Date(r.fin) })));
  return turnosDelHorario(ahora).filter((t) => !tomados.some((o) => t.inicio < o.fin && o.inicio < t.fin));
}

/* ¿Ese inicio corresponde a un turno válido del horario (sin mirar Google)? */
function turnoValido(ahora, inicioIso) {
  const t = turnosDelHorario(ahora).find((x) => x.inicio.toISOString() === new Date(inicioIso).toISOString());
  return t || null;
}

module.exports = { HORARIO, DURACION_MIN, turnosDelHorario, rango, libres, turnoValido, local };
