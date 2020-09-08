import { IsomorphicNode } from "./app/app";
import { app } from "./frameworks/register";

export const createNode = async (): Promise<IsomorphicNode> => {
  return app.main;
};
