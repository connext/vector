// test specific config

type TestConfig = {
  numAgents: number;
};

const numAgents = parseInt("3");

export const config: TestConfig = {
  numAgents,
};
