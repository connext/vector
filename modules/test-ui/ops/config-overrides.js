// Goal: add wasm support to a create-react-app
// Solution derived from: https://stackoverflow.com/a/61722010

const path = require("path");

module.exports = function override(config, env) {
  const wasmExtensionRegExp = /\.wasm$/;

  config.resolve.extensions.push(".wasm");

  // make sure the file-loader ignores WASM files
  config.module.rules.forEach((rule) => {
    (rule.oneOf || []).forEach((oneOf) => {
      if (oneOf.loader && oneOf.loader.indexOf("file-loader") >= 0) {
        oneOf.exclude.push(wasmExtensionRegExp);
      }
    });
  });

  // add new loader to handle WASM files
  config.module.rules.push({
    include: path.resolve(__dirname, "src"),
    test: wasmExtensionRegExp,
    type: "webassembly/experimental",
    use: [{ loader: require.resolve("wasm-loader"), options: {} }],
  });

  return config;
};
