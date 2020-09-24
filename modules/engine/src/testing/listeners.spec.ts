import { IChannelSigner, IVectorProtocol } from "@connext/vector-types"
import { getRandomChannelSigner } from "@connext/vector-utils";
import { Evt } from "evt";

describe("listeners", () => {
    const vector: IVectorProtocol = Evt.create() as any

    describe("withdraw", () => {
        const signer: IChannelSigner = getRandomChannelSigner()

        
    })
})