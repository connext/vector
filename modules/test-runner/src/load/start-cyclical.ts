import { startServer } from "./helpers/setupServer";
import { cyclicalTransferTest } from "./helpers/test";

startServer().then(async () => {
  await cyclicalTransferTest();
});
