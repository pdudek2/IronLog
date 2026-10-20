const js = require('@eslint/js')
const globals = require('globals')
const tseslint = require('typescript-eslint')
const reactHooks = require('eslint-plugin-react-hooks')
const { defineConfig, globalIgnores } = require('eslint/config')

module.exports = defineConfig([
  globalIgnores(['android', 'ios', '.expo', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
])
