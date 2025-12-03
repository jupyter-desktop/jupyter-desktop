// build.js
// webpack を使って JupyterLab 拡張をビルドするスクリプトです。
// 処理内容:
// 1. webpack と `webpack.config.js` を読み込む
// 2. webpack を実行してビルド
// 3. エラー時は表示して終了（`process.exit(1)`）
// 4. 成功時は結果を表示
const webpack = require("webpack");
const config = require("./webpack.config.js");

webpack(config, (err, stats) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  if (stats.hasErrors()) {
    console.error(stats.toString({ colors: true }));
    process.exit(1);
  }
  console.log(stats.toString({ colors: true }));
});

