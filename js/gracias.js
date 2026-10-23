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
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TZ = 'America/Argentina/Buenos_Aires';
  var fmt = function (opts) { return new Intl.DateTimeFormat('es-AR', Object.assign({ timeZone: TZ }, opts)); };
  var fDiaCorto = fmt({ weekday: 'short' }), fNum = fmt({ day: 'numeric' }), fMes = fmt({ month: 'short' });
  var fHora = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
  var fDia = fmt({ weekday: 'long' }), fMesLargo = fmt({ month: 'long' });
  /* «miércoles 28 de octubre» (Intl pone una coma después del día de la semana) */
  var fLarga = { format: function (x) { return fDia.format(x) + ' ' + fNum.format(x) + ' de ' + fMesLargo.format(x); } };
  var fCorta = { format: function (x) { return fDia.format(x) + ' ' + fNum.format(x); } };
  var limpiar = function (s) { return s.replace('.', ''); };

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
      if (d.dedicacion) u.searchParams.set('a1', d.dedicacion);
      if (d.tema) u.searchParams.set('a2', d.tema);
      if (d.decisiones) u.searchParams.set('a3', d.decisiones);
      u.searchParams.set('hide_gdpr_banner', '1');
    }
    return u;
  }

  /* Lo que se muestra si la agenda propia no está conectada (link externo, WhatsApp o aviso). */
  function respaldo() {
    var u = CFG.agendaUrl ? agendaUrl() : null;
    var google = u && u.hostname === 'calendar.google.com' && /\/appointments\//.test(u.pathname);
    if (google) u.searchParams.set('gv', 'true');
    if (u && (google || /calendly\.com$/.test(u.hostname))) {
      text.textContent = 'Ahora elegí el día y el horario que te quede mejor.';
      action.hidden = true;
      if (!google) {
        u.searchParams.set('embed_domain', location.hostname);
        u.searchParams.set('embed_type', 'Inline');
      }
      agenda.className = 'done__agenda';
      agenda.innerHTML = '<iframe title="Elegir día y horario" loading="lazy"></iframe>';
      agenda.firstChild.src = u.toString();
      agenda.hidden = false;
    } else if (u) {
      text.textContent = 'Ahora elegí el día y el horario que te quede mejor.';
      action.textContent = 'Elegir día y horario';
      action.href = u.toString();
      action.target = '_blank';
      action.rel = 'noopener';
      action.hidden = false;
    } else if (CFG.whatsapp) {
      text.textContent = 'Último paso: escribime por WhatsApp para coordinar el día y el horario. El mensaje ya va con tus respuestas.';
      action.textContent = 'Coordinar por WhatsApp';
      action.href = waLink('Hola Bernardo, ya pagué la consulta. Te paso mis datos para coordinar el horario.');
      action.target = '_blank';
      action.rel = 'noopener';
      action.hidden = false;
    } else {
      text.textContent = 'Te vamos a escribir por WhatsApp para coordinar el día y el horario de la consulta.';
      action.hidden = true;
    }
  }

  function confirmada(r) {
    title.textContent = 'Tu consulta quedó reservada';
    var ini = new Date(r.inicio);
    text.textContent = 'Te espero el ' + fLarga.format(ini) + ' a las ' + fHora.format(ini) + ' por Google Meet.' +
      (r.email ? ' Te llegó la invitación a ' + r.email + ' con el link de la videollamada.' : '');
    agenda.hidden = true;
    if (r.meetUrl) {
      action.textContent = 'Abrir el link de Meet';
      action.href = r.meetUrl;
      action.target = '_blank';
      action.rel = 'noopener';
      action.hidden = false;
    } else {
      action.hidden = true;
    }
    document.title = title.textContent + ' · Bernardo Vásquez';
  }

  /* Selector de día y horario con los turnos libres que devuelve /api/turnos. */
  function selector(dias) {
    text.textContent = 'Ahora elegí el día y el horario que te quede mejor. La consulta es por Google Meet y dura una hora.';
    action.hidden = true;
    var elegido = { dia: 0, turno: null };

    agenda.className = 'slots';
    agenda.innerHTML =
      '<div class="slots__days" role="tablist" aria-label="Día"></div>' +
      '<div class="slots__times" role="radiogroup" aria-label="Horario"></div>' +
      '<p class="slots__err" aria-live="polite"></p>' +
      '<button class="btn btn--primary" type="button" disabled>Elegí un horario</button>';
    agenda.hidden = false;
    var cDias = agenda.querySelector('.slots__days');
    var cHoras = agenda.querySelector('.slots__times');
    var err = agenda.querySelector('.slots__err');
    var boton = agenda.querySelector('button');

    function pintarDias() {
      cDias.innerHTML = '';
      dias.forEach(function (dia, i) {
        var f = new Date(dia.turnos[0]);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'slots__day' + (i === elegido.dia ? ' is-on' : '');
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', i === elegido.dia ? 'true' : 'false');
        b.innerHTML = '<span>' + limpiar(fDiaCorto.format(f)) + '</span><strong>' + fNum.format(f) + '</strong><span>' + limpiar(fMes.format(f)) + '</span>';
        b.addEventListener('click', function () { elegido.dia = i; elegido.turno = null; pintarDias(); pintarHoras(); actualizar(); });
        cDias.appendChild(b);
      });
    }
    function pintarHoras() {
      cHoras.innerHTML = '';
      dias[elegido.dia].turnos.forEach(function (iso) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'slots__time' + (iso === elegido.turno ? ' is-on' : '');
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', iso === elegido.turno ? 'true' : 'false');
        b.textContent = fHora.format(new Date(iso));
        b.addEventListener('click', function () { elegido.turno = iso; pintarHoras(); actualizar(); });
        cHoras.appendChild(b);
      });
    }
    function actualizar() {
      if (!elegido.turno) { boton.disabled = true; boton.textContent = 'Elegí un horario'; return; }
      var f = new Date(elegido.turno);
      boton.disabled = false;
      boton.textContent = 'Reservar el ' + fCorta.format(f) + ' a las ' + fHora.format(f);
    }
    boton.addEventListener('click', function () {
      if (!elegido.turno) return;
      boton.disabled = true;
      boton.textContent = 'Reservando…';
      err.textContent = '';
      fetch('/api/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ pago_id: pago, inicio: elegido.turno })
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, estado: r.status, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j.reserva) { confirmada(res.j.reserva); return; }
          err.textContent = (res.j && res.j.error) || 'No pudimos reservar el turno. Probá de nuevo.';
          if (res.estado === 409 || res.estado === 400) return cargar(); // ese horario se ocupó: refrescar
          actualizar();
        })
        .catch(function () { err.textContent = 'No pudimos reservar el turno. Probá de nuevo.'; actualizar(); });
    });

    pintarDias();
    pintarHoras();
    actualizar();
  }

  function cargar() {
    return fetch('/api/turnos', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (t) {
        if (!t.disponible) return respaldo();
        if (!t.dias.length) {
          text.textContent = 'En este momento no quedan horarios libres en las próximas semanas. Te escribimos por WhatsApp para coordinar.';
          agenda.hidden = true;
          action.hidden = true;
          return;
        }
        selector(t.dias);
      })
      .catch(respaldo);
  }

  if (estado === 'approved') {
    title.textContent = 'Listo, tu consulta está paga';
    text.textContent = 'Un momento, estamos cargando los horarios disponibles.';
    action.hidden = true;
    if (pago) { small.textContent = 'Número de pago: ' + pago; small.hidden = false; }
    if (!pago || !window.fetch) { respaldo(); }
    else {
      fetch('/api/reservar?pago_id=' + encodeURIComponent(pago), { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.reserva) confirmada(j.reserva); else cargar(); })
        .catch(cargar);
    }
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
