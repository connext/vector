context("Node Profile Creation", () => {
  beforeEach(() => {
    cy.clearCookies()
    cy.clearLocalStorage()
    cy.visit("/");

    cy.contains("Generate Random Mnemonic").click();
    cy.get("input")
      .invoke("val")
      .should(mnemonic => {
        expect(mnemonic).to.have.length.be.greaterThan(1);
      });
    cy.contains("Setup Node").click();
  });

    it("cy.random_mnemonic - click to create random mnemonic", () => {
      cy.contains("Generate Random Mnemonic").click();
      cy.get("input")
        .invoke("val")
        .should(mnemonic => {
          expect(mnemonic).to.have.length.be.greaterThan(1);
        });
    });

  context("Setup Node", () => {
    it("cy.setup_channel - click setup node", () => {
      cy.contains("Setup Node").click();
    });

    it("cy.public_identifier - check if public identifier is generated", () => {
      cy.get(
        ":nth-child(1) > .ant-list-item-meta > .ant-list-item-meta-content > .ant-list-item-meta-description",
      ).invoke("text")
      .should(mnemonic => {
        expect(mnemonic).to.have.length.be.greaterThan(1);

        expect(mnemonic).to.be.a("string");

        expect(mnemonic).to.include('indra')
      });
    });

    it("cy.signer_address - check if signer address is generated", () => {
      cy.get(":nth-child(2) > .ant-list-item-meta > .ant-list-item-meta-content > .ant-list-item-meta-description")
        .invoke("text")
        .should(address => {
          expect(address).to.have.length.be.greaterThan(1);

          expect(address).to.be.a("string");
        });
    });

    it("cy.drop_down - click show mnemonic", () => {
      cy.get(".ant-collapse-header").click();
      cy.get("p")
        .invoke("text")
        .should(mnemonic => {
          expect(mnemonic).to.have.length.be.greaterThan(1);
          //   expect(mnemonic).to.include('indra')
          expect(mnemonic).to.be.a("string");
        });
    });
  });
});
