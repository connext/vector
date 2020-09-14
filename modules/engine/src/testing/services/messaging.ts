import { IMessagingService } from "@connext/vector-types";
import { Evt } from "evt";

export class MemoryMessagingService implements IMessagingService {
  connect(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  send(to: string, msg: any): Promise<void> {
    throw new Error("Method not implemented.");
  }

  onReceive(subject: string, callback: (msg: any) => void): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async subscribe(subject: string, callback: (data: any) => void): Promise<void> {
    this.evt.pipe(({ subject: _subject }) => _subject === subject).attach(({ data }) => callback(data));
  }

  request(subject: string, timeout: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new Error("Method not implemented.");
  }

  async publish(subject: string, data: any): Promise<void> {
    this.evt.post({ subject, data });
  }

  unsubscribe(subject: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  private readonly evt: Evt<{ subject: string; data: any }> = Evt.create<{ subject: string; data: any }>();
}
