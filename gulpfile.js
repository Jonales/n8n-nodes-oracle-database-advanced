const path = require('path');

const { task, src, dest, series, parallel } = require('gulp');

/**
 * Copia ícones dos nodes para o diretório de distribuição
 * @returns {NodeJS.ReadWriteStream}
 */
function copyNodeIcons() {
  const nodeSource = path.resolve('nodes', '**', '*.{png,svg}');
  const nodeDestination = path.resolve('dist', 'nodes');

  console.log('📂 Copiando ícones dos nodes...');
  return src(nodeSource, { allowEmpty: true })
    .pipe(dest(nodeDestination));
}

/**
 * Copia ícones das credenciais para o diretório de distribuição
 * @returns {NodeJS.ReadWriteStream}
 */
function copyCredentialIcons() {
  const credSource = path.resolve('credentials', '**', '*.{png,svg}');
  const credDestination = path.resolve('dist', 'credentials');

  console.log('🔑 Copiando ícones das credenciais...');
  return src(credSource, { allowEmpty: true })
    .pipe(dest(credDestination));
}

/**
 * Copia todos os assets adicionais (JSONs, configs, etc.)
 * @returns {NodeJS.ReadWriteStream}
 */
function copyAssets() {
  const assetsSource = path.resolve('{nodes,credentials}', '**', '*.{json,yaml,yml}');
  const assetsDestination = path.resolve('dist');

  console.log('📄 Copiando assets adicionais...');
  return src(assetsSource, { allowEmpty: true, base: '.' })
    .pipe(dest(assetsDestination));
}

/**
 * Limpa arquivos desnecessários do dist
 * @returns {Promise<string[]>}
 */
async function cleanupDist() {
  const deleteAsync = async (...args) => {
    const del = await import('del');
    return del.deleteAsync(...args);
  };

	
  console.log('🧹 Limpando arquivos desnecessários...');
  return deleteAsync([
    'dist/**/*.test.js',
    'dist/**/*.spec.js',
    'dist/**/*.test.d.ts',
    'dist/**/*.spec.d.ts',
    'dist/**/*.test.js.map',
    'dist/**/*.spec.js.map'
  ], { force: true });
}

/**
 * Tarefa principal para copiar todos os ícones
 */
const copyIcons = parallel(copyNodeIcons, copyCredentialIcons);

/**
 * Tarefa completa de build de assets
 */
const buildAssets = series(copyIcons, copyAssets);

/**
 * Tarefa de build completo com limpeza
 */
const buildComplete = series(buildAssets, cleanupDist);

// ===== Registrar Tasks =====

// Task individual para ícones (compatibilidade com versão anterior)
task('build:icons', copyIcons);

// Tasks modernas e granulares
task('copy:node-icons', copyNodeIcons);
task('copy:credential-icons', copyCredentialIcons);
task('copy:assets', copyAssets);
task('cleanup:dist', cleanupDist);

// Tasks compostas
task('build:assets', buildAssets);
task('build:complete', buildComplete);

// Task padrão
task('default', buildComplete);

// ===== Watch Tasks (Desenvolvimento) =====

/**
 * Watch para desenvolvimento - monitora mudanças nos assets
 */
function watchAssets() {
  const { watch } = require('gulp');
	
  console.log('👀 Iniciando watch mode para assets...');
	
  // Watch ícones dos nodes
  watch('nodes/**/*.{png,svg}', { ignoreInitial: false }, copyNodeIcons);
	
  // Watch ícones das credenciais  
  watch('credentials/**/*.{png,svg}', { ignoreInitial: false }, copyCredentialIcons);
	
  // Watch outros assets
  watch('{nodes,credentials}/**/*.{json,yaml,yml}', { ignoreInitial: false }, copyAssets);
	
  console.log('✅ Watch ativo! Modificações serão copiadas automaticamente.');
}

task('watch', watchAssets);
task('dev:assets', watchAssets);

// ===== Error Handling =====

process.on('uncaughtException', (err) => {
  console.error('❌ Erro não capturado no Gulp:', err.message);
  process.exit(1);
});

// ===== Module Exports =====

module.exports = {
  // Tasks individuais
  copyNodeIcons,
  copyCredentialIcons, 
  copyAssets,
  cleanupDist,
  watchAssets,
	
  // Tasks compostas
  copyIcons,
  buildAssets,
  buildComplete,
	
  // Default export
  default: buildComplete
};
