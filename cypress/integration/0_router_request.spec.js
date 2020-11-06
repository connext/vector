context("Channel Setup", () => {

  describe("Request", () => {

    it("Get Request from http://localhost:8002/config", () => {
      cy.request("http://localhost:8002/config").should(response => {
        console.log(response);
        expect(response.status, 'Get Request').to.eq(200);
        expect(response, 'headers as property').to.have.property("headers");
        expect(response, 'duration as property').to.have.property("duration");
        expect(response.body[0], 'publicIdentifier as property').to.have.property("publicIdentifier");
        expect(response.body[0].publicIdentifier, 'PublicIdentifier should be string').to.be.a("string");
        expect(response.body[0].publicIdentifier, 'indra as prefix in publicIdentifier').to.include("indra");
      });
    });

  });
});
