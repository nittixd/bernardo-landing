'use strict';
/* Firmas con vencimiento (link para conectar Google, estado de OAuth) y cifrado del token de Google.
   Mismo esquema que la agenda de Invest Mining. Necesita AGENDA_SECRET (32 caracteres o más). */
const { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } = require('crypto');

function secreto() {
  const s = process.env.AGENDA_SECRET;
  if (s && s.length >= 32) return s;
  throw new Error('Falta AGENDA_SECRET (32 caracteres o más)');
}

const b64url = (b) => Buffer.from(b).toString('base64url');

function nuevoId(bytes = 9) {
  return b64url(randomBytes(bytes));
}

function firmar(datos, vigenciaSeg) {
  const cuerpo = b64url(JSON.stringify(Object.assign({}, datos, { exp: Math.floor(Date.now() / 1000) + vigenciaSeg })));
  const firma = b64url(createHmac('sha256', secreto()).update(cuerpo).digest());
  return cuerpo + '.' + firma;
}

function verificar(valor) {
  if (!valor) return null;
  const [cuerpo, firma] = String(valor).split('.');
  if (!cuerpo || !firma) return null;
  const esperada = createHmac('sha256', secreto()).update(cuerpo).digest();
  const recibida = Buffer.from(firma, 'base64url');
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    if (typeof datos.exp !== 'number' || datos.exp < Date.now() / 1000) return null;
    return datos;
  } catch (e) {
    return null;
  }
}

function clave() {
  return createHash('sha256').update(secreto() + ':tokens').digest();
}

/* AES-256-GCM para guardar el refresh token de Google. */
function cifrar(texto) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), datos].map(b64url).join('.');
}

function descifrar(valor) {
  const [iv, tag, datos] = String(valor).split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', clave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString('utf8');
}

function mismoTexto(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

module.exports = { nuevoId, firmar, verificar, cifrar, descifrar, mismoTexto };
