/**
 * Planilla de la web de Bernardo Vásquez.
 * Recibe dos cosas desde bernardovasquez.com.ar:
 *   - "consulta": cada consulta PAGADA, con las tres respuestas y los datos de contacto (y te manda un mail).
 *   - "recursos": cada email que se anota para recibir los recursos del podcast.
 *
 * Instalación (una sola vez, desde la cuenta de Google de Bernardo):
 *   1. Crear una planilla nueva en Google Sheets. Menú Extensiones › Apps Script.
 *   2. Borrar lo que haya y pegar este archivo entero. Cambiar CLAVE por una palabra larga cualquiera.
 *   3. Implementar › Nueva implementación › Tipo: Aplicación web.
 *      Ejecutar como: Yo. Quién tiene acceso: Cualquier usuario. Implementar y aceptar los permisos.
 *   4. Copiar la URL de la aplicación web (termina en /exec) y pasarla junto con la CLAVE.
 */
const CLAVE = 'CAMBIAR-ESTA-CLAVE';

function doPost(e) {
  let d = {};
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return salida({ ok: false }); }
  if (d.clave !== CLAVE) return salida({ ok: false });

  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (d.tipo === 'recursos') {
      const h = hoja(libro, 'Recursos', ['Fecha', 'Email', 'Desde']);
      if (!yaEsta(h, 2, d.email)) h.appendRow([new Date(), d.email, d.origen || '']);
      return salida({ ok: true });
    }
    if (d.tipo === 'consulta') {
      const h = hoja(libro, 'Consultas', ['Fecha de pago', 'Nombre', 'Email', 'WhatsApp', 'A qué se dedica',
        'Sobre qué quiere conversar', 'Decisiones', 'Monto', 'N.º de pago', 'Coordinada']);
      if (yaEsta(h, 9, d.pago_id)) return salida({ ok: true }); // Mercado Pago a veces avisa dos veces
      h.appendRow([new Date(d.fecha || Date.now()), d.nombre, d.email, d.whatsapp, d.dedicacion, d.tema,
        d.decisiones, (d.moneda || '') + ' ' + (d.monto || ''), d.pago_id, '']);
      MailApp.sendEmail({
        to: Session.getEffectiveUser().getEmail(),
        subject: 'Nueva consulta paga: ' + d.nombre,
        body: [
          'Entró una consulta paga desde la web.',
          '',
          'Nombre: ' + d.nombre,
          'Email: ' + d.email,
          'WhatsApp: ' + d.whatsapp,
          '',
          'A qué se dedica: ' + d.dedicacion,
          'Sobre qué quiere conversar: ' + d.tema,
          'Decisiones sobre el patrimonio: ' + d.decisiones,
          '',
          'Pago de Mercado Pago N.º ' + d.pago_id + ' por ' + (d.moneda || '') + ' ' + (d.monto || '') + '.',
          'Falta coordinar día y horario.',
        ].join('\n'),
      });
      return salida({ ok: true });
    }
    return salida({ ok: false });
  } finally {
    lock.releaseLock();
  }
}

function hoja(libro, nombre, encabezados) {
  let h = libro.getSheetByName(nombre);
  if (!h) {
    h = libro.insertSheet(nombre);
    h.appendRow(encabezados);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, encabezados.length).setFontWeight('bold');
  }
  return h;
}

function yaEsta(h, columna, valor) {
  if (!valor || h.getLastRow() < 2) return false;
  const vals = h.getRange(2, columna, h.getLastRow() - 1, 1).getValues();
  return vals.some(function (f) { return String(f[0]).toLowerCase() === String(valor).toLowerCase(); });
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
