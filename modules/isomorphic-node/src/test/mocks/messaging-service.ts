import { IMessagingService } from "../../core/shared/messaging/messaging.service";

export class MockMessagingService implements IMessagingService {
  connect(natsUrl: string): Promise<void> {
    return Promise.resolve();
  }
  request(subject: string, timeout: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return Promise.resolve(data);
  }
}
