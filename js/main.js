(function () {
  'use strict';

  var CFG = window.BV || {};
  var KEY = 'bv-consulta';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function load() { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(d) { try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }

  /* recursos del podcast */
  var rec = document.querySelector('[data-recursos]');
  if (rec) {
    if (CFG.recursosUrl) rec.href = CFG.recursosUrl;
    else rec.addEventListener('click', function (e) { e.preventDefault(); });
  }

  var form = document.getElementById('quiz');
  if (!form) return;

  var steps = Array.prototype.slice.call(form.querySelectorAll('.step'));
  var bars = form.querySelectorAll('.quiz__bar span');
  var live = form.querySelector('[data-live]');
  var data = load();
  var current = 0;
  var busy = false;

  /* restaurar lo que ya escribió (vuelve de Mercado Pago, recarga, etc.) */
  ['dedicacion', 'tema', 'nombre', 'email', 'whatsapp'].forEach(function (k) {
    if (data[k] && form.elements[k]) form.elements[k].value = data[k];
  });
  if (data.decisiones) {
    var r = form.querySelector('input[name="decisiones"][value="' + data.decisiones + '"]');
    if (r) r.checked = true;
  }

  function firstIncomplete() {
    if (!data.dedicacion) return 0;
    if (!data.tema) return 1;
    if (!data.decisiones) return 2;
    return 3;
  }

  function paintBar(i) {
    for (var b = 0; b < bars.length; b++) bars[b].classList.toggle('is-done', b <= i);
  }

  function focusStep(el) {
    var target = el.querySelector('.field:not([type="hidden"])') || el.querySelector('input[type="radio"]') || el.querySelector('.step__q');
    if (!target) return;
    // en el celular no abrir el teclado solo; ahí basta con anunciar la pregunta
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (touch && target.classList.contains('field')) target = el.querySelector('.step__q');
    target.focus({ preventScroll: true });
  }

  function show(i, opts) {
    opts = opts || {};
    var prev = steps[current];
    var next = steps[i];
    if (!next) return;
    if (prev && prev !== next && !opts.instant) {
      prev.classList.remove('is-active');
      prev.classList.add('is-leaving');
      setTimeout(function () { prev.classList.remove('is-leaving'); }, reduce ? 0 : 140);
    } else if (prev && prev !== next) {
      prev.classList.remove('is-active');
    }
    var go = function () {
      next.classList.add('is-active');
      current = i;
      paintBar(i);
      if (live) live.textContent = 'Paso ' + (i + 1) + ' de ' + steps.length;
      if (!opts.noFocus) focusStep(next);
      if (i === 3) fetchPrice();
    };
    if (opts.instant || reduce || prev === next) go(); else setTimeout(go, 140);
  }

  function setErr(name, msg) {
    var p = form.querySelector('[data-err="' + name + '"]');
    if (p) p.textContent = msg || '';
    var f = form.elements[name];
    if (f && f.setAttribute && !f.length) {
      if (msg) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid');
    }
  }

  function val(name) {
    var f = form.elements[name];
    if (!f) return '';
    if (f.length && f[0] && f[0].type === 'radio') {
      for (var j = 0; j < f.length; j++) if (f[j].checked) return f[j].value;
      return '';
    }
    return (f.value || '').replace(/\s+/g, ' ').trim();
  }

  function check(i) {
    var ok = true;
    if (i === 0) {
      var d = val('dedicacion');
      setErr('dedicacion', d.length < 2 ? 'Contanos brevemente a qué te dedicás.' : '');
      ok = d.length >= 2;
    } else if (i === 1) {
      var t = val('tema');
      setErr('tema', t.length < 3 ? 'Escribí en una o dos líneas qué querés conversar.' : '');
      ok = t.length >= 3;
    } else if (i === 2) {
      ok = !!val('decisiones');
      setErr('decisiones', ok ? '' : 'Elegí una opción.');
    } else if (i === 3) {
      var n = val('nombre'), e = val('email'), w = val('whatsapp').replace(/[^\d]/g, '');
      var okN = n.length >= 3 && /[a-záéíóúñü]/i.test(n);
      var okE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
      var okW = w.length >= 8 && w.length <= 15;
      setErr('nombre', okN ? '' : 'Escribí tu nombre y apellido.');
      setErr('email', okE ? '' : 'Revisá el email.');
      setErr('whatsapp', okW ? '' : 'Escribí tu número con código de área.');
      ok = okN && okE && okW;
      if (!ok) {
        var bad = !okN ? 'nombre' : !okE ? 'email' : 'whatsapp';
        form.elements[bad].focus();
      }
    }
    return ok;
  }

  function persist() {
    ['dedicacion', 'tema', 'decisiones', 'nombre', 'email', 'whatsapp'].forEach(function (k) { data[k] = val(k); });
    save(data);
  }

  form.addEventListener('input', persist);

  form.addEventListener('click', function (e) {
    var t = e.target.closest('[data-next],[data-back]');
    if (!t) return;
    if (t.hasAttribute('data-back')) { show(Math.max(0, current - 1)); return; }
    if (check(current)) { persist(); show(current + 1); }
  });

  /* Enter avanza; en el texto largo, Shift+Enter hace salto de línea */
  form.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.isComposing) return;
    var el = e.target;
    if (current === 3) return; // en datos, Enter envía el formulario
    if (el.tagName === 'TEXTAREA' && e.shiftKey) return;
    if (el.classList && el.classList.contains('field')) {
      e.preventDefault();
      if (check(current)) { persist(); show(current + 1); }
    }
  });

  /* pregunta 3: elegir avanza solo, después de que se vea marcada */
  form.addEventListener('change', function (e) {
    if (e.target.name !== 'decisiones') return;
    setErr('decisiones', '');
    persist();
    setTimeout(function () { show(3); }, reduce ? 0 : 180);
  });

  /* precio en pesos del día */
  var priced = false;
  function fetchPrice() {
    if (priced || !window.fetch) return;
    priced = true;
    fetch('/api/precio').then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
      if (!p || !p.ars) return;
      var ars = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(p.ars);
      var note = form.querySelector('[data-precio]');
      var casa = p.casa === 'oficial' ? 'dólar oficial' : p.casa === 'bolsa' ? 'dólar MEP' : 'tipo de cambio';
      if (note) note.textContent = 'Hoy son $ ' + ars + ' (USD 200 al ' + casa + ' del día). Se paga con Mercado Pago.';
    }).catch(function () {});
  }

  /* envío: crea el pago y va a Mercado Pago */
  var submit = form.querySelector('[data-submit]');
  var label = form.querySelector('[data-label]');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    for (var i = 0; i < 3; i++) {
      if (!check(i)) { show(i); return; }
    }
    if (!check(3)) return;
    persist();
    busy = true;
    submit.disabled = true;
    label.textContent = 'Preparando el pago…';
    setErr('form', '');
    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        dedicacion: data.dedicacion, tema: data.tema, decisiones: data.decisiones,
        nombre: data.nombre, email: data.email, whatsapp: data.whatsapp
      })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      if (res.ok && res.j.url) {
        data.ref = res.j.ref;
        save(data);
        window.location.href = res.j.url;
        return;
      }
      throw new Error(res.j && res.j.error ? res.j.error : 'No pudimos iniciar el pago.');
    }).catch(function (err) {
      busy = false;
      submit.disabled = false;
      label.textContent = 'Ir al pago';
      setErr('form', (err && err.message ? err.message : 'No pudimos iniciar el pago.') + ' Probá de nuevo en un momento.');
    });
  });

  /* botones "Reservar": llevan a la tarjeta y la dejan lista */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-cta]');
    if (!a) return;
    e.preventDefault();
    var y = form.getBoundingClientRect().top + window.scrollY - 24;
    window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
    setTimeout(function () { focusStep(steps[current]); }, reduce ? 0 : 450);
  });

  show(firstIncomplete(), { instant: true, noFocus: true });
})();
