import { SerializedQueue, SelfUpdate, OtherUpdate } from "../queue";
import { UpdateParams, UpdateType, Result } from "@connext/vector-types";
import { getNextNonceForUpdate } from "../utils";
import { expect } from "@connext/vector-utils";

type Nonce = number;

type Delayed = { __test_queue_delay__: number };
type DelayedSelfUpdate = SelfUpdate & Delayed;
type DelayedOtherUpdate = OtherUpdate & Delayed;

function sleepAsync(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class DelayedUpdater {
    readonly state: ['self' | 'other', Nonce][] = [];
    readonly isAlice: boolean;
    readonly initialNonce: number;

    reentrant = false;

    constructor(isAlice: boolean, initialNonce: Nonce) {
        this.isAlice = isAlice;
        this.initialNonce = initialNonce;
    }

    // Asserts that the function is not re-entrant with itself or other invocations.
    // This verifies the "Serialized" in "SerializedQueue".
    private async notReEntrant<T>(f: () => Promise<T>): Promise<T> {
        expect(this.reentrant).to.be.false;
        this.reentrant = true;
        let result = await f();
        expect(this.reentrant).to.be.true;
        this.reentrant = false;
        return result;
    }

    currentNonce(): Nonce {
        if (this.state.length == 0) {
            return -1;
        }
        return this.state[this.state.length - 1][1];
    }

    private isCancelledAsync(cancel: Promise<unknown>, delay: Delayed): Promise<boolean> {
        return Promise.race([
            (async () => { await sleepAsync(delay.__test_queue_delay__); return false; })(),
            (async () => { await cancel; return true; })()
        ])
    }

    selfUpdateAsync(value: SelfUpdate, cancel: Promise<unknown>): Promise<Result<void> | undefined> {
        return this.notReEntrant(async () => {
            if (await this.isCancelledAsync(cancel, value as DelayedSelfUpdate)) {
                return undefined;
            }
            let nonce = getNextNonceForUpdate(this.currentNonce(), this.isAlice);
            this.state.push(['self', nonce])
            return Result.ok(undefined)
        });
    }

    otherUpdateAsync(value: OtherUpdate, cancel: Promise<unknown>): Promise<Result<void> | undefined> {
        return this.notReEntrant(async () => {
            expect(value.nonce).to.be.eq(getNextNonceForUpdate(this.currentNonce(), !this.isAlice))

            if (await this.isCancelledAsync(cancel, value as DelayedOtherUpdate)) {
                return undefined;
            }

            this.state.push(['other', value.nonce])
            return Result.ok(undefined);
        });
    }
}

function setup(isAlice: boolean, initialNonce: number = -1): [DelayedUpdater, SerializedQueue] {
    let updater = new DelayedUpdater(isAlice, initialNonce);
    let queue = new SerializedQueue(
        isAlice,
        updater.selfUpdateAsync.bind(updater),
        updater.otherUpdateAsync.bind(updater),
        async () => updater.currentNonce()
    );
    return [updater, queue]
}

function selfUpdate(delay: number): DelayedSelfUpdate {
    const delayed: Delayed = {
        __test_queue_delay__: delay,
    };
    return delayed as unknown as DelayedSelfUpdate;
}

function otherUpdate(delay: number, nonce: number): DelayedOtherUpdate {
    const delayed: Delayed & { nonce: number } = {
        __test_queue_delay__: delay,
        nonce,
    };
    return delayed as unknown as DelayedOtherUpdate;
}

describe('Simple Updates', () => {
    it('Can update own when not interrupted and is leader', async () => {
        let [updater, queue] = setup(true);
        let result = await queue.executeSelfAsync(selfUpdate(10));
        expect(result?.isError).to.be.false;
        expect(updater.state).to.be.deep.equal([['self', 0]]);
    })
    it('Can update other when not interrupted and is not leader', async () => {
        let [updater, queue] = setup(true);
        let result = await queue.executeOtherAsync(otherUpdate(10, 1));
        expect(result?.isError).to.be.false;
        expect(updater.state).to.be.deep.equal([['other', 1]]);
    })
})