/* Genera el link para que Bernardo conecte su Google Calendar (vence a los 14 días).
   Uso (con el mismo AGENDA_SECRET que está en Vercel):
     set -a; . ~/.config/bernardo-landing/agenda.env; set +a
     node scripts/link-conectar.js [https://bernardovasquez.com.ar] [cuenta@sugerida.com] [bernardo|drive]
   Drive de José (carpeta de recursos): node scripts/link-conectar.js https://bernardovasquez.com.ar '' drive */
'use strict';
const { firmar } = require('../api/_seguridad');

const base = (process.argv[2] || process.env.PUBLIC_URL || 'https://bernardovasquez.com.ar').replace(/\/$/, '');
const pro = process.argv[4] || 'bernardo'; // "bernardo" = su calendario; "drive" = el Drive de José (recursos)
const pista = process.argv[3] !== undefined ? process.argv[3] : (pro === 'drive' ? '' : 'consultas@bernardovasquez.com.ar');
const dias = 14;
const f = firmar(Object.assign({ pro }, pista ? { pista } : {}), dias * 24 * 3600);
const vence = new Date(Date.now() + dias * 864e5).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' });
console.log(base + '/conectar?f=' + encodeURIComponent(f));
console.log('Vence el ' + vence + '.');
