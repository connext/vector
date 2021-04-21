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

// TODO: Slot in the real thing.
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

export class SerializedQueue {
  private readonly incomingSelf: WakingQueue<SelfUpdate, Result<void>> = new WakingQueue();
  private readonly incomingOther: WakingQueue<OtherUpdate, Result<void>> = new WakingQueue();

  constructor(
    private readonly selfIsAlice: boolean,
    private readonly selfUpdateAsync: Cancellable<SelfUpdate, void>,
    private readonly otherUpdateAsync: Cancellable<OtherUpdate, void>,
    private readonly getCurrentNonce: () => Promise<Nonce>,
  ) {
    this.processUpdatesAsync();
  }

  executeSelfAsync(update: SelfUpdate): Promise<Result<void>> {
    return this.incomingSelf.push(update);
  }

  executeOtherAsync(update: OtherUpdate): Promise<Result<void>> {
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

      if (selfPredictedNonce === otherPredictedNonce) {
        // TODO: handle this case, this shouldnt happen! this means
        // there is a nonce collision, should resolve with Result.fail
      }

      if (selfPredictedNonce > otherPredictedNonce) {
        // Our update has priority. If we have an update,
        // execute it without inturruption. Otherwise,
        // execute their update with inturruption
        if (self !== undefined) {
          await processOneUpdate(this.selfUpdateAsync, self, NeverCancel, this.incomingSelf);
        } else {
          await processOneUpdate(this.otherUpdateAsync, other!, selfPromise, this.incomingOther);
        }
      } else {
        // Their update has priority. Vice-versa from above
        if (other !== undefined) {
          // Out of order update received?
          // NOTE: this *may* not be an out of order update to be rejected,
          // instead it may be an update that must be synced. it is likely
          // that we should fall through and allow the otherUpdateAsync to
          // handle this case?
          if (otherPredictedNonce !== other.update.nonce) {
            // TODO: Should resolve with Result::Error?
            // What is Connext convention here?
            this.incomingOther.reject("Out of order update");
            continue;
          }

          await processOneUpdate(this.otherUpdateAsync, other, NeverCancel, this.incomingOther);
        } else {
          await processOneUpdate(this.selfUpdateAsync, self!, otherPromise, this.incomingSelf);
        }
      }
    }
  }
}
