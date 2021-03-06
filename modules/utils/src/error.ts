import { BaseLogger } from "pino";

export const logAxiosError = (
  logger: BaseLogger,
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  error: any,
  additionalContext = {},
  message = "Error sending request",
): void => {
  let errorObj: any = { message: error.message ?? message };
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    errorObj = {
      ...errorObj,
      data: error.response.data,
      status: error.response.status,
      headers: error.response.headers,
    };
  } else if (error.request) {
    // The request was made but no response was received
    // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
    // http.ClientRequest in node.js
    errorObj = { ...errorObj, request: "Error in request" };
  }
  logger.error({ ...errorObj, ...additionalContext, config: error.config }, message);
};
