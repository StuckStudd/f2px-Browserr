// Minimal static server for previewing website/ locally:  npm run site:serve  ->  http://localhost:8080
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', 'website')
const port = Number(process.env.PORT) || 8080
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.exe': 'application/octet-stream'
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    const file = path.resolve(root, '.' + (url.endsWith('/') ? url + 'index.html' : url))
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end('Forbidden')
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) return res.writeHead(404).end('Not found')
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size })
      fs.createReadStream(file).pipe(res)
    })
  })
  .listen(port, () => console.log(`F2PX site: http://localhost:${port}`))
