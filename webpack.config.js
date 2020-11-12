require('dotenv').config();
const path = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const NodemonPlugin = require('nodemon-webpack-plugin');

process.env.BABEL_ENV = 'server';

module.exports = (env, argv) => {
  const { mode } = argv || {};
  const IS_DEVELOPMENT = mode === 'development';

  return {
    entry: {
      app: ['@babel/polyfill', './src/app.js'],
    },
    target: 'node',
    externals: [
      nodeExternals({
        whitelist: [/\.(?!(?:jsx?|json)$).{1,5}$/i],
      }),
    ],
    resolve: {
      modules: ['node_modules', 'src'],
      extensions: ['.js', '.jsx'],
    },
    node: {
      __dirname: false,
    },
    module: {
      rules: [
        {
          /* ESLint Pre-processor */
          enforce: 'pre',
          test: /\.jsx?$/,
          exclude: [/node_modules/],
          use: [
            {
              loader: 'eslint-loader',
            },
          ],
        },
        {
          /* Babel Processor */
          test: /\.jsx?$/,
          exclude: [/node_modules/],
          use: [
            {
              loader: 'babel-loader',
              options: {
                cacheDirectory: true,
              },
            },
          ],
        },
        {
          /* Pug/HTML Processor */
          test: /\.pug$/,
          use: [{ loader: 'pug-loader' }],
        },
        {
          /* YAML Processor */
          test: /\.ya?ml$/,
          use: [{ loader: 'json-loader' }, { loader: 'yaml-loader' }],
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        __IS_CLIENT__: 'false',
      }),
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        openAnalyzer: false,
        reportFilename: path.join(__dirname, 'reports/bundle/server.html'),
      }),
    ].concat(
      IS_DEVELOPMENT
        ? [
            /* Development */
            new NodemonPlugin(),
          ]
        : []
    ),
  };
};
