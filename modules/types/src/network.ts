import { JsonRpcProvider, FallbackProvider } from "@ethersproject/providers";

export type ChainProviders = {
  [chainId: number]: string[]
};

export type HydratedProviders = {
  [chainId: number]: ChainProvider;
};

interface Blah extends JsonRpcProvider {

}

/* Represents an aggregate of providers for a particular chain. Leverages functionality from
*  @ethersproject/providers/FallbackProvider in order to fallback to other providers in the
*  event of failed requests.
*/
export class ChainProvider {
    readonly chainId: number;
    readonly providerUrls: string[];
    readonly _provider: JsonRpcProvider | FallbackProvider;

    constructor(chainId: number, providers: string[] | JsonRpcProvider[], stallTimeout?: number) {
      // We'll collect all the provider URLs as we hydrate each provider.
      var providerUrls: string[] = [];
      if (providers.length > 1) {
        this._provider = new FallbackProvider(
          // Map the provider URLs into JsonRpcProviders 
          providers.map((provider: string | JsonRpcProvider, priority: number) => {
            const hydratedProvider = (typeof(provider) === "string") ? new JsonRpcProvider(provider, chainId) : provider;
            providerUrls.push(hydratedProvider.connection.url);
            return {
              provider: hydratedProvider,
              priority: priority,
              // Timeout before also triggering the next provider; this does not stop
              // this provider and if its result comes back before a quorum is reached
              // it will be incorporated into the vote
              // - lower values will cause more network traffic but may result in a
              //   faster retult.
              // TODO: Should we have our own default timeout defined, as well as a config option for this?
              // Default timeout is written as either 2sec or .75sec (in @ethers-project/fallback-provider.ts):
              // config.stallTimeout = isCommunityResource(configOrProvider) ? 2000: 750;
              stallTimeout,
              weight: 1
            }
          }),
          // Quorum stays at 1, since we only ever want to send reqs to 1 node at a time.
          1
        );
      } else if (providers.length === 1) {
        const provider = providers[0];
        this._provider = (typeof(provider) === "string") ? new JsonRpcProvider(provider, chainId) : provider;
      } else {
        throw new Error("At least one provider must be defined.")
      }

      this.chainId = chainId;
      this.providerUrls = providerUrls;
    }

    // send(method: string, params: { [name: string]: any }): Promise<any> {
      // return this.perform(method, params);
    // }

}