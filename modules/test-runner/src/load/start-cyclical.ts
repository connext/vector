import { startServer } from "./setupServer";
import { cyclicalTransferTest } from "./test";

startServer().then(async () => {
  await cyclicalTransferTest();
});
