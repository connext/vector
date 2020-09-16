import { IMessagingService } from "@connext/vector-types";
import { Evt } from "evt";

export class MemoryMessagingService implements IMessagingService {
  private readonly evt: Evt<{ subject: string; data: any }> = Evt.create<{ subject: string; data: any }>();

  async connect(): Promise<void> {
    return;
  }

  async send(to: string, msg: any): Promise<void> {
    this.evt.post({ subject: to, data: msg });
  }

  async onReceive(subject: string, callback: (msg: any) => void): Promise<void> {
    this.evt
      .pipe(({ subject: _subject }) => _subject === subject)
      .attach(({ data }) => {
        callback(data);
      });
  }

  async subscribe(subject: string, callback: (data: any) => void): Promise<void> {
    this.evt.pipe(({ subject: _subject }) => _subject === subject).attach(({ data }) => callback(data));
  }

  request(subject: string, timeout: number, data: any): Promise<any> {
    throw new Error("Method not implemented.");
  }

  async publish(subject: string, data: any): Promise<void> {
    this.evt.post({ subject, data });
  }

  unsubscribe(subject: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
