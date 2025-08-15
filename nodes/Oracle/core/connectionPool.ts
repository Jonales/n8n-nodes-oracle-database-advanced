import oracledb from 'oracledb';

import { OracleCredentials } from '../types/oracle.credentials.type';

// Definição de tipo mais robusta para o Pool
type Pool = oracledb.Pool;

// Interface para rastrear pools com status
interface PoolWrapper {
  pool: Pool;
  isActive: boolean;
  createdAt: Date;
}

export interface PoolConfig {
  poolMin?: number;
  poolMax?: number;
  poolIncrement?: number;
  poolTimeout?: number;
  stmtCacheSize?: number;
  queueMax?: number;
  queueTimeout?: number;
  poolPingInterval?: number;
  enableStatistics?: boolean;
  homogeneous?: boolean;
}

export interface PoolStatistics {
  poolAlias?: string;
  poolMin: number;
  poolMax: number;
  poolIncrement: number;
  poolTimeout: number;
  connectionsOpen: number;
  connectionsInUse: number;
  queueLength: number;
  stmtCacheSize: number;
  isActive: boolean;
  createdAt: Date;
}

export class OracleConnectionPool {
  private static pools: Map<string, PoolWrapper> = new Map<string, PoolWrapper>();
  private static defaultConfig: PoolConfig = {
    poolMin: 2,
    poolMax: 20,
    poolIncrement: 2,
    poolTimeout: 60,
    stmtCacheSize: 50,
    queueMax: 500,
    queueTimeout: 60000,
    poolPingInterval: 60,
    enableStatistics: true,
    homogeneous: true,
  };

  /**
   * Obter ou criar pool de conexões
   */
  static async getPool(
    credentials: OracleCredentials,
    config: Partial<PoolConfig> = {},
  ): Promise<Pool> {
    const poolKey = this.generatePoolKey(credentials);

    // Verificar se pool já existe e está válido
    const existingPoolWrapper = this.pools.get(poolKey);
    if (existingPoolWrapper?.isActive) {
      // Testar se o pool ainda está funcional
      try {
        await this.testPoolConnection(existingPoolWrapper.pool);
        return existingPoolWrapper.pool;
      } catch (error) {
        console.warn(`Pool ${poolKey} não está funcional, criando novo...`);
        existingPoolWrapper.isActive = false;
        this.pools.delete(poolKey);
      }
    }

    // Criar novo pool se não existir ou não estiver funcional
    const newPool: Pool = await this.createPool(credentials, config);
    const poolWrapper: PoolWrapper = {
      pool: newPool,
      isActive: true,
      createdAt: new Date(),
    };

    // Armazenar pool no Map
    this.pools.set(poolKey, poolWrapper);

    // Configurar eventos do pool
    this.setupPoolEvents(newPool, poolKey);

    return newPool;
  }

  /**
   * Testar se o pool está funcional
   */
  private static async testPoolConnection(pool: Pool): Promise<void> {
    let connection: oracledb.Connection | null = null;
    try {
      connection = await pool.getConnection();
      // Teste simples para verificar se a conexão funciona
      await connection.execute('SELECT 1 FROM DUAL');
    } finally {
      if (connection) {
        await connection.close();
      }
    }
  }

  /**
   * Criar novo pool de conexões
   */
  private static async createPool(
    credentials: OracleCredentials,
    userConfig: Partial<PoolConfig>,
  ): Promise<Pool> {
    const poolConfig = {
      ...this.defaultConfig,
      ...userConfig,
      user: credentials.user,
      password: credentials.password,
      connectionString: credentials.connectionString,
    };

    try {
      const pool = await oracledb.createPool(poolConfig);
      console.log(
        `Oracle Pool criado para ${credentials.user}@${credentials.connectionString}`,
      );
      return pool;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Falha ao criar pool de conexões: ${errorMessage}`);
    }
  }

  /**
   * Configurar eventos do pool para monitoramento
   */
  private static setupPoolEvents(pool: Pool, poolKey: string): void {
    try {
      // Type assertion mais segura para acessar eventos
      const poolWithEvents = pool as Pool & {
        on?: (event: string, callback: () => void) => void;
      };

      if (poolWithEvents.on && typeof poolWithEvents.on === 'function') {
        poolWithEvents.on('connectionRequest', () => {
          console.log(`Pool ${poolKey}: Solicitação de conexão`);
        });

        poolWithEvents.on('connectionCreated', () => {
          console.log(`Pool ${poolKey}: Nova conexão criada`);
        });

        poolWithEvents.on('connectionDestroyed', () => {
          console.log(`Pool ${poolKey}: Conexão destruída`);
        });
      }
    } catch (error) {
      console.warn(`Não foi possível configurar eventos para pool ${poolKey}:`, error);
    }
  }

  /**
   * Obter estatísticas do pool
   */
  static async getPoolStatistics(credentials: OracleCredentials): Promise<PoolStatistics> {
    const poolKey = this.generatePoolKey(credentials);
    const poolWrapper = this.pools.get(poolKey);

    if (!poolWrapper) {
      throw new Error(`Pool não encontrado para ${poolKey}`);
    }

    if (!poolWrapper.isActive) {
      throw new Error(`Pool ${poolKey} está inativo`);
    }

    const pool = poolWrapper.pool;

    // Type assertion mais segura para acessar propriedades do pool
    const poolStats = pool as Pool & {
      poolAlias?: string;
      poolMin: number;
      poolMax: number;
      poolIncrement: number;
      poolTimeout: number;
      connectionsOpen: number;
      connectionsInUse: number;
      queueLength?: number;
      stmtCacheSize: number;
    };

    return {
      poolAlias: poolStats.poolAlias,
      poolMin: poolStats.poolMin || this.defaultConfig.poolMin!,
      poolMax: poolStats.poolMax || this.defaultConfig.poolMax!,
      poolIncrement: poolStats.poolIncrement || this.defaultConfig.poolIncrement!,
      poolTimeout: poolStats.poolTimeout || this.defaultConfig.poolTimeout!,
      connectionsOpen: poolStats.connectionsOpen || 0,
      connectionsInUse: poolStats.connectionsInUse || 0,
      queueLength: poolStats.queueLength || 0,
      stmtCacheSize: poolStats.stmtCacheSize || this.defaultConfig.stmtCacheSize!,
      isActive: poolWrapper.isActive,
      createdAt: poolWrapper.createdAt,
    };
  }

  /**
   * Verificar se um pool existe e está ativo
   */
  static hasActivePool(credentials: OracleCredentials): boolean {
    const poolKey = this.generatePoolKey(credentials);
    const poolWrapper = this.pools.get(poolKey);
    return poolWrapper !== undefined && poolWrapper.isActive;
  }

  /**
   * Obter conexão do pool
   */
  static async getConnection(credentials: OracleCredentials): Promise<oracledb.Connection> {
    const pool = await this.getPool(credentials);
    try {
      return await pool.getConnection();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Falha ao obter conexão do pool: ${errorMessage}`);
    }
  }

  /**
   * Fechar pool específico
   */
  static async closePool(credentials: OracleCredentials): Promise<void> {
    const poolKey = this.generatePoolKey(credentials);
    const poolWrapper = this.pools.get(poolKey);

    if (poolWrapper) {
      try {
        if (poolWrapper.isActive) {
          await poolWrapper.pool.close(10); // 10 segundos timeout
          poolWrapper.isActive = false;
        }
        this.pools.delete(poolKey);
        console.log(`Pool ${poolKey} fechado com sucesso`);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`Erro ao fechar pool ${poolKey}:`, errorMessage);
        // Marca como inativo e remove do Map mesmo se houve erro ao fechar
        poolWrapper.isActive = false;
        this.pools.delete(poolKey);
      }
    }
  }

  /**
   * Fechar todos os pools
   */
  static async closeAllPools(): Promise<void> {
    const closePromises = Array.from(this.pools.entries()).map(
      async ([key, poolWrapper]) => {
        try {
          if (poolWrapper.isActive) {
            await poolWrapper.pool.close(10);
            poolWrapper.isActive = false;
          }
          console.log(`Pool ${key} fechado`);
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(`Erro ao fechar pool ${key}:`, errorMessage);
          poolWrapper.isActive = false;
        }
      },
    );

    await Promise.all(closePromises);
    this.pools.clear();
    console.log('Todos os pools Oracle foram fechados');
  }

  /**
   * Gerar chave única para o pool baseada nas credenciais
   */
  private static generatePoolKey(credentials: OracleCredentials): string {
    const { user, connectionString } = credentials;
    return `${user}@${connectionString}`;
  }

  /**
   * Listar todos os pools ativos
   */
  static getActivePoolsInfo(): Array<{ key: string; isActive: boolean; createdAt: Date }> {
    return Array.from(this.pools.entries()).map(([key, poolWrapper]) => ({
      key,
      isActive: poolWrapper.isActive,
      createdAt: poolWrapper.createdAt,
    }));
  }

  /**
   * Configurar pool customizado para cargas específicas
   */
  static getHighVolumeConfig(): PoolConfig {
    return {
      poolMin: 5,
      poolMax: 50,
      poolIncrement: 5,
      poolTimeout: 120,
      stmtCacheSize: 100,
      queueMax: 1000,
      queueTimeout: 120000,
      poolPingInterval: 30,
      enableStatistics: true,
    };
  }

  /**
   * Configurar pool para operações OLTP (muitas transações pequenas)
   */
  static getOLTPConfig(): PoolConfig {
    return {
      poolMin: 10,
      poolMax: 100,
      poolIncrement: 10,
      poolTimeout: 30,
      stmtCacheSize: 200,
      queueMax: 2000,
      queueTimeout: 30000,
      poolPingInterval: 15,
      enableStatistics: true,
    };
  }

  /**
   * Configurar pool para operações analíticas (queries longas)
   */
  static getAnalyticsConfig(): PoolConfig {
    return {
      poolMin: 2,
      poolMax: 10,
      poolIncrement: 1,
      poolTimeout: 300,
      stmtCacheSize: 30,
      queueMax: 100,
      queueTimeout: 300000,
      poolPingInterval: 120,
      enableStatistics: true,
    };
  }
}

/**
 * Cleanup automático dos pools ao encerrar o processo
 */
const handleProcessExit = async (signal: string) => {
  console.log(`Recebido sinal ${signal}. Encerrando pools Oracle...`);
  try {
    await OracleConnectionPool.closeAllPools();
    console.log('Pools fechados com sucesso');
  } catch (error) {
    console.error('Erro ao fechar pools:', error);
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => handleProcessExit('SIGINT'));
process.on('SIGTERM', () => handleProcessExit('SIGTERM'));

// Limpeza adicional para outros eventos
process.on('beforeExit', async () => {
  await OracleConnectionPool.closeAllPools();
});

process.on('uncaughtException', async (error) => {
  console.error('Erro não capturado:', error);
  await OracleConnectionPool.closeAllPools();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Promise rejeitada não tratada:', reason, 'em', promise);
  await OracleConnectionPool.closeAllPools();
  process.exit(1);
});