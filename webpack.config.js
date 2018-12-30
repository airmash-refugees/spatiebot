module.exports = {
  entry: {
    spatiebot: './src/app.ts',
    backgroundworker: './src/appworker.ts'
  },
  output: {
    path: __dirname,
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      { loader: 'ts-loader' }
    ]
  },
  // mode: "development",
  // optimization: { minimize: false },
  plugins: [{
    apply: (compiler) => {
      compiler.hooks.afterEmit.tap('AfterEmitPlugin', (compilation) => {
        // integrate the backgroundworker as base64 encoded data-url in the spatiebot

        const fs = require("fs");
        const backgroundworker = fs.readFileSync("./backgroundworker.js", "utf8");
        let buff = new Buffer(backgroundworker);  
        let base64data = buff.toString('base64');
        const workerBlobUrl = "data:text/javascript;base64," + base64data;

        let spatiebot = fs.readFileSync("./spatiebot.js", "utf8");
        spatiebot = spatiebot.replace(/__appworker__/, workerBlobUrl); 
        require("fs").writeFileSync("./spatiebot.js", spatiebot);
      });
    }
  }]
}