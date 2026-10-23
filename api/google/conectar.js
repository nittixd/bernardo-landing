'use strict';
/* Llegan acá desde el botón de /conectar, con el link firmado que genera José:
   pro "bernardo" = su Google Calendar (agenda); pro "drive" = el Drive de José (carpeta de recursos).
   El estado viaja por Google y vuelve firmado: así nadie conecta otra cuenta en su lugar. */
const google = require('../_google');
const { firmar, verificar } = require('../_seguridad');

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const f = q.get('f') || '';
  const ir = (ruta) => { res.statusCode = 303; res.setHeader('Location', ruta); res.end(); };
  const permiso = verificar(f);
  if (!permiso || !['bernardo', 'drive'].includes(permiso.pro)) return ir('/conectar?error=link');
  if (!google.credenciales()) return ir('/conectar?error=config&f=' + encodeURIComponent(f));
  const alcances = permiso.pro === 'drive' ? google.ALCANCES_DRIVE : google.ALCANCES;
  return ir(google.urlAutorizacion(firmar({ pro: permiso.pro }, 15 * 60), permiso.pista || '', alcances));
};
