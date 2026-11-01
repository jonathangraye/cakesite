import http from 'node:http';

process.env.SITE_URL ??= 'http://localhost:4321';
const { handler } = await import('../lambda/dist/index.mjs');
const PORT = 8787;

http
  .createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/checkout') {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"errors":["Unknown route"]}');
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const result = await handler({ body, isBase64Encoded: false });
    res.writeHead(result.statusCode, result.headers).end(result.body);
  })
  .listen(PORT, () => console.log(`Checkout API on http://localhost:${PORT} (run "npm run dev" in another terminal)`));
