import fs from "fs";

export const isDirectory = async (path: string): Promise<boolean> => {
  try {
    return fs.statSync(path).isDirectory();
  } catch (e) {
    return false;
  }
};
