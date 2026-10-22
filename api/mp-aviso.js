'use strict';
/* Webhook de Mercado Pago (notification_url de cada preferencia).
   No confía en lo que llega: con el id vuelve a pedir el pago a la API de Mercado Pago y,
   si está aprobado, le manda a Bernardo las respuestas que viajan en la metadata del pago.
   Siempre responde 200 rápido para que Mercado Pago no reintente de más. */
const { avisar, leerPago } = require('./_mp');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);

  const tipo = b.type || b.topic || q.type || q.topic || '';
  const id = (b.data && b.data.id) || q['data.id'] || (tipo === 'payment' ? q.id : '') || '';
  if (tipo !== 'payment' || !/^\d+$/.test(String(id))) return res.status(200).json({ ok: true, ignorado: true });

  try {
    const p = await leerPago(id);
    const m = p.metadata || {};
    if (p.status === 'approved' && String(p.external_reference || '').startsWith('bv-')) {
      await avisar({
        tipo: 'consulta',
        pago_id: String(p.id),
        estado: p.status,
        fecha: p.date_approved || p.date_created,
        monto: p.transaction_amount,
        moneda: p.currency_id,
        referencia: p.external_reference,
        nombre: m.nombre || '',
        email: m.email || (p.payer && p.payer.email) || '',
        whatsapp: m.whatsapp || '',
        dedicacion: m.dedicacion || '',
        tema: m.tema || '',
        decisiones: m.decisiones || '',
      });
    }
    console.log('mp-aviso', id, p.status);
  } catch (e) {
    console.error('mp-aviso', id, e && e.message);
  }
  return res.status(200).json({ ok: true });
};
