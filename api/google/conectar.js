'use strict';
/* Llegan acá desde el botón de /conectar, con el link firmado que genera José:
   pro "bernardo" = su Google Calendar (agenda); "drive" = el Drive de la carpeta de recursos;
   "gmail" = su Gmail, solo para enviar el mail de bienvenida de los recursos.
   El estado viaja por Google y vuelve firmado: así nadie conecta otra cuenta en su lugar. */
const google = require('../_google');
const { firmar, verificar } = require('../_seguridad');

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const f = q.get('f') || '';
  const ir = (ruta) => { res.statusCode = 303; res.setHeader('Location', ruta); res.end(); };
  const permiso = verificar(f);
  if (!permiso || !['bernardo', 'drive', 'gmail'].includes(permiso.pro)) return ir('/conectar?error=link');
  if (!google.credenciales()) return ir('/conectar?error=config&f=' + encodeURIComponent(f));
  const alcances = { drive: google.ALCANCES_DRIVE, gmail: google.ALCANCES_GMAIL }[permiso.pro] || google.ALCANCES;
  return ir(google.urlAutorizacion(firmar({ pro: permiso.pro }, 15 * 60), permiso.pista || '', alcances));
};
