"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OracleConnectionPool = void 0;
const oracledb_1 = __importDefault(require("oracledb"));
class OracleConnectionPool {
    static pools = new Map();
    static defaultConfig = {
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
    static async getPool(credentials, config = {}) {
        const poolKey = this.generatePoolKey(credentials);
        const existingPoolWrapper = this.pools.get(poolKey);
        if (existingPoolWrapper?.isActive) {
            try {
                await this.testPoolConnection(existingPoolWrapper.pool);
                return existingPoolWrapper.pool;
            }
            catch (error) {
                console.warn(`Pool ${poolKey} não está funcional, criando novo...`);
                existingPoolWrapper.isActive = false;
                this.pools.delete(poolKey);
            }
        }
        const newPool = await this.createPool(credentials, config);
        const poolWrapper = {
            pool: newPool,
            isActive: true,
            createdAt: new Date(),
        };
        this.pools.set(poolKey, poolWrapper);
        this.setupPoolEvents(newPool, poolKey);
        return newPool;
    }
    static async testPoolConnection(pool) {
        let connection = null;
        try {
            connection = await pool.getConnection();
            await connection.execute('SELECT 1 FROM DUAL');
        }
        finally {
            if (connection) {
                await connection.close();
            }
        }
    }
    static async createPool(credentials, userConfig) {
        const poolConfig = {
            ...this.defaultConfig,
            ...userConfig,
            user: credentials.user,
            password: credentials.password,
            connectionString: credentials.connectionString,
        };
        try {
            const pool = await oracledb_1.default.createPool(poolConfig);
            console.log(`Oracle Pool criado para ${credentials.user}@${credentials.connectionString}`);
            return pool;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Falha ao criar pool de conexões: ${errorMessage}`);
        }
    }
    static setupPoolEvents(pool, poolKey) {
        try {
            const poolWithEvents = pool;
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
        }
        catch (error) {
            console.warn(`Não foi possível configurar eventos para pool ${poolKey}:`, error);
        }
    }
    static async getPoolStatistics(credentials) {
        const poolKey = this.generatePoolKey(credentials);
        const poolWrapper = this.pools.get(poolKey);
        if (!poolWrapper) {
            throw new Error(`Pool não encontrado para ${poolKey}`);
        }
        if (!poolWrapper.isActive) {
            throw new Error(`Pool ${poolKey} está inativo`);
        }
        const pool = poolWrapper.pool;
        const poolStats = pool;
        return {
            poolAlias: poolStats.poolAlias,
            poolMin: poolStats.poolMin || this.defaultConfig.poolMin,
            poolMax: poolStats.poolMax || this.defaultConfig.poolMax,
            poolIncrement: poolStats.poolIncrement || this.defaultConfig.poolIncrement,
            poolTimeout: poolStats.poolTimeout || this.defaultConfig.poolTimeout,
            connectionsOpen: poolStats.connectionsOpen || 0,
            connectionsInUse: poolStats.connectionsInUse || 0,
            queueLength: poolStats.queueLength || 0,
            stmtCacheSize: poolStats.stmtCacheSize || this.defaultConfig.stmtCacheSize,
            isActive: poolWrapper.isActive,
            createdAt: poolWrapper.createdAt,
        };
    }
    static hasActivePool(credentials) {
        const poolKey = this.generatePoolKey(credentials);
        const poolWrapper = this.pools.get(poolKey);
        return poolWrapper !== undefined && poolWrapper.isActive;
    }
    static async getConnection(credentials) {
        const pool = await this.getPool(credentials);
        try {
            return await pool.getConnection();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Falha ao obter conexão do pool: ${errorMessage}`);
        }
    }
    static async closePool(credentials) {
        const poolKey = this.generatePoolKey(credentials);
        const poolWrapper = this.pools.get(poolKey);
        if (poolWrapper) {
            try {
                if (poolWrapper.isActive) {
                    await poolWrapper.pool.close(10);
                    poolWrapper.isActive = false;
                }
                this.pools.delete(poolKey);
                console.log(`Pool ${poolKey} fechado com sucesso`);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Erro ao fechar pool ${poolKey}:`, errorMessage);
                poolWrapper.isActive = false;
                this.pools.delete(poolKey);
            }
        }
    }
    static async closeAllPools() {
        const closePromises = Array.from(this.pools.entries()).map(async ([key, poolWrapper]) => {
            try {
                if (poolWrapper.isActive) {
                    await poolWrapper.pool.close(10);
                    poolWrapper.isActive = false;
                }
                console.log(`Pool ${key} fechado`);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Erro ao fechar pool ${key}:`, errorMessage);
                poolWrapper.isActive = false;
            }
        });
        await Promise.all(closePromises);
        this.pools.clear();
        console.log('Todos os pools Oracle foram fechados');
    }
    static generatePoolKey(credentials) {
        const { user, connectionString } = credentials;
        return `${user}@${connectionString}`;
    }
    static getActivePoolsInfo() {
        return Array.from(this.pools.entries()).map(([key, poolWrapper]) => ({
            key,
            isActive: poolWrapper.isActive,
            createdAt: poolWrapper.createdAt,
        }));
    }
    static getHighVolumeConfig() {
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
    static getOLTPConfig() {
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
    static getAnalyticsConfig() {
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
exports.OracleConnectionPool = OracleConnectionPool;
const handleProcessExit = async (signal) => {
    console.log(`Recebido sinal ${signal}. Encerrando pools Oracle...`);
    try {
        await OracleConnectionPool.closeAllPools();
        console.log('Pools fechados com sucesso');
    }
    catch (error) {
        console.error('Erro ao fechar pools:', error);
    }
    finally {
        process.exit(0);
    }
};
process.on('SIGINT', () => handleProcessExit('SIGINT'));
process.on('SIGTERM', () => handleProcessExit('SIGTERM'));
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
//# sourceMappingURL=connectionPool.js.map