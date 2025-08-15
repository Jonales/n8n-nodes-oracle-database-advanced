/**
 * Prettier 3.x – configuração oficial do projeto
 * Alinhado ao ESLint 9 (e regra prettier/prettier: error)
 */
module.exports = {
  $schema: 'https://json.schemastore.org/prettierrc',

  // Estilo geral
  printWidth: 100,
  tabWidth: 2,
  useTabs: true,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'avoid',
  endOfLine: 'lf',

  // Plugins
  plugins: [
    require('prettier-plugin-organize-imports'),
  ],

  // Plugin: prettier-plugin-organize-imports
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
};
// Configuração para o plugin de organização de imports
// - importOrderSeparation: separa os grupos de imports com uma linha em branco