import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { errorSummary, json } from './http';
import { SESSION_ID_RE, summariseSession } from './order-summary';
import { getStripe, retrieveSessionWithItems } from './stripe-client';

const NOT_FOUND = { errors: ["We couldn't find that order."] };

export async function orderSummary(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const id = event.queryStringParameters?.session_id ?? '';
  if (!SESSION_ID_RE.test(id)) return json(400, { errors: ['Invalid order reference.'] });

  try {
    const stripe = await getStripe();
    const session = await retrieveSessionWithItems(stripe, id);
    const summary = summariseSession(session);
    return summary ? json(200, summary) : json(422, NOT_FOUND);
  } catch (err) {
    if ((err as { code?: string }).code === 'resource_missing') return json(422, NOT_FOUND);
    console.error('order_summary_failed:', errorSummary(err));
    return json(500, { errors: ["We couldn't load your order details."] });
  }
}
