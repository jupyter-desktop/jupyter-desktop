const path = require("path");
const webpack = require("webpack");
const { ModuleFederationPlugin } = webpack.container;
const CopyPlugin = require("copy-webpack-plugin");

// Package name (must match package.json name)
const packageName = "jupyterlab-angular-demo";

// Packages that are provided by JupyterLab at runtime
// These must NOT be bundled - they come from JupyterLab's shared scope
const sharedPackages = [
  "@jupyterlab/application",
  "@jupyterlab/apputils",
  "@jupyterlab/coreutils",
  "@jupyterlab/docmanager",
  "@jupyterlab/docregistry",
  "@jupyterlab/launcher",
  "@jupyterlab/notebook",
  "@jupyterlab/services",
  "@jupyterlab/ui-components",
  "@lumino/coreutils",
  "@lumino/disposable",
  "@lumino/signaling",
  "@lumino/widgets",
  "@lumino/algorithm"
];

// Create shared configuration - import: false means don't bundle these
const shared = {};
for (const pkg of sharedPackages) {
  shared[pkg] = {
    requiredVersion: false,
    import: false
  };
}

module.exports = {
  mode: "production",
  entry: {
    index: "./src/index.ts"
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "../dist/jupyter-desktop"),
    publicPath: "auto",
    clean: false
  },
  resolve: { 
    extensions: [".ts", ".tsx", ".js", ".jsx"]
  },
  module: { 
    rules: [ 
      { 
        test: /\.tsx?$/, 
        use: {
          loader: "ts-loader",
          options: {
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"]
      },
      {
        test: /\.svg$/,
        type: "asset/source"
      }
    ] 
  },
  plugins: [
    new ModuleFederationPlugin({
      name: packageName.replace(/-/g, "_"),
      library: { 
        type: "var", 
        name: ["_JUPYTERLAB", packageName] 
      },
      filename: "remoteEntry.js",
      exposes: {
        "./index": "./src/index.ts",
        "./extension": "./src/index.ts"
      },
      shared: shared
    }),
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, "dist/angular"),
          to: path.resolve(__dirname, "dist/angular"),
          noErrorOnMissing: true
        }
      ]
    })
  ],
  target: "web",
  devtool: "source-map",
  optimization: {
    minimize: false
  }
};
