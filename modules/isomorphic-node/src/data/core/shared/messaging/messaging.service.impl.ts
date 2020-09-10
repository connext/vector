import { connect, Client } from "ts-nats";

import { IMessagingService } from "../../../../core/shared/messaging/messaging.service";

export class TempNatsMessagingService implements IMessagingService {
  private connection: Client | undefined;

  private assertConnected(): void {
    if (!this.connection) {
      throw new Error(`No connection detected, use connect() method`);
    }
  }

  async connect(natsUrl: string): Promise<void> {
    this.connection = await connect({ servers: [natsUrl] });
  }

  async request(subject: string, timeout: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.assertConnected();
    const response = await this.connection?.request(subject, timeout, data);
    return response?.data;
  }
}
