import my from "./utils";
const carolUrl = "http://localhost:8005"; // Node A
const daveUrl = "http://localhost:8006"; // Node B

const routerUrl = "http://localhost:8007";

context("GET Config", () => {
  describe("Request", () => {
    it("Get Request from Router", () => {
      my.getConfig(routerUrl);
    });

    it("GET Request from Node A: Carol", () => {
      my.getConfig(carolUrl);
    });

    it("GET Request from Node B: Dave", () => {
      my.getConfig(daveUrl);
    });
  });
});
