describe("Channel Setup", () => {
  beforeEach(() => {
    cy.request("http://localhost:8007/config").as("response");
    cy.wrap("one").as("a");
    cy.visit("/");

    cy.contains("Generate Random Mnemonic").click();
    cy.get("input")
      .invoke("val")
      .should(mnemonic => {
        expect(mnemonic).to.have.length.be.greaterThan(1);
      });
    cy.contains("Setup Node").click();
  });

  it("Setting up channel", function() {
    // Check if Channel already exist for the node
    // if(cy.get('.ant-statistic-title').contains('Channel Address')){
    //   cy.get('.ant-col-8 > .ant-btn').click()
    // }
    cy.get(
      "#deposit > .ant-row > .ant-col-18 > .ant-form-item-control-input > .ant-form-item-control-input-content > .ant-input-group-wrapper > .ant-input-wrapper > .ant-input",
    ).type(this.response.body[0].publicIdentifier);
    cy.get(
      ":nth-child(5) > .ant-col-24 > #deposit > .ant-row > .ant-col-18 > .ant-form-item-control-input > .ant-form-item-control-input-content > .ant-input-group-wrapper > .ant-input-wrapper > .ant-input-group-addon > .ant-btn",
    ).click();
    cy.wait(5000);

    cy.get(".ant-statistic-content-value")
      .invoke("text")
      .should(channel_address => {
        expect(channel_address).to.have.length.be.greaterThan(1);

        expect(channel_address).to.be.a("string");
      });
  });

  // after(() => {
  //   // clean store once done with the test
  //   cy.get(".ant-col-8 > .ant-btn").click();
  // });
});
