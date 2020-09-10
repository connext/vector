export interface IMessagingService {
  connect(natsUrl: string): Promise<void>;
  request(subject: string, timeout: number, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  publish(subject: string, data: any): Promise<void>;
  subscribe(subject: string, cb: (err: Error | null, data: any) => any): Promise<number>;
  unsubscribe(sid: number): Promise<void>;
}
