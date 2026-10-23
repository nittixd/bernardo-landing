'use strict';
/* Datos de la agenda en un JSON dentro de un almacén privado de Vercel Blob (BLOB_READ_WRITE_TOKEN).
   Mismo patrón que Invest Mining y los certificados de Adela: cada cambio lee con su etiqueta y escribe
   con ifMatch; si otro lo cambió en el medio, vuelve a intentar. Así dos reservas nunca se pisan.
   Sin BLOB_READ_WRITE_TOKEN (en la compu) usa un archivo local en .data/agenda.json. */
const fs = require('fs');
const path = require('path');

const RUTA = 'bernardo/agenda.json';
const VACIO = () => ({ google: null, reservas: [] });

class TurnoTomado extends Error {}
class Conflicto extends Error {}

function blob() {
  return process.env.BLOB_READ_WRITE_TOKEN ? require('@vercel/blob') : null;
}

const archivoLocal = path.join(__dirname, '..', '.data', 'agenda.json');

async function leerCrudo() {
  const b = blob();
  if (!b) {
    try { return { datos: JSON.parse(fs.readFileSync(archivoLocal, 'utf8')), etag: 'local' }; } catch (e) { return null; }
  }
  const r = await b.get(RUTA, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  const txt = await new Response(r.stream).text();
  // get() devuelve la etiqueta débil (W/"…"); put() con ifMatch espera la fuerte
  return { datos: JSON.parse(txt), etag: String(r.blob.etag).replace(/^W\//, '') };
}

async function escribir(d, cond) {
  const b = blob();
  if (!b) {
    fs.mkdirSync(path.dirname(archivoLocal), { recursive: true });
    fs.writeFileSync(archivoLocal, JSON.stringify(d, null, 2));
    return;
  }
  try {
    await b.put(RUTA, JSON.stringify(d), Object.assign({
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    }, cond.nuevo ? { allowOverwrite: false } : { ifMatch: cond.etag }));
  } catch (e) {
    if ((b.BlobPreconditionFailedError && e instanceof b.BlobPreconditionFailedError) || /exist|precondition/i.test(e.message)) throw new Conflicto(e.message);
    throw e;
  }
}

async function leer() {
  const r = await leerCrudo();
  if (r) return r;
  const nuevos = VACIO();
  try { await escribir(nuevos, { nuevo: true }); } catch (e) { if (!(e instanceof Conflicto)) throw e; }
  return (await leerCrudo()) || { datos: nuevos };
}

/* Lee, aplica el cambio y escribe solo si nadie lo tocó en el medio. */
async function cambiar(fn) {
  for (let intento = 0; intento < 8; intento++) {
    const { datos, etag } = await leer();
    const resultado = fn(datos); // puede tirar TurnoTomado
    try {
      await escribir(datos, { etag });
      return resultado;
    } catch (e) {
      if (!(e instanceof Conflicto)) throw e;
      await new Promise((r) => setTimeout(r, 80 + Math.random() * 220));
    }
  }
  throw new Error('No se pudo guardar: demasiados cambios al mismo tiempo');
}

const seSuperponen = (a, b) => a.inicio < b.fin && b.inicio < a.fin;

module.exports = {
  TurnoTomado,
  seSuperponen,
  async datos() { return (await leer()).datos; },
  async guardarGoogle(google) { await cambiar((d) => { d.google = google; }); },
  async guardarDrive(cambios) { return cambiar((d) => { d.drive = Object.assign({}, d.drive || {}, cambios); return d.drive; }); },
  /* Suma un mail a la lista de recursos; devuelve false si ya estaba. */
  async agregarSuscripto(email) {
    return cambiar((d) => {
      d.suscriptos = d.suscriptos || [];
      if (d.suscriptos.some((s) => s.email === email)) return false;
      d.suscriptos.push({ email, fecha: new Date().toISOString() });
      return true;
    });
  },
  /* Agrega la reserva si el horario sigue libre y el pago no se usó. Devuelve la existente si ya estaba. */
  async crearReserva(r) {
    return cambiar((d) => {
      const previa = d.reservas.find((x) => x.pagoId === r.pagoId && x.estado === 'confirmada');
      if (previa) return { previa };
      if (d.reservas.some((x) => x.estado === 'confirmada' && seSuperponen(x, r))) throw new TurnoTomado();
      d.reservas.push(r);
      return { nueva: r };
    });
  },
  async actualizarReserva(id, cambios) {
    return cambiar((d) => {
      const r = d.reservas.find((x) => x.id === id);
      if (r) Object.assign(r, cambios);
      return r;
    });
  },
  async quitarReserva(id) {
    await cambiar((d) => { d.reservas = d.reservas.filter((x) => x.id !== id); });
  },
};
