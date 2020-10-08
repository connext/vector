import { BaseLogger } from "pino";
import {
  AuthService,
  getRandomBytes32,
  getSignerAddressFromPublicIdentifier,
  recoverAddressFromChannelMessage,
} from "@connext/vector-utils";
import { MessagingConfig } from "@connext/vector-types";

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
    this.logger.debug(config, `Created messaging auth service`);

    this.defaultJWTAudience = this.config.messagingUrl as string;
    this.auth = new AuthService(
      this.logger.child({ module: "AuthService" }),
      this.defaultJWTAudience,
      this.config.privateKey!,
      this.config.publicKey!,
    );
  }

  public async getNonce(userIdentifier: string): Promise<string> {
    const nonce = getRandomBytes32();
    const expiry = Date.now() + nonceTTL;
    // currently storing nonces in memory
    this.nonces[userIdentifier] = { expiry, nonce };
    this.logger.debug({ userIdentifier, expiry, nonce, method: "getNonce" });
    return nonce;
  }

  public async verifyAndVend(signedNonce: string, userIdentifier: string, adminToken?: string): Promise<string> {
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

    // publish as "to.from.subject", respond to _INBOX
    const permissions = {
      publish: {
        allow: [`*.${userIdentifier}.>`, `_INBOX.>`],
      },
      subscribe: {
        allow: [`>`],
      },
    };

    const jwt = await this.vend(userIdentifier, nonceTTL, permissions);
    return jwt;
  }

  private async vendAdminToken(userIdentifier: string): Promise<string> {
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

  private vend(subject: string, ttl: number, permissions: any): Promise<string> {
    return this.auth.vendBearerJWT(subject, ttl, permissions);
  }

  private verify(bearerToken: string): boolean {
    return this.auth.verifyBearerJWT(bearerToken);
  }
}
