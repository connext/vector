context('Web Page Status', () => {

  beforeEach(() => {
    cy.visit('/')
  })

  it('Check status of web page', () => {
    cy.contains('Vector Browser Node')
  })
  
  it('cy.window() - get the global window object', () => {
    cy.window().should('have.property', 'top')
  })

  it('cy.document() - get the document object', () => {
    cy.document().should('have.property', 'charset').and('eq', 'UTF-8')
  })

  it('cy.input() - get the if the field for Mnemonic is empty', () => {
    cy.get('input').should('have.length', 1)
  })

  it('cy.random_mnemonic - click to create random mnemonic from generator', () => {
    cy.contains('Generate Random Mnemonic').click()
  })

})
