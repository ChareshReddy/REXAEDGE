import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '**/.temp_*/**'],
  },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        React: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
