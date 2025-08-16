"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionManagerFactory = exports.TransactionManager = void 0;
class TransactionManager {
    connection;
    savepoints = [];
    transactionStartTime;
    options;
    isTransactionActive = false;
    retryCount = 0;
    constructor(connection, options = {}) {
        this.connection = connection;
        this.options = {
            isolation: 'READ_COMMITTED',
            timeout: 300,
            autoRollbackOnError: true,
            maxRetries: 3,
            retryDelay: 1000,
            ...options,
        };
    }
    async beginTransaction() {
        if (this.isTransactionActive) {
            throw new Error('Transação já está ativa. Use commit() ou rollback() primeiro.');
        }
        try {
            if (this.options.isolation &&
                this.options.isolation !== 'READ_COMMITTED') {
                await this.setIsolationLevel(this.options.isolation);
            }
            if (this.options.timeout) {
                await this.setTransactionTimeout(this.options.timeout);
            }
            this.transactionStartTime = new Date();
            this.isTransactionActive = true;
            this.retryCount = 0;
            console.log(`Transação iniciada às ${this.transactionStartTime.toISOString()}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error
                ? error instanceof Error
                    ? error.message
                    : String(error)
                : String(error);
            throw new Error(`Falha ao iniciar transação: ${errorMessage}`);
        }
    }
    async createSavepoint(name, description) {
        if (!this.isTransactionActive) {
            throw new Error('Nenhuma transação ativa para criar savepoint');
        }
        if (!this.isValidSavepointName(name)) {
            throw new Error('Nome do savepoint inválido. Use apenas letras, números e underscore.');
        }
        if (this.savepoints.find((sp) => sp.name === name)) {
            throw new Error(`Savepoint '${name}' já existe`);
        }
        try {
            await this.connection.execute(`SAVEPOINT ${name}`);
            const savepointInfo = {
                name,
                timestamp: new Date(),
                description,
            };
            this.savepoints.push(savepointInfo);
            console.log(`Savepoint '${name}' criado às ${savepointInfo.timestamp.toISOString()}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error
                ? error instanceof Error
                    ? error.message
                    : String(error)
                : String(error);
            throw new Error(`Falha ao criar savepoint '${name}': ${errorMessage}`);
        }
    }
    async rollbackToSavepoint(name) {
        if (!this.isTransactionActive) {
            throw new Error('Nenhuma transação ativa para rollback');
        }
        const savepoint = this.savepoints.find((sp) => sp.name === name);
        if (!savepoint) {
            throw new Error(`Savepoint '${name}' não encontrado`);
        }
        try {
            await this.connection.execute(`ROLLBACK TO SAVEPOINT ${name}`);
            const savepointIndex = this.savepoints.findIndex((sp) => sp.name === name);
            this.savepoints = this.savepoints.slice(0, savepointIndex + 1);
            console.log(`Rollback executado para savepoint '${name}'`);
        }
        catch (error) {
            const errorMessage = error instanceof Error
                ? error instanceof Error
                    ? error.message
                    : String(error)
                : String(error);
            throw new Error(`Falha no rollback para savepoint '${name}': ${errorMessage}`);
        }
    }
    async releaseSavepoint(name) {
        if (!this.isTransactionActive) {
            throw new Error('Nenhuma transação ativa');
        }
        const savepointIndex = this.savepoints.findIndex((sp) => sp.name === name);
        if (savepointIndex === -1) {
            throw new Error(`Savepoint '${name}' não encontrado`);
        }
        try {
            this.savepoints.splice(savepointIndex, 1);
            console.log(`Savepoint '${name}' removido`);
        }
        catch (error) {
            const errorMessage = error instanceof Error
                ? error instanceof Error
                    ? error.message
                    : String(error)
                : String(error);
            throw new Error(`Falha ao remover savepoint '${name}': ${errorMessage}`);
        }
    }
    async commit() {
        if (!this.isTransactionActive) {
            throw new Error('Nenhuma transação ativa para commit');
        }
        try {
            await this.connection.commit();
            this.cleanupTransaction();
            const duration = this.getTransactionDuration();
            console.log(`Transação commitada com sucesso. Duração: ${duration}ms`);
        }
        catch (error) {
            if (this.options.autoRollbackOnError) {
                await this.rollback();
            }
            const errorMessage = error instanceof Error
                ? error instanceof Error
                    ? error.message
                    : String(error)
                : String(error);
            throw new Error(`Falha no commit: ${errorMessage}`);
        }
    }
    async rollback() {
        if (!this.isTransactionActive) {
            throw new Error('Nenhuma transação ativa para rollback');
        }
        try {
            await this.connection.rollback();
            this.cleanupTransaction();
            const duration = this.getTransactionDuration();
            console.log(`Transação revertida. Duração: ${duration}ms`);
        }
        catch (error) {
            this.cleanupTransaction();
            const errorMessage = error instanceof Error
                ? error instanceof Error
                    ? error.message
                    : String(error)
                : String(error);
            throw new Error(`Falha no rollback: ${errorMessage}`);
        }
    }
    async executeWithRetry(operation, operationName = 'operação') {
        let lastError;
        for (let attempt = 1; attempt <= (this.options.maxRetries || 3); attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (!this.isRetryableError(error)) {
                    throw error;
                }
                if (attempt < (this.options.maxRetries || 3)) {
                    const errorMessage = error instanceof Error
                        ? error instanceof Error
                            ? error.message
                            : String(error)
                        : String(error);
                    console.log(`${operationName} falhou (tentativa ${attempt}). Tentando novamente em ${this.options.retryDelay}ms...`);
                    console.log(`Erro: ${errorMessage}`);
                    await this.sleep(this.options.retryDelay || 1000);
                    this.retryCount++;
                }
                else {
                    console.log(`${operationName} falhou após ${attempt} tentativas`);
                }
            }
        }
        if (lastError instanceof Error) {
            throw lastError;
        }
        else {
            throw new Error(String(lastError));
        }
    }
    async executeBatch(operations, batchOptions = {}) {
        if (!this.isTransactionActive) {
            await this.beginTransaction();
        }
        const results = [];
        const { savepointPerOperation = false, stopOnError = true } = batchOptions;
        for (let i = 0; i < operations.length; i++) {
            const operation = operations[i];
            const operationName = operation.name || `operation_${i + 1}`;
            try {
                if (savepointPerOperation) {
                    await this.createSavepoint(`batch_${i}_${Date.now()}`);
                }
                const result = await this.connection.execute(operation.sql, operation.binds || {}, { autoCommit: false });
                results.push({
                    index: i,
                    name: operationName,
                    success: true,
                    result,
                    rowsAffected: result.rowsAffected,
                });
            }
            catch (error) {
                const errorMessage = error instanceof Error
                    ? error instanceof Error
                        ? error.message
                        : String(error)
                    : String(error);
                const errorResult = {
                    index: i,
                    name: operationName,
                    success: false,
                    error: errorMessage,
                };
                results.push(errorResult);
                if (stopOnError) {
                    if (savepointPerOperation && this.savepoints.length > 0) {
                        const lastSavepoint = this.savepoints[this.savepoints.length - 1];
                        await this.rollbackToSavepoint(lastSavepoint.name);
                    }
                    throw new Error(`Operação '${operationName}' falhou: ${errorMessage}`);
                }
            }
        }
        return results;
    }
    getTransactionInfo() {
        return {
            isActive: this.isTransactionActive,
            startTime: this.transactionStartTime,
            duration: this.getTransactionDuration(),
            savepoints: this.savepoints.map((sp) => ({
                name: sp.name,
                timestamp: sp.timestamp,
                description: sp.description,
            })),
            retryCount: this.retryCount,
            options: this.options,
        };
    }
    async setIsolationLevel(level) {
        const isolationMap = {
            READ_COMMITTED: 'READ COMMITTED',
            SERIALIZABLE: 'SERIALIZABLE',
            READ_ONLY: 'READ ONLY',
        };
        const oracleLevel = isolationMap[level];
        if (oracleLevel) {
            await this.connection.execute(`SET TRANSACTION ISOLATION LEVEL ${oracleLevel}`);
        }
    }
    async setTransactionTimeout(timeoutSeconds) {
        setTimeout(() => {
            if (this.isTransactionActive) {
                console.warn(`Transação excedeu timeout de ${timeoutSeconds}s. Considere rollback.`);
            }
        }, timeoutSeconds * 1000);
    }
    isValidSavepointName(name) {
        return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) && name.length <= 30;
    }
    isRetryableError(error) {
        if (!(error instanceof Error))
            return false;
        const retryableErrors = [
            'ORA-00060',
            'ORA-08177',
            'ORA-00054',
            'ORA-30006',
        ];
        return retryableErrors.some((code) => error instanceof Error ? error.message : String(error)?.includes(code));
    }
    getTransactionDuration() {
        if (!this.transactionStartTime)
            return 0;
        return Date.now() - this.transactionStartTime.getTime();
    }
    cleanupTransaction() {
        this.isTransactionActive = false;
        this.transactionStartTime = undefined;
        this.savepoints = [];
        this.retryCount = 0;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.TransactionManager = TransactionManager;
class TransactionManagerFactory {
    static createOLTPManager(connection) {
        return new TransactionManager(connection, {
            isolation: 'READ_COMMITTED',
            timeout: 30,
            autoRollbackOnError: true,
            maxRetries: 3,
            retryDelay: 500,
        });
    }
    static createBatchManager(connection) {
        return new TransactionManager(connection, {
            isolation: 'READ_COMMITTED',
            timeout: 1800,
            autoRollbackOnError: true,
            maxRetries: 5,
            retryDelay: 2000,
        });
    }
    static createAnalyticsManager(connection) {
        return new TransactionManager(connection, {
            isolation: 'READ_ONLY',
            timeout: 3600,
            autoRollbackOnError: false,
            maxRetries: 1,
            retryDelay: 0,
        });
    }
    static createCriticalManager(connection) {
        return new TransactionManager(connection, {
            isolation: 'SERIALIZABLE',
            timeout: 120,
            autoRollbackOnError: true,
            maxRetries: 5,
            retryDelay: 1500,
        });
    }
}
exports.TransactionManagerFactory = TransactionManagerFactory;
//# sourceMappingURL=transactionManager.js.map