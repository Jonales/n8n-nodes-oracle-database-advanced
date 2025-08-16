"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OracleDatabase = void 0;
const crypto_1 = require("crypto");
const n8n_workflow_1 = require("n8n-workflow");
const oracledb_1 = __importDefault(require("oracledb"));
const connection_1 = require("./connection");
if (typeof String.prototype.replaceAll === 'undefined') {
    String.prototype.replaceAll = function (searchValue, replaceValue) {
        if (typeof replaceValue === 'function') {
            return this.replace(new RegExp(searchValue, 'g'), replaceValue);
        }
        return this.replace(new RegExp(searchValue, 'g'), replaceValue);
    };
}
class OracleDatabase {
    description = {
        displayName: 'Oracle Database with Parameterization',
        name: 'oracleDatabaseParameterized',
        icon: 'file:oracle.svg',
        group: ['input'],
        version: 1,
        description: 'Execute SQL queries on Oracle database with parameter support - embedded thin client',
        defaults: {
            name: 'Oracle Database',
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
                displayName: 'SQL Statement',
                name: 'query',
                type: 'string',
                typeOptions: {
                    alwaysOpenEditWindow: true,
                },
                default: '',
                placeholder: 'SELECT id, name FROM product WHERE id < :param_name',
                required: true,
                description: 'The SQL query to execute. Use :param_name for parameters.',
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
                description: 'Parameters for the SQL query',
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
                                    { name: 'Yes', value: true },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
    generateUniqueId() {
        try {
            return (0, crypto_1.randomUUID)().replaceAll('-', '_');
        }
        catch {
            return (Math.random().toString(36).substring(2, 15) +
                Math.random().toString(36).substring(2, 15));
        }
    }
    validateParameters(parameters, node) {
        for (const param of parameters) {
            if (!param.name || param.name.trim() === '') {
                throw new n8n_workflow_1.NodeOperationError(node, 'Parameter name cannot be empty');
            }
            if (param.parseInStatement && (!param.value || param.value.toString().trim() === '')) {
                throw new n8n_workflow_1.NodeOperationError(node, `Parameter '${param.name}' marked for IN statement but has no values`);
            }
        }
    }
    getOracleDataType(datatype) {
        return datatype === 'number' ? oracledb_1.default.NUMBER : oracledb_1.default.STRING;
    }
    convertValue(value, datatype) {
        return datatype === 'number' ? Number(value) : String(value);
    }
    processNormalParameter(item, bindParameters) {
        bindParameters[item.name] = {
            type: this.getOracleDataType(item.datatype),
            val: this.convertValue(item.value, item.datatype),
        };
    }
    processInStatementParameter(item, bindParameters, query, node) {
        const valList = item.value.toString().split(',').map(v => v.trim());
        if (valList.length === 0) {
            throw new n8n_workflow_1.NodeOperationError(node, `Parameter '${item.name}' for IN statement cannot be empty`);
        }
        const placeholders = [];
        const datatype = this.getOracleDataType(item.datatype);
        valList.forEach((val, index) => {
            const paramName = `${item.name}_${index}_${this.generateUniqueId()}`;
            placeholders.push(`:${paramName}`);
            bindParameters[paramName] = {
                type: datatype,
                val: this.convertValue(val, item.datatype),
            };
        });
        const inClause = `(${placeholders.join(',')})`;
        return query.replaceAll(`:${item.name}`, inClause);
    }
    processParameters(parameters, query, node) {
        this.validateParameters(parameters, node);
        const bindParameters = {};
        let processedQuery = query;
        for (const item of parameters) {
            if (item.parseInStatement) {
                processedQuery = this.processInStatementParameter(item, bindParameters, processedQuery, node);
            }
            else {
                this.processNormalParameter(item, bindParameters);
            }
        }
        return { bindParameters, processedQuery };
    }
    validateQuery(query, node) {
        if (!query || query.trim() === '') {
            throw new n8n_workflow_1.NodeOperationError(node, 'SQL query cannot be empty');
        }
    }
    async execute() {
        const credentials = await this.getCredentials('oracleCredentials');
        const oracleCredentials = {
            user: String(credentials.user),
            password: String(credentials.password),
            connectionString: String(credentials.connectionString),
        };
        const db = new connection_1.OracleConnection(oracleCredentials);
        let connection;
        let returnItems = [];
        try {
            connection = await db.getConnection();
            const query = this.getNodeParameter('query', 0);
            const oracleInstance = new OracleDatabase();
            oracleInstance.validateQuery(query, this.getNode());
            const parameterList = this.getNodeParameter('params', 0, {}).values || [];
            const { bindParameters, processedQuery } = oracleInstance.processParameters(parameterList, query, this.getNode());
            console.log('Executing query:', processedQuery);
            console.log('Parameters:', Object.keys(bindParameters));
            const result = await connection.execute(processedQuery, bindParameters, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT,
                autoCommit: true,
            });
            returnItems = this.helpers.returnJsonArray(result.rows);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Oracle Database execution failed:', {
                error: errorMessage,
                nodeId: this.getNode().id,
            });
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Oracle Database Error: ${errorMessage}`, {
                description: 'Check your SQL query and parameters for syntax errors'
            });
        }
        finally {
            if (connection) {
                try {
                    await connection.close();
                }
                catch (closeError) {
                    console.error(`OracleDB: Failed to close the database connection: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
                }
            }
        }
        return this.prepareOutputData(returnItems);
    }
}
exports.OracleDatabase = OracleDatabase;
//# sourceMappingURL=OracleDatabase.node.js.map