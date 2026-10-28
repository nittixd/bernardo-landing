'use strict';
/* OAuth y Calendar de Google por HTTP (sin googleapis), igual que la agenda de Invest Mining.
   Variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y PUBLIC_URL (para la URI de redirección). */

const ALCANCES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];
// Drive de José para la carpeta de recursos: solo los archivos que crea esta app (no el resto del Drive)
const ALCANCES_DRIVE = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];
// Gmail de Bernardo: solo enviar (no lee nada), para el mail de bienvenida de los recursos
const ALCANCES_GMAIL = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'];
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';

class ErrorGoogle extends Error {
  constructor(mensaje, estado, revocado) {
    super(mensaje);
    this.estado = estado;
    this.revocado = !!revocado;
  }
}

function credenciales() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secreto = process.env.GOOGLE_CLIENT_SECRET;
  return id && secreto ? { id, secreto } : null;
}

function urlPublica() {
  return String(process.env.PUBLIC_URL || 'http://localhost:4194').replace(/\/$/, '');
}

function urlRedireccion() {
  return urlPublica() + '/api/google/callback';
}

function urlAutorizacion(estado, pista, alcances) {
  const cred = credenciales();
  if (!cred) throw new Error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET');
  const q = new URLSearchParams({
    client_id: cred.id,
    redirect_uri: urlRedireccion(),
    response_type: 'code',
    scope: (alcances || ALCANCES).join(' '),
    access_type: 'offline',
    prompt: 'consent', // sin esto Google no vuelve a mandar el refresh token
    include_granted_scopes: 'true',
    state: estado,
  });
  if (pista) q.set('login_hint', pista);
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
}

async function pedirToken(cuerpo) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(cuerpo),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new ErrorGoogle(('Google token ' + r.status + ': ' + (j.error || '') + ' ' + (j.error_description || '')).trim(), r.status, j.error === 'invalid_grant');
  }
  return j;
}

async function canjearCodigo(codigo, alcances) {
  const cred = credenciales();
  if (!cred) throw new Error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET');
  const t = await pedirToken({
    code: codigo,
    client_id: cred.id,
    client_secret: cred.secreto,
    redirect_uri: urlRedireccion(),
    grant_type: 'authorization_code',
  });
  let email;
  if (t.id_token) {
    // viene directo del endpoint de Google por TLS, alcanza con leerlo
    email = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString('utf8')).email;
  }
  const otorgados = String(t.scope || '').split(' ');
  const faltan = (alcances || ALCANCES).filter((a) => a.startsWith('https://') && !otorgados.includes(a));
  return { refreshToken: t.refresh_token, email, alcancesFaltantes: faltan };
}

const cache = new Map(); // tokens de acceso en memoria hasta un minuto antes de vencer

async function tokenDesdeRefresh(refreshToken) {
  const c = cache.get(refreshToken);
  if (c && c.vence > Date.now()) return c.token;
  const cred = credenciales();
  if (!cred) throw new Error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET');
  const t = await pedirToken({ refresh_token: refreshToken, client_id: cred.id, client_secret: cred.secreto, grant_type: 'refresh_token' });
  cache.set(refreshToken, { token: t.access_token, vence: Date.now() + (t.expires_in - 60) * 1000 });
  return t.access_token;
}

async function llamar(token, ruta, init) {
  init = init || {};
  const r = await fetch(API + ruta, Object.assign({}, init, {
    headers: Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, init.headers || {}),
    signal: AbortSignal.timeout(10000),
  }));
  if (r.status === 204) return undefined;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorGoogle('Calendar ' + r.status + ': ' + ((j.error && j.error.message) || r.statusText), r.status);
  return j;
}

async function listarOcupadosPorEventos(token, calendarId, desde, hasta, ignorar) {
  const saltear = (ignorar || []).map((t) => String(t).trim().toLowerCase());
  const salida = [];
  let pagina;
  do {
    const q = new URLSearchParams({ timeMin: desde.toISOString(), timeMax: hasta.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    if (pagina) q.set('pageToken', pagina);
    const r = await llamar(token, '/calendars/' + encodeURIComponent(calendarId) + '/events?' + q);
    for (const ev of r.items || []) {
      if (ev.status === 'cancelled' || ev.transparency === 'transparent') continue;
      if (saltear.includes(String(ev.summary || '').trim().toLowerCase())) continue;
      const yo = (ev.attendees || []).find((a) => a.self);
      if (yo && yo.responseStatus === 'declined') continue;
      const ini = ev.start.dateTime || ev.start.date + 'T00:00:00-03:00';
      const fin = ev.end.dateTime || ev.end.date + 'T00:00:00-03:00';
      salida.push({ inicio: new Date(ini), fin: new Date(fin) });
    }
    pagina = r.nextPageToken;
  } while (pagina);
  return salida;
}

async function horariosOcupados(token, calendarId, desde, hasta, ignorar) {
  // con títulos a ignorar hay que mirar los eventos uno por uno (freeBusy no trae títulos)
  if (ignorar && ignorar.length) return listarOcupadosPorEventos(token, calendarId, desde, hasta, ignorar);
  try {
    const r = await llamar(token, '/freeBusy', {
      method: 'POST',
      body: JSON.stringify({ timeMin: desde.toISOString(), timeMax: hasta.toISOString(), items: [{ id: calendarId }] }),
    });
    const cal = r.calendars[calendarId];
    if (cal && cal.errors && cal.errors.length) throw new ErrorGoogle('freeBusy: ' + cal.errors.map((e) => e.reason).join(', '), 403);
    return ((cal && cal.busy) || []).map((b) => ({ inicio: new Date(b.start), fin: new Date(b.end) }));
  } catch (e) {
    // si falta el permiso de freeBusy, los eventos alcanzan para saber qué está ocupado
    if (e instanceof ErrorGoogle && e.estado === 403) return listarOcupadosPorEventos(token, calendarId, desde, hasta);
    throw e;
  }
}

async function crearEvento(token, calendarId, e) {
  const cuerpo = {
    summary: e.titulo,
    description: e.descripcion,
    start: { dateTime: e.inicio.toISOString() },
    end: { dateTime: e.fin.toISOString() },
    attendees: e.invitado ? [{ email: e.invitado.email, displayName: e.invitado.nombre }] : undefined,
    extendedProperties: { private: { agendaReserva: e.reservaId } },
    conferenceData: { createRequest: { requestId: 'agenda-' + e.reservaId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    reminders: { useDefault: true },
  };
  const q = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: e.invitado ? 'all' : 'none' });
  const ev = await llamar(token, '/calendars/' + encodeURIComponent(calendarId) + '/events?' + q, { method: 'POST', body: JSON.stringify(cuerpo) });
  const video = ev.conferenceData && (ev.conferenceData.entryPoints || []).find((p) => p.entryPointType === 'video');
  return { id: ev.id, meetUrl: ev.hangoutLink || (video && video.uri) || '' };
}

module.exports = { ALCANCES, ALCANCES_DRIVE, ALCANCES_GMAIL, ErrorGoogle, credenciales, urlPublica, urlAutorizacion, canjearCodigo, tokenDesdeRefresh, horariosOcupados, crearEvento };
