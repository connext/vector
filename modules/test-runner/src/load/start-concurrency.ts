import { startServer } from "./helpers/setupServer";
import { concurrencyTest } from "./helpers/test";

startServer().then(async () => {
  await concurrencyTest();
});
