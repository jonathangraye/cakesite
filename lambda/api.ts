import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { checkout } from './checkout';
import { json } from './http';
import { orderSummary } from './order-api';

/** Entry point for the public API Lambda (checkout and order summary). */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  switch (event.routeKey) {
    case 'POST /api/checkout':
      return checkout(event);
    case 'GET /api/order':
      return orderSummary(event);
    default:
      return json(400, { errors: ['Unknown route.'] });
  }
}
