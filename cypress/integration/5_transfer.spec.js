import my from "./utils";
import hr from "./http-request";

const carolUrl = "http://localhost:8005"; // Node A
const daveUrl = "http://localhost:8006"; // Node B

const router = "http://localhost:8007";
const transferEth = "0.005";

describe("Node setup", () => {
  beforeEach(() => {
    // hr.clearStore("http://localhost:3333/");
    cy.request(`${router}/config`).as("routerConfig");
    cy.request(`${carolUrl}/config`).as("serverConfig");
    cy.visit("/");

    cy.contains("Generate Random Mnemonic").click();
    cy.get("input")
      .invoke("val")
      .should(mnemonic => {
        expect(mnemonic).to.have.length.be.greaterThan(1);
      });
    cy.contains("Setup Node").click();
  });

  describe("Setup Channel", function() {
    it("make a deposit", function() {
      cy.get(
        "#deposit > .ant-row > .ant-col-18 > .ant-form-item-control-input > .ant-form-item-control-input-content > .ant-input-group-wrapper > .ant-input-wrapper > .ant-input",
      ).type(this.routerConfig.body[0].publicIdentifier);
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
      const channelAddress = my.getChannelAddress();
    //   hr.sendEth(channelAddress);
      my.transfer(transferEth, this.serverConfig.body[0].publicIdentifier)
    });
  });
});
