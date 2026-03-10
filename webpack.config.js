const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");

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
			// Handles image imports in TypeScript: import arrowUrl from './res/arrow.png'
			{
			test: /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i,
			type: "asset/resource",
			generator: {
				filename: "res/[name][ext]",
			},
			},
		],
		},
		plugins: [
		new HtmlWebpackPlugin({
			template: "./src/client/index.html",
			filename: "index.html",
		}),
		new CopyPlugin({
			patterns: [
			{ from: "src/client/res", to: "res" },
			],
		}),
		...(isDev
			? []
			: [new MiniCssExtractPlugin({ filename: "styles.[contenthash].css" })]),
		],
		devtool: isDev ? "inline-source-map" : false,
	};
};
