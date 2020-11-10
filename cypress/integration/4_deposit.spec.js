import my from "./utils";
const depositEth = "0.05";
const withdrawEth = "0.005";
const address = "0x627306090abaB3A6e1400e9345bC60c78a8BEf57"

describe("Deposit", () => {
  beforeEach(() => {
    cy.request("http://localhost:8002/config").as("response");
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

  it("make a deposit", function() {
    // Check if Channel already exist for the node
    // if (cy.get(".ant-statistic-title").contains("Channel Address")) {
    //   cy.get(".ant-col-8 > .ant-btn").click();
    //   cy.reload(true)
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
    my.deposit(depositEth);


    // withdraw
    my.withdraw(withdrawEth, address);
   

  });

  // it("make a withdraw", function () {
    

  // });
  

  afterEach(() => {
    // clean store once done with the test
    cy.get(".ant-col-8 > .ant-btn").click();
  });
});
