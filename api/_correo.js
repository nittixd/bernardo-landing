'use strict';
/* Mail de bienvenida de los recursos, enviado DESDE la casilla de Bernardo (consultas@) con la API de Gmail
   (permiso gmail.send: solo enviar, no lee nada). Si Bernardo no conectó su Gmail, no se manda y queda
   el aviso de Google Drive como hasta ahora. */
const almacen = require('./_almacen');
const google = require('./_google');
const { descifrar } = require('./_seguridad');

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const encabezado = (s) => '=?UTF-8?B?' + b64(s) + '?=';
const lineas = (s) => s.replace(/.{1,76}/g, '$&\r\n'); // base64 en renglones de 76

function html(url) {
  const verde = '#234D3C';
  return `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#FAF8F3">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAF8F3"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E4DFD4;border-radius:6px">
<tr><td style="padding:32px 32px 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:#1C1C1C">Tus recursos de Antes que se lave</td></tr>
<tr><td style="padding:8px 32px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#5A554B">
<p style="margin:0 0 14px">Hola, gracias por escuchar el podcast.</p>
<p style="margin:0 0 22px">Acá tenés la carpeta con los recursos. Cada episodio suma uno nuevo, así que podés volver cuando quieras con este mismo link.</p>
</td></tr>
<tr><td style="padding:0 32px 26px"><a href="${url}" style="display:inline-block;background:${verde};color:#FAF8F3;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;padding:14px 22px;border-radius:5px">Abrir los recursos</a></td></tr>
<tr><td style="padding:0 32px 30px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#5A554B">
<p style="margin:0 0 18px">Si en algún momento querés revisar cómo está organizado tu patrimonio, podés reservar una consulta en <a href="https://bernardovasquez.com.ar" style="color:${verde}">bernardovasquez.com.ar</a>.</p>
<p style="margin:0">Saludos,<br><strong style="color:#1C1C1C">Bernardo Vásquez</strong><br>Abogado · Fideicomisos de administración patrimonial</p>
</td></tr></table>
</td></tr></table></body></html>`;
}

function texto(url) {
  return [
    'Hola, gracias por escuchar el podcast.',
    '',
    'Acá tenés la carpeta con los recursos de Antes que se lave. Cada episodio suma uno nuevo, así que podés volver cuando quieras con este mismo link:',
    url,
    '',
    'Si en algún momento querés revisar cómo está organizado tu patrimonio, podés reservar una consulta en https://bernardovasquez.com.ar',
    '',
    'Saludos,',
    'Bernardo Vásquez',
    'Abogado · Fideicomisos de administración patrimonial',
  ].join('\r\n');
}

/* Devuelve true si se mandó; false si Bernardo todavía no conectó su Gmail. */
async function enviarRecursos(para, url) {
  const d = await almacen.datos();
  if (!d.gmail || !d.gmail.refreshToken) return false;
  const token = await google.tokenDesdeRefresh(descifrar(d.gmail.refreshToken));
  const desde = d.gmail.email || 'consultas@bernardovasquez.com.ar';
  const limite = 'bv' + Date.now().toString(36);
  const mime = [
    'From: ' + encabezado('Bernardo Vásquez') + ' <' + desde + '>',
    'To: <' + para + '>',
    'Subject: ' + encabezado('Tus recursos de Antes que se lave'),
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + limite + '"',
    '',
    '--' + limite,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    lineas(b64(texto(url))),
    '--' + limite,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    lineas(b64(html(url))),
    '--' + limite + '--',
    '',
  ].join('\r\n');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(mime, 'utf8').toString('base64url') }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error('Gmail ' + r.status + ': ' + ((j.error && j.error.message) || r.statusText));
  }
  return true;
}

module.exports = { enviarRecursos };
