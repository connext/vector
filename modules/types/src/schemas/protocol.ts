////////////////////////////////////////

import { Static, Type } from "@sinclair/typebox";

import { TPublicIdentifier, TIntegerString, TAddress } from "..";
import { TBytes32, TransferResolverSchema, TransferStateSchema } from "../schemas";

import { TBasicMeta, TSetupUpdateDetails } from "./basic";

////////////////////////////////////////
// Protocol API Parameter schemas

// The protocol takes in channel update parameters, and tries to execute
// the given update. It is fed these parameters by the Engine.

// Setup
const SetupProtocolParamsSchema = Type.Intersect([
  TSetupUpdateDetails,
  Type.Object({ counterpartyIdentifier: TPublicIdentifier, meta: TBasicMeta }),
]);

// Deposit
const DepositProtocolParamsSchema = Type.Object({
  channelAddress: TAddress,
  assetId: TAddress,
  meta: TBasicMeta,
});

// Create
const CreateProtocolParamsSchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
  transferDefinition: TAddress,
  transferInitialState: TransferStateSchema,
  timeout: TIntegerString,
  meta: TBasicMeta,
});

// Resolve
const ResolveProtocolParamsSchema = Type.Object({
  channelAddress: TAddress,
  transferId: TBytes32,
  transferResolver: TransferResolverSchema,
  meta: TBasicMeta,
});

// Namespace export
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ProtocolParams {
  export const SetupSchema = SetupProtocolParamsSchema;
  export type Setup = Static<typeof SetupProtocolParamsSchema>;
  export const DepositSchema = DepositProtocolParamsSchema;
  export type Deposit = Static<typeof DepositProtocolParamsSchema>;
  export const CreateSchema = CreateProtocolParamsSchema;
  export type Create = Static<typeof CreateProtocolParamsSchema>;
  export const ResolveSchema = ResolveProtocolParamsSchema;
  export type Resolve = Static<typeof ResolveProtocolParamsSchema>;
}
