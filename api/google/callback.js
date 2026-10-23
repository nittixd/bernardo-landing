'use strict';
/* Vuelta de la pantalla de Google: guarda el permiso (cifrado) para leer lo ocupado y crear los eventos. */
const almacen = require('../_almacen');
const google = require('../_google');
const { cifrar, verificar } = require('../_seguridad');

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const ir = (ruta) => { res.statusCode = 303; res.setHeader('Location', ruta); res.end(); };
  const estado = verificar(q.get('state'));
  if (!estado || estado.pro !== 'bernardo') return ir('/conectar?error=estado');
  if (q.get('error')) return ir('/conectar?error=cancelado');
  try {
    const t = await google.canjearCodigo(q.get('code') || '');
    if (t.alcancesFaltantes.length) return ir('/conectar?error=permisos');
    if (!t.refreshToken) return ir('/conectar?error=sin-refresh');
    await almacen.guardarGoogle({
      email: t.email || '',
      calendarId: 'primary',
      refreshToken: cifrar(t.refreshToken),
      conectadoEn: new Date().toISOString(),
    });
    return ir('/conectar?listo=1&cuenta=' + encodeURIComponent(t.email || ''));
  } catch (e) {
    console.error('google callback', e && e.message);
    return ir('/conectar?error=google');
  }
};
