import oracledb from 'oracledb';
import { OracleCredentials } from '../types/oracle.credentials.type';
type Pool = oracledb.Pool;
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
export declare class OracleConnectionPool {
    private static pools;
    private static defaultConfig;
    static getPool(credentials: OracleCredentials, config?: Partial<PoolConfig>): Promise<Pool>;
    private static testPoolConnection;
    private static createPool;
    private static setupPoolEvents;
    static getPoolStatistics(credentials: OracleCredentials): Promise<PoolStatistics>;
    static hasActivePool(credentials: OracleCredentials): boolean;
    static getConnection(credentials: OracleCredentials): Promise<oracledb.Connection>;
    static closePool(credentials: OracleCredentials): Promise<void>;
    static closeAllPools(): Promise<void>;
    private static generatePoolKey;
    static getActivePoolsInfo(): Array<{
        key: string;
        isActive: boolean;
        createdAt: Date;
    }>;
    static getHighVolumeConfig(): PoolConfig;
    static getOLTPConfig(): PoolConfig;
    static getAnalyticsConfig(): PoolConfig;
}
export {};
//# sourceMappingURL=connectionPool.d.ts.map