module.exports = {
  root: true,
  extends: ['airbnb', 'prettier'],
  parser: 'babel-eslint',
  plugins: ['prettier'],
  env: {
    browser: true,
  },
  settings: {
    'import/resolver': {
      node: {
        paths: ['src'],
      },
    },
  },
  rules: {
    'prettier/prettier': ['error'],
  },
};
