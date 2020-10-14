const config = {
  adminToken: "cxt1234",
  domainName: "",
  production: false,
};

// "Output" config by printing it (will be read into ops/start-global.sh by jq)
console.log(JSON.stringify(config));
