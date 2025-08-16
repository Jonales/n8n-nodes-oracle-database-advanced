import { Connection } from 'oracledb';
export interface BulkOperationResult {
    operation: string;
    totalRows: number;
    successfulRows: number;
    failedRows: number;
    batchCount: number;
    duration: number;
    errors: BulkError[];
}
export interface BulkError {
    batchIndex: number;
    rowIndex: number;
    error: string;
    data?: any;
}
export interface BulkInsertOptions {
    batchSize?: number;
    continueOnError?: boolean;
    autoCommit?: boolean;
    bindDefs?: any;
    dmlRowCounts?: boolean;
}
export interface BulkUpdateOptions extends BulkInsertOptions {
    whereColumns: string[];
}
export interface BulkDeleteOptions {
    batchSize?: number;
    continueOnError?: boolean;
    autoCommit?: boolean;
    whereColumns: string[];
}
export declare class BulkOperations {
    private connection;
    private defaultBatchSize;
    constructor(connection: Connection, defaultBatchSize?: number);
    bulkInsert(tableName: string, data: any[], options?: BulkInsertOptions): Promise<BulkOperationResult>;
    bulkUpdate(tableName: string, data: any[], options: BulkUpdateOptions): Promise<BulkOperationResult>;
    bulkDelete(tableName: string, data: any[], options: BulkDeleteOptions): Promise<BulkOperationResult>;
    bulkUpsert(tableName: string, data: any[], keyColumns: string[], options?: BulkInsertOptions): Promise<BulkOperationResult>;
    parallelBulkOperations(operations: Array<{
        operation: 'insert' | 'update' | 'delete' | 'upsert';
        tableName: string;
        data: any[];
        options?: any;
    }>): Promise<BulkOperationResult[]>;
    private validateDataStructure;
    private generateValuesClause;
    getPerformanceStats(): any;
}
export declare class BulkOperationsFactory {
    static createHighVolumeOperations(connection: Connection): BulkOperations;
    static createFastOperations(connection: Connection): BulkOperations;
    static createConservativeOperations(connection: Connection): BulkOperations;
}
//# sourceMappingURL=bulkOperations.d.ts.map