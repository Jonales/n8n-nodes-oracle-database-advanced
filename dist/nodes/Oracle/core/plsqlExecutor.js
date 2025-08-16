"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLSQLExecutorFactory = exports.PLSQLExecutor = void 0;
const oracledb_1 = __importDefault(require("oracledb"));
class PLSQLExecutor {
    connection;
    debugMode = false;
    constructor(connection, debugMode = false) {
        this.connection = connection;
        this.debugMode = debugMode;
    }
    async executeAnonymousBlock(plsqlBlock, binds = {}, options = {}) {
        const startTime = Date.now();
        const warnings = [];
        this.validatePLSQLBlock(plsqlBlock);
        const execOptions = {
            autoCommit: options.autoCommit !== false,
            outFormat: options.outFormat || oracledb_1.default.OUT_FORMAT_OBJECT,
            fetchArraySize: options.fetchArraySize || 100,
            maxRows: options.maxRows || 0,
            ...options,
        };
        try {
            const detectedOutParams = this.detectOutputParameters(plsqlBlock);
            const finalBinds = { ...binds };
            for (const param of detectedOutParams) {
                if (!(param in finalBinds)) {
                    finalBinds[param] = {
                        dir: oracledb_1.default.BIND_OUT,
                        type: oracledb_1.default.STRING,
                        maxSize: 4000,
                    };
                }
            }
            if (this.debugMode) {
                console.log('Executando bloco PL/SQL:', plsqlBlock.substring(0, 200) + '...');
                console.log('Parâmetros:', finalBinds);
            }
            if (options.timeout) {
                this.setExecutionTimeout(options.timeout);
            }
            const result = await this.connection.execute(plsqlBlock, finalBinds, execOptions);
            const executionTime = Date.now() - startTime;
            const implicitResults = await this.processImplicitResults(result.implicitResults);
            return {
                success: true,
                executionTime,
                outBinds: result.outBinds || {},
                implicitResults,
                rowsAffected: result.rowsAffected,
                warnings,
                compilationErrors: [],
            };
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            const compilationErrors = await this.checkCompilationErrors(plsqlBlock);
            return {
                success: false,
                executionTime,
                outBinds: {},
                implicitResults: [],
                warnings: [error instanceof Error ? error.message : String(error)],
                compilationErrors,
            };
        }
    }
    async executeProcedure(procedureName, parameters = {}, options = {}) {
        const procMetadata = await this.getProcedureMetadata(procedureName);
        const paramList = Object.keys(parameters)
            .map((param) => `:${param}`)
            .join(', ');
        const plsqlCall = `BEGIN ${procedureName}(${paramList}); END;`;
        const configuredBinds = this.configureBindsFromMetadata(parameters, procMetadata);
        return this.executeAnonymousBlock(plsqlCall, configuredBinds, options);
    }
    async executeFunction(functionName, parameters = {}, returnType = 'VARCHAR2', options = {}) {
        const paramList = Object.keys(parameters)
            .map((param) => `:${param}`)
            .join(', ');
        const plsqlCall = `BEGIN :result := ${functionName}(${paramList}); END;`;
        const configuredBinds = {
            result: {
                dir: oracledb_1.default.BIND_OUT,
                type: this.getOracleType(returnType),
                maxSize: 4000,
            },
            ...parameters,
        };
        return this.executeAnonymousBlock(plsqlCall, configuredBinds, options);
    }
    async executeBatch(blocks, options = {}) {
        const results = [];
        const { stopOnError = true } = options;
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            try {
                let result;
                switch (block.type) {
                    case 'anonymous':
                        result = await this.executeAnonymousBlock(block.sql, block.inputParams, options);
                        break;
                    case 'procedure':
                        result = await this.executeProcedure(block.name, block.inputParams, options);
                        break;
                    case 'function':
                        result = await this.executeFunction(block.name, block.inputParams, block.returnType, options);
                        break;
                    default:
                        throw new Error(`Tipo de bloco não suportado: ${block.type}`);
                }
                results.push(result);
                if (!result.success && stopOnError) {
                    console.error(`Erro no bloco ${i + 1}, parando execução`);
                    break;
                }
            }
            catch (error) {
                const errorResult = {
                    success: false,
                    executionTime: 0,
                    outBinds: {},
                    implicitResults: [],
                    warnings: [error instanceof Error ? error.message : String(error)],
                    compilationErrors: [],
                };
                results.push(errorResult);
                if (stopOnError) {
                    console.error(`Erro no bloco ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
                    break;
                }
            }
        }
        return results;
    }
    async executePackageItem(packageName, itemName, itemType, parameters = {}, returnType, options = {}) {
        const fullName = `${packageName}.${itemName}`;
        if (itemType === 'procedure') {
            return this.executeProcedure(fullName, parameters, options);
        }
        else {
            return this.executeFunction(fullName, parameters, returnType || 'VARCHAR2', options);
        }
    }
    async executeDynamicPLSQL(template, substitutions, parameters = {}, options = {}) {
        let dynamicSQL = template;
        for (const [placeholder, value] of Object.entries(substitutions)) {
            const regex = new RegExp(`\\$\\{${placeholder}\\}`, 'g');
            dynamicSQL = dynamicSQL.replace(regex, value);
        }
        this.validateDynamicSQL(dynamicSQL);
        return this.executeAnonymousBlock(dynamicSQL, parameters, options);
    }
    async getCompilationInfo(objectName, objectType) {
        const sql = `
            SELECT line, position, text, attribute, message_number
            FROM user_errors 
            WHERE name = UPPER(:objectName) 
              AND type = UPPER(:objectType)
            ORDER BY sequence
        `;
        const result = await this.connection.execute(sql, {
            objectName,
            objectType,
        }, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
        return result.rows;
    }
    async getDependencies(objectName, objectType) {
        const sql = `
            SELECT referenced_owner, referenced_name, referenced_type, referenced_link_name
            FROM user_dependencies 
            WHERE name = UPPER(:objectName) 
              AND type = UPPER(:objectType)
            ORDER BY referenced_owner, referenced_name
        `;
        const result = await this.connection.execute(sql, {
            objectName,
            objectType,
        }, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
        return result.rows;
    }
    validatePLSQLBlock(plsqlBlock) {
        const trimmed = plsqlBlock.trim().toUpperCase();
        if (!trimmed.startsWith('BEGIN') && !trimmed.startsWith('DECLARE')) {
            throw new Error('Bloco PL/SQL deve começar com BEGIN ou DECLARE');
        }
        if (!trimmed.endsWith('END;') && !trimmed.endsWith('END')) {
            throw new Error('Bloco PL/SQL deve terminar com END;');
        }
        const beginCount = (plsqlBlock.match(/\bBEGIN\b/gi) || []).length;
        const endCount = (plsqlBlock.match(/\bEND\b/gi) || []).length;
        if (beginCount !== endCount) {
            throw new Error(`Desbalanceamento de BEGIN/END: ${beginCount} BEGIN(s), ${endCount} END(s)`);
        }
    }
    detectOutputParameters(plsqlBlock) {
        const outParams = [];
        const assignmentRegex = /:(\w+)\s*:=/g;
        let match;
        while ((match = assignmentRegex.exec(plsqlBlock)) !== null) {
            outParams.push(match[1]);
        }
        const outParamRegex = /:(\w+)\s+OUT/gi;
        while ((match = outParamRegex.exec(plsqlBlock)) !== null) {
            outParams.push(match[1]);
        }
        return [...new Set(outParams)];
    }
    async processImplicitResults(implicitResults) {
        if (!implicitResults || implicitResults.length === 0) {
            return [];
        }
        const results = [];
        for (const resultSet of implicitResults) {
            const rows = [];
            let row;
            while ((row = await resultSet.getRow())) {
                rows.push(row);
            }
            await resultSet.close();
            results.push(rows);
        }
        return results;
    }
    async checkCompilationErrors(plsqlBlock) {
        return [];
    }
    async getProcedureMetadata(procedureName) {
        const sql = `
            SELECT argument_name, data_type, in_out, position
            FROM user_arguments 
            WHERE object_name = UPPER(:procedureName)
            ORDER BY position
        `;
        const result = await this.connection.execute(sql, {
            procedureName: procedureName.split('.').pop(),
        }, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
        return result.rows;
    }
    configureBindsFromMetadata(parameters, metadata) {
        const configuredBinds = {};
        for (const param of metadata) {
            const paramName = param.ARGUMENT_NAME?.toLowerCase();
            if (!paramName)
                continue;
            if (param.IN_OUT === 'OUT' || param.IN_OUT === 'IN OUT') {
                configuredBinds[paramName] = {
                    dir: param.IN_OUT === 'OUT' ? oracledb_1.default.BIND_OUT : oracledb_1.default.BIND_INOUT,
                    type: this.getOracleType(param.DATA_TYPE),
                    maxSize: 4000,
                    val: parameters[paramName],
                };
            }
            else {
                configuredBinds[paramName] = parameters[paramName];
            }
        }
        return configuredBinds;
    }
    typeMap = {
        VARCHAR2: oracledb_1.default.STRING,
        CHAR: oracledb_1.default.STRING,
        NVARCHAR2: oracledb_1.default.STRING,
        NCHAR: oracledb_1.default.STRING,
        NUMBER: oracledb_1.default.NUMBER,
        BINARY_INTEGER: oracledb_1.default.NUMBER,
        PLS_INTEGER: oracledb_1.default.NUMBER,
        DATE: oracledb_1.default.DATE,
        TIMESTAMP: oracledb_1.default.DATE,
        CLOB: oracledb_1.default.CLOB,
        BLOB: oracledb_1.default.BLOB,
        CURSOR: oracledb_1.default.CURSOR,
    };
    getOracleType(dataType) {
        return this.typeMap[dataType.toUpperCase()] || oracledb_1.default.STRING;
    }
    validateDynamicSQL(sql) {
        const dangerousPatterns = [
            /DROP\s+TABLE/i,
            /DROP\s+DATABASE/i,
            /TRUNCATE/i,
            /DELETE\s+FROM.*WHERE\s+1\s*=\s*1/i,
        ];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(sql)) {
                throw new Error(`SQL dinâmico contém padrão perigoso: ${pattern.source}`);
            }
        }
    }
    setExecutionTimeout(timeoutSeconds) {
        setTimeout(() => {
            console.warn(`Execução PL/SQL excedeu timeout de ${timeoutSeconds}s`);
        }, timeoutSeconds * 1000);
    }
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }
}
exports.PLSQLExecutor = PLSQLExecutor;
class PLSQLExecutorFactory {
    static createDevelopmentExecutor(connection) {
        return new PLSQLExecutor(connection, true);
    }
    static createProductionExecutor(connection) {
        return new PLSQLExecutor(connection, false);
    }
}
exports.PLSQLExecutorFactory = PLSQLExecutorFactory;
//# sourceMappingURL=plsqlExecutor.js.map