const mnemonic = process.env.INDRA_MNEMONIC;
if (!mnemonic) {
  throw new Error("INDRA_MNEMONIC is a required config item");
}

let chainProviders;
try {
  chainProviders = JSON.parse(process.env.INDRA_CHAIN_PROVIDERS!);
} catch (e) {
  throw new Error("INDRA_CHAIN_PROVIDERS is a required config item");
}
if (!chainProviders) {
  throw new Error("INDRA_CHAIN_PROVIDERS is a required config item");
}

export const config = {
  port: process.env.INDRA_PORT ?? 5040,
  mnemonic,
  chainProviders,
};
