import globals from 'globals'
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs'
import { configs, plugins } from 'eslint-config-airbnb-extended'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/'] },
  plugins.stylistic,
  plugins.importX,
  ...configs.base.typescript,
  ...tseslint.configs.recommended,
  comments.recommended,
  {
    name:            'rkv-signaling/language',
    languageOptions: {
      ecmaVersion:   'latest',
      sourceType:    'module',
      parserOptions: { ecmaVersion: 'latest' },
      globals:       { ...globals.browser, ...globals.node },
    },
  },
  {
    name:  'rkv-signaling/house-style',
    rules: {
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
      '@stylistic/arrow-parens':                             [
        'error',
        'as-needed',
        { requireForBlockBody: true },
      ],
      '@stylistic/function-call-spacing':    ['error', 'never'],
      '@stylistic/key-spacing':              ['error', { align: 'value' }],
      '@stylistic/max-len':                  ['error', { code: 100 }],
      '@stylistic/newline-per-chained-call': ['error', { ignoreChainWithDepth: 1 }],
      '@stylistic/semi':                     ['error', 'never'],
      'func-style':                          ['error', 'expression', { allowArrowFunctions: true }],
      'import-x/prefer-default-export':      'off',
      'no-param-reassign':                   'off',
      'no-use-before-define':                'off',
    },
  },
  {
    name:            'rkv-signaling/tests',
    files:           ['test/**/*.ts'],
    languageOptions: { globals: globals.vitest },
    rules:           {
      '@stylistic/max-len':                  'off',
      'import-x/no-extraneous-dependencies': 'off',
    },
  },
]
