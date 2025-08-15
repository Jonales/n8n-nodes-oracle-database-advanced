//const { configs } = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // Objeto separado APENAS para ignores
  {
    ignores: [
      'dist/**',
      'node_modules/**', 
      'coverage/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/*.d.ts',
      '.tsbuildinfo'
    ]
  },
  // Configuração principal para arquivos TypeScript
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
        ...globals.jest
      }
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin')
    },
    rules: {
      'indent': 'off', // Temporariamente desabilitado
      'quotes': 'warn', // Warning ao invés de error
      'semi': 'warn',
      // ... outras regras como 'warn' ao invés de 'error'
      // Regras básicas de estilo
      'indent': ['error', 2],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'no-console': 'off',
      'prefer-const': 'error',
      
      // Desabilitar regras JS em favor das TypeScript equivalentes
      'no-unused-vars': 'off',
      'no-undef': 'off', // TypeScript já faz essa verificação
      
      // Regras TypeScript específicas
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      
      // Regras específicas para n8n nodes
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn'
    }
  },
    {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
      'no-console': 'off',
    },
  },

];
