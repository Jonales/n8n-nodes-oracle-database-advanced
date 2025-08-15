import oracledb from "oracledb";
type Pool = ReturnType<typeof oracledb.createPool> extends Promise<infer T> ? T : never;
import { OracleCredentials } from "../types/oracle.credentials.type";

export interface PoolConfig extends PoolAttributes {
    minConnections?: number;
    maxConnections?: number;
    connectionTimeout?: number;
    idleTimeout?: number;
    enableStatistics?: boolean;
}

export class OracleConnectionPool {
    private static pools: Map<string, ConnectionPool> = new Map();
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
    ): Promise<ConnectionPool> {
        const poolKey = this.generatePoolKey(credentials);
        
        if (!this.pools.has(poolKey)) {
            const pool = await this.createPool(credentials, config);
            this.pools.set(poolKey, pool);
            
            // Configurar eventos do pool
            this.setupPoolEvents(pool, poolKey);
        }
        
        return this.pools.get(poolKey)!;
    }

    /**
     * Criar novo pool de conexões
     */
    private static async createPool(
        credentials: OracleCredentials,
        userConfig: Partial<PoolConfig>
    ): Promise<ConnectionPool> {
        const poolConfig = {
            ...this.defaultConfig,
            ...userConfig,
            user: credentials.user,
            password: credentials.password,
            connectionString: credentials.connectionString
        };

        try {
            const pool = await oracledb.createPool(poolConfig);
            console.log(`Oracle Pool criado para ${credentials.user}@${credentials.connectionString}`);
            return pool;
        } catch (error) {
            throw new Error(`Falha ao criar pool de conexões: ${error.message}`);
        }
    }

    /**
     * Configurar eventos do pool para monitoramento
     */
    private static setupPoolEvents(pool: ConnectionPool, poolKey: string): void {
        // Eventos disponíveis no oracledb 6.x
        pool.on?.('connectionRequest', () => {
            console.log(`Pool ${poolKey}: Solicitação de conexão`);
        });

        pool.on?.('connectionCreated', () => {
            console.log(`Pool ${poolKey}: Nova conexão criada`);
        });

        pool.on?.('connectionDestroyed', () => {
            console.log(`Pool ${poolKey}: Conexão destruída`);
        });
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

        return {
            poolAlias: pool.poolAlias,
            poolMin: pool.poolMin,
            poolMax: pool.poolMax,
            poolIncrement: pool.poolIncrement,
            poolTimeout: pool.poolTimeout,
            connectionsOpen: pool.connectionsOpen,
            connectionsInUse: pool.connectionsInUse,
            queueLength: pool.queueLength || 0,
            stmtCacheSize: pool.stmtCacheSize
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
                await pool.close(10); // 10 segundos timeout
                this.pools.delete(poolKey);
                console.log(`Pool ${poolKey} fechado com sucesso`);
            } catch (error) {
                console.error(`Erro ao fechar pool ${poolKey}:`, error);
            }
        }
    }

    /**
     * Fechar todos os pools
     */
    static async closeAllPools(): Promise<void> {
        const closePromises = Array.from(this.pools.entries()).map(async ([key, pool]) => {
            try {
                await pool.close(10);
                console.log(`Pool ${key} fechado`);
            } catch (error) {
                console.error(`Erro ao fechar pool ${key}:`, error);
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
