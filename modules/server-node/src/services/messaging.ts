import { IMessagingService } from "@connext/vector-types";
import { connect, Client, Subscription } from "ts-nats";

export class TempNatsMessagingService implements IMessagingService {
  private connection: Client | undefined;
  private subscriptions: Map<number, Subscription> = new Map<number, Subscription>();

  constructor(private readonly natsUrl: string) {}

  private assertConnected(): void {
    if (!this.connection) {
      throw new Error(`No connection detected, use connect() method`);
    }
  }

  async connect(): Promise<void> {
    this.connection = await connect({ servers: [this.natsUrl] });
  }

  async request(subject: string, timeout: number, data: any): Promise<any> {
    this.assertConnected();
    const response = await this.connection!.request(subject, timeout, data);
    return response?.data;
  }

  async publish(subject: string, data: any): Promise<void> {
    this.assertConnected();
    this.connection!.publish(subject, data);
  }

  async subscribe(subject: string, cb: (err: Error | null, data: any) => any): Promise<number> {
    this.assertConnected();
    const sub = await this.connection!.subscribe(subject, cb);
    this.subscriptions.set(sub.sid, sub);
    return sub.sid;
  }

  async unsubscribe(sid: number): Promise<void> {
    this.assertConnected();
    const sub = this.subscriptions.get(sid);
    sub?.unsubscribe();
  }
}
