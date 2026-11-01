import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

// Never return 403/404: CloudFront swaps those for the site's 404 page.
export function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

/** A log-safe description of an error: type, code and message, never request data. */
export function errorSummary(err: unknown): string {
  const e = err as { type?: string; name?: string; code?: string; message?: string; detail?: { code?: string } };
  return [e.type ?? e.name ?? 'Error', e.code ?? e.detail?.code, e.message ?? String(err)].filter(Boolean).join(' ');
}
