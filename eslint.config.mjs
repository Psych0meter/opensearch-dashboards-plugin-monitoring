import typescriptParser from '@typescript-eslint/parser';
import js from '@eslint/js';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 2020,
      },
      globals: {
        NodeJS: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
    },
    rules: {
      '@typescript-eslint/no-empty-interface': ['warn'],
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
    },
  },
  {
    ignores: ['node_modules/', 'build/', 'dist/', 'target/'],
  },
];