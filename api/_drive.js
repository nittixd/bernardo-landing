'use strict';
/* Carpeta de recursos del podcast en el Google Drive de José (permiso drive.file: la app solo ve
   lo que ella misma crea). Bernardo queda como editor; cada persona que deja su mail, como lectora. */
const almacen = require('./_almacen');
const google = require('./_google');
const { descifrar } = require('./_seguridad');

const API = 'https://www.googleapis.com/drive/v3';
const NOMBRE_CARPETA = 'Recursos · Antes que se lave';
const EDITOR = 'consultas@bernardovasquez.com.ar';

async function llamar(token, ruta, init) {
  init = init || {};
  const r = await fetch(API + ruta, Object.assign({}, init, {
    headers: Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, init.headers || {}),
    signal: AbortSignal.timeout(10000),
  }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error('Drive ' + r.status + ': ' + ((j.error && j.error.message) || r.statusText));
    e.estado = r.status;
    e.razon = j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
    throw e;
  }
  return j;
}

async function token() {
  const d = await almacen.datos();
  if (!d.drive || !d.drive.refreshToken) return null;
  return { d, token: await google.tokenDesdeRefresh(descifrar(d.drive.refreshToken)) };
}

function compartir(tk, carpetaId, email, rol, mensaje) {
  const q = new URLSearchParams({ sendNotificationEmail: 'true', fields: 'id' });
  if (mensaje) q.set('emailMessage', mensaje);
  return llamar(tk, '/files/' + encodeURIComponent(carpetaId) + '/permissions?' + q, {
    method: 'POST',
    body: JSON.stringify({ type: 'user', role: rol, emailAddress: email }),
  });
}

/* Crea la carpeta si no existe y suma a Bernardo como editor. Se llama al conectar el Drive. */
async function prepararCarpeta() {
  const t = await token();
  if (!t) throw new Error('Drive sin conectar');
  let { carpetaId, carpetaUrl, editorOk } = t.d.drive;
  if (carpetaId) {
    try { await llamar(t.token, '/files/' + encodeURIComponent(carpetaId) + '?fields=id,trashed'); } catch (e) { if (e.estado === 404) carpetaId = null; else throw e; }
  }
  if (!carpetaId) {
    const f = await llamar(t.token, '/files?fields=id,webViewLink', {
      method: 'POST',
      body: JSON.stringify({ name: NOMBRE_CARPETA, mimeType: 'application/vnd.google-apps.folder' }),
    });
    carpetaId = f.id;
    carpetaUrl = f.webViewLink || 'https://drive.google.com/drive/folders/' + f.id;
    editorOk = false;
  }
  if (!editorOk) {
    await compartir(t.token, carpetaId, EDITOR, 'writer', 'Bernardo, esta es la carpeta de los recursos del podcast. Lo que subas acá lo ve cada persona que deja su mail en la web.');
    editorOk = true;
  }
  return almacen.guardarDrive({ carpetaId, carpetaUrl, editorOk, editor: EDITOR });
}

/* Le da acceso de lectura a quien dejó su mail. Google le manda el aviso con el link. */
async function darAcceso(email) {
  const t = await token();
  if (!t || !t.d.drive.carpetaId) return null;
  await compartir(t.token, t.d.drive.carpetaId, email, 'reader',
    'Acá tenés los recursos del podcast Antes que se lave. Cada episodio suma uno nuevo en esta carpeta.');
  return t.d.drive.carpetaUrl;
}

module.exports = { prepararCarpeta, darAcceso, NOMBRE_CARPETA, EDITOR };
