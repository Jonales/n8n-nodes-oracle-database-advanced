const {
  fixupPluginRules,
  fixupConfigRules,
} = require('@eslint/compat');
const {
  FlatCompat,
} = require('@eslint/eslintrc');
const js = require('@eslint/js');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const {
  defineConfig,
  globalIgnores,
} = require('eslint/config');
const _import = require('eslint-plugin-import');
const n8nNodesBase = require('eslint-plugin-n8n-nodes-base');
const prettier = require('eslint-plugin-prettier');
const globals = require('globals');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});

module.exports = defineConfig([{
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 'latest',
    sourceType: 'module',

    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: __dirname,
    },

    globals: {
      ...globals.node,
      ...globals.jest,
    },
  },

  plugins: {
    '@typescript-eslint': typescriptEslint,
    import: fixupPluginRules(_import),
    prettier,
    'n8n-nodes-base': n8nNodesBase,
  },

  extends: fixupConfigRules(compat.extends(
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:@typescript-eslint/strict',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:prettier/recommended',
  )),

  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },

      node: {
        extensions: ['.ts', '.js', '.json'],
      },
    },
  },

  rules: {
    'prettier/prettier': 'error',

    '@typescript-eslint/array-type': ['error', {
      default: 'array',
    }],

    '@typescript-eslint/ban-types': ['error', {
      extendDefaults: true,

      types: {
        Object: {
          message: 'Use {} em vez de \'Object\'.',
        },

        String: {
          message: 'Use \'string\' em vez de \'String\'.',
        },

        Number: {
          message: 'Use \'number\' em vez de \'Number\'.',
        },

        Boolean: {
          message: 'Use \'boolean\' em vez de \'Boolean\'.',
        },
      },
    }],

    '@typescript-eslint/consistent-type-assertions': ['error', {
      assertionStyle: 'as',
    }],

    '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    '@typescript-eslint/consistent-type-exports': 'error',

    '@typescript-eslint/consistent-type-imports': ['error', {
      prefer: 'type-imports',
    }],

    '@typescript-eslint/explicit-function-return-type': ['warn', {
      allowExpressions: true,
    }],

    '@typescript-eslint/explicit-member-accessibility': ['error', {
      accessibility: 'explicit',
    }],

    '@typescript-eslint/naming-convention': ['error', {
      selector: 'typeLike',
      format: ['PascalCase'],
    }, {
      selector: 'interface',
      format: ['PascalCase'],
      prefix: ['I'],
    }, {
      selector: 'typeAlias',
      format: ['PascalCase'],
    }, {
      selector: 'enum',
      format: ['PascalCase'],
    }, {
      selector: 'enumMember',
      format: ['UPPER_CASE'],
    }],

    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-inferrable-types': 'error',

    '@typescript-eslint/no-namespace': ['error', {
      allowDeclarations: true,
    }],

    '@typescript-eslint/no-unused-expressions': 'error',
    '@typescript-eslint/no-useless-constructor': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',

    '@typescript-eslint/triple-slash-reference': ['error', {
      path: 'never',
      types: 'never',
      lib: 'never',
    }],

    'arrow-body-style': ['error', 'as-needed'],
    'curly': ['error', 'multi-line'],
    'default-case': 'error',
    'eqeqeq': ['error', 'smart'],

    'func-style': ['error', 'expression', {
      allowArrowFunctions: true,
    }],

    'guard-for-in': 'error',
    'new-parens': 'error',
    'no-caller': 'error',
    'no-cond-assign': ['error', 'except-parens'],
    'no-debugger': 'error',
    'no-new-wrappers': 'error',
    'no-redeclare': 'error',
    'no-throw-literal': 'error',
    'no-var': 'error',
    'object-shorthand': ['error', 'always'],
    'prefer-arrow-callback': 'error',
    'prefer-const': 'error',
    'radix': 'error',
    'use-isnan': 'error',
    'import/no-default-export': 'error',

    'import/order': ['error', {
      groups: [
        'builtin',
        'external',
        'internal',
        ['parent', 'sibling', 'index'],
        'object',
        'type',
      ],

      'newlines-between': 'always',

      alphabetize: {
        order: 'asc',
        caseInsensitive: true,
      },
    }],

    'import/no-duplicates': 'error',
    'import/no-unresolved': 'error',
    'n8n-nodes-base/node-class-description-inputs-wrong-regular-count': 'error',
    'n8n-nodes-base/node-class-description-outputs-wrong-regular-count': 'error',
    'n8n-nodes-base/node-param-description-lowercase-first-char': 'warn',
    'n8n-nodes-base/node-param-display-name-lowercase-first-char': 'warn',
    'n8n-nodes-base/node-param-description-missing-final-period': 'warn',
    'n8n-nodes-base/node-param-display-name-miscased': 'warn',
    'no-useless-constructor': 'off',

    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
  },
}, {
  files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*.ts'],

  languageOptions: {
    globals: {
      ...globals.jest,
    },
  },

  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'import/no-default-export': 'off',
    'n8n-nodes-base/node-param-description-lowercase-first-char': 'off',
    'n8n-nodes-base/node-param-display-name-lowercase-first-char': 'off',
  },
}, {
  files: [
    '**/*.config.js',
    '**/*.config.cjs',
    '**/gulpfile.js',
    '**/jest.config.js',
    '**/.eslintrc.cjs',
  ],

  languageOptions: {
    globals: {
      ...globals.node,
    },
  },

  rules: {
    '@typescript-eslint/no-var-requires': 'off',
    'import/no-default-export': 'off',
    '@typescript-eslint/no-require-imports': 'off',
  },
}, {
  files: ['nodes/**/*.node.ts', 'credentials/**/*.credentials.ts'],

  rules: {
    'import/no-default-export': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
  },
}, {
  files: ['**/*.d.ts'],

  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-types': 'off',
    'import/no-default-export': 'off',
  },
}, globalIgnores([
  '**/dist/',
  '**/node_modules/',
  '**/coverage/',
  '**/*.min.js',
  '**/*.bundle.js',
  '**/.tsbuildinfo',
]), globalIgnores(['**/dist', '**/node_modules', '**/coverage'])]);
