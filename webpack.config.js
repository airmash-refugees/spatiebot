module.exports = {
  entry: './app.ts',
  output: {
    path: __dirname,
    filename: 'spatiebot.js'
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
  // optimization: { minimize: false}
}