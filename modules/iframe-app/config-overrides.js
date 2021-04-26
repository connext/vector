// WASM support inspired by https://stackoverflow.com/a/59720645

module.exports = function override(config, env) {
  const wasmExtensionRegExp = /\.wasm$/;

  config.resolve.extensions.push(".wasm");

  // make file-loader ignore WASM files
  config.module.rules.forEach((rule) => {
    (rule.oneOf || []).forEach((oneOf) => {
      if (oneOf.loader && oneOf.loader.indexOf("file-loader") >= 0) {
        oneOf.exclude.push(wasmExtensionRegExp);
      }
    });
  });

  // add a dedicated loader for WASM
  config.module.rules.push({
    test: wasmExtensionRegExp,

    // necessary to avoid "Module parse failed: magic header not detected" errors;
    // see https://github.com/pine/arraybuffer-loader/issues/12#issuecomment-390834140
    type: "javascript/auto",

    use: [{ loader: require.resolve("wasm-loader"), options: {} }],
  });

  return config;
};
