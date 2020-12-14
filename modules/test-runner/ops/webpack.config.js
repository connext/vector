const path = require("path");

module.exports = {
  mode: "development",
  target: "node",

  entry: {
    duet: path.join(__dirname, "../src/duet/index.ts"),
    messaging: path.join(__dirname, "../src/messaging/index.ts"),
    node: path.join(__dirname, "../src/node/index.ts"),
    router: path.join(__dirname, "../src/router/index.ts"),
    trio: path.join(__dirname, "../src/trio/index.ts"),
  },

  externals: {
    hardhat: "commonjs2 hardhat",
    mocha: "commonjs2 mocha",
    sequelize: "commonjs2 sequelize",
    sqlite3: "commonjs2 sqlite3",
  },

  node: {
    __filename: false,
    __dirname: false,
  },

  resolve: {
    mainFields: ["main", "module"],
    extensions: [".js", ".ts", ".json"],
    symlinks: false,
  },

  output: {
    path: path.join(__dirname, "../dist"),
    filename: `[name].bundle.js`,
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
    ],
  },

  stats: { warnings: false },
};
