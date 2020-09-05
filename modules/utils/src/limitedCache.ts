interface Node {
  next: Node | null;
  key: string;
}

/**
 * Caching class that limits is size to maxLength keys. A linked list
 * is used under-the-hood to keep track of the order of key insertion.
 * Keys are removed via a FIFO strategy.
 */
export class LimitedCache {
  public readonly maxLength: number;

  private length: number = 0;

  private head: Node | null = null;

  private tail: Node | null = null;

  private cache: { [k: string]: any } = {};

  constructor(maxLength: number) {
    this.maxLength = maxLength;
  }

  set<T>(k: string, v: T) {
    const exists = !!this.cache[k];
    this.cache[k] = v;
    if (exists) {
      return;
    }

    const node = {
      next: null,
      key: k,
    };

    if (!this.tail) {
      this.cache[k] = v;
      this.head = this.tail = node;
      this.length++;
      return;
    }

    this.tail.next = node;
    this.tail = node;
    if (this.length === this.maxLength) {
      const head = this.head!;
      delete this.cache[head.key];
      this.head = head.next!;
      return;
    }

    this.length++;
  }

  get<T>(k: string): T | null {
    const res = this.cache[k];
    if (!res) {
      return null;
    }
    return res;
  }
}
