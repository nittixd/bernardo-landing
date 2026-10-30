/* Teléfono de WhatsApp con código de país, igual en el navegador y en /api.
   Sirve para las agendas de Invest Mining, Bernardo y AJB: el que reserva elige el país
   (Argentina por defecto) y escribe su número como le salga; acá se ordena.

   En el navegador queda como window.Telefono; en Node, require('./telefono').
   Telefono.normalizar(iso, texto) → { ok: true, e164: '+542644123456', digitos: '542644123456' }
                                   | { ok: false, error: 'Sumá el código de área…' }
   - Si el texto empieza con + o 00, se toma como número completo y el país elegido no importa.
   - Argentina: saca el 0, el 9 y el 15, y pide los 10 dígitos con código de área.
     Se guarda como +54 y 10 dígitos (sin el 9), que es como abre wa.me.
   - Otros países: saca el 0 de adelante (salvo Italia) y el código de país si lo repitió. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Telefono = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [código ISO, nombre, código de país, largo mínimo y máximo del número sin el código]
  var PAISES = [
    ['AR', 'Argentina', '54', 10, 10],
    ['UY', 'Uruguay', '598', 8, 8],
    ['PY', 'Paraguay', '595', 9, 9],
    ['CL', 'Chile', '56', 9, 9],
    ['BO', 'Bolivia', '591', 8, 8],
    ['PE', 'Perú', '51', 9, 9],
    ['BR', 'Brasil', '55', 10, 11],
    ['CO', 'Colombia', '57', 10, 10],
    ['EC', 'Ecuador', '593', 9, 9],
    ['VE', 'Venezuela', '58', 10, 10],
    ['MX', 'México', '52', 10, 10],
    ['CR', 'Costa Rica', '506', 8, 8],
    ['PA', 'Panamá', '507', 7, 8],
    ['GT', 'Guatemala', '502', 8, 8],
    ['DO', 'República Dominicana', '1', 10, 10],
    ['US', 'Estados Unidos o Canadá', '1', 10, 10],
    ['ES', 'España', '34', 9, 9],
    ['IT', 'Italia', '39', 6, 11],
    ['PT', 'Portugal', '351', 9, 9],
    ['FR', 'Francia', '33', 9, 9],
    ['DE', 'Alemania', '49', 6, 13],
    ['GB', 'Reino Unido', '44', 10, 10],
    ['IL', 'Israel', '972', 8, 9],
    ['AE', 'Emiratos Árabes Unidos', '971', 8, 9]
  ].map(function (p) { return { iso: p[0], nombre: p[1], codigo: p[2], min: p[3], max: p[4] }; });

  // "Otro país": no hay código fijo, la persona lo escribe con el +
  var OTRO = 'XX';

  // zona horaria del navegador → país sugerido (si no está, Argentina)
  var ZONAS = {
    Montevideo: 'UY', Asuncion: 'PY', Santiago: 'CL', La_Paz: 'BO', Lima: 'PE', Sao_Paulo: 'BR',
    Bogota: 'CO', Guayaquil: 'EC', Caracas: 'VE', Mexico_City: 'MX', Costa_Rica: 'CR', Panama: 'PA',
    Guatemala: 'GT', Santo_Domingo: 'DO', New_York: 'US', Chicago: 'US', Denver: 'US', Los_Angeles: 'US',
    Toronto: 'US', Madrid: 'ES', Rome: 'IT', Lisbon: 'PT', Paris: 'FR', Berlin: 'DE', London: 'GB',
    Jerusalem: 'IL', Dubai: 'AE'
  };

  function buscar(iso) {
    for (var i = 0; i < PAISES.length; i++) if (PAISES[i].iso === iso) return PAISES[i];
    return null;
  }

  function bandera(iso) {
    if (!/^[A-Z]{2}$/.test(iso) || iso === OTRO) return '🌐';
    return String.fromCodePoint(127397 + iso.charCodeAt(0), 127397 + iso.charCodeAt(1));
  }

  function digitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }

  // número argentino sin el 54: saca 0, 9 y 15 para dejar código de área + número (10 dígitos)
  function nacionalAR(n) {
    n = n.replace(/^0/, '');
    if ((n.length === 11 || n.length === 13) && n.charAt(0) === '9') n = n.slice(1);
    if (n.length === 12) {
      var lugares = n.indexOf('11') === 0 ? [2] : [3, 4, 2];
      for (var i = 0; i < lugares.length; i++) {
        if (n.substr(lugares[i], 2) === '15') { n = n.slice(0, lugares[i]) + n.slice(lugares[i] + 2); break; }
      }
    }
    return n;
  }

  function listo(d) {
    if (d.length < 8) return { ok: false, error: 'Revisá el número, parece que faltan dígitos.' };
    if (d.length > 15) return { ok: false, error: 'Revisá el número, tiene dígitos de más.' };
    return { ok: true, e164: '+' + d, digitos: d };
  }

  // número completo con el código de país adelante
  function completo(d) {
    if (d.indexOf('54') === 0) {
      var ar = nacionalAR(d.slice(2));
      if (ar.length === 10) d = '54' + ar;
    }
    return listo(d);
  }

  function normalizar(iso, texto) {
    var crudo = String(texto == null ? '' : texto).trim();
    var d = digitos(crudo);
    if (!d) return { ok: false, error: 'Escribí tu número de WhatsApp.' };
    var pais = buscar(iso);

    if (/^\+/.test(crudo) || /^00/.test(crudo) || !pais) {
      if (/^00/.test(crudo)) d = d.slice(2);
      return completo(d);
    }

    if (pais.iso === 'AR') {
      if (d.indexOf('54') === 0 && d.length >= 12) return completo(d); // escribió el 54 sin el +
      var n = nacionalAR(d);
      if (n.length < 10) return { ok: false, error: 'Sumá el código de área, por ejemplo 264 412 3456.' };
      return listo('54' + n);
    }

    var nac = pais.iso === 'IT' ? d : d.replace(/^0/, '');
    var sin = nac.length - pais.codigo.length;
    if (nac.length > pais.max && nac.indexOf(pais.codigo) === 0 && sin >= pais.min && sin <= pais.max) {
      nac = nac.slice(pais.codigo.length); // repitió el código de país
    }
    if (nac.length < 6) return { ok: false, error: 'Revisá el número, parece que faltan dígitos.' };
    return listo(pais.codigo + nac);
  }

  // país de un número completo (para cambiar el selector si escriben +598…)
  function paisDe(texto) {
    var d = digitos(texto).replace(/^00/, '');
    var mejor = null;
    for (var i = 0; i < PAISES.length; i++) {
      var p = PAISES[i];
      if (d.indexOf(p.codigo) === 0 && (!mejor || p.codigo.length > mejor.codigo.length)) mejor = p;
    }
    if (mejor && mejor.codigo === '1') return 'US';
    return mejor ? mejor.iso : OTRO;
  }

  function paisPorZona() {
    try {
      var z = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      return ZONAS[z.split('/').pop()] || 'AR';
    } catch (e) {
      return 'AR';
    }
  }

  return { PAISES: PAISES, OTRO: OTRO, buscar: buscar, bandera: bandera, normalizar: normalizar, paisDe: paisDe, paisPorZona: paisPorZona };
});
