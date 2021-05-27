import { startServer } from "./helpers/setupServer";
import { channelBandwidthTest } from "./helpers/test";

startServer().then(async () => {
  await channelBandwidthTest();
});
