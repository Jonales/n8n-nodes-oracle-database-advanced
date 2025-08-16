"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OracleDatabaseAdvanced = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const oracledb_1 = __importDefault(require("oracledb"));
const aqOperations_1 = require("./core/aqOperations");
const bulkOperations_1 = require("./core/bulkOperations");
const connectionPool_1 = require("./core/connectionPool");
const plsqlExecutor_1 = require("./core/plsqlExecutor");
const transactionManager_1 = require("./core/transactionManager");
class OracleDatabaseAdvanced {
    description = {
        displayName: 'Oracle Database Advanced',
        name: 'oracleDatabaseAdvanced',
        icon: 'file:oracle.svg',
        group: ['transform'],
        version: 1,
        description: 'Oracle Database com recursos avançados para cargas pesadas e Oracle 19c+',
        defaults: {
            name: 'Oracle Database Advanced',
        },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [
            {
                name: 'oracleCredentials',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Operation Type',
                name: 'operationType',
                type: 'options',
                default: 'query',
                options: [
                    { name: 'SQL Query', value: 'query' },
                    { name: 'PL/SQL Block', value: 'plsql' },
                    { name: 'Stored Procedure', value: 'procedure' },
                    { name: 'Function', value: 'function' },
                    { name: 'Bulk Operations', value: 'bulk' },
                    { name: 'Transaction Block', value: 'transaction' },
                    { name: 'Oracle AQ', value: 'queue' },
                ],
            },
            {
                displayName: 'SQL/PL/SQL Statement',
                name: 'statement',
                type: 'string',
                typeOptions: {
                    alwaysOpenEditWindow: true,
                    rows: 10,
                },
                default: '',
                description: 'SQL query ou PL/SQL block para executar',
            },
            {
                displayName: 'Connection Pool',
                name: 'connectionPool',
                type: 'options',
                default: 'standard',
                options: [
                    { name: 'Standard Pool', value: 'standard' },
                    { name: 'High Volume Pool', value: 'highvolume' },
                    { name: 'OLTP Pool', value: 'oltp' },
                    { name: 'Analytics Pool', value: 'analytics' },
                    { name: 'Single Connection', value: 'single' },
                ],
            },
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
                                required: true,
                            },
                            {
                                displayName: 'Value',
                                name: 'value',
                                type: 'string',
                                default: '',
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
                                    { name: 'OUT Parameter', value: 'out' },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
    async execute() {
        const credentials = await this.getCredentials('oracleCredentials');
        const operationType = this.getNodeParameter('operationType', 0);
        const connectionPoolType = this.getNodeParameter('connectionPool', 0);
        const oracleCredentials = {
            user: String(credentials.user),
            password: String(credentials.password),
            connectionString: String(credentials.connectionString),
        };
        let connection;
        let returnItems = [];
        try {
            const getPoolConfig = (poolType) => {
                switch (poolType) {
                    case 'highvolume':
                        return connectionPool_1.OracleConnectionPool.getHighVolumeConfig();
                    case 'oltp':
                        return connectionPool_1.OracleConnectionPool.getOLTPConfig();
                    case 'analytics':
                        return connectionPool_1.OracleConnectionPool.getAnalyticsConfig();
                    default:
                        return {};
                }
            };
            const processParameters = () => {
                const parameterList = this.getNodeParameter('params', 0, {}).values || [];
                const bindParameters = {};
                for (const param of parameterList) {
                    let value = param.value;
                    switch (param.datatype) {
                        case 'number':
                            value = Number(param.value);
                            break;
                        case 'date':
                            value = new Date(param.value);
                            break;
                        case 'out':
                            value = {
                                dir: oracledb_1.default.BIND_OUT,
                                type: oracledb_1.default.STRING,
                                maxSize: 4000,
                            };
                            break;
                        case 'clob':
                            value = { type: oracledb_1.default.CLOB, val: param.value };
                            break;
                    }
                    bindParameters[param.name] = value;
                }
                return bindParameters;
            };
            const executeQuery = async (conn) => {
                const statement = this.getNodeParameter('statement', 0);
                const bindParameters = processParameters();
                const result = await conn.execute(statement, bindParameters, {
                    outFormat: oracledb_1.default.OUT_FORMAT_OBJECT,
                    autoCommit: true,
                });
                return this.helpers.returnJsonArray(result.rows);
            };
            const executePLSQL = async (conn) => {
                const statement = this.getNodeParameter('statement', 0);
                const bindParameters = processParameters();
                const executor = plsqlExecutor_1.PLSQLExecutorFactory.createProductionExecutor(conn);
                const result = await executor.executeAnonymousBlock(statement, bindParameters);
                return this.helpers.returnJsonArray([result]);
            };
            const executeBulkOperations = async (conn) => {
                const inputData = this.getInputData();
                const data = inputData.map((item) => item.json);
                const bulkOps = bulkOperations_1.BulkOperationsFactory.createHighVolumeOperations(conn);
                const result = await bulkOps.bulkInsert('target_table', data, {
                    batchSize: 5000,
                    continueOnError: true,
                    autoCommit: true,
                });
                return this.helpers.returnJsonArray([result]);
            };
            const executeTransaction = async (conn) => {
                const statement = this.getNodeParameter('statement', 0);
                const txManager = transactionManager_1.TransactionManagerFactory.createBatchManager(conn);
                await txManager.beginTransaction();
                try {
                    const operations = statement
                        .split(';')
                        .filter((s) => s.trim())
                        .map((sql) => ({
                        sql: sql.trim(),
                        binds: processParameters(),
                    }));
                    const results = await txManager.executeBatch(operations, {
                        savepointPerOperation: true,
                        stopOnError: true,
                    });
                    await txManager.commit();
                    return this.helpers.returnJsonArray([{ success: true, results }]);
                }
                catch (error) {
                    await txManager.rollback();
                    throw error;
                }
            };
            const executeAQOperations = async (conn) => {
                const aqOps = new aqOperations_1.AQOperations(conn);
                const queueName = this.getNodeParameter('queueName', 0, 'DEFAULT_QUEUE');
                const result = await aqOps.getQueueInfo(queueName);
                return this.helpers.returnJsonArray([result]);
            };
            if (connectionPoolType === 'single') {
                connection = await oracledb_1.default.getConnection(oracleCredentials);
            }
            else {
                const poolConfig = getPoolConfig(connectionPoolType);
                const pool = await connectionPool_1.OracleConnectionPool.getPool(oracleCredentials, poolConfig);
                connection = await pool.getConnection();
            }
            switch (operationType) {
                case 'query':
                    returnItems = await executeQuery(connection);
                    break;
                case 'plsql':
                    returnItems = await executePLSQL(connection);
                    break;
                case 'bulk':
                    returnItems = await executeBulkOperations(connection);
                    break;
                case 'transaction':
                    returnItems = await executeTransaction(connection);
                    break;
                case 'queue':
                    returnItems = await executeAQOperations(connection);
                    break;
                default:
                    throw new Error(`Tipo de operação não suportado: ${operationType}`);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Oracle Advanced Error: ${errorMessage}`);
        }
        finally {
            if (connection) {
                try {
                    await connection.close();
                }
                catch (closeError) {
                    const closeErrorMessage = closeError instanceof Error
                        ? closeError.message
                        : String(closeError);
                    console.error(`Falha ao fechar conexão: ${closeErrorMessage}`);
                }
            }
        }
        return this.prepareOutputData(returnItems);
    }
}
exports.OracleDatabaseAdvanced = OracleDatabaseAdvanced;
//# sourceMappingURL=OracleDatabaseAdvanced.js.map