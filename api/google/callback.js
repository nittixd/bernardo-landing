'use strict';
/* Vuelta de la pantalla de Google.
   - Calendario de Bernardo: guarda el permiso (cifrado) para leer lo ocupado y crear las consultas.
   - Drive de José: guarda el permiso, crea la carpeta de recursos y suma a Bernardo como editor. */
const almacen = require('../_almacen');
const google = require('../_google');
const drive = require('../_drive');
const { cifrar, verificar } = require('../_seguridad');

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const ir = (ruta) => { res.statusCode = 303; res.setHeader('Location', ruta); res.end(); };
  const estado = verificar(q.get('state'));
  if (!estado || !['bernardo', 'drive', 'gmail'].includes(estado.pro)) return ir('/conectar?error=estado');
  const tipo = estado.pro === 'bernardo' ? '' : '&tipo=' + estado.pro;
  if (q.get('error')) return ir('/conectar?error=cancelado' + tipo);
  try {
    const alcances = { drive: google.ALCANCES_DRIVE, gmail: google.ALCANCES_GMAIL }[estado.pro] || google.ALCANCES;
    const t = await google.canjearCodigo(q.get('code') || '', alcances);
    if (t.alcancesFaltantes.length) return ir('/conectar?error=permisos' + tipo);
    if (!t.refreshToken) return ir('/conectar?error=sin-refresh' + tipo);
    const cuenta = '&cuenta=' + encodeURIComponent(t.email || '');

    if (estado.pro === 'gmail') {
      await almacen.guardarGmail({ email: t.email || '', refreshToken: cifrar(t.refreshToken), conectadoEn: new Date().toISOString() });
      return ir('/conectar?listo=1' + tipo + cuenta);
    }

    if (estado.pro === 'drive') {
      await almacen.guardarDrive({ email: t.email || '', refreshToken: cifrar(t.refreshToken), conectadoEn: new Date().toISOString() });
      try {
        await drive.prepararCarpeta();
      } catch (e) {
        console.error('drive carpeta', e && e.message);
        return ir('/conectar?error=carpeta' + tipo + cuenta);
      }
      return ir('/conectar?listo=1' + tipo + cuenta);
    }

    await almacen.guardarGoogle({
      email: t.email || '',
      calendarId: 'primary',
      refreshToken: cifrar(t.refreshToken),
      conectadoEn: new Date().toISOString(),
    });
    return ir('/conectar?listo=1' + cuenta);
  } catch (e) {
    console.error('google callback', e && e.message);
    return ir('/conectar?error=google' + tipo);
  }
};
