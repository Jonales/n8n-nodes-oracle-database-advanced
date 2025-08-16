import { Connection } from 'oracledb';
import oracledb from 'oracledb';

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

export class BulkOperations {
  private connection: Connection;
  private defaultBatchSize = 1000;

  constructor(connection: Connection, defaultBatchSize?: number) {
    this.connection = connection;
    if (defaultBatchSize) {
      this.defaultBatchSize = defaultBatchSize;
    }
  }

  /**
   * Inserção em massa (Bulk Insert)
   */
  async bulkInsert(
    tableName: string,
    data: any[],
    options: BulkInsertOptions = {},
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const {
      batchSize = this.defaultBatchSize,
      continueOnError = false,
      autoCommit = true,
      bindDefs,
      dmlRowCounts = true,
    } = options;

    if (!data || data.length === 0) {
      throw new Error('Dados para inserção não podem estar vazios');
    }

    // Validar estrutura dos dados
    const columns = Object.keys(data[0]);
    this.validateDataStructure(data, columns);

    // Gerar SQL de inserção
    const placeholders = columns.map(() => '?').join(',');
    const sql = `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`;

    console.log(
      `Iniciando bulk insert de ${data.length} registros em ${tableName}`,
    );

    let totalSuccess = 0;
    let totalErrors = 0;
    const errors: BulkError[] = [];
    let batchCount = 0;

    // Processar em lotes
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
          // Processar erros específicos de cada linha (CORRIGIDO)
          for (const batchError of result.batchErrors) {
            errors.push({
              batchIndex: batchCount - 1,
              rowIndex: i + (batchError.offset ?? 0), // ✅ Correção TS18048
              error:
                (batchError as any).error?.message || 'Unknown batch error', // ✅ Correção TS2339/TS2552
              data: batch[batchError.offset ?? 0], // ✅ Correção TS2538
            });
            totalErrors++;
          }
        } else {
          totalSuccess += batch.length;
        }

        // Commit intermediário se autoCommit estiver habilitado
        if (autoCommit) {
          await this.connection.commit();
        }

        console.log(`Lote ${batchCount} processado: ${batch.length} registros`);
      } catch (error: unknown) {
        if (continueOnError) {
          errors.push({
            batchIndex: batchCount - 1,
            rowIndex: i,
            error: error instanceof Error ? error.message : String(error),
            data: batch,
          });
          totalErrors += batch.length;
        } else {
          throw new Error(
            `Erro no lote ${batchCount}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    // Commit final se não foi feito nos lotes
    if (!autoCommit && totalSuccess > 0) {
      await this.connection.commit();
    }

    const duration = Date.now() - startTime;
    console.log(
      `Bulk insert concluído: ${totalSuccess} sucessos, ${totalErrors} erros em ${duration}ms`,
    );

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

  /**
   * Atualização em massa (Bulk Update) - CORRIGIDO
   */
  async bulkUpdate(
    tableName: string,
    data: any[],
    options: BulkUpdateOptions,
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const {
      batchSize = this.defaultBatchSize,
      continueOnError = false,
      autoCommit = true,
      whereColumns,
    } = options;

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

    // Gerar SQL de atualização
    const setClause = setColumns.map((col) => `${col} = ?`).join(',');
    const whereClause = whereColumns.map((col) => `${col} = ?`).join(' AND ');
    const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;

    console.log(
      `Iniciando bulk update de ${data.length} registros em ${tableName}`,
    );

    let totalSuccess = 0;
    let totalErrors = 0;
    const errors: BulkError[] = [];
    let batchCount = 0;

    // Processar em lotes
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
              rowIndex: i + (batchError.offset ?? 0), // ✅ Correção TS18048
              error:
                (batchError as any).error?.message || 'Unknown batch error', // ✅ Correção TS2339/TS2552
              data: batch[batchError.offset ?? 0], // ✅ Correção TS2538
            });
            totalErrors++;
          }
        } else {
          totalSuccess += batch.length;
        }

        if (autoCommit) {
          await this.connection.commit();
        }

        console.log(`Lote ${batchCount} atualizado: ${batch.length} registros`);
      } catch (error: unknown) {
        if (continueOnError) {
          errors.push({
            batchIndex: batchCount - 1,
            rowIndex: i,
            error: error instanceof Error ? error.message : String(error),
            data: batch,
          });
          totalErrors += batch.length;
        } else {
          throw new Error(
            `Erro no lote ${batchCount}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    if (!autoCommit && totalSuccess > 0) {
      await this.connection.commit();
    }

    const duration = Date.now() - startTime;
    console.log(
      `Bulk update concluído: ${totalSuccess} sucessos, ${totalErrors} erros em ${duration}ms`,
    );

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

  /**
   * Exclusão em massa (Bulk Delete) - CORRIGIDO
   */
  async bulkDelete(
    tableName: string,
    data: any[],
    options: BulkDeleteOptions,
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const {
      batchSize = this.defaultBatchSize,
      continueOnError = false,
      autoCommit = true,
      whereColumns,
    } = options;

    if (!whereColumns || whereColumns.length === 0) {
      throw new Error('whereColumns deve ser especificado para bulk delete');
    }

    if (!data || data.length === 0) {
      throw new Error('Dados para exclusão não podem estar vazios');
    }

    // Gerar SQL de exclusão
    const whereClause = whereColumns.map((col) => `${col} = ?`).join(' AND ');
    const sql = `DELETE FROM ${tableName} WHERE ${whereClause}`;

    console.log(
      `Iniciando bulk delete de ${data.length} registros em ${tableName}`,
    );

    let totalSuccess = 0;
    let totalErrors = 0;
    const errors: BulkError[] = [];
    let batchCount = 0;

    // Processar em lotes
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
              rowIndex: i + (batchError.offset ?? 0), // ✅ Correção TS18048
              error:
                (batchError as any).error?.message || 'Unknown batch error', // ✅ Correção TS2339/TS2552
              data: batch[batchError.offset ?? 0], // ✅ Correção TS2538
            });
            totalErrors++;
          }
        } else {
          totalSuccess += batch.length;
        }

        if (autoCommit) {
          await this.connection.commit();
        }

        console.log(`Lote ${batchCount} excluído: ${batch.length} registros`);
      } catch (error: unknown) {
        if (continueOnError) {
          errors.push({
            batchIndex: batchCount - 1,
            rowIndex: i,
            error: error instanceof Error ? error.message : String(error),
            data: batch,
          });
          totalErrors += batch.length;
        } else {
          throw new Error(
            `Erro no lote ${batchCount}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    if (!autoCommit && totalSuccess > 0) {
      await this.connection.commit();
    }

    const duration = Date.now() - startTime;
    console.log(
      `Bulk delete concluído: ${totalSuccess} sucessos, ${totalErrors} erros em ${duration}ms`,
    );

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

  /**
   * UPSERT em massa (Insert ou Update baseado na existência)
   */
  async bulkUpsert(
    tableName: string,
    data: any[],
    keyColumns: string[],
    options: BulkInsertOptions = {},
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();

    if (!keyColumns || keyColumns.length === 0) {
      throw new Error('keyColumns deve ser especificado para upsert');
    }

    const allColumns = Object.keys(data[0]);
    const updateColumns = allColumns.filter((col) => !keyColumns.includes(col));

    // Gerar SQL MERGE (Oracle-specific)
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
      console.log(
        `Bulk upsert concluído: ${result.rowsAffected} registros afetados em ${duration}ms`,
      );

      return {
        operation: 'UPSERT',
        totalRows: data.length,
        successfulRows: result.rowsAffected || 0,
        failedRows: 0,
        batchCount: 1,
        duration,
        errors: [],
      };
    } catch (error: unknown) {
      throw new Error(
        `Erro no bulk upsert: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Processar operações em paralelo (para múltiplas tabelas)
   */
  async parallelBulkOperations(
    operations: Array<{
      operation: 'insert' | 'update' | 'delete' | 'upsert';
      tableName: string;
      data: any[];
      options?: any;
    }>,
  ): Promise<BulkOperationResult[]> {
    const promises = operations.map(async (op) => {
      switch (op.operation) {
      case 'insert':
        return this.bulkInsert(op.tableName, op.data, op.options);
      case 'update':
        return this.bulkUpdate(op.tableName, op.data, op.options);
      case 'delete':
        return this.bulkDelete(op.tableName, op.data, op.options);
      case 'upsert':
        return this.bulkUpsert(
          op.tableName,
          op.data,
          op.options.keyColumns,
          op.options,
        );
      default:
        throw new Error(`Operação não suportada: ${op.operation}`);
      }
    });

    return Promise.all(promises);
  }

  /**
   * Validar estrutura dos dados
   */
  private validateDataStructure(data: any[], expectedColumns: string[]): void {
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

  /**
   * Gerar cláusula VALUES para MERGE
   */
  private generateValuesClause(columns: string[], rowCount: number): string {
    const valueRows = [];
    for (let i = 0; i < rowCount; i++) {
      const placeholders = columns
        .map((_, colIndex) => `:${i * columns.length + colIndex + 1}`)
        .join(',');
      valueRows.push(`(${placeholders})`);
    }
    return `SELECT * FROM (VALUES ${valueRows.join(',')})`;
  }

  /**
   * Obter estatísticas de performance
   */
  getPerformanceStats(): any {
    return {
      defaultBatchSize: this.defaultBatchSize,
      connectionStatus: this.connection ? 'Connected' : 'Disconnected',
    };
  }
}

/**
 * Factory para criar BulkOperations com configurações pré-definidas
 */
export class BulkOperationsFactory {
  /**
   * Configuração para operações de alto volume (milhões de registros)
   */
  static createHighVolumeOperations(connection: Connection): BulkOperations {
    return new BulkOperations(connection, 5000);
  }

  /**
   * Configuração para operações rápidas (milhares de registros)
   */
  static createFastOperations(connection: Connection): BulkOperations {
    return new BulkOperations(connection, 10000);
  }

  /**
   * Configuração para operações conservadoras (memória limitada)
   */
  static createConservativeOperations(connection: Connection): BulkOperations {
    return new BulkOperations(connection, 500);
  }
}
