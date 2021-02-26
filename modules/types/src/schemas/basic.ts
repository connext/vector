import { Static, TLiteral, Type } from "@sinclair/typebox";

import { UpdateType } from "../channel";

////////////////////////////////////////
//////// Shared object/string types

// String pattern types
export const TAddress = Type.RegEx(/^0x[a-fA-F0-9]{40}$/);
export const TIntegerString = Type.RegEx(/^([0-9])*$/);
export const TDecimalString = Type.RegEx(/^[0-9]*\.?[0-9]*$/);
export const TPublicIdentifier = Type.RegEx(/^vector([a-zA-Z0-9]{50})$/);
export const TBytes32 = Type.RegEx(/^0x([a-fA-F0-9]{64})$/);
export const TBytes = Type.RegEx(/^0x([a-fA-F0-9])$/);
export const TSignature = Type.RegEx(/^0x([a-fA-F0-9]{130})$/);
export const TUrl = Type.String({ format: "uri" });

// Convenience types
export const TChainId = Type.Number({ minimum: 1 });

// Custom object pattern types
export const TBalance = Type.Object({
  to: Type.Array(TAddress),
  amount: Type.Array(TIntegerString),
});

export const TBasicMeta = Type.Optional(Type.Dict(Type.Any()));
export const TTransferMeta = Type.Intersect([
  Type.Object({
    createdAt: Type.Number(),
    resolvedAt: Type.Optional(Type.Number()),
  }),
  Type.Dict(Type.Any()),
]);

export const TContractAddresses = Type.Object({
  channelFactoryAddress: TAddress,
  transferRegistryAddress: TAddress,
});

export const TNetworkContext = Type.Intersect([
  TContractAddresses,
  Type.Object({
    chainId: TChainId,
  }),
]);

export const AllowedSwapSchema = Type.Object({
  fromChainId: TChainId,
  toChainId: TChainId,
  fromAssetId: TAddress,
  toAssetId: TAddress,
  priceType: Type.Union([Type.Literal("hardcoded")]),
  hardcodedRate: TDecimalString,
  rebalancerUrl: Type.Optional(Type.String({ format: "uri" })),
  rebalanceThresholdPct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  percentageFee: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  flatFee: Type.Optional(TIntegerString),
  gasSubsidyPercentage: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});
export type AllowedSwap = Static<typeof AllowedSwapSchema>;

////////////////////////////////////////
//////// Transfer types
// NOTE: The schemas of the transfer states could be validated using the
// schema validation, however, it is validated using the onchain `create`
// and updated using `resolve` at the protocol layer, so there is no real
// risk to not validating these using the schema validation. Instead,
// use relaxed schema validation for all transfer types to make it easier
// to support generic transfer types (since no schemas have to be updated)
export const TransferStateSchema = Type.Dict(Type.Any());
export const TransferResolverSchema = Type.Any(); //Type.Dict(Type.Any());
export const TransferEncodingSchema = Type.Array(Type.String(), { maxItems: 2, minItems: 2 });
export const TransferNameSchema = Type.String();

export const TFullTransferState = Type.Object({
  balance: TBalance,
  assetId: TAddress,
  channelAddress: TAddress,
  inDispute: Type.Boolean(),
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
  transferResolver: Type.Optional(TransferResolverSchema), // undefined iff not resolved
  meta: TTransferMeta,
  channelNonce: Type.Integer({ minimum: 1 }),
  initiatorIdentifier: TPublicIdentifier,
  responderIdentifier: TPublicIdentifier,
});

////////////////////////////////////////
//////// Channel types

// Setup update details
export const TSetupUpdateDetails = Type.Object({
  timeout: TIntegerString,
  networkContext: TNetworkContext,
  meta: TBasicMeta,
});

// Deposit update details
export const TDepositUpdateDetails = Type.Object({
  totalDepositsAlice: TIntegerString,
  totalDepositsBob: TIntegerString,
  meta: TBasicMeta,
});

// Create update details
export const TCreateUpdateDetails = Type.Object({
  transferId: TBytes32,
  balance: TBalance,
  transferDefinition: TAddress,
  transferTimeout: TIntegerString,
  transferInitialState: TransferStateSchema,
  transferEncodings: TransferEncodingSchema,
  merkleProofData: Type.Array(Type.String()),
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
  Object.values(UpdateType).map((update) => Type.Literal(update)) as [TLiteral<UpdateType>],
);

export const TChannelUpdate = Type.Object({
  channelAddress: TAddress,
  fromIdentifier: TPublicIdentifier,
  toIdentifier: TPublicIdentifier,
  type: TChannelUpdateType,
  nonce: Type.Number(),
  balance: TBalance,
  assetId: TAddress,
  details: Type.Dict(Type.Any()), // specific detail structure asserted in validation
  aliceSignature: Type.Optional(Type.Union([TSignature, Type.Null()])), //Type.Optional(TSignature),
  bobSignature: Type.Optional(Type.Union([TSignature, Type.Null()])),
});
export type TChannelUpdate = Static<typeof TChannelUpdate>;

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
  defundNonces: Type.Array(TIntegerString),
  inDispute: Type.Boolean(),
});

export type TFullChannelState = Static<typeof TFullChannelState>;

// Quote schemas
export const TransferQuoteSchema = Type.Object({
  routerIdentifier: TPublicIdentifier,
  amount: TIntegerString,
  assetId: TAddress,
  chainId: TChainId,
  recipient: TPublicIdentifier,
  recipientChainId: TChainId,
  recipientAssetId: TAddress,
  fee: TIntegerString,
  expiry: TIntegerString,
  signature: Type.Optional(TSignature),
});
export type TransferQuote = Static<typeof TransferQuoteSchema>;

export const WithdrawalQuoteSchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
  fee: TIntegerString,
  expiry: TIntegerString,
  signature: Type.Optional(TSignature),
});
export type WithdrawalQuote = Static<typeof WithdrawalQuoteSchema>;
