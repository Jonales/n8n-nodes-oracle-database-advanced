import { IExecuteFunctions } from "n8n-core";

import {
    IDataObject,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
} from "n8n-workflow";

import oracledb from "oracledb";
import { OracleConnection } from "./core/connection";

export class OracleDatabase implements INodeType {
    description: INodeTypeDescription = {
        displayName: "Oracle Database with Parameterization",
        name: "Oracle Database with Parameterization",
        icon: "file:oracle.svg",
        group: ["input"],
        version: 1,
        description: "Execute SQL queries on Oracle database with parameter support - embedded thin client",
        defaults: {
            name: "Oracle Database",
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
                displayName: "SQL Statement",
                name: "query",
                type: "string",
                typeOptions: {
                    alwaysOpenEditWindow: true
                },
                default: "",
                placeholder: "SELECT id, name FROM product WHERE id < :param_name",
                required: true,
                description: "The SQL query to execute. Use :param_name for parameters.",
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
                                    { name: 'Number', value: 'number' }
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
        // Polyfill for older Node.js versions
        if (typeof String.prototype.replaceAll === "undefined") {
            String.prototype.replaceAll = function (match, replace) {
                return this.replace(new RegExp(match, 'g'), () => replace);
            };
        }

        const credentials = await this.getCredentials("oracleCredentials");
        
        const oracleCredentials = {
            user: String(credentials.user),
            password: String(credentials.password),
            connectionString: String(credentials.connectionString),
        };

        // Simplified connection without thinMode parameter
        const db = new OracleConnection(oracleCredentials);
        
        let connection;
        let returnItems: INodeExecutionData[] = [];

        try {
            connection = await db.getConnection();

            // Get query
            let query = this.getNodeParameter("query", 0) as string;

            // Get list of param objects entered by user
            const parameterIDataObjectList = ((this.getNodeParameter('params', 0, {}) as IDataObject).values as { 
                name: string, 
                value: string | number, 
                datatype: string, 
                parseInStatement: boolean 
            }[]) || [];

            // Convert parameterIDataObjectList to map of BindParameters that OracleDB wants
            const bindParameters: { [key: string]: oracledb.BindParameter } = parameterIDataObjectList.reduce((result: { [key: string]: oracledb.BindParameter }, item) => {
                // Set data type to be correct type
                let datatype: number | string | undefined = undefined;
                if (item.datatype && item.datatype === 'number') {
                    datatype = oracledb.NUMBER;
                } else {
                    datatype = oracledb.STRING;
                }

                if (!item.parseInStatement) {
                    // Normal process
                    result[item.name] = { 
                        type: datatype, 
                        val: item.datatype && item.datatype === 'number' ? Number(item.value) : String(item.value) 
                    };
                    return result;
                } else {
                    // Make it possible to use a parameter for an IN statement
                    const valList = item.value.toString().split(',');
                    let generatedSqlString = '(';
                    const crypto = require('crypto');
                    
                    for (let i = 0; i < valList.length; i++) {
                        // Generate unique parameter names for each item in list
                        const uniqueId: string = crypto.randomUUID().replaceAll('-', '_');
                        const newParamName = item.name + uniqueId;
                        
                        // Add new param to param list
                        result[newParamName] = { 
                            type: datatype, 
                            val: item.datatype && item.datatype === 'number' ? Number(valList[i].trim()) : String(valList[i].trim()) 
                        };
                        
                        // Create sql string for list with new param names
                        generatedSqlString += `:${newParamName},`;
                    }
                    
                    generatedSqlString = generatedSqlString.slice(0, -1) + ')'; // Replace trailing comma with closing parenthesis
                    
                    // Replace all occurrences of original parameter name with new generated sql
                    query = query.replaceAll(":" + item.name, generatedSqlString);
                    return result;
                }
            }, {});

            // Execute query
            const result = await connection.execute(
                query,
                bindParameters,
                {
                    outFormat: oracledb.OUT_FORMAT_OBJECT,
                    autoCommit: true,
                },
            );

            returnItems = this.helpers.returnJsonArray(
                result.rows as unknown as IDataObject[]
            );

        } catch (error) {
            throw new NodeOperationError(this.getNode(), `Oracle Database Error: ${error.message}`);
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (error) {
                    console.error(`OracleDB: Failed to close the database connection: ${error}`);
                }
            }
        }

        return this.prepareOutputData(returnItems);
    }
}

// Global declaration for replaceAll polyfill
declare global {
    interface String {
        replaceAll(match: string | RegExp, replace: string): string;
    }
}

// Polyfill implementation
if (typeof String.prototype.replaceAll === 'undefined') {
    String.prototype.replaceAll = function (match: string | RegExp, replace: string): string {
        return this.replace(new RegExp(match, 'g'), replace);
    };
}
