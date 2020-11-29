
// strings aliases: these function more as documentation for devs than checked types
export type ABIEncoding = string; // eg "tuple(address to, uint256 amount)"
export type Address = string; // aka HexString of length 42
export type AssetId = string; // aka Address of ERC20 token contract or AddressZero for ETH
export type Bytes32 = string; // aka HexString of length 66
export type DecString = string; // eg "3.14"
export type HexString = string; // eg "0xabc123" of arbitrary length
export type PublicIdentifier = string; // "vector" + base58(<publicKey>)
export type PublicKey = string; // aka HexString of length 132
export type PrivateKey = string; // aka Bytes32
export type SignatureString = string; // aka HexString of length 132
export type UrlString = string; // eg "<protocol>://<host>[:<port>]/<path>

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
