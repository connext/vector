import { Type, Static } from "@sinclair/typebox";

export const SetupInputSchema = Type.Object({
  counterpartyIdentifier: Type.String(), // TODO: pattern
  chainId: Type.Number({ minimum: 1 }),
  timeout: Type.String(),
});
export type SetupInput = Static<typeof SetupInputSchema>;

export const DepositInputSchema = Type.Object({
  channelAddress: Type.String(), // TODO: pattern
  amount: Type.String(),
  assetId: Type.String(),
});
export type DepositInput = Static<typeof DepositInputSchema>;
