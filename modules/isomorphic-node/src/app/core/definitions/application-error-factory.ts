import { CustomError } from "./custom-error";
import { Err } from "./err";

export interface ApplicationErrorFactory {
  getError(name: string, data?: Err): CustomError;
}
