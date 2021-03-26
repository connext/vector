import { JsonRpcProvider, FallbackProvider } from "@ethersproject/providers";

export type ChainProviders = {
  [chainId: number]: string[]
};

export type HydratedProviders = {
  [chainId: number]: ChainProvider;
};

/* Represents an aggregate of providers for a particular chain. Leverages functionality from
*  @ethersproject/providers/FallbackProvider in order to fallback to other providers in the
*  event of failed requests.
*/
export class ChainProvider extends FallbackProvider {
    readonly chainId: number;
    readonly providerUrls: string[];

    constructor(chainId: number, providers: string[] | JsonRpcProvider[], stallTimeout?: number) {
      // We'll collect all the provider URLs as we hydrate each provider.
      var providerUrls: string[] = [];
      super(
        // Map the provider URLs into JsonRpcProviders 
        providers.map((provider: string | JsonRpcProvider, priority: number) => {
          const hydratedProvider = (typeof(provider) === "string") ? new JsonRpcProvider(provider, chainId) : provider;
          providerUrls.push(hydratedProvider.connection.url);
          return {
            provider: hydratedProvider,
            // Invert priority as higher values are used first.
            priority: -priority,
            // Timeout before also triggering the next provider; this does not stop
            // this provider and if its result comes back before a quorum is reached
            // it will be incorporated into the vote
            // - lower values will cause more network traffic but may result in a
            //   faster retult.
            // TODO: Should we have our own default timeout defined, as well as a config option for this?
            // Default timeout is written as either 2sec or .75sec (in @ethers-project/fallback-provider.ts):
            // config.stallTimeout = isCommunityResource(configOrProvider) ? 2000: 750;
            stallTimeout: stallTimeout
          }
        }),
        // Quorum stays at 1, since we only ever want to send reqs to 1 node at a time.
        1
      );
      this.chainId = chainId;
      this.providerUrls = providerUrls;
    }

    send(method: string, params: { [name: string]: any }): Promise<any> {
        return this.perform(method, params);
    }

}