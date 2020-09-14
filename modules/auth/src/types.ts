export type MessagingConfig = {
  clusterId?: string;
  messagingUrl: string | string[];
  options?: any;
  privateKey: string;
  publicKey: string;
  token?: string;
};

export type GenericErrorResponse = {
  message: string;
};

export type GenericSuccessResponse = {
  success: true;
};
