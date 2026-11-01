import http from 'node:http';

process.env.SITE_URL ??= 'http://localhost:4321';
const { handler: api } = await import('../lambda/dist/api/index.mjs');
const { handler: webhook } = await import('../lambda/dist/webhook/index.mjs');
const PORT = 8787;

const routes = {
  'POST /api/checkout': api,
  'GET /api/order': api,
  'POST /api/stripe/webhook': webhook,
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const routeKey = `${req.method} ${url.pathname}`;
    const handler = routes[routeKey];
    if (!handler) {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"errors":["Unknown route"]}');
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const result = await handler({
      routeKey,
      rawPath: url.pathname,
      queryStringParameters: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v)])),
      body,
      isBase64Encoded: false,
    });
    res.writeHead(result.statusCode, result.headers).end(result.body);
  })
  .listen(PORT, () => console.log(`Local API on http://localhost:${PORT} (run "npm run dev" in another terminal)`));
