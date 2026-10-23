/* Servidor local de la landing de Bernardo (no se publica: está en .vercelignore).
   node serve.js → http://localhost:4194
   Imita a Vercel: URLs sin .html (/gracias) y las funciones de /api con req.body ya parseado.
   Para que /api/checkout funcione, MP_ACCESS_TOKEN tiene que estar en el entorno
   (el perfil bernardo-landing del launch.json lo carga de ~/.config/bernardo-landing/mercadopago.env). */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || '4194', 10);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
};

function api(req, res, name) {
  const file = path.join(ROOT, 'api', name + '.js');
  if (name.split('/').some((p) => p.startsWith('_')) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', async () => {
    const type = String(req.headers['content-type'] || '');
    if (/json/.test(type)) { try { req.body = JSON.parse(raw || '{}'); } catch (e) { req.body = {}; } }
    else if (/urlencoded/.test(type)) req.body = Object.fromEntries(new URLSearchParams(raw));
    else req.body = raw;
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
    try {
      delete require.cache[require.resolve(file)];
      Object.keys(require.cache).filter((k) => k.startsWith(path.join(ROOT, 'api'))).forEach((k) => delete require.cache[k]);
      await require(file)(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) { res.statusCode = 500; res.end('error'); }
    }
  });
}

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  const m = /^\/api\/([\w-]+(?:\/[\w-]+)?)\/?$/.exec(urlPath);
  if (m) return api(req, res, m[1]);
  if (urlPath === '/') urlPath = '/index.html';
  let file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404</h1>');
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': st.size,
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, () => console.log(`Landing Bernardo en http://localhost:${PORT}`));
