import { IExecuteFunctions } from "n8n-core";
import {
    IDataObject,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
} from "n8n-workflow";

import oracledb, { Connection, ConnectionPool } from "oracledb";
import { OracleConnectionPool } from "./connectionPool";
import { TransactionManager, TransactionManagerFactory } from "./core/transactionManager";
import { BulkOperations, BulkOperationsFactory } from "./core/bulkOperations";
import { PLSQLExecutor, PLSQLExecutorFactory } from "./core/plsqlExecutor";
import { AQOperations, AQOperationsFactory } from "./core/aqOperations";

export class OracleDatabaseAdvanced implements INodeType {
    description: INodeTypeDescription = {
        displayName: "Oracle Database Advanced",
        name: "oracleDatabaseAdvanced",
        icon: "file:oracle.svg",
        group: ["transform"],
        version: 1,
        description: "Oracle Database com recursos avançados para cargas pesadas e Oracle 19c+",
        defaults: {
            name: "Oracle Database Advanced",
        },
        inputs: ["main"],
        outputs: ["main"],
        credentials: [
            {
                name: "oracleCredentials",
                required: true,
            },
        ],
        properties: [
            {
                displayName: "Operation Type",
                name: "operationType",
                type: "options",
                default: "query",
                options: [
                    { name: "SQL Query", value: "query", description: "Execute standard SQL queries" },
                    { name: "PL/SQL Block", value: "plsql", description: "Execute PL/SQL anonymous blocks" },
                    { name: "Stored Procedure", value: "procedure", description: "Call stored procedures" },
                    { name: "Function", value: "function", description: "Call Oracle functions" },
                    { name: "Bulk Operations", value: "bulk", description: "High-volume insert/update/delete" },
                    { name: "Transaction Block", value: "transaction", description: "Complex multi-statement transactions" },
                    { name: "Oracle AQ", value: "queue", description: "Advanced Queuing operations" }
                ],
            },
            {
                displayName: "SQL/PL/SQL Statement",
                name: "statement",
                type: "string",
                typeOptions: {
                    alwaysOpenEditWindow: true,
                    rows: 10,
                },
                default: "",
                placeholder: "SELECT * FROM table WHERE id = :param1",
                description: "SQL query, PL/SQL block, or procedure call to execute",
            },
            {
                displayName: "Connection Pool",
                name: "connectionPool",
                type: "options",
                default: "standard",
                options: [
                    { name: "Standard Pool", value: "standard", description: "Balanced pool for general use" },
                    { name: "High Volume Pool", value: "highvolume", description: "Optimized for bulk operations" },
                    { name: "OLTP Pool", value: "oltp", description: "Many small transactions" },
                    { name: "Analytics Pool", value: "analytics", description: "Long-running queries" },
                    { name: "Single Connection", value: "single", description: "No pooling" }
                ],
                description: "Type of connection pool to use",
            },
            {
                displayName: "Auto Commit",
                name: "autoCommit",
                type: "boolean",
                default: true,
                displayOptions: {
                    show: { operationType: ["query", "plsql", "procedure", "function"] }
                },
                description: "Automatically commit transactions",
            },
            {
                displayName: "Batch Size",
                name: "batchSize",
                type: "number",
                default: 1000,
                displayOptions: {
                    show: { operationType: ["bulk"] }
                },
                description: "Number of records to process in each batch",
            },
            {
                displayName: "Continue on Error",
                name: "continueOnError",
                type: "boolean",
                default: false,
                displayOptions: {
                    show: { operationType: ["bulk", "transaction"] }
                },
                description: "Continue processing even if some operations fail",
            },
            {
                displayName: "Transaction Type",
                name: "transactionType",
                type: "options",
                default: "oltp",
                displayOptions: {
                    show: { operationType: ["transaction"] }
                },
                options: [
                    { name: "OLTP (Fast)", value: "oltp", description: "Short transactions, fast commits" },
                    { name: "Batch (Long)", value: "batch", description: "Long transactions with savepoints" },
                    { name: "Analytics (Read-only)", value: "analytics", description: "Read-only operations" },
                    { name: "Critical (Serializable)", value: "critical", description: "Highest consistency level" }
                ],
            },
            {
                displayName: "Bulk Operation",
                name: "bulkOperation",
                type: "options",
                default: "insert",
                displayOptions: {
                    show: { operationType: ["bulk"] }
                },
                options: [
                    { name: "Bulk Insert", value: "insert", description: "Insert multiple records" },
                    { name: "Bulk Update", value: "update", description: "Update multiple records" },
                    { name: "Bulk Delete", value: "delete", description: "Delete multiple records" },
                    { name: "Bulk Upsert", value: "upsert", description: "Insert or update based on key" }
                ],
            },
            {
                displayName: "Table Name",
                name: "tableName",
                type: "string",
                default: "",
                displayOptions: {
                    show: { operationType: ["bulk"] }
                },
                placeholder: "customer_table",
                description: "Target table for bulk operations",
            },
            {
                displayName: "Key Columns",
                name: "keyColumns",
                type: "string",
                default: "",
                displayOptions: {
                    show: { 
                        operationType: ["bulk"],
                        bulkOperation: ["update", "delete", "upsert"]
                    }
                },
                placeholder: "id,email",
                description: "Comma-separated list of key columns for WHERE clause",
            },
            {
                displayName: "Queue Operation",
                name: "queueOperation",
                type: "options",
                default: "enqueue",
                displayOptions: {
                    show: { operationType: ["queue"] }
                },
                options: [
                    { name: "Enqueue Message", value: "enqueue", description: "Send message to queue" },
                    { name: "Dequeue Message", value: "dequeue", description: "Receive message from queue" },
                    { name: "Queue Info", value: "info", description: "Get queue statistics" },
                    { name: "Create Queue", value: "create", description: "Create new queue" },
                    { name: "Purge Queue", value: "purge", description: "Remove messages from queue" }
                ],
            },
            {
                displayName: "Queue Name",
                name: "queueName",
                type: "string",
                default: "",
                displayOptions: {
                    show: { operationType: ["queue"] }
                },
                placeholder: "ORDER_QUEUE",
                description: "Name of the Oracle AQ queue",
            },
            {
                displayName: "Message Payload",
                name: "messagePayload",
                type: "json",
                default: "{}",
                displayOptions: {
                    show: { 
                        operationType: ["queue"],
                        queueOperation: ["enqueue"]
                    }
                },
                description: "JSON payload for the message",
            },
            {
                displayName: "Message Priority",
                name: "messagePriority",
                type: "number",
                default: 1,
                displayOptions: {
                    show: { 
                        operationType: ["queue"],
                        queueOperation: ["enqueue"]
                    }
                },
                description: "Message priority (1 = highest)",
            },
            {
                displayName: "Correlation ID",
                name: "correlationId",
                type: "string",
                default: "",
                displayOptions: {
                    show: { 
                        operationType: ["queue"],
                        queueOperation: ["enqueue", "dequeue"]
                    }
                },
                description: "Correlation ID for message tracking",
            },
            {
                displayName: "Wait Time (seconds)",
                name: "waitTime",
                type: "number",
                default: 5,
                displayOptions: {
                    show: { 
                        operationType: ["queue"],
                        queueOperation: ["dequeue"]
                    }
                },
                description: "How long to wait for a message",
            },
            {
                displayName: "Max Messages",
                name: "maxMessages",
                type: "number",
                default: 1,
                displayOptions: {
                    show: { 
                        operationType: ["queue"],
                        queueOperation: ["dequeue"]
                    }
                },
                description: "Maximum number of messages to receive",
            },
            {
                displayName: "Debug Mode",
                name: "debugMode",
                type: "boolean",
                default: false,
                description: "Enable detailed logging for troubleshooting",
            },
            // Parâmetros existentes do node original
            {
                displayName: 'Parameters',
                name: 'params',
                placeholder: 'Add Parameter',
                type: 'fixedCollection',
                typeOptions: {
                    multipleValueButtonText: 'Add another Parameter',
                    multipleValues: true,
                },
                default: {},
                description: 'Parameters for SQL queries and PL/SQL blocks',
                options: [
                    {
                        displayName: 'Values',
                        name: 'values',
                        values: [
                            {
                                displayName: 'Name',
                                name: 'name',
                                type: 'string',
                                default: '',
                                placeholder: 'e.g. param_name',
                                hint: 'Parameter name (do not include ":")',
                                required: true,
                            },
                            {
                                displayName: 'Value',
                                name: 'value',
                                type: 'string',
                                default: '',
                                placeholder: 'Example: 12345',
                                required: true,
                            },
                            {
                                displayName: 'Data Type',
                                name: 'datatype',
                                type: 'options',
                                required: true,
                                default: 'string',
                                options: [
                                    { name: 'String', value: 'string' },
                                    { name: 'Number', value: 'number' },
                                    { name: 'Date', value: 'date' },
                                    { name: 'CLOB', value: 'clob' },
                                    { name: 'OUT Parameter', value: 'out' }
                                ],
                            },
                            {
                                displayName: 'Parse for IN statement',
                                name: 'parseInStatement',
                                type: 'options',
                                required: true,
                                default: false,
                                hint: 'If "Yes", the "Value" field should be comma-separated values (e.g., 1,2,3 or str1,str2,str3)',
                                options: [
                                    { name: 'No', value: false },
                                    { name: 'Yes', value: true }
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        // Polyfill para versões antigas do Node.js
        if (typeof String.prototype.replaceAll === "undefined") {
            String.prototype.replaceAll = function (match, replace) {
                return this.replace(new RegExp(match, 'g'), () => replace);
            };
        }

        const credentials = await this.getCredentials("oracleCredentials");
        const operationType = this.getNodeParameter("operationType", 0) as string;
        const connectionPoolType = this.getNodeParameter("connectionPool", 0) as string;
        const debugMode = this.getNodeParameter("debugMode", 0) as boolean;
        
        const oracleCredentials = {
            user: String(credentials.user),
            password: String(credentials.password),
            connectionString: String(credentials.connectionString),
        };

        let connection: Connection;
        let pool: ConnectionPool;
        let returnItems: INodeExecutionData[] = [];

        try {
            // Configurar conexão baseada no tipo de pool
            if (connectionPoolType === 'single') {
                connection = await oracledb.getConnection(oracleCredentials);
            } else {
                pool = await this.getConnectionPool(connectionPoolType, oracleCredentials);
                connection = await pool.getConnection();
            }

            if (debugMode) {
                console.log(`Executando operação: ${operationType} com pool: ${connectionPoolType}`);
            }

            // Executar operação baseada no tipo
            switch (operationType) {
                case 'query':
                    returnItems = await this.executeQuery(connection, debugMode);
                    break;
                case 'plsql':
                    returnItems = await this.executePLSQL(connection, debugMode);
                    break;
                case 'procedure':
                    returnItems = await this.executeProcedure(connection, debugMode);
                    break;
                case 'function':
                    returnItems = await this.executeFunction(connection, debugMode);
                    break;
                case 'bulk':
                    returnItems = await this.executeBulkOperations(connection, debugMode);
                    break;
                case 'transaction':
                    returnItems = await this.executeTransaction(connection, debugMode);
                    break;
                case 'queue':
                    returnItems = await this.executeAQOperations(connection, debugMode);
                    break;
                default:
                    throw new Error(`Tipo de operação não suportado: ${operationType}`);
            }

        } catch (error) {
            throw new NodeOperationError(this.getNode(), `Oracle Advanced Error: ${error.message}`);
        } finally {
            if (connection) {
                try {
                    if (connectionPoolType === 'single') {
                        await connection.close();
                    } else {
                        await connection.close(); // Retorna para o pool
                    }
                } catch (error) {
                    console.error(`Falha ao fechar conexão: ${error}`);
                }
            }
        }

        return this.prepareOutputData(returnItems);
    }

    /**
     * Obter pool de conexões baseado no tipo
     */
    private async getConnectionPool(poolType: string, credentials: any): Promise<ConnectionPool> {
        switch (poolType) {
            case 'highvolume':
                return OracleConnectionPool.getPool(credentials, OracleConnectionPool.getHighVolumeConfig());
            case 'oltp':
                return OracleConnectionPool.getPool(credentials, OracleConnectionPool.getOLTPConfig());
            case 'analytics':
                return OracleConnectionPool.getPool(credentials, OracleConnectionPool.getAnalyticsConfig());
            default:
                return OracleConnectionPool.getPool(credentials);
        }
    }

    /**
     * Executar query SQL padrão
     */
    private async executeQuery(connection: Connection, debugMode: boolean): Promise<INodeExecutionData[]> {
        const statement = this.getNodeParameter("statement", 0) as string;
        const autoCommit = this.getNodeParameter("autoCommit", 0) as boolean;
        const bindParameters = this.processParameters();

        if (debugMode) {
            console.log('Executando query:', statement);
            console.log('Parâmetros:', bindParameters);
        }

        const result = await connection.execute(statement, bindParameters, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit,
        });

        return this.helpers.returnJsonArray(result.rows as unknown as IDataObject[]);
    }

    /**
     * Executar bloco PL/SQL
     */
    private async executePLSQL(connection: Connection, debugMode: boolean): Promise<INodeExecutionData[]> {
        const statement = this.getNodeParameter("statement", 0) as string;
        const autoCommit = this.getNodeParameter("autoCommit", 0) as boolean;
        const bindParameters = this.processParameters();

        const executor = debugMode ? 
            PLSQLExecutorFactory.createDevelopmentExecutor(connection) :
            PLSQLExecutorFactory.createProductionExecutor(connection);

        const result = await executor.executeAnonymousBlock(statement, bindParameters, {
            autoCommit
        });

        return this.helpers.returnJsonArray([{
            success: result.success,
            executionTime: result.executionTime,
            outBinds: result.outBinds,
            implicitResults: result.implicitResults,
            rowsAffected: result.rowsAffected,
            warnings: result.warnings,
            compilationErrors: result.compilationErrors
        }]);
    }

    /**
     * Executar stored procedure
     */
    private async executeProcedure(connection: Connection, debugMode: boolean): Promise<INodeExecutionData[]> {
        const statement = this.getNodeParameter("statement", 0) as string;
        const autoCommit = this.getNodeParameter("autoCommit", 0) as boolean;
        const bindParameters = this.processParameters();

        // Extrair nome da procedure do statement
        const procedureName = this.extractProcedureName(statement);
        
        const executor = debugMode ? 
            PLSQLExecutorFactory.createDevelopmentExecutor(connection) :
            PLSQLExecutorFactory.createProductionExecutor(connection);

        const result = await executor.executeProcedure(procedureName, bindParameters, {
            autoCommit
        });

        return this.helpers.returnJsonArray([result]);
    }

    /**
     * Executar function
     */
    private async executeFunction(connection: Connection, debugMode: boolean): Promise<INodeExecutionData[]> {
        const statement = this.getNodeParameter("statement", 0) as string;
        const autoCommit = this.getNodeParameter("autoCommit", 0) as boolean;
        const bindParameters = this.processParameters();

        // Extrair nome da function do statement
        const functionName = this.extractFunctionName(statement);
        
        const executor = debugMode ? 
            PLSQLExecutorFactory.createDevelopmentExecutor(connection) :
            PLSQLExecutorFactory.createProductionExecutor(connection);

        const result = await executor.executeFunction(functionName, bindParameters, 'VARCHAR2', {
            autoCommit
        });

        return this.helpers.returnJsonArray([result]);
    }

    /**
     * Executar operações em massa
     */
    private async executeBulkOperations(connection: Connection, debugMode: boolean): Promise<INodeExecutionData[]> {
        const bulkOperation = this.getNodeParameter("bulkOperation", 0) as string;
        const tableName = this.getNodeParameter("tableName", 0) as string;
        const batchSize = this.getNodeParameter("batchSize", 0) as number;
        const continueOnError = this.getNodeParameter("continueOnError", 0) as boolean;
        const keyColumns = this.getNodeParameter("keyColumns", 0) as string;

        // Obter dados de entrada
        const inputData = this.getInputData();
        const data = inputData.map(item => item.json);

        const bulkOps = BulkOperationsFactory.createHighVolumeOperations(connection);

        let result;
        const keyColumnsList = keyColumns ? keyColumns.split(',').map(col => col.trim()) : [];

        switch (bulkOperation) {
            case 'insert':
                result = await bulkOps.bulkInsert(tableName, data, {
                    batchSize,
                    continueOnError,
                    autoCommit: true
                });
                break;
            case 'update':
                result = await bulkOps.bulkUpdate(tableName, data, {
                    batchSize,
                    continueOnError,
                    autoCommit: true,
                    whereColumns: keyColumnsList
                });
                break;
            case 'delete':
                result = await bulkOps.bulkDelete(tableName, data, {
                    batchSize,
                    continueOnError,
                    autoCommit: true,
                    whereColumns: keyColumnsList
                });
                break;
            case 'upsert':
                result = await bulkOps.bulkUpsert(tableName, data, keyColumnsList, {
                    batchSize,
                    continueOnError,
                    autoCommit: true
                });
                break;
            default:
                throw new Error(`Operação bulk não suportada: ${bulkOperation}`);
        }

        return this.helpers.returnJsonArray([result]);
    }

    /**
     * Executar transação complexa
     */
    private async executeTransaction(connection: Connection, debugMode: boolean): Promise<INodeExecutionData[]> {
        const transactionType = this.getNodeParameter("transactionType", 0) as string;
        const statement = this.getNodeParameter("statement", 0) as string;
        const continueOnError = this.getNodeParameter("continueOnError", 0) as boolean;

        let txManager;
        switch (transactionType) {
            case 'oltp':
                txManager = TransactionManagerFactory.createOLTPManager(connection);
                break;
            case 'batch':
                txManager = TransactionManagerFactory.createBatchManager(connection);
                break;
            case 'analytics':
                txManager = TransactionManagerFactory.createAnalyticsManager(connection);
                break;
            case 'critical':
                txManager = TransactionManagerFactory.createCriticalManager(connection);
                break;
            default:
                txManager = TransactionManagerFactory.createOLTPManager(connection);
        }

        try {
            await txManager.beginTransaction();
            
            // Dividir statement em múltiplas operações se separadas por ';'
            const operations = statement.split(';').filter(s => s.trim()).map(sql => ({
                sql: sql.trim(),
                binds: this.processParameters(),
                name: `operation_${Date.now()}`
            }));

            const results = await txManager.executeBatch(operations, {
                savepointPerOperation: true,
                stopOnError: !continueOnError
            });

            await txManager.commit();

            return this.helpers.returnJsonArray([{
                success: true,
                transactionInfo: txManager.getTransactionInfo(),
                operationResults: results
            }]);

        } catch (error) {
            await txManager.rollback();
            throw error;
        }
    }

    /**
     * Executar operações de Advanced Queuing
     */
    private async executeAQOperations(connection: Connection, debugMode: boolean): Promise<INodeExecutionData[]> {
        const queueOperation = this.getNodeParameter("queueOperation", 0) as string;
        const queueName = this.getNodeParameter("queueName", 0) as string;

        const aqOps = new AQOperations(connection);

        let result;
        
        switch (queueOperation) {
            case 'enqueue':
                const messagePayload = this.getNodeParameter("messagePayload", 0) as string;
                const messagePriority = this.getNodeParameter("messagePriority", 0) as number;
                const correlationId = this.getNodeParameter("correlationId", 0) as string;

                result = await aqOps.enqueueMessage(queueName, {
                    payload: JSON.parse(messagePayload),
                    priority: messagePriority,
                    correlationId: correlationId || undefined
                });
                break;

            case 'dequeue':
                const waitTime = this.getNodeParameter("waitTime", 0) as number;
                const maxMessages = this.getNodeParameter("maxMessages", 0) as number;
                const dequeueCorrelationId = this.getNodeParameter("correlationId", 0) as string;

                if (maxMessages > 1) {
                    result = await aqOps.dequeueMultiple(queueName, maxMessages, {
                        waitTime,
                        correlationId: dequeueCorrelationId || undefined
                    });
                } else {
                    const singleResult = await aqOps.dequeueMessage(queueName, {
                        waitTime,
                        correlationId: dequeueCorrelationId || undefined
                    });
                    result = [singleResult];
                }
                break;

            case 'info':
                result = await aqOps.getQueueInfo(queueName);
                break;

            case 'create':
                const createResult = await aqOps.createQueue(queueName, `${queueName}_TABLE`);
                result = { success: createResult, queueName };
                break;

            case 'purge':
                result = await aqOps.purgeQueue(queueName);
                break;

            default:
                throw new Error(`Operação de fila não suportada: ${queueOperation}`);
        }

        return this.helpers.returnJsonArray(Array.isArray(result) ? result : [result]);
    }

    /**
     * Processar parâmetros do node original
     */
    private processParameters(): { [key: string]: any } {
        const parameterList = ((this.getNodeParameter('params', 0, {}) as IDataObject).values as { 
            name: string, 
            value: string | number, 
            datatype: string, 
            parseInStatement: boolean 
        }[]) || [];

        const bindParameters: { [key: string]: any } = {};

        for (const param of parameterList) {
            let value: any = param.value;
            
            // Converter tipo se necessário
            switch (param.datatype) {
                case 'number':
                    value = Number(param.value);
                    break;
                case 'date':
                    value = new Date(param.value);
                    break;
                case 'out':
                    value = { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 };
                    break;
                case 'clob':
                    value = { type: oracledb.CLOB, val: param.value };
                    break;
            }

            bindParameters[param.name] = value;
        }

        return bindParameters;
    }

    /**
     * Extrair nome da procedure do statement
     */
    private extractProcedureName(statement: string): string {
        const match = statement.match(/(?:CALL|EXEC|EXECUTE)\s+(\w+(?:\.\w+)?)/i);
        return match ? match[1] : statement.split('(')[0].trim();
    }

    /**
     * Extrair nome da function do statement  
     */
    private extractFunctionName(statement: string): string {
        const match = statement.match(/(\w+(?:\.\w+)?)\s*\(/);
        return match ? match[1] : statement.trim();
    }
}

// Declaração global para replaceAll polyfill
declare global {
    interface String {
        replaceAll(match: string | RegExp, replace: string): string;
    }
}

// Implementação do polyfill
if (typeof String.prototype.replaceAll === 'undefined') {
    String.prototype.replaceAll = function (match: string | RegExp, replace: string): string {
        return this.replace(new RegExp(match, 'g'), replace);
    };
}
