import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { OrderRecord, OrderStatus } from './order-record';
import type { OrderStore } from './webhook';

export function dynamoStore(table: string): OrderStore {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });

  return {
    async createOrder(record) {
      try {
        await db.send(
          new PutCommand({ TableName: table, Item: record, ConditionExpression: 'attribute_not_exists(orderId)' }),
        );
        return true;
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) return false;
        throw err;
      }
    },

    async getOrder(orderId) {
      const res = await db.send(new GetCommand({ TableName: table, Key: { orderId }, ConsistentRead: true }));
      return (res.Item as OrderRecord | undefined) ?? null;
    },

    async markProcessed(orderId, at) {
      await db.send(
        new UpdateCommand({
          TableName: table,
          Key: { orderId },
          UpdateExpression: 'SET processedAt = :at, updatedAt = :at',
          ConditionExpression: 'attribute_exists(orderId)',
          ExpressionAttributeValues: { ':at': at.toISOString() },
        }),
      );
    },

    async updateStatus(orderId, status: OrderStatus, at) {
      await db.send(
        new UpdateCommand({
          TableName: table,
          Key: { orderId },
          UpdateExpression: 'SET #status = :status, updatedAt = :at',
          ConditionExpression: 'attribute_exists(orderId)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status, ':at': at.toISOString() },
        }),
      );
    },
  };
}
