'use strict';
/* Bernardo llega acá desde el botón de /conectar, con el link firmado que le manda José.
   El estado viaja por Google y vuelve firmado: así nadie conecta otro calendario. */
const google = require('../_google');
const { firmar, verificar } = require('../_seguridad');

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const f = q.get('f') || '';
  const ir = (ruta) => { res.statusCode = 303; res.setHeader('Location', ruta); res.end(); };
  const permiso = verificar(f);
  if (!permiso || permiso.pro !== 'bernardo') return ir('/conectar?error=link');
  if (!google.credenciales()) return ir('/conectar?error=config&f=' + encodeURIComponent(f));
  return ir(google.urlAutorizacion(firmar({ pro: 'bernardo' }, 15 * 60), permiso.pista || ''));
};
