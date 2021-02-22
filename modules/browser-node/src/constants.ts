import { HashZero } from "@ethersproject/constants";

export const EIP712Domain = {
  name: "Vector",
  version: "1",
  salt: HashZero,
};

export const EIP712Types = {
  Greeting: [
    {
      name: "contents",
      type: "string",
    },
  ],
};

export const EIP712Value = {
  contents: "Welcome to Connext. Please confirm signature to sign in!",
};

export const NonEIP712Message = "Connext V1 Login";
