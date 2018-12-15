const CleanWebpackPlugin = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './app.ts',
  plugins: [
    //new CleanWebpackPlugin(['public/build'])
  ],
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
  }
}