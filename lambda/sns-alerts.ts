import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import type { Alerts } from './webhook';

export function snsAlerts(topicArn: string): Alerts {
  const sns = new SNSClient({});
  return {
    async send(subject, message) {
      // SNS subjects must be ASCII and under 100 characters.
      const safeSubject = subject.replace(/[^\x20-\x7e]/g, '').slice(0, 99);
      await sns.send(new PublishCommand({ TopicArn: topicArn, Subject: safeSubject, Message: message }));
    },
  };
}
