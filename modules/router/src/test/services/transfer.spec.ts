describe.skip("transfer.ts", () => {
  describe("transferWithAutoCollateralization", () => {
    describe("should properly queue update", () => {
      it("should work", async () => {});
      it("should work if undercollateralized", async () => {});
    });
    describe("should work without queueing update", () => {
      it("should fail if requestCollateral fails", async () => {});
      it("should fail if conditionalTransfer fails", async () => {});
      it("should work", async () => {});
      it("should work if undercollateralized", async () => {});
    });
  });

  describe("cancelCreatedTransfer", () => {
    it("should fail without queueing if cannot get registry info", async () => {});
    it("should fail without queueing if cannot get registry.encodedCancel", async () => {});
    it("should fail without queueing if cannot get registry.resolverEncoding", async () => {});
    it("should work if resolveTransfer works", async () => {});
    it("should properly enqueue resolveTransfer updates", async () => {});
    it("should fail if store.queueUpdate fails", async () => {});
    it("should fail without enqueueing if resolveTransfer fails && enqueue = false", async () => {});
  });
});
