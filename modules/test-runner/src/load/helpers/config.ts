// test specific config

type TestConfig = {
  numAgents: number;
};

const numAgents = parseInt(process.env.VECTOR_NUM_AGENTS ?? "3");

export const config: TestConfig = {
  numAgents,
};
