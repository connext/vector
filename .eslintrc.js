module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "plugin:@typescript-eslint/recommended",
    "prettier/@typescript-eslint",
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
  },
  rules: {
    "@typescript-eslint/no-empty-interface": ["off"],
    "comma-dangle": ["warn", "always-multiline"],
    "quotes": ["warn", "double", { "allowTemplateLiterals": true, "avoidEscape": true }],
    "semi": ["error", "always"],
    "@typescript-eslint/no-explicit-any": ["off"],
  },
};
