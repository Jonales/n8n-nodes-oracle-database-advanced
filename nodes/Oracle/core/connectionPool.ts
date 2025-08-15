import oracledb from "oracledb";
import { OracleCredentials } from "../types/oracle.credentials.type";

// Definição de tipo mais robusta para o Pool
type Pool = Awaited<ReturnType<typeof oracledb.createPool>>;

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

export class OracleConnectionPool {
    private static pools: Map<string, Pool> = new Map<string, Pool>();
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
        homogeneous: true
    };

    /**
     * Obter ou criar pool de conexões
     */
    static async getPool(
        credentials: OracleCredentials, 
        config: Partial<PoolConfig> = {}
    ): Promise<Pool> {
        const poolKey = this.generatePoolKey(credentials);
        
        // Verificar se pool já existe
        const existingPool = this.pools.get(poolKey);
        if (existingPool) {
            return existingPool;
        }

        // Criar novo pool se não existir
        const newPool: Pool = await this.createPool(credentials, config);
        
        // Armazenar pool no Map (correção do erro TS2322)
        this.pools.set(poolKey, newPool);
        
        // Configurar eventos do pool
        this.setupPoolEvents(newPool, poolKey);
        
        return newPool;
    }

    /**
     * Criar novo pool de conexões
     */
    private static async createPool(
        credentials: OracleCredentials,
        userConfig: Partial<PoolConfig>
    ): Promise<Pool> {
        const poolConfig = {
            ...this.defaultConfig,
            ...userConfig,
            user: credentials.user,
            password: credentials.password,
            connectionString: credentials.connectionString
        };

        try {
            const pool: Pool = await oracledb.createPool(poolConfig);
            console.log(`Oracle Pool criado para ${credentials.user}@${credentials.connectionString}`);
            return pool;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Falha ao criar pool de conexões: ${errorMessage}`);
        }
    }

    /**
     * Configurar eventos do pool para monitoramento
     */
    private static setupPoolEvents(pool: Pool, poolKey: string): void {
        const poolAny = pool as any;
        if (poolAny && typeof poolAny.on === 'function') {
            // Eventos disponíveis no oracledb 6.x
            poolAny.on('connectionRequest', () => {
                console.log(`Pool ${poolKey}: Solicitação de conexão`);
            });

            poolAny.on('connectionCreated', () => {
                console.log(`Pool ${poolKey}: Nova conexão criada`);
            });

            poolAny.on('connectionDestroyed', () => {
                console.log(`Pool ${poolKey}: Conexão destruída`);
            });
        }
    }

    /**
     * Obter estatísticas do pool
     */
    static async getPoolStatistics(credentials: OracleCredentials): Promise<any> {
        const poolKey = this.generatePoolKey(credentials);
        const pool = this.pools.get(poolKey);
        
        if (!pool) {
            throw new Error(`Pool não encontrado para ${poolKey}`);
        }

        const poolAny = pool as any;
        return {
            poolAlias: poolAny.poolAlias,
            poolMin: poolAny.poolMin,
            poolMax: poolAny.poolMax,
            poolIncrement: poolAny.poolIncrement,
            poolTimeout: poolAny.poolTimeout,
            connectionsOpen: poolAny.connectionsOpen,
            connectionsInUse: poolAny.connectionsInUse,
            queueLength: poolAny.queueLength || 0,
            stmtCacheSize: poolAny.stmtCacheSize
        };
    }

    /**
     * Fechar pool específico
     */
    static async closePool(credentials: OracleCredentials): Promise<void> {
        const poolKey = this.generatePoolKey(credentials);
        const pool = this.pools.get(poolKey);
        
        if (pool) {
            try {
                await (pool as any).close(10); // 10 segundos timeout
                this.pools.delete(poolKey);
                console.log(`Pool ${poolKey} fechado com sucesso`);
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Erro ao fechar pool ${poolKey}:`, errorMessage);
            }
        }
    }

    /**
     * Fechar todos os pools
     */
    static async closeAllPools(): Promise<void> {
        const closePromises = Array.from(this.pools.entries()).map(async ([key, pool]) => {
            try {
                await (pool as any).close(10);
                console.log(`Pool ${key} fechado`);
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Erro ao fechar pool ${key}:`, errorMessage);
            }
        });

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
            enableStatistics: true
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
            enableStatistics: true
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
            enableStatistics: true
        };
    }
}

/**
 * Cleanup automático dos pools ao encerrar o processo
 */
process.on('SIGINT', async () => {
    console.log('Encerrando pools Oracle...');
    await OracleConnectionPool.closeAllPools();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Encerrando pools Oracle...');
    await OracleConnectionPool.closeAllPools();
    process.exit(0);
});
