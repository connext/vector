import { UpdateParams, UpdateType, Result, ChannelUpdate } from "@connext/vector-types";
import { getNextNonceForUpdate } from "./utils";

type Nonce = number;

// A node for FifoQueue<T>
class FifoNode<T> {
  prev: FifoNode<T> | undefined;
  value: T;
  constructor(value: T) {
    this.value = value;
  }
}

// A very simple FifoQueue.
// After looking at a couple unsatisfactory npm
// dependencies it seemed easier to just write this. :/
class FifoQueue<T> {
  head: FifoNode<T> | undefined;
  tail: FifoNode<T> | undefined;

  push(value: T) {
    const node = new FifoNode(value);
    if (this.head === undefined) {
      this.head = node;
      this.tail = node;
    } else {
      this.tail!.prev = node;
      this.tail = node;
    }
  }

  peek(): T | undefined {
    if (this.head === undefined) {
      return undefined;
    }
    return this.head.value;
  }

  pop(): T | undefined {
    if (this.head === undefined) {
      return undefined;
    }
    const value = this.head.value;
    this.head = this.head.prev;
    if (this.head === undefined) {
      this.tail = undefined;
    }
    return value;
  }
}

// A manually resolvable promise.
// When using this, be aware of "throw-safety".
class Resolver<O> {
  // @ts-ignore: This is assigned in the constructor
  readonly resolve: (value: O) => void;

  isResolved: boolean = false;

  // @ts-ignore: This is assigned in the constructor
  readonly reject: (reason?: any) => void;

  readonly promise: Promise<O>;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      // @ts-ignore Assigning to readonly in constructor
      this.resolve = (output: O) => {
        this.isResolved = true;
        resolve(output);
      };
      // @ts-ignore Assigning to readonly in constructor
      this.reject = reject;
    });
  }
}

export type SelfUpdate = {
  params: UpdateParams<UpdateType>;
};

export type OtherUpdate = {
  update: ChannelUpdate<UpdateType>;
  previous: ChannelUpdate<UpdateType>;
  inbox: string;
};

// Repeated wake-up promises.
class Waker {
  private current: Resolver<void> | undefined;

  // Wakes up all promises from previous
  // calls to waitAsync()
  wake() {
    let current = this.current;
    if (current) {
      this.current = undefined;
      current.resolve(undefined);
    }
  }

  // Wait until the next call to wake()
  waitAsync(): Promise<void> {
    if (this.current === undefined) {
      this.current = new Resolver();
    }
    return this.current.promise;
  }
}

class WakingQueue<I, O> {
  private readonly fifo: FifoQueue<[I, Resolver<O>]> = new FifoQueue();
  private readonly waker: Waker = new Waker();

  peek(): I | undefined {
    return this.fifo.peek()?.[0];
  }

  // Pushes an item on the queue, returning a promise
  // that resolved when the item has been popped from the
  // queue (meaning it has been handled completely)
  push(value: I): Promise<O> {
    let resolver = new Resolver<O>();
    this.fifo.push([value, resolver]);
    this.waker.wake();
    return resolver.promise;
  }

  // Returns a promise which resolves when there is
  // an item at the top of the queue.
  async peekAsync(): Promise<I> {
    while (true) {
      let peek = this.peek();
      if (peek !== undefined) {
        return peek;
      }
      await this.waker.waitAsync();
    }
  }

  // Resolves the top item from the queue (removing it
  // and resolving the promise)
  resolve(output: O) {
    let item = this.fifo.pop()!;
    item[1].resolve(output);
  }

  reject(error: any) {
    let item = this.fifo.pop()!;
    item[1].reject(error);
  }
}

const NeverCancel: Promise<never> = new Promise((_resolve, _reject) => {});

// If the Promise resolves to undefined it has been cancelled.
export type Cancellable<I, O> = (value: I, cancel: Promise<unknown>) => Promise<Result<O> | undefined>;

// Infallibly process an update.
// If the function fails, this rejects the queue.
// If the function cancels, this ignores the queue.
// If the function succeeds, this resolves the queue.
async function processOneUpdate<I, O>(
  f: Cancellable<I, O>,
  value: I,
  cancel: Promise<unknown>,
  queue: WakingQueue<I, Result<O>>,
): Promise<Result<O> | undefined> {
  let result;
  try {
    result = await f(value, cancel);
  } catch (e) {
    queue.reject(e);
  }

  // If not cancelled, resolve.
  if (result !== undefined) {
    queue.resolve(result);
  }

  return result;
}

export class SerializedQueue<S = void, O = void> {
  private readonly incomingSelf: WakingQueue<SelfUpdate, Result<S>> = new WakingQueue();
  private readonly incomingOther: WakingQueue<OtherUpdate, Result<O>> = new WakingQueue();
  private readonly selfIsAlice: boolean;

  private readonly selfUpdateAsync: Cancellable<SelfUpdate, S>;
  private readonly otherUpdateAsync: Cancellable<OtherUpdate, O>;
  private readonly getCurrentNonce: () => Promise<Nonce>;

  constructor(
    selfIsAlice: boolean,
    selfUpdateAsync: Cancellable<SelfUpdate, S>,
    otherUpdateAsync: Cancellable<OtherUpdate, O>,
    getCurrentNonce: () => Promise<Nonce>,
  ) {
    this.selfIsAlice = selfIsAlice;
    this.selfUpdateAsync = selfUpdateAsync;
    this.otherUpdateAsync = otherUpdateAsync;
    this.getCurrentNonce = getCurrentNonce;
    this.processUpdatesAsync();
  }

  executeSelfAsync(update: SelfUpdate): Promise<Result<S>> {
    return this.incomingSelf.push(update);
  }

  executeOtherAsync(update: OtherUpdate): Promise<Result<O>> {
    return this.incomingOther.push(update);
  }

  private async processUpdatesAsync(): Promise<never> {
    while (true) {
      // Wait until there is at least one unit of work.
      let selfPromise = this.incomingSelf.peekAsync();
      let otherPromise = this.incomingOther.peekAsync();
      await Promise.race([selfPromise, otherPromise]);

      // Find out which completed. If both, we want to know that, too.
      // For this reason we can't use the result of Promise.race from above.
      const self = this.incomingSelf.peek();
      const other = this.incomingOther.peek();

      const currentNonce = await this.getCurrentNonce();
      const selfPredictedNonce = getNextNonceForUpdate(currentNonce, this.selfIsAlice);
      const otherPredictedNonce = getNextNonceForUpdate(currentNonce, !this.selfIsAlice);

      if (selfPredictedNonce > otherPredictedNonce) {
        // Our update has priority. If we have an update,
        // execute it without interruption. Otherwise,
        // execute their update with interruption
        if (self !== undefined) {
          await processOneUpdate(this.selfUpdateAsync, self, NeverCancel, this.incomingSelf);
        } else {
          // TODO: In the case that our update cancels theirs, we already know their
          // update will fail because it doesn't include ours (unless they reject our update)
          // So, this may end up falling back to the sync protocol unnecessarily when we
          // try to execute their update after ours. For robustness sake, it's probably
          // best to leave this as-is and optimize that case later.
          await processOneUpdate(this.otherUpdateAsync, other!, selfPromise, this.incomingOther);
        }
      } else {
        // Their update has priority. Vice-versa from above
        if (other !== undefined) {
          await processOneUpdate(this.otherUpdateAsync, other, NeverCancel, this.incomingOther);
        } else {
          await processOneUpdate(this.selfUpdateAsync, self!, otherPromise, this.incomingSelf);
        }
      }
    }
  }
}
