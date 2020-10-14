import { startServer } from "./setupServer";
import { concurrencyTest } from "./test";

startServer().then(async () => {
  await concurrencyTest();
});
