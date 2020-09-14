import { BaseLogger } from "pino";
import { AuthService } from "ts-natsutil";
import {
  getAddressError,
  getRandomBytes32,
  getSignerAddressFromPublicIdentifier,
  isValidPublicIdentifier,
  recoverAddressFromChannelMessage,
} from "@connext/vector-utils";

import { MessagingConfig } from "../types";

const nonceTTL = 24 * 60 * 60 * 1000; // 1 day

export class MessagingAuthService {
  private auth: AuthService;
  private defaultJWTAudience: string;
  private nonces: { [key: string]: { nonce: string; expiry: number } } = {};

  constructor(
    private readonly config: MessagingConfig,
    private readonly logger: BaseLogger,
    private readonly adminToken: string,
  ) {
    if (!this.config.privateKey || !this.config.publicKey) {
      throw new Error("messaging auth service requires configured keypair");
    }

    this.logger.debug(config, `Created messaging auth service`);

    this.defaultJWTAudience = this.config.messagingUrl as string;
    this.auth = new AuthService(
      this.logger.child({ module: "AuthService" }),
      this.defaultJWTAudience,
      this.config.privateKey,
      this.config.publicKey,
    );
  }

  async getNonce(userIdentifier: string): Promise<string> {
    const nonce = getRandomBytes32();
    const expiry = Date.now() + nonceTTL;
    // currently storing nonces in memory
    this.nonces[userIdentifier] = { expiry, nonce };
    this.logger.debug({ userIdentifier, expiry, nonce, method: "getNonce" });
    return nonce;
  }

  async verifyAndVend(signedNonce: string, userIdentifier: string, adminToken?: string): Promise<string> {
    if (adminToken === this.adminToken) {
      this.logger.warn(`Vending admin token to ${userIdentifier}`);
      return this.vendAdminToken(userIdentifier);
    }

    const address = getSignerAddressFromPublicIdentifier(userIdentifier);
    this.logger.debug(`Got address ${address} from userIdentifier ${userIdentifier}`);

    if (!this.nonces[userIdentifier]) {
      throw new Error(`User hasn't requested a nonce yet`);
    }

    const { nonce, expiry } = this.nonces[userIdentifier];
    const recovered = await recoverAddressFromChannelMessage(nonce, signedNonce);
    if (recovered !== address) {
      throw new Error(`Verification failed, expected ${address}, got ${recovered}`);
    }
    if (Date.now() > expiry) {
      throw new Error(`Verification failed... nonce expired for address: ${userIdentifier}`);
    }

    // Try to get latest published OR move everything under address route.
    const permissions = {
      publish: {
        allow: [`${userIdentifier}.>`],
      },
      subscribe: {
        allow: [`>`],
      },
      // response: {
      // TODO: consider some sane ttl to safeguard DDOS
      // },
    };

    const jwt = this.vend(userIdentifier, nonceTTL, permissions);
    return jwt;
  }

  async vendAdminToken(userIdentifier: string): Promise<string> {
    const permissions = {
      publish: {
        allow: [`>`],
      },
      subscribe: {
        allow: [`>`],
      },
    };

    const jwt = this.vend(userIdentifier, nonceTTL, permissions);
    return jwt;
  }

  parseAddress(callback: (address: string, data?: any) => any): any {
    return async (subject: string, data: any): Promise<string> => {
      // Get & validate address from subject
      const address = subject.split(".")[0]; // first item of subscription is address
      const addressError = getAddressError(address);
      if (addressError) {
        throw new Error(`Subject's first item isn't a valid address: ${addressError}`);
      }
      this.logger.debug(`Parsed address ${address}`);
      return callback(address, data);
    };
  }

  parseIdentifier(callback: (publicIdentifier: string, data?: any) => any): any {
    return async (subject: string, data: any): Promise<string> => {
      // Get & validate address from subject
      const identifier = subject.split(".")[0]; // first item of subscription is id
      if (!identifier || !isValidPublicIdentifier(identifier)) {
        throw new Error(`Subject's first item isn't a valid identifier: ${identifier}`);
      }
      this.logger.debug(`Parsed identifier ${identifier}`);
      return callback(identifier, data);
    };
  }

  // For clients sending requests of the form:
  //  `${clientIdentifier}.${nodeIdentifier}.${chainId}.channel.get`
  parseIdentifierAndChain(callback: (publicIdentifier: string, chainId: number, data?: any) => any): any {
    return async (subject: string, data: any): Promise<string> => {
      // Get & validate address from subject
      const [userIdentifier, nodeIdentifier, chainIdStr] = subject.split(".");
      const chainId = parseInt(chainIdStr, 10);
      if (!isValidPublicIdentifier(userIdentifier)) {
        throw new Error(`Subject's first item isn't a valid identifier: ${userIdentifier}`);
      }

      if (!isValidPublicIdentifier(nodeIdentifier)) {
        throw new Error(`Subject's second item isn't a valid identifier: ${userIdentifier}`);
      }

      this.logger.debug(`Parsed identifier ${userIdentifier}`);
      return callback(userIdentifier, chainId, data);
    };
  }

  parseLock(callback: any): any {
    return async (subject: string, data: any): Promise<string> => {
      const lockName = subject.split(".").pop(); // last item of subject is lockName

      // TODO need to validate that lockName is EITHER multisig OR [multisig, appIdentityHash]
      //      holding off on this right now because it will be *much* easier to iterate through
      //      all appIdentityHashs after our store refactor.

      // const address = subject.split(".")[0]; // first item of subscription is address
      // const channel = await this.channelRepo.findByUserPublicIdentifier(address);
      // if (lockName !== channel.multisigAddress || lockName !== ) {
      //   return this.badSubject(`Subject's last item isn't a valid lockName: ${subject}`);
      // }

      this.logger.debug(`Parsed lockName ${lockName}`);
      return callback(lockName, data);
    };
  }

  vend(subject: string, ttl: number, permissions: any): Promise<string> {
    return this.auth.vendBearerJWT(subject, ttl, permissions);
  }

  verify(bearerToken: string): boolean {
    return this.auth.verifyBearerJWT(bearerToken);
  }
}
