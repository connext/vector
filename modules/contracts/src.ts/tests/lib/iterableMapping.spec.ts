describe("LibIterableMapping.sol", () => {
  describe("stringEqual", () => {
    it.skip("should work", async () => {});
  });

  describe("isEmptyString", () => {
    it.skip("should work", async () => {});
  });

  describe("nameExists", () => {
    it.skip("should work", async () => {});
    it.skip("should return false if name is empty", async () => {});
    it.skip("should return false if contract.names is empty", async () => {});
    it.skip("should return false if name is not in contract.names", async () => {});
  });

  describe("length", () => {
    it.skip("should work", async () => {});
  });

  describe("getTransferDefinitionByName", () => {
    it.skip("should work", async () => {});
    it.skip("should fail if name is an empty string", async () => {});
    it.skip("should fail if name is not in contract.names", async () => {});
  });

  describe("getTransferDefinitionByIndex", () => {
    it.skip("should work", async () => {});
    // FIXME: should this be 0-indexed?
    it.skip("should fail if index > self.names.length", async () => {});
  });

  describe("getTransferDefinitions", () => {
    it.skip("should work", async () => {});
  });

  describe("addTransferDefinition", () => {
    it.skip("should work", async () => {});
    it.skip("should fail if name is an empty string", async () => {});
    it.skip("should fail if name is in contract.names", async () => {});
  });

  describe("removeTransferDefinition", () => {
    it.skip("should work", async () => {});
    it.skip("should fail if name is an empty string", async () => {});
    it.skip("should fail if name is not in contract.names", async () => {});
  });
});
