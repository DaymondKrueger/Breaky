const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env, argv) => {
  const isDev = argv.mode === "development";

  return {
    entry: "./src/client/index.ts",
    output: {
      path: path.resolve(__dirname, "dist/client"),
      filename: "bundle.[contenthash].js",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"],
      alias: {
        "@shared": path.resolve(__dirname, "src/shared"),
        "@client": path.resolve(__dirname, "src/client"),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: "ts-loader",
              options: {
                configFile: "tsconfig.client.json",
              },
            },
          ],
          exclude: /node_modules/,
        },
        {
          test: /\.scss$/,
          use: [
            isDev ? "style-loader" : MiniCssExtractPlugin.loader,
            "css-loader",
            "sass-loader",
          ],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/client/index.html",
        filename: "index.html",
      }),
      ...(isDev
        ? []
        : [new MiniCssExtractPlugin({ filename: "styles.[contenthash].css" })]),
    ],
    devtool: isDev ? "inline-source-map" : false,
  };
};
