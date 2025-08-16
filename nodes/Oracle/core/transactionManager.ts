import { Connection } from 'oracledb';

export interface TransactionOptions {
  isolation?: 'READ_COMMITTED' | 'SERIALIZABLE' | 'READ_ONLY';
  timeout?: number; // em segundos
  autoRollbackOnError?: boolean;
  maxRetries?: number;
  retryDelay?: number; // em milissegundos
}

export interface SavepointInfo {
  name: string;
  timestamp: Date;
  description?: string;
}

export class TransactionManager {
  private connection: Connection;
  private savepoints: SavepointInfo[] = [];
  private transactionStartTime?: Date;
  private options: TransactionOptions;
  private isTransactionActive = false;
  private retryCount = 0;

  constructor(connection: Connection, options: TransactionOptions = {}) {
    this.connection = connection;
    this.options = {
      isolation: 'READ_COMMITTED',
      timeout: 300, // 5 minutos default
      autoRollbackOnError: true,
      maxRetries: 3,
      retryDelay: 1000,
      ...options,
    };
  }

  /**
   * Iniciar uma nova transação
   */
  async beginTransaction(): Promise<void> {
    if (this.isTransactionActive) {
      throw new Error(
        'Transação já está ativa. Use commit() ou rollback() primeiro.',
      );
    }

    try {
      // Configurar isolamento se especificado
      if (
        this.options.isolation &&
        this.options.isolation !== 'READ_COMMITTED'
      ) {
        await this.setIsolationLevel(this.options.isolation);
      }

      // Configurar timeout se especificado
      if (this.options.timeout) {
        await this.setTransactionTimeout(this.options.timeout);
      }

      // Marcar início da transação
      this.transactionStartTime = new Date();
      this.isTransactionActive = true;
      this.retryCount = 0;

      console.log(
        `Transação iniciada às ${this.transactionStartTime.toISOString()}`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
        	? error instanceof Error
        		? error.message
        		: String(error)
        	: String(error);
      throw new Error(`Falha ao iniciar transação: ${errorMessage}`);
    }
  }

  /**
   * Criar um savepoint
   */
  async createSavepoint(name: string, description?: string): Promise<void> {
    if (!this.isTransactionActive) {
      throw new Error('Nenhuma transação ativa para criar savepoint');
    }

    // Validar nome do savepoint
    if (!this.isValidSavepointName(name)) {
      throw new Error(
        'Nome do savepoint inválido. Use apenas letras, números e underscore.',
      );
    }

    // Verificar se savepoint já existe
    if (this.savepoints.find((sp) => sp.name === name)) {
      throw new Error(`Savepoint '${name}' já existe`);
    }

    try {
      await this.connection.execute(`SAVEPOINT ${name}`);

      const savepointInfo: SavepointInfo = {
        name,
        timestamp: new Date(),
        description,
      };

      this.savepoints.push(savepointInfo);
      console.log(
        `Savepoint '${name}' criado às ${savepointInfo.timestamp.toISOString()}`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
        	? error instanceof Error
        		? error.message
        		: String(error)
        	: String(error);
      throw new Error(`Falha ao criar savepoint '${name}': ${errorMessage}`);
    }
  }

  /**
   * Rollback para um savepoint específico
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    if (!this.isTransactionActive) {
      throw new Error('Nenhuma transação ativa para rollback');
    }

    const savepoint = this.savepoints.find((sp) => sp.name === name);
    if (!savepoint) {
      throw new Error(`Savepoint '${name}' não encontrado`);
    }

    try {
      await this.connection.execute(`ROLLBACK TO SAVEPOINT ${name}`);

      // Remover savepoints criados após este
      const savepointIndex = this.savepoints.findIndex(
        (sp) => sp.name === name,
      );
      this.savepoints = this.savepoints.slice(0, savepointIndex + 1);

      console.log(`Rollback executado para savepoint '${name}'`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
        	? error instanceof Error
        		? error.message
        		: String(error)
        	: String(error);
      throw new Error(
        `Falha no rollback para savepoint '${name}': ${errorMessage}`,
      );
    }
  }

  /**
   * Remover um savepoint
   */
  async releaseSavepoint(name: string): Promise<void> {
    if (!this.isTransactionActive) {
      throw new Error('Nenhuma transação ativa');
    }

    const savepointIndex = this.savepoints.findIndex((sp) => sp.name === name);
    if (savepointIndex === -1) {
      throw new Error(`Savepoint '${name}' não encontrado`);
    }

    try {
      // Oracle não tem comando RELEASE SAVEPOINT, mas podemos removê-lo da lista
      this.savepoints.splice(savepointIndex, 1);
      console.log(`Savepoint '${name}' removido`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
        	? error instanceof Error
        		? error.message
        		: String(error)
        	: String(error);
      throw new Error(`Falha ao remover savepoint '${name}': ${errorMessage}`);
    }
  }

  /**
   * Commit da transação
   */
  async commit(): Promise<void> {
    if (!this.isTransactionActive) {
      throw new Error('Nenhuma transação ativa para commit');
    }

    try {
      await this.connection.commit();
      this.cleanupTransaction();

      const duration = this.getTransactionDuration();
      console.log(`Transação commitada com sucesso. Duração: ${duration}ms`);
    } catch (error: unknown) {
      if (this.options.autoRollbackOnError) {
        await this.rollback();
      }
      const errorMessage =
        error instanceof Error
        	? error instanceof Error
        		? error.message
        		: String(error)
        	: String(error);
      throw new Error(`Falha no commit: ${errorMessage}`);
    }
  }

  /**
   * Rollback completo da transação
   */
  async rollback(): Promise<void> {
    if (!this.isTransactionActive) {
      throw new Error('Nenhuma transação ativa para rollback');
    }

    try {
      await this.connection.rollback();
      this.cleanupTransaction();

      const duration = this.getTransactionDuration();
      console.log(`Transação revertida. Duração: ${duration}ms`);
    } catch (error: unknown) {
      this.cleanupTransaction(); // Limpar mesmo com erro
      const errorMessage =
        error instanceof Error
        	? error instanceof Error
        		? error.message
        		: String(error)
        	: String(error);
      throw new Error(`Falha no rollback: ${errorMessage}`);
    }
  }

  /**
   * Executar operação com retry automático
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName = 'operação',
  ): Promise<T> {
    let lastError: Error | unknown;

    for (
      let attempt = 1;
      attempt <= (this.options.maxRetries || 3);
      attempt++
    ) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error;

        // Verificar se é um erro que vale a pena retry
        if (!this.isRetryableError(error)) {
          throw error;
        }

        if (attempt < (this.options.maxRetries || 3)) {
          const errorMessage =
            error instanceof Error
            	? error instanceof Error
            		? error.message
            		: String(error)
            	: String(error);
          console.log(
            `${operationName} falhou (tentativa ${attempt}). Tentando novamente em ${this.options.retryDelay}ms...`,
          );
          console.log(`Erro: ${errorMessage}`);
          await this.sleep(this.options.retryDelay || 1000);
          this.retryCount++;
        } else {
          console.log(`${operationName} falhou após ${attempt} tentativas`);
        }
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    } else {
      throw new Error(String(lastError));
    }
  }

  /**
   * Executar múltiplas operações em batch com controle de savepoints
   */
  async executeBatch(
    operations: Array<{ sql: string; binds?: any; name?: string }>,
    batchOptions: {
      savepointPerOperation?: boolean;
      stopOnError?: boolean;
    } = {},
  ): Promise<any[]> {
    if (!this.isTransactionActive) {
      await this.beginTransaction();
    }

    const results: any[] = [];
    const { savepointPerOperation = false, stopOnError = true } = batchOptions;

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const operationName = operation.name || `operation_${i + 1}`;

      try {
        // Criar savepoint se solicitado
        if (savepointPerOperation) {
          await this.createSavepoint(`batch_${i}_${Date.now()}`);
        }

        const result = await this.connection.execute(
          operation.sql,
          operation.binds || {},
          { autoCommit: false },
        );

        results.push({
          index: i,
          name: operationName,
          success: true,
          result,
          rowsAffected: result.rowsAffected,
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error
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
          // Rollback para savepoint se existe
          if (savepointPerOperation && this.savepoints.length > 0) {
            const lastSavepoint = this.savepoints[this.savepoints.length - 1];
            await this.rollbackToSavepoint(lastSavepoint.name);
          }
          throw new Error(
            `Operação '${operationName}' falhou: ${errorMessage}`,
          );
        }
      }
    }

    return results;
  }

  /**
   * Obter informações da transação atual
   */
  getTransactionInfo(): any {
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

  /**
   * Configurar nível de isolamento
   */
  private async setIsolationLevel(level: string): Promise<void> {
    const isolationMap = {
      READ_COMMITTED: 'READ COMMITTED',
      SERIALIZABLE: 'SERIALIZABLE',
      READ_ONLY: 'READ ONLY',
    };

    const oracleLevel = isolationMap[level as keyof typeof isolationMap];
    if (oracleLevel) {
      await this.connection.execute(
        `SET TRANSACTION ISOLATION LEVEL ${oracleLevel}`,
      );
    }
  }

  /**
   * Configurar timeout da transação
   */
  private async setTransactionTimeout(timeoutSeconds: number): Promise<void> {
    // Oracle não tem SET TRANSACTION TIMEOUT direto, mas podemos simular
    setTimeout(() => {
      if (this.isTransactionActive) {
        console.warn(
          `Transação excedeu timeout de ${timeoutSeconds}s. Considere rollback.`,
        );
      }
    }, timeoutSeconds * 1000);
  }

  /**
   * Verificar se nome do savepoint é válido
   */
  private isValidSavepointName(name: string): boolean {
    return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) && name.length <= 30;
  }

  /**
   * Verificar se erro é passível de retry
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const retryableErrors = [
      'ORA-00060', // Deadlock
      'ORA-08177', // Serialization failure
      'ORA-00054', // Resource busy
      'ORA-30006', // Resource busy; acquire with NOWAIT specified
    ];

    return retryableErrors.some((code) =>
      error instanceof Error ? error.message : String(error)?.includes(code),
    );
  }

  /**
   * Calcular duração da transação
   */
  private getTransactionDuration(): number {
    if (!this.transactionStartTime) return 0;
    return Date.now() - this.transactionStartTime.getTime();
  }

  /**
   * Limpar estado da transação
   */
  private cleanupTransaction(): void {
    this.isTransactionActive = false;
    this.transactionStartTime = undefined;
    this.savepoints = [];
    this.retryCount = 0;
  }

  /**
   * Utilitário para sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory para criar TransactionManager com configurações pré-definidas
 */
export class TransactionManagerFactory {
  /**
   * Configuração para operações OLTP (transações rápidas)
   */
  static createOLTPManager(connection: Connection): TransactionManager {
    return new TransactionManager(connection, {
      isolation: 'READ_COMMITTED',
      timeout: 30,
      autoRollbackOnError: true,
      maxRetries: 3,
      retryDelay: 500,
    });
  }

  /**
   * Configuração para operações batch (transações longas)
   */
  static createBatchManager(connection: Connection): TransactionManager {
    return new TransactionManager(connection, {
      isolation: 'READ_COMMITTED',
      timeout: 1800, // 30 minutos
      autoRollbackOnError: true,
      maxRetries: 5,
      retryDelay: 2000,
    });
  }

  /**
   * Configuração para operações analíticas (apenas leitura)
   */
  static createAnalyticsManager(connection: Connection): TransactionManager {
    return new TransactionManager(connection, {
      isolation: 'READ_ONLY',
      timeout: 3600, // 1 hora
      autoRollbackOnError: false,
      maxRetries: 1,
      retryDelay: 0,
    });
  }

  /**
   * Configuração para operações críticas (serializable)
   */
  static createCriticalManager(connection: Connection): TransactionManager {
    return new TransactionManager(connection, {
      isolation: 'SERIALIZABLE',
      timeout: 120,
      autoRollbackOnError: true,
      maxRetries: 5,
      retryDelay: 1500,
    });
  }
}
