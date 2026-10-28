'use strict';
/* Recursos del podcast en Google Drive (permiso drive.file: la app solo ve lo que ella misma crea).
   Estructura (pedido de José, 27/10):
     Podcast · Antes que se lave          ← carpeta principal, Bernardo (consultas@) como editor
       ├─ Recursos                        ← acá Bernardo sube el material; cada mail recibe acceso de LECTURA solo a esta
       └─ Mails (Google Sheets)           ← cada mail que se deja en la web cae solo como una fila
   Quien deja su mail nunca ve la planilla: el acceso se le da a la subcarpeta Recursos. */
const almacen = require('./_almacen');
const google = require('./_google');
const { descifrar } = require('./_seguridad');
const correo = require('./_correo');

const DRIVE = 'https://www.googleapis.com/drive/v3';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const NOMBRE_PRINCIPAL = 'Podcast · Antes que se lave';
const NOMBRE_RECURSOS = 'Recursos';
const NOMBRE_PLANILLA = 'Mails';
const CARPETA = 'application/vnd.google-apps.folder';
const PLANILLA = 'application/vnd.google-apps.spreadsheet';
const EDITOR = 'consultas@bernardovasquez.com.ar';

async function llamar(token, url, init) {
  init = init || {};
  const r = await fetch(url, Object.assign({}, init, {
    headers: Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, init.headers || {}),
    signal: AbortSignal.timeout(10000),
  }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error('Google ' + r.status + ': ' + ((j.error && j.error.message) || r.statusText));
    e.estado = r.status;
    e.razon = j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
    throw e;
  }
  return j;
}

async function sesion() {
  const d = await almacen.datos();
  if (!d.drive || !d.drive.refreshToken) return null;
  return { d, token: await google.tokenDesdeRefresh(descifrar(d.drive.refreshToken)) };
}

async function existe(tk, id) {
  if (!id) return false;
  try {
    const f = await llamar(tk, DRIVE + '/files/' + encodeURIComponent(id) + '?fields=id,trashed');
    return !f.trashed;
  } catch (e) {
    if (e.estado === 404) return false;
    throw e;
  }
}

async function crear(tk, nombre, tipo, padre) {
  return llamar(tk, DRIVE + '/files?fields=id,webViewLink', {
    method: 'POST',
    body: JSON.stringify(Object.assign({ name: nombre, mimeType: tipo }, padre ? { parents: [padre] } : {})),
  });
}

function compartir(tk, id, email, rol, mensaje, avisar) {
  const q = new URLSearchParams({ sendNotificationEmail: avisar === false ? 'false' : 'true', fields: 'id' });
  if (mensaje && avisar !== false) q.set('emailMessage', mensaje);
  return llamar(tk, DRIVE + '/files/' + encodeURIComponent(id) + '/permissions?' + q, {
    method: 'POST',
    body: JSON.stringify({ type: 'user', role: rol, emailAddress: email }),
  });
}

/* Deja armada la estructura. Es idempotente: crea solo lo que falta. Se llama al conectar el Drive. */
async function prepararCarpeta() {
  const s = await sesion();
  if (!s) throw new Error('Drive sin conectar');
  const tk = s.token;
  const dr = Object.assign({}, s.d.drive);
  const yo = String(dr.email || '').toLowerCase();

  if (!(await existe(tk, dr.carpetaId))) {
    const f = await crear(tk, NOMBRE_PRINCIPAL, CARPETA);
    Object.assign(dr, { carpetaId: f.id, carpetaUrl: f.webViewLink, editorOk: false, recursosId: null, planillaId: null });
  } else {
    // la carpeta de la primera versión se llamaba "Recursos · Antes que se lave"
    await llamar(tk, DRIVE + '/files/' + encodeURIComponent(dr.carpetaId), { method: 'PATCH', body: JSON.stringify({ name: NOMBRE_PRINCIPAL }) });
  }

  if (!(await existe(tk, dr.recursosId))) {
    const f = await crear(tk, NOMBRE_RECURSOS, CARPETA, dr.carpetaId);
    Object.assign(dr, { recursosId: f.id, recursosUrl: f.webViewLink || 'https://drive.google.com/drive/folders/' + f.id });
  }

  if (!(await existe(tk, dr.planillaId))) {
    const f = await crear(tk, NOMBRE_PLANILLA, PLANILLA, dr.carpetaId);
    Object.assign(dr, { planillaId: f.id, planillaUrl: f.webViewLink || 'https://docs.google.com/spreadsheets/d/' + f.id });
    await llamar(tk, SHEETS + '/' + f.id + '/values/A1:D1?valueInputOption=RAW', {
      method: 'PUT',
      body: JSON.stringify({ values: [['Fecha', 'Email', 'Acceso a Recursos', 'Aviso']] }),
    });
  }

  // si la conectó otra cuenta (no la de Bernardo), Bernardo queda como editor de toda la carpeta
  if (!dr.editorOk) {
    if (yo !== EDITOR) {
      await compartir(tk, dr.carpetaId, EDITOR, 'writer',
        'Bernardo, en «Recursos» subí el material del podcast y en «Mails» vas a ver a cada persona que lo pidió desde la web.');
    }
    dr.editorOk = true;
  }

  return almacen.guardarDrive(dr);
}

/* Le da acceso de lectura a la carpeta Recursos, le manda el mail de bienvenida desde la casilla de
   Bernardo (si conectó su Gmail; si no, avisa Google Drive) y lo anota en la planilla. */
async function darAcceso(email) {
  const s = await sesion();
  if (!s || !s.d.drive.recursosId) return null;
  const dr = s.d.drive;
  const conGmail = !!(s.d.gmail && s.d.gmail.refreshToken);
  const MENSAJE = 'Acá tenés los recursos del podcast Antes que se lave. Cada episodio suma uno nuevo en esta carpeta.';
  let aviso = 'aviso de Google Drive';
  try {
    if (conGmail) {
      try {
        await compartir(s.token, dr.recursosId, email, 'reader', null, false);
      } catch (e) {
        // a un mail que no es de Google, Drive solo le comparte con aviso
        if (e.estado !== 400 && e.estado !== 403) throw e;
        await compartir(s.token, dr.recursosId, email, 'reader', MENSAJE, true);
      }
    } else {
      await compartir(s.token, dr.recursosId, email, 'reader', MENSAJE, true);
    }
  } catch (e) {
    await anotar(s.token, dr.planillaId, email, 'no (' + (e.razon || e.estado) + ')', '').catch(() => {});
    throw e;
  }
  if (conGmail) {
    try {
      if (await correo.enviarRecursos(email, dr.recursosUrl)) aviso = 'mail de Bernardo';
    } catch (e) {
      console.error('mail de recursos', e && e.message);
      aviso = 'falló el mail (' + String(e.message).slice(0, 40) + ')';
    }
  }
  await anotar(s.token, dr.planillaId, email, 'sí', aviso);
  return dr.recursosUrl;
}

function anotar(tk, planillaId, email, acceso, aviso) {
  if (!planillaId) return Promise.resolve();
  const fecha = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  return llamar(tk, SHEETS + '/' + planillaId + '/values/A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', {
    method: 'POST',
    body: JSON.stringify({ values: [[fecha, email, acceso, aviso || '']] }),
  });
}

module.exports = { prepararCarpeta, darAcceso, NOMBRE_PRINCIPAL, EDITOR };
