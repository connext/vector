import { TStringLiteral, Type } from "@sinclair/typebox";

import { UpdateType } from "../channel";
import {
  HashlockTransferResolverEncoding,
  HashlockTransferStateEncoding,
  WithdrawResolverEncoding,
  WithdrawStateEncoding,
} from "../transferDefinitions";

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
  withdrawAddress: Type.Optional(TAddress),
  hashlockTransferAddress: Type.Optional(TAddress),
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

// hashlock transfer pattern types
export const HashlockTransferStateSchema = Type.Object({
  balance: TBalance,
  lockHash: TBytes32,
  expiry: TIntegerString,
});
export const HashlockTransferResolverSchema = Type.Object({
  preImage: TBytes32,
});
export const HashlockTransferEncodingSchema = Type.Array([
  Type.Literal(HashlockTransferStateEncoding),
  Type.Literal(HashlockTransferResolverEncoding),
]);

// Withdraw transfer pattern types
export const WithdrawTransferStateSchema = Type.Object({
  balance: TBalance,
  initiatorSignature: TSignature,
  initiator: TAddress,
  responder: TAddress,
  data: TBytes32,
  nonce: TIntegerString,
  fee: TIntegerString,
});
export const WithdrawTransferResolverSchema = Type.Object({
  responderSignature: TSignature,
});
export const WithdrawTransferEncodingSchema = Type.Array([
  Type.Literal(WithdrawStateEncoding),
  Type.Literal(WithdrawResolverEncoding),
]);

// Shared transfer pattern types
export const TransferStateSchema = Type.Union([HashlockTransferStateSchema, WithdrawTransferStateSchema]);

export const TransferResolverSchema = Type.Union([HashlockTransferResolverSchema, WithdrawTransferResolverSchema]);

export const TransferEncodingSchema = Type.Union([HashlockTransferEncodingSchema, WithdrawTransferEncodingSchema]);

export const TFullTransferState = Type.Object({
  initialBalance: TBalance,
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
  transferResolver: TransferResolverSchema, // undefined iff not resolved
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
  transferDefinition: TAddress,
  transferTimeout: TIntegerString,
  transferInitialState: TransferStateSchema,
  transferEncodings: TransferEncodingSchema, // Initial state, resolver state
  merkleProofData: Type.Array(TBytes),
  merkleRoot: TBytes32,
  meta: TBasicMeta,
});

// Resolve update details
export const TResolveUpdateDetails = Type.Object({
  transferId: TBytes32,
  transferDefinition: TAddress,
  transferResolver: TransferResolverSchema,
  transferEncodings: TransferEncodingSchema, // Initial state, resolver state
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
