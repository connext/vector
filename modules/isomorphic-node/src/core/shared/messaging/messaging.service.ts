export interface IMessagingService {
  connect(natsUrl: string): Promise<void>;
  request(subject: string, timeout: number, data: Record<string, unknown>): Promise<Record<string, unknown>>;
}
