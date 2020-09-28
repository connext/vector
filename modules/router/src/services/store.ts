export interface IRouterStore {
  queueUpdate(type: string, params: any): Promise<void>;
}

export class RouterStore implements IRouterStore {
  async queueUpdate(type: string, params: any): Promise<void> {}
}
