(function () {
  'use strict';

  var CFG = window.BV || {};
  var q = new URLSearchParams(location.search);
  var estado = q.get('collection_status') || q.get('status') || '';
  var pago = q.get('payment_id') || q.get('collection_id') || '';
  var d = {};
  try { d = JSON.parse(sessionStorage.getItem('bv-consulta')) || {}; } catch (e) {}

  var $ = function (s) { return document.querySelector(s); };
  var title = $('[data-title]'), text = $('[data-text]'), action = $('[data-action]');
  var agenda = $('[data-agenda]'), small = $('[data-small]');

  function waLink(intro) {
    var lineas = [
      intro,
      '',
      'Nombre: ' + (d.nombre || ''),
      'A qué me dedico: ' + (d.dedicacion || ''),
      'Quiero conversar sobre: ' + (d.tema || ''),
      'Decisiones: ' + (d.decisiones || ''),
    ];
    if (pago) lineas.push('Pago de Mercado Pago: ' + pago);
    return 'https://wa.me/' + String(CFG.whatsapp).replace(/\D/g, '') + '?text=' + encodeURIComponent(lineas.join('\n'));
  }

  function agendaUrl() {
    var u;
    try { u = new URL(CFG.agendaUrl); } catch (e) { return null; }
    if (/calendly\.com$/.test(u.hostname)) {
      if (d.nombre) u.searchParams.set('name', d.nombre);
      if (d.email) u.searchParams.set('email', d.email);
      // a1..a3 = preguntas propias del evento en Calendly, en este orden
      if (d.dedicacion) u.searchParams.set('a1', d.dedicacion);
      if (d.tema) u.searchParams.set('a2', d.tema);
      if (d.decisiones) u.searchParams.set('a3', d.decisiones);
      u.searchParams.set('hide_gdpr_banner', '1');
    }
    return u;
  }

  if (estado === 'approved') {
    title.textContent = 'Listo, tu consulta está paga';
    var u = CFG.agendaUrl ? agendaUrl() : null;
    if (u && /calendly\.com$/.test(u.hostname)) {
      text.textContent = 'Ahora elegí el día y el horario que te quede mejor.';
      action.hidden = true;
      u.searchParams.set('embed_domain', location.hostname);
      u.searchParams.set('embed_type', 'Inline');
      agenda.innerHTML = '<iframe title="Elegir día y horario" loading="lazy"></iframe>';
      agenda.firstChild.src = u.toString();
      agenda.hidden = false;
    } else if (u) {
      text.textContent = 'Ahora elegí el día y el horario que te quede mejor.';
      action.textContent = 'Elegir día y horario';
      action.href = u.toString();
      action.target = '_blank';
      action.rel = 'noopener';
    } else if (CFG.whatsapp) {
      text.textContent = 'Último paso: escribime por WhatsApp para coordinar el día y el horario. El mensaje ya va con tus respuestas.';
      action.textContent = 'Coordinar por WhatsApp';
      action.href = waLink('Hola Bernardo, ya pagué la consulta. Te paso mis datos para coordinar el horario.');
      action.target = '_blank';
      action.rel = 'noopener';
    } else {
      text.textContent = 'Te vamos a escribir por WhatsApp para coordinar el día y el horario de la consulta.';
      action.hidden = true;
    }
    if (pago) { small.textContent = 'Número de pago: ' + pago; small.hidden = false; }
  } else if (estado === 'pending' || estado === 'in_process') {
    title.textContent = 'Tu pago está en proceso';
    text.textContent = 'Mercado Pago todavía lo está acreditando. Apenas se confirme te escribimos para coordinar el día y el horario.';
    action.hidden = true;
    if (pago) { small.textContent = 'Número de pago: ' + pago; small.hidden = false; }
  } else if (estado) {
    title.textContent = 'No se pudo completar el pago';
    text.textContent = 'No se hizo ningún cobro. Tus respuestas quedaron guardadas, así que podés intentarlo de nuevo en un paso.';
    action.textContent = 'Volver a intentar';
    action.href = '/#reservar';
  }

  if (estado) document.title = title.textContent + ' · Bernardo Vásquez';
})();
