import { Connection } from 'oracledb';
export interface PLSQLExecutionResult {
    success: boolean;
    executionTime: number;
    outBinds: {
        [key: string]: any;
    };
    implicitResults: any[][];
    rowsAffected?: number;
    warnings: string[];
    compilationErrors: PLSQLCompilationError[];
}
export interface PLSQLCompilationError {
    line: number;
    position: number;
    text: string;
    attribute: string;
    messageNumber: number;
}
export interface PLSQLExecutionOptions {
    autoCommit?: boolean;
    fetchArraySize?: number;
    maxRows?: number;
    outFormat?: number;
    enableDebug?: boolean;
    timeout?: number;
}
export interface PLSQLBlock {
    type: 'anonymous' | 'procedure' | 'function' | 'package';
    name?: string;
    sql: string;
    inputParams?: {
        [key: string]: any;
    };
    outputParams?: string[];
    returnType?: string;
}
export declare class PLSQLExecutor {
    private connection;
    private debugMode;
    constructor(connection: Connection, debugMode?: boolean);
    executeAnonymousBlock(plsqlBlock: string, binds?: {
        [key: string]: any;
    }, options?: PLSQLExecutionOptions): Promise<PLSQLExecutionResult>;
    executeProcedure(procedureName: string, parameters?: {
        [key: string]: any;
    }, options?: PLSQLExecutionOptions): Promise<PLSQLExecutionResult>;
    executeFunction(functionName: string, parameters?: {
        [key: string]: any;
    }, returnType?: string, options?: PLSQLExecutionOptions): Promise<PLSQLExecutionResult>;
    executeBatch(blocks: PLSQLBlock[], options?: PLSQLExecutionOptions & {
        stopOnError?: boolean;
    }): Promise<PLSQLExecutionResult[]>;
    executePackageItem(packageName: string, itemName: string, itemType: 'procedure' | 'function', parameters?: {
        [key: string]: any;
    }, returnType?: string, options?: PLSQLExecutionOptions): Promise<PLSQLExecutionResult>;
    executeDynamicPLSQL(template: string, substitutions: {
        [key: string]: string;
    }, parameters?: {
        [key: string]: any;
    }, options?: PLSQLExecutionOptions): Promise<PLSQLExecutionResult>;
    getCompilationInfo(objectName: string, objectType: string): Promise<any[]>;
    getDependencies(objectName: string, objectType: string): Promise<any[]>;
    private validatePLSQLBlock;
    private detectOutputParameters;
    private processImplicitResults;
    private checkCompilationErrors;
    private getProcedureMetadata;
    private configureBindsFromMetadata;
    private typeMap;
    private getOracleType;
    private validateDynamicSQL;
    private setExecutionTimeout;
    setDebugMode(enabled: boolean): void;
}
export declare class PLSQLExecutorFactory {
    static createDevelopmentExecutor(connection: Connection): PLSQLExecutor;
    static createProductionExecutor(connection: Connection): PLSQLExecutor;
}
//# sourceMappingURL=plsqlExecutor.d.ts.map