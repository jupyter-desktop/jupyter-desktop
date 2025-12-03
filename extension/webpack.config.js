const path = require("path");
const webpack = require("webpack");
const { ModuleFederationPlugin } = webpack.container;
const CopyPlugin = require("copy-webpack-plugin");
const fs = require("fs");

// Package name (must match package.json name)
const packageName = "jupyter-desktop";

// Read package.json to get peer dependencies versions
const packageJsonPath = path.resolve(__dirname, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const peerDependencies = packageJson.peerDependencies || {};

// Packages that are provided by JupyterLab at runtime
// These must NOT be bundled - they come from JupyterLab's shared scope
const sharedPackages = [
  "@jupyterlab/application",
  "@jupyterlab/apputils",
  "@jupyterlab/cells",
  "@jupyterlab/console",
  "@jupyterlab/coreutils",
  "@jupyterlab/docmanager",
  "@jupyterlab/docregistry",
  "@jupyterlab/launcher",
  "@jupyterlab/logconsole",
  "@jupyterlab/mainmenu",
  "@jupyterlab/notebook",
  "@jupyterlab/outputarea",
  "@jupyterlab/rendermime",
  "@jupyterlab/services",
  "@jupyterlab/settingregistry",
  "@jupyterlab/translation",
  "@jupyterlab/ui-components",
  "@lumino/coreutils",
  "@lumino/disposable",
  "@lumino/signaling",
  "@lumino/widgets",
  "@lumino/algorithm"
];

// Create shared configuration - import: false means don't bundle these
// singleton: true means these are singleton modules (only one instance)
// strictVersion: false allows version mismatches (JupyterLab will provide the version)
// requiredVersion: use peerDependencies version if available, otherwise false
const shared = {};
for (const pkg of sharedPackages) {
  const requiredVersion = peerDependencies[pkg] || false;
  shared[pkg] = {
    singleton: true,
    strictVersion: false,
    requiredVersion: requiredVersion,
    import: false,
    eager: false
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
