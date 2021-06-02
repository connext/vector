// test specific config

type TestConfig = {
  numAgents: number;
  testDuration: number;
  maxConcurrency: number;
  queuedPayments: number;
  sugarDaddy: string;
};

const numAgents = parseInt(process.env.NUM_AGENTS ?? "3");
const testDuration = parseInt(process.env.TEST_DURATION ?? "90") * 1_000;
const maxConcurrency = parseInt(process.env.MAX_CONCURRENCY ?? "10");
const queuedPayments = parseInt(process.env.QUEUED_PAYMENTS ?? "25");
const sugarDaddy =
  process.env.SUGAR_DADDY ?? "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

export const config: TestConfig = {
  numAgents,
  testDuration,
  maxConcurrency,
  queuedPayments,
  sugarDaddy,
};

console.log("Running tests with config", config);
