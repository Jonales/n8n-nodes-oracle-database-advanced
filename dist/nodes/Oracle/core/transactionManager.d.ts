import { Connection } from 'oracledb';
export interface TransactionOptions {
    isolation?: 'READ_COMMITTED' | 'SERIALIZABLE' | 'READ_ONLY';
    timeout?: number;
    autoRollbackOnError?: boolean;
    maxRetries?: number;
    retryDelay?: number;
}
export interface SavepointInfo {
    name: string;
    timestamp: Date;
    description?: string;
}
export declare class TransactionManager {
    private connection;
    private savepoints;
    private transactionStartTime?;
    private options;
    private isTransactionActive;
    private retryCount;
    constructor(connection: Connection, options?: TransactionOptions);
    beginTransaction(): Promise<void>;
    createSavepoint(name: string, description?: string): Promise<void>;
    rollbackToSavepoint(name: string): Promise<void>;
    releaseSavepoint(name: string): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    executeWithRetry<T>(operation: () => Promise<T>, operationName?: string): Promise<T>;
    executeBatch(operations: Array<{
        sql: string;
        binds?: any;
        name?: string;
    }>, batchOptions?: {
        savepointPerOperation?: boolean;
        stopOnError?: boolean;
    }): Promise<any[]>;
    getTransactionInfo(): any;
    private setIsolationLevel;
    private setTransactionTimeout;
    private isValidSavepointName;
    private isRetryableError;
    private getTransactionDuration;
    private cleanupTransaction;
    private sleep;
}
export declare class TransactionManagerFactory {
    static createOLTPManager(connection: Connection): TransactionManager;
    static createBatchManager(connection: Connection): TransactionManager;
    static createAnalyticsManager(connection: Connection): TransactionManager;
    static createCriticalManager(connection: Connection): TransactionManager;
}
//# sourceMappingURL=transactionManager.d.ts.map