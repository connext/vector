import { IMessagingService } from "@connext/vector-types";

export class MockMessagingService implements IMessagingService {
  publish(subject: string, data: any): Promise<void> {
    throw new Error("Method not implemented.");
  }
  subscribe(subject: string, cb: (err: Error | null, data: any) => any): Promise<number> {
    throw new Error("Method not implemented.");
  }
  unsubscribe(sid: number): Promise<void> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  connect(natsUrl: string): Promise<void> {
    return Promise.resolve();
  }
  request(subject: string, timeout: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return Promise.resolve(data);
  }
}
