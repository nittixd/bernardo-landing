/* Servidor estático mínimo de la landing de Bernardo.
   Local: node serve.js (puerto 4194).
   VPS: corre bajo pm2 con el PORT que se le asigne y Caddy le hace reverse proxy.
   Sirve video con soporte de Range (206): sin eso, Safari no reproduce. */
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
  '.webm': 'video/webm',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404</h1>');
    }
    const ext = path.extname(file);
    const type = MIME[ext] || 'application/octet-stream';
    const cache = (ext === '.html') ? 'no-cache' : 'public, max-age=604800';
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (isNaN(start) || start >= st.size) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + st.size });
        return res.end();
      }
      if (isNaN(end) || end >= st.size) end = st.size - 1;
      res.writeHead(206, {
        'Content-Type': type,
        'Cache-Control': cache,
        'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': cache,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, () => console.log(`Landing Bernardo en http://localhost:${PORT}`));
