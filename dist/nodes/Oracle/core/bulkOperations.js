"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkOperationsFactory = exports.BulkOperations = void 0;
class BulkOperations {
    connection;
    defaultBatchSize = 1000;
    constructor(connection, defaultBatchSize) {
        this.connection = connection;
        if (defaultBatchSize) {
            this.defaultBatchSize = defaultBatchSize;
        }
    }
    async bulkInsert(tableName, data, options = {}) {
        const startTime = Date.now();
        const { batchSize = this.defaultBatchSize, continueOnError = false, autoCommit = true, bindDefs, dmlRowCounts = true, } = options;
        if (!data || data.length === 0) {
            throw new Error('Dados para inserção não podem estar vazios');
        }
        const columns = Object.keys(data[0]);
        this.validateDataStructure(data, columns);
        const placeholders = columns.map(() => '?').join(',');
        const sql = `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`;
        console.log(`Iniciando bulk insert de ${data.length} registros em ${tableName}`);
        let totalSuccess = 0;
        let totalErrors = 0;
        const errors = [];
        let batchCount = 0;
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const batchData = batch.map((row) => columns.map((col) => row[col]));
            batchCount++;
            try {
                const result = await this.connection.executeMany(sql, batchData, {
                    autoCommit: false,
                    batchErrors: continueOnError,
                    bindDefs,
                    dmlRowCounts,
                });
                if (result.batchErrors && result.batchErrors.length > 0) {
                    for (const batchError of result.batchErrors) {
                        errors.push({
                            batchIndex: batchCount - 1,
                            rowIndex: i + (batchError.offset ?? 0),
                            error: batchError.error?.message || 'Unknown batch error',
                            data: batch[batchError.offset ?? 0],
                        });
                        totalErrors++;
                    }
                }
                else {
                    totalSuccess += batch.length;
                }
                if (autoCommit) {
                    await this.connection.commit();
                }
                console.log(`Lote ${batchCount} processado: ${batch.length} registros`);
            }
            catch (error) {
                if (continueOnError) {
                    errors.push({
                        batchIndex: batchCount - 1,
                        rowIndex: i,
                        error: error instanceof Error ? error.message : String(error),
                        data: batch,
                    });
                    totalErrors += batch.length;
                }
                else {
                    throw new Error(`Erro no lote ${batchCount}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
        if (!autoCommit && totalSuccess > 0) {
            await this.connection.commit();
        }
        const duration = Date.now() - startTime;
        console.log(`Bulk insert concluído: ${totalSuccess} sucessos, ${totalErrors} erros em ${duration}ms`);
        return {
            operation: 'INSERT',
            totalRows: data.length,
            successfulRows: totalSuccess,
            failedRows: totalErrors,
            batchCount,
            duration,
            errors,
        };
    }
    async bulkUpdate(tableName, data, options) {
        const startTime = Date.now();
        const { batchSize = this.defaultBatchSize, continueOnError = false, autoCommit = true, whereColumns, } = options;
        if (!whereColumns || whereColumns.length === 0) {
            throw new Error('whereColumns deve ser especificado para bulk update');
        }
        if (!data || data.length === 0) {
            throw new Error('Dados para atualização não podem estar vazios');
        }
        const allColumns = Object.keys(data[0]);
        const setColumns = allColumns.filter((col) => !whereColumns.includes(col));
        if (setColumns.length === 0) {
            throw new Error('Nenhuma coluna para atualizar encontrada');
        }
        const setClause = setColumns.map((col) => `${col} = ?`).join(',');
        const whereClause = whereColumns.map((col) => `${col} = ?`).join(' AND ');
        const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
        console.log(`Iniciando bulk update de ${data.length} registros em ${tableName}`);
        let totalSuccess = 0;
        let totalErrors = 0;
        const errors = [];
        let batchCount = 0;
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const batchData = batch.map((row) => [
                ...setColumns.map((col) => row[col]),
                ...whereColumns.map((col) => row[col]),
            ]);
            batchCount++;
            try {
                const result = await this.connection.executeMany(sql, batchData, {
                    autoCommit: false,
                    batchErrors: continueOnError,
                    dmlRowCounts: true,
                });
                if (result.batchErrors && result.batchErrors.length > 0) {
                    for (const batchError of result.batchErrors) {
                        errors.push({
                            batchIndex: batchCount - 1,
                            rowIndex: i + (batchError.offset ?? 0),
                            error: batchError.error?.message || 'Unknown batch error',
                            data: batch[batchError.offset ?? 0],
                        });
                        totalErrors++;
                    }
                }
                else {
                    totalSuccess += batch.length;
                }
                if (autoCommit) {
                    await this.connection.commit();
                }
                console.log(`Lote ${batchCount} atualizado: ${batch.length} registros`);
            }
            catch (error) {
                if (continueOnError) {
                    errors.push({
                        batchIndex: batchCount - 1,
                        rowIndex: i,
                        error: error instanceof Error ? error.message : String(error),
                        data: batch,
                    });
                    totalErrors += batch.length;
                }
                else {
                    throw new Error(`Erro no lote ${batchCount}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
        if (!autoCommit && totalSuccess > 0) {
            await this.connection.commit();
        }
        const duration = Date.now() - startTime;
        console.log(`Bulk update concluído: ${totalSuccess} sucessos, ${totalErrors} erros em ${duration}ms`);
        return {
            operation: 'UPDATE',
            totalRows: data.length,
            successfulRows: totalSuccess,
            failedRows: totalErrors,
            batchCount,
            duration,
            errors,
        };
    }
    async bulkDelete(tableName, data, options) {
        const startTime = Date.now();
        const { batchSize = this.defaultBatchSize, continueOnError = false, autoCommit = true, whereColumns, } = options;
        if (!whereColumns || whereColumns.length === 0) {
            throw new Error('whereColumns deve ser especificado para bulk delete');
        }
        if (!data || data.length === 0) {
            throw new Error('Dados para exclusão não podem estar vazios');
        }
        const whereClause = whereColumns.map((col) => `${col} = ?`).join(' AND ');
        const sql = `DELETE FROM ${tableName} WHERE ${whereClause}`;
        console.log(`Iniciando bulk delete de ${data.length} registros em ${tableName}`);
        let totalSuccess = 0;
        let totalErrors = 0;
        const errors = [];
        let batchCount = 0;
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const batchData = batch.map((row) => whereColumns.map((col) => row[col]));
            batchCount++;
            try {
                const result = await this.connection.executeMany(sql, batchData, {
                    autoCommit: false,
                    batchErrors: continueOnError,
                    dmlRowCounts: true,
                });
                if (result.batchErrors && result.batchErrors.length > 0) {
                    for (const batchError of result.batchErrors) {
                        errors.push({
                            batchIndex: batchCount - 1,
                            rowIndex: i + (batchError.offset ?? 0),
                            error: batchError.error?.message || 'Unknown batch error',
                            data: batch[batchError.offset ?? 0],
                        });
                        totalErrors++;
                    }
                }
                else {
                    totalSuccess += batch.length;
                }
                if (autoCommit) {
                    await this.connection.commit();
                }
                console.log(`Lote ${batchCount} excluído: ${batch.length} registros`);
            }
            catch (error) {
                if (continueOnError) {
                    errors.push({
                        batchIndex: batchCount - 1,
                        rowIndex: i,
                        error: error instanceof Error ? error.message : String(error),
                        data: batch,
                    });
                    totalErrors += batch.length;
                }
                else {
                    throw new Error(`Erro no lote ${batchCount}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
        if (!autoCommit && totalSuccess > 0) {
            await this.connection.commit();
        }
        const duration = Date.now() - startTime;
        console.log(`Bulk delete concluído: ${totalSuccess} sucessos, ${totalErrors} erros em ${duration}ms`);
        return {
            operation: 'DELETE',
            totalRows: data.length,
            successfulRows: totalSuccess,
            failedRows: totalErrors,
            batchCount,
            duration,
            errors,
        };
    }
    async bulkUpsert(tableName, data, keyColumns, options = {}) {
        const startTime = Date.now();
        if (!keyColumns || keyColumns.length === 0) {
            throw new Error('keyColumns deve ser especificado para upsert');
        }
        const allColumns = Object.keys(data[0]);
        const updateColumns = allColumns.filter((col) => !keyColumns.includes(col));
        const mergeClause = keyColumns
            .map((col) => `target.${col} = source.${col}`)
            .join(' AND ');
        const insertColumns = allColumns.join(',');
        const insertValues = allColumns.map((col) => `source.${col}`).join(',');
        const updateClause = updateColumns
            .map((col) => `target.${col} = source.${col}`)
            .join(',');
        const sql = `
            MERGE INTO ${tableName} target
            USING (${this.generateValuesClause(allColumns, data.length)}) source (${insertColumns})
            ON (${mergeClause})
            WHEN MATCHED THEN
                UPDATE SET ${updateClause}
            WHEN NOT MATCHED THEN
                INSERT (${insertColumns}) VALUES (${insertValues})
        `;
        try {
            const flatData = data.flatMap((row) => allColumns.map((col) => row[col]));
            const result = await this.connection.execute(sql, flatData, {
                autoCommit: options.autoCommit !== false,
            });
            const duration = Date.now() - startTime;
            console.log(`Bulk upsert concluído: ${result.rowsAffected} registros afetados em ${duration}ms`);
            return {
                operation: 'UPSERT',
                totalRows: data.length,
                successfulRows: result.rowsAffected || 0,
                failedRows: 0,
                batchCount: 1,
                duration,
                errors: [],
            };
        }
        catch (error) {
            throw new Error(`Erro no bulk upsert: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async parallelBulkOperations(operations) {
        const promises = operations.map(async (op) => {
            switch (op.operation) {
                case 'insert':
                    return this.bulkInsert(op.tableName, op.data, op.options);
                case 'update':
                    return this.bulkUpdate(op.tableName, op.data, op.options);
                case 'delete':
                    return this.bulkDelete(op.tableName, op.data, op.options);
                case 'upsert':
                    return this.bulkUpsert(op.tableName, op.data, op.options.keyColumns, op.options);
                default:
                    throw new Error(`Operação não suportada: ${op.operation}`);
            }
        });
        return Promise.all(promises);
    }
    validateDataStructure(data, expectedColumns) {
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowColumns = Object.keys(row);
            for (const col of expectedColumns) {
                if (!(col in row)) {
                    throw new Error(`Linha ${i}: coluna '${col}' não encontrada`);
                }
            }
        }
    }
    generateValuesClause(columns, rowCount) {
        const valueRows = [];
        for (let i = 0; i < rowCount; i++) {
            const placeholders = columns
                .map((_, colIndex) => `:${i * columns.length + colIndex + 1}`)
                .join(',');
            valueRows.push(`(${placeholders})`);
        }
        return `SELECT * FROM (VALUES ${valueRows.join(',')})`;
    }
    getPerformanceStats() {
        return {
            defaultBatchSize: this.defaultBatchSize,
            connectionStatus: this.connection ? 'Connected' : 'Disconnected',
        };
    }
}
exports.BulkOperations = BulkOperations;
class BulkOperationsFactory {
    static createHighVolumeOperations(connection) {
        return new BulkOperations(connection, 5000);
    }
    static createFastOperations(connection) {
        return new BulkOperations(connection, 10000);
    }
    static createConservativeOperations(connection) {
        return new BulkOperations(connection, 500);
    }
}
exports.BulkOperationsFactory = BulkOperationsFactory;
//# sourceMappingURL=bulkOperations.js.map