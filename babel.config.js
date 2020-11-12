module.exports = api => {
  const BABEL_ENV = api.env();
  const presets = {
    server: ['@babel/preset-env', '@babel/preset-react'],
    jest: [
      [
        '@babel/preset-env',
        {
          targets: {
            node: 'current',
          },
        },
      ],
      '@babel/preset-react',
    ],
  }[BABEL_ENV];

  const plugins = ['@babel/plugin-proposal-object-rest-spread'];

  api.cache.forever();

  return {
    presets,
    plugins,
  };
};
