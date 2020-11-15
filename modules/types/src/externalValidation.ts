import { ChannelUpdate, FullChannelState, FullTransferState, UpdateParams, UpdateType } from "./channel";
import { Result } from "./error";

// This service is injected into the protocol via the higher
// level modules (i.e. router) to allow validation of updates
// against context that the lower level modules may not have.
// Examples:
// - server-node will only transfer supported assets
// - server-node will only accept up to xx in withdrawal fees
// - router will not resolve a transfer for the receiver IFF
//   the sender side payment has been cancelled
// etc.

// The `inbound` / `outbound` validation is separated to
// reduce latency of updates (since generating the update
// from params could involve onchain reads)

// NOTE: *ALL* of this validation will be performed under the
// channel lock. This means that the validate functions should
// not take longer than the lock timeout. Additionally, higher
// level services should perform any state-based validation
// within the outbound function (i.e. there is a class of race
// conditions where a user requests a valid update, something
// changes before the operation starts under lock, and the
// queued update is no longer valid)

export interface IExternalValidation {
  // This is called when you are *receiving* an update from your
  // counterparty
  validateInbound<T extends UpdateType = any>(
    update: ChannelUpdate<T>,
    state: FullChannelState | undefined,
    transfer?: FullTransferState,
  ): Promise<Result<void | Error>>;

  // This is called when you are *proposing* an update to
  // your conterparty, and validates the input params
  // before generating an update.
  validateOutbound<T extends UpdateType = any>(
    params: UpdateParams<T>,
    state: FullChannelState | undefined,
    transfer?: FullTransferState,
  ): Promise<Result<void | Error>>;
}
