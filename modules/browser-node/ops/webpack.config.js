const path = require("path");

module.exports = {
  mode: "development",

  context: path.join(__dirname, ".."),

  entry: path.join(__dirname, "../src/index.ts"),

  node: {
    crypto: true,
    fs: "empty",
    net: "empty",
    express: "empty",
    tls: "empty",
  },

  resolve: {
    mainFields: ["main", "module"],
    extensions: [".js", ".wasm", ".ts", ".json"],
    symlinks: false,
  },

  output: {
    path: path.join(__dirname, "../dist"),
    filename: "bundle.js",
  },

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/env"],
          },
        },
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.join(__dirname, "../tsconfig.json"),
          },
        },
      },
      {
        test: /\.wasm$/,
        type: "javascript/auto",
        use: "wasm-loader",
      },
    ],
  },

  plugins: [],

  stats: { warnings: false },
};
