import { IMessagingService } from "@connext/vector-types";
import { Evt } from "evt";

export class MemoryMessagingService implements IMessagingService {
  connect(natsUrl: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  request(subject: string, timeout: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new Error("Method not implemented.");
  }

  async publish(subject: string, data: any): Promise<void> {
    this.evt.post({ subject, data });
  }

  async subscribe(subject: string, callback: (err: Error | null, data: any) => void): Promise<number> {
    this.evt.pipe(({ subject: _subject }) => _subject === subject).attach(({ data }) => callback(null, data));
    return 0; // TODO: return id for unsubscribing
  }

  unsubscribe(sid: number): Promise<void> {
    throw new Error("Method not implemented.");
  }
  private readonly evt: Evt<{ subject: string; data: any }> = Evt.create<{ subject: string; data: any }>();
}
