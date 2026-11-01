import type { OrderRecord } from './order-record';
import type { Alerts, OrderStore } from './webhook';

/** Used by `npm run dev:api` when ORDERS_TABLE isn't set, so local webhooks don't touch AWS. */
export function memoryStore(): OrderStore {
  const orders = new Map<string, OrderRecord>();
  return {
    async createOrder(record) {
      if (orders.has(record.orderId)) return false;
      orders.set(record.orderId, record);
      console.log('[dev] order stored', record.orderId, record.addressCheck, record.items.length, 'items');
      return true;
    },
    async getOrder(id) {
      return orders.get(id) ?? null;
    },
    async markProcessed(id, at) {
      const o = orders.get(id);
      if (o) o.processedAt = at.toISOString();
    },
    async updateStatus(id, status, at) {
      const o = orders.get(id);
      if (!o) throw new Error(`Order ${id} not found`);
      o.status = status;
      o.updatedAt = at.toISOString();
    },
  };
}

export function consoleAlerts(): Alerts {
  return {
    async send(subject, message) {
      console.log(`[dev] alert: ${subject}\n${message}`);
    },
  };
}
