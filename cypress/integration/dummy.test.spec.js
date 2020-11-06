describe("parent", () => {
  beforeEach(() => {
    // alias the $btn.text() as 'text'
    cy.wrap('one').as('a')
  });

  it("has access to text", function() {
    this.a; // is now available
  });

  it("has access to text", () => {
    this.a; // is now available
  });
});
