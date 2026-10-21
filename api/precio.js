'use strict';
const { precio } = require('./_mp');

module.exports = async (req, res) => {
  try {
    const p = await precio();
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.status(200).json({ usd: p.usd, ars: p.ars, casa: p.casa, fecha: p.fecha });
  } catch (e) {
    console.error('precio', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: 'Sin cotización' });
  }
};
