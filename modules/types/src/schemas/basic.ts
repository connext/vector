import { TStringLiteral, Type } from "@sinclair/typebox";

import { UpdateType } from "../channel";

////////////////////////////////////////
//////// Shared object/string types

// String pattern types
export const TAddress = Type.Pattern(/^0x[a-fA-F0-9]{40}$/);
export const TIntegerString = Type.Pattern(/^([0-9])*$/);
export const TDecimalString = Type.Pattern(/^[0-9]*\.?[0-9]*$/);
export const TPublicIdentifier = Type.Pattern(/^indra([a-zA-Z0-9]{50})$/);
export const TBytes32 = Type.Pattern(/^0x([a-fA-F0-9]{64})$/);
export const TBytes = Type.Pattern(/^0x([a-fA-F0-9])$/);
export const TSignature = Type.Pattern(/^0x([a-fA-F0-9]{130})$/);
export const TUrl = Type.String({ format: "uri" });

// Convenience types
export const TChainId = Type.Number({ minimum: 1 });

// Custom object pattern types
export const TBalance = Type.Object({
  to: Type.Array(TAddress),
  amount: Type.Array(TIntegerString),
});

export const TBasicMeta = Type.Optional(Type.Any());

export const TContractAddresses = Type.Object({
  channelFactoryAddress: TAddress,
  channelMastercopyAddress: TAddress,
  transferRegistryAddress: TAddress,
});

export const TNetworkContext = Type.Intersect([
  TContractAddresses,
  Type.Object({
    chainId: TChainId,
    providerUrl: TUrl,
  }),
]);

////////////////////////////////////////
//////// Transfer types
// NOTE: The schemas of the transfer states could be validated using the
// schema validation, however, it is validated using the onchain `create`
// and updated using `resolve` at the protocol layer, so there is no real
// risk to not validating these using the schema validation. Instead,
// use relaxed schema validation for all transfer types to make it easier
// to support generic transfer types (since no schemas have to be updated)
export const TransferStateSchema = Type.Any();
export const TransferResolverSchema = Type.Any();
export const TransferEncodingSchema = Type.Array(Type.String(), { maxItems: 2, minItems: 2, uniqueItems: true });
export const TransferNameSchema = Type.String();

export const TFullTransferState = Type.Object({
  balance: TBalance,
  assetId: TAddress,
  channelAddress: TAddress,
  transferId: TBytes32,
  transferDefinition: TAddress,
  transferTimeout: TIntegerString,
  initialStateHash: TBytes32,
  initiator: TAddress, // either alice or bob
  responder: TAddress, // either alice or bob
  channelFactoryAddress: TAddress, // networkContext?
  chainId: TChainId,
  transferEncodings: TransferEncodingSchema, // Initial state encoding, resolver encoding
  transferState: TransferStateSchema,
  transferResolver: Type.Optional(Type.Any()), // undefined iff not resolved
  meta: TBasicMeta,
});

////////////////////////////////////////
//////// Channel types

// Setup update details
export const TSetupUpdateDetails = Type.Object({
  timeout: TIntegerString,
  networkContext: TNetworkContext,
});

// Deposit update details
export const TDepositUpdateDetails = Type.Object({
  totalDepositedA: TIntegerString,
  totalDepositedB: TIntegerString,
});

// Create update details
export const TCreateUpdateDetails = Type.Object({
  transferId: TBytes32,
  balance: TBalance,
  transferDefinition: TAddress,
  transferTimeout: TIntegerString,
  transferInitialState: TransferStateSchema,
  merkleProofData: Type.Array(TBytes),
  merkleRoot: TBytes32,
  meta: TBasicMeta,
});

// Resolve update details
export const TResolveUpdateDetails = Type.Object({
  transferId: TBytes32,
  transferDefinition: TAddress,
  transferResolver: TransferResolverSchema,
  merkleRoot: TBytes32,
  meta: TBasicMeta,
});

// Shared channel types
export const TChannelUpdateDetails = Type.Union([
  TSetupUpdateDetails,
  TDepositUpdateDetails,
  TCreateUpdateDetails,
  TResolveUpdateDetails,
]);

export const TChannelUpdateType = Type.Union(
  Object.values(UpdateType).map(update => Type.Literal(update)) as [TStringLiteral<UpdateType>],
);

export const TChannelUpdate = Type.Object({
  channelAddress: TAddress,
  fromIdentifier: TPublicIdentifier,
  toIdentifier: TPublicIdentifier,
  type: TChannelUpdateType,
  nonce: Type.Number(),
  balance: TBalance,
  assetId: TAddress,
  details: TCreateUpdateDetails,
  aliceSignature: Type.Optional(TSignature),
  bobSignature: Type.Optional(TSignature),
});

export const TFullChannelState = Type.Object({
  assetIds: Type.Array(TAddress, { minItems: 1 }),
  balances: Type.Array(TBalance, { minItems: 1 }),
  channelAddress: TAddress,
  alice: TAddress,
  bob: TAddress,
  merkleRoot: TBytes,
  nonce: Type.Number(),
  processedDepositsA: Type.Array(TIntegerString),
  processedDepositsB: Type.Array(TIntegerString),
  timeout: TIntegerString,
  aliceIdentifier: TPublicIdentifier,
  bobIdentifier: TPublicIdentifier,
  latestUpdate: TChannelUpdate,
  networkContext: TNetworkContext,
});
