
type TODO = any;
type Nonce = number;
import { UpdateParams, UpdateType } from "@connext/vector-types";


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
class Resolver {
    // @ts-ignore: This is assigned in the constructor 
    readonly resolve: (value: unknown) => void;

    isResolved: boolean = false;

    // @ts-ignore: This is assigned in the constructor
    readonly reject: (reason?: any) => void;

    readonly promise: Promise<void>;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            // @ts-ignore Assigning to readonly in constructor
            this.resolve = () => { this.isResolved = true; resolve() };
            // @ts-ignore Assigning to readonly in constructor
            this.reject = reject;
        });
    }
}

// TODO: Slot in the real thing.
export type SelfUpdate = {
    params: UpdateParams<UpdateType>,
};

export type OtherUpdate = {
    params: UpdateParams<UpdateType>,
    nonce: Nonce,
}

// Repeated wake-up promises.
class Waker {
    private current: Resolver | undefined;

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
        return this.current.promise
    }
}

class WakingQueue<T> {
    private readonly fifo: FifoQueue<[T, Resolver]> = new FifoQueue();
    private readonly waker: Waker = new Waker();

    peek(): T | undefined {
        return this.fifo.peek()?.[0];
    }

    // Pushes an item on the queue, returning a promise
    // that resolved when the item has been popped from the
    // queue (meaning it has been handled completely)
    push(value: T): Promise<void> {
        let resolver = new Resolver();
        this.fifo.push([value, resolver]);
        this.waker.wake();
        return resolver.promise;
    }

    // Returns a promise which resolves when there is
    // an item at the top of the queue.
    async peekAsync(): Promise<T> {
        while (true) {
            let peek = this.peek();
            if (peek !== undefined) {
                return peek
            }
            await this.waker.waitAsync()
        }
    }

    // Resolves the top item from the queue (removing it
    // and resolving the promise)
    resolve() {
        let item = this.fifo.pop()!;
        item[1].resolve(undefined);
    }

    reject() {
        let item = this.fifo.pop()!;
        item[1].reject(undefined);
    }
}

const NeverCancel: Promise<void> = new Promise((_resolve, _reject) => { });

function runSelfUpdateAsync(update: SelfUpdate, cancel: Promise<unknown>) {
    throw new Error("TODO runSelfUpdateAsync")
}

function runOtherUpdateAsync(update: OtherUpdate, cancel: Promise<unknown>) {
    throw new Error("TODO runOtherUpdateAsync")
}

export class Queue {
    private readonly incomingSelf: WakingQueue<SelfUpdate> = new WakingQueue();
    private readonly incomingOther: WakingQueue<OtherUpdate> = new WakingQueue();

    constructor() {
        this.processUpdatesAsync();
    }

    executeSelfAsync(update: SelfUpdate): Promise<void> {
        return this.incomingSelf.push(update);
    }

    executeOtherAsync(update: OtherUpdate): Promise<void> {
        return this.incomingOther.push(update)
    }

    private async processUpdatesAsync(): Promise<never> {
        while (true) {
            // Wait until there is at least one unit of work.
            let selfPromise = this.incomingSelf.peekAsync();
            let otherPromise = this.incomingOther.peekAsync();
            await Promise.race([selfPromise, otherPromise]);

            // Find out which completed (if both, we want to know, which is why we can't use the result of Promise.race)
            const self = this.incomingSelf.peek();
            const other = this.incomingOther.peek();

            // TODO: Get these from the incoming update and the current state.
            const selfPredictedNonce = 0; /* TODO: Calculate from current channel state */
            const otherPredictedNonce = 0; /* TODO: Calculate from current channel state */

            // Find out which case we are in, and execute that case.
            if (selfPredictedNonce > otherPredictedNonce) {
                // Our update has priority. If we have an update,
                // execute it without inturruption. Otherwise,
                // execute their update with inturruption
                if (self !== undefined) {
                    runSelfUpdateAsync(self, NeverCancel);
                } else {
                    runOtherUpdateAsync(other!, selfPromise);
                }
            } else {
                // Their update has priority. Vice-versa from above
                if (other !== undefined) {
                    // Out of order update received?
                    // TODO: Robust handling
                    if (otherPredictedNonce !== other.nonce) {
                        this.incomingOther.resolve()
                    }

                    runOtherUpdateAsync(other, NeverCancel)
                } else {
                    runSelfUpdateAsync(self!, otherPromise)
                }
            }
        }
    }
}