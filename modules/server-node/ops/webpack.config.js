const CopyPlugin = require("copy-webpack-plugin");
const path = require("path");

module.exports = {
  mode: "development",
  target: "node",

  context: path.join(__dirname, ".."),

  entry: path.join(__dirname, "../src/index.ts"),

  externals: {
    ".prisma/client": "commonjs2 .prisma/client",
    "@prisma/client": "commonjs2 @prisma/client",
    "pg-native": "commonjs2 pg-native",
    sqlite3: "commonjs2 sqlite3",
  },

  node: {
    __filename: false,
    __dirname: false,
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

  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.join(__dirname, "../node_modules/@connext/vector-contracts/dist/pure-evm_bg.wasm"),
          to: path.join(__dirname, "../dist/pure-evm_bg.wasm"),
        },
        {
          from: path.join(__dirname, "../schema.prisma"),
          to: path.join(__dirname, "../dist/schema.prisma"),
        },
        {
          from: path.join(__dirname, "../src/generated"),
          to: path.join(__dirname, "../dist/generated"),
        },
      ],
    }),
  ],

  stats: { warnings: false },
};
