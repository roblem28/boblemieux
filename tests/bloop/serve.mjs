// Local stand-in for Netlify, for tests/bloop/run.js: serves public/ and runs the real bloop-now function with
// @netlify/blobs swapped for an in-memory store.   node tests/bloop/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

const stub = 'data:text/javascript,' + encodeURIComponent(
  'const stores = (globalThis.__blobs ||= new Map());' +
  'export function getStore(o){ const name = typeof o === "string" ? o : o.name; if(!stores.has(name)) stores.set(name,new Map()); const m = stores.get(name);' +
  ' return { async setJSON(k,v){ m.set(k, JSON.stringify(v)); return {modified:true}; }, async get(k,opt){ const v = m.get(k); if(v===undefined) return null; return opt && opt.type==="json" ? JSON.parse(v) : v; } }; }');
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, next){ if (s === '@netlify/blobs') return { url: ${JSON.stringify(stub)}, shortCircuit: true }; return next(s, c); }`));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { default: handler } = await import(path.join(root, 'netlify/functions/bloop-now.mjs'));
const PORT = Number(process.argv[2] || 8765);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/.netlify/functions/bloop-now') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, String(v));
    const r = await handler(new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let file = path.join(root, 'public', decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(root, 'public'))) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<h1>Not found</h1>'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
}).listen(PORT, '127.0.0.1', () => console.log(`bloop test server on http://127.0.0.1:${PORT}/bloop/`));
