-- This is an empty migration.
CREATE OR REPLACE FUNCTION save_channel_and_transfer(
  channel_state JSONB,
  asset_ids TEXT[],
  latest_update JSONB,
  transfer_state JSONB
) RETURNS BOOLEAN AS $$
DECLARE
  iterator INTEGER := 0;
BEGIN

  -- First, save all channel fields that should only
  -- be saved once (i.e. not nonce, merkleRoot, assetIds)
  INSERT INTO "channel"(
    "channelAddress",
    "publicIdentifierA",
    "publicIdentifierB",
    "participantA",
    "participantB",
    "timeout",
    "channelFactoryAddress",
    "transferRegistryAddress",
    "chainId",
    "createdAt"
  ) VALUES (
    channel_state->>'channelAddress',
    channel_state->>'aliceIdentifier',
    channel_state->>'bobIdentifier',
    channel_state->>'alice',
    channel_state->>'bob',
    channel_state->>'timeout',
    channel_state->>'channelFactoryAddress',
    channel_state->>'transferRegistryAddress',
    channel_state->>'chainId',
    DEFAULT
  ) ON CONFLICT ("channelAddress") DO NOTHING;

  -- Update channel with all fields that could change
  UPDATE "channel"
  SET
    "nonce" = (channel_state->>'nonce')::INTEGER,
    "merkleRoot" = channel_state->>'merkleRoot',
    "assetIds" = array_to_string(asset_ids, ',')
  WHERE "channelAddress" = channel_state->>'channelAddress';

  -- Now, save all balance fields
  FOREACH a IN ARRAY asset_ids LOOP
    -- Create the alice inserts
    INSERT INTO "balance"(
      "participant",
      "assetId",
      "channelAddress"
    ) VALUES (
      channel_state->>'alice',
      a,
      channel_state->>'channelAddress'
    ) ON CONFLICT ON CONSTRAINT balance_pkey DO NOTHING;

    -- Create the alice updates
    UPDATE "balance"
    SET
      "to" = channel_state#>>'{balances,' || iterator || 'to,0}',
      "amount" = channel_state#>>'{balances,' || iterator || 'amount,0}',
      "processedDeposit" = channel_state#>>'{processedDepositsA,' || iterator || '}',
      "defundNonce" = channel_state#>>'{defundNonces,' || iterator || '}'
    WHERE 
      "channelAddress" = channel_state->>'channelAddress'
      AND "assetId" = a
      AND "participant" = channel_state->>'alice';

    -- Create the bob inserts
    INSERT INTO "balance"(
      "participant",
      "assetId",
      "channelAddress"
    ) VALUES (
      channel_state->>'bob',
      a,
      channel_state->>'channelAddress'
    ) ON CONFLICT ON CONSTRAINT balance_pkey DO NOTHING;

    -- Create the bob updates
    UPDATE "balance"
    SET
      "to" = channel_state#>>'{balances,' || iterator || 'to,1}',
      "amount" = channel_state#>>'{balances,' || iterator || 'amount,1}',
      "processedDeposit" = channel_state#>>'{processedDepositsB,' || iterator || '}',
      "defundNonce" = channel_state#>>'{defundNonces,' || iterator || '}'
    WHERE 
      "channelAddress" = channel_state->>'channelAddress'
      AND "assetId" = a
      AND "participant" = channel_state->>'bob';

    -- Increment iterator
    iterator := iterator + 1;
  END LOOP;

  -- Save all update fields that should be saved once
  -- TODO: is doing nothing on conflict correct here? should
  -- probably raise...? but what about restores?
  INSERT INTO "update"(
    "channelAddress",
    "channelAddressId",
    "createdAt",
    "nonce"
  ) VALUES (
    channel_state->>'channelAddress',
    channel_state->>'channelAddress',
    DEFAULT,
    (channel_state#>>'{latestUpdate,nonce}')::INTEGER
  ) ON CONFLICT ("id") DO NOTHING;

  -- Update update with all fields that could change
  UPDATE "update"
  SET
    "fromIdentifier" = channel_state#>>'{latestUpdate,fromIdentifier}',
    "toIdentifier" = channel_state#>>'{latestUpdate,toIdentifier}',
    "type" = channel_state#>>'{latestUpdate,type}',
    "amountA" = channel_state#>>'{latestUpdate,balance,amount,0}',
    "amountB" = channel_state#>>'{latestUpdate,balance,amount,1}',
    "toA" = channel_state#>>'{latestUpdate,balance,to,0}',
    "toB" = channel_state#>>'{latestUpdate,balance,to,1}',
    "assetId" = channel_state#>>'{latestUpdate,assetId}',
    "signatureA" = channel_state#>>'{latestUpdate,aliceSignature}',
    "signatureB" = channel_state#>>'{latestUpdate,bobSignature}',
    "totalDepositsAlice" = channel_state#>>'{latestUpdate,details,totalDepositsAlice}',
    "totalDepositsBob" = channel_state#>>'{latestUpdate,details,totalDepositsBob}',
    "transferAmountA" = channel_state#>>'{latestUpdate,details,balance,amount,0}',
    "transferAmountB" = channel_state#>>'{latestUpdate,details,balance,amount,1}',
    "transferToA" = channel_state#>>'{latestUpdate,details,balance,to,0}',
    "transferToB" = channel_state#>>'{latestUpdate,details,balance,to,1}',
    "transferId" = channel_state#>>'{latestUpdate,details,transferId}',
    "transferDefinition" = channel_state#>>'{latestUpdate,details,transferDefinition}',
    "transferTimeout" = channel_state#>>'{latestUpdate,details,transferTimeout}',
    "transferInitialState" = channel_state#>>'{latestUpdate,details,transferInitialState}',
    "transferEncodings" = array_to_string((channel_state#>>'{latestUpdate,details,transferEncodings}')::array, '$'),
    "meta" = channel_state#>>'{latestUpdate,details,meta}',
    "transferResolver" = channel_state#>>'{latestUpdate,details,transferResolver}',
    "merkleRoot" = channel_state#>>'{latestUpdate,details,merkleRoot}',
    "id" = channel_state#>>'{latestUpdate,id,id}',
    "idSignature" = channel_state#>>'{latestUpdate,id,signature}'
  WHERE
    "channelAddressId" = channel_state->>'channelAddress'
    AND "nonce" = (channel_state#>>'{latestUpdate,nonce}')::INTEGER;

  -- Save all transfer fields that should only be saved
  -- once
  IF channel_state#>>'{latestUpdate,type}' = "create"
  THEN

    INSERT INTO "transfer"(
      "transferId",
      "routingId",
      "channelNonce",
      "createdAt",
      "createUpdateChannelAddressId",
      "createUpdateNonce",
      "amountA",
      "amountB",
      "toA",
      "toB",
      "initialStateHash",
      "channelAddress",
      "channelAddressId"
    ) VALUES (
      transfer_state->>'transferId',
      transfer_state#>>'{meta,routingId}',
      transfer_state->>'channelNonce',
      DEFAULT,
      channel_state->>'channelAddress',
      channel_state#>>'{latestUpdate,nonce}',
      transfer_state#>>'{balance,amount,0}',
      transfer_state#>>'{balance,amount,1}',
      transfer_state#>>'{balance,to,0}',
      transfer_state#>>'{balance,to,1}',
      transfer_state->>'initialStateHash',
      transfer_state->>'channelAddress',
      transfer_state->>'channelAddress'
    );

  ELSIF channel_state#>>'{latestUpdate,type}' = "resolve"
  THEN

    UPDATE "transfer"
    SET
      "channelAddress" = NULL,
      "amountA" = transfer_state#>>'{balance,amount,0}',
      "amountB" = transfer_state#>>'{balance,amount,1}',
      "toA" = transfer_state#>>'{balance,to,0}',
      "toB" = transfer_state#>>'{balance,to,1}',
      "resolveUpdateChannelAddressId" = transfer_state->>'channelAddress',
      "resolveUpdateNonce" = (channel_state#>>'{latestUpdate,nonce}')::INTEGER
    WHERE "transferId" = transfer_id->>'transferId';

  END IF;

  RETURN TRUE;

END;
$$ LANGUAGE plpgsql;