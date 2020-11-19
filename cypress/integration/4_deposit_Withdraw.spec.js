import my from "./utils";
const depositEth = "0.05";
const withdrawEth = "1";
const address = "0x627306090abaB3A6e1400e9345bC60c78a8BEf57";

context("Browser Node Setup", () => {
  beforeEach(() => {
    cy.log("Visit localhost:3333");
    cy.visit("/");

    cy.log("Clear IndexedDB");
    cy.contains("Clear Store").click();

    cy.log("Generate Random Mnemonic");
    cy.contains("Generate Random Mnemonic").click();
    cy.get("input")
      .invoke("val")
      .should(mnemonic => {
        expect(mnemonic).to.be.a("string");
        expect(mnemonic).to.have.length.be.greaterThan(1);
      });

    cy.log("Setup Node");
    cy.contains("Setup Node").click();
  });

  describe("Setting up Channel Address", function() {
    beforeEach(() => {
      cy.get(
        "#deposit > .ant-row > .ant-col-18 > .ant-form-item-control-input > .ant-form-item-control-input-content > .ant-input-group-wrapper > .ant-input-wrapper > .ant-input",
      ).as("channel_setup");

      cy.get(
        ":nth-child(5) > .ant-col-24 > #deposit > .ant-row > .ant-col-18 > .ant-form-item-control-input > .ant-form-item-control-input-content > .ant-input-group-wrapper > .ant-input-wrapper > .ant-input-group-addon > .ant-btn",
      ).as("setup");

      cy.log("GET Config");
      cy.request(`http://localhost:8007/config`).then(response => {
        const publicIdentifier = response.body[0].publicIdentifier;
        cy.get("@channel_setup").type(publicIdentifier);
      });

      cy.get("@setup").click();
      cy.wait(5000);

      cy.get(".ant-statistic-content-value")
        .invoke("text")
        .should(channel_address => {
          expect(channel_address).to.have.length.be.greaterThan(1);

          expect(channel_address).to.be.a("string");
        });
    });
    it("Make a deposit", function() {
      cy.log("Deposit to channel address");
      my.deposit(depositEth);
    });

    it("Make a withdraw", function() {
      cy.log("Deposit to your address");
      my.withdraw(withdrawEth, address);
    });
  });
});
