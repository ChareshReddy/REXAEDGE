import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn'
    }
  },
  {
    ignores: ['node_modules/**', 'mock/**', 'schema/**']
  }
];
