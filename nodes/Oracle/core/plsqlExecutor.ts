import { Connection } from 'oracledb';
import oracledb from 'oracledb';

export interface PLSQLExecutionResult {
  success: boolean;
  executionTime: number;
  outBinds: { [key: string]: any };
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
  timeout?: number; // em segundos
}

export interface PLSQLBlock {
  type: 'anonymous' | 'procedure' | 'function' | 'package';
  name?: string;
  sql: string;
  inputParams?: { [key: string]: any };
  outputParams?: string[];
  returnType?: string;
}

export class PLSQLExecutor {
  private connection: Connection;
  private debugMode = false;

  constructor(connection: Connection, debugMode = false) {
    this.connection = connection;
    this.debugMode = debugMode;
  }

  /**
   * Executar bloco PL/SQL anônimo
   */
  async executeAnonymousBlock(
    plsqlBlock: string,
    binds: { [key: string]: any } = {},
    options: PLSQLExecutionOptions = {},
  ): Promise<PLSQLExecutionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // Validar sintaxe básica do bloco PL/SQL
    this.validatePLSQLBlock(plsqlBlock);

    // Configurar opções padrão
    const execOptions = {
      autoCommit: options.autoCommit !== false,
      outFormat: options.outFormat || oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: options.fetchArraySize || 100,
      maxRows: options.maxRows || 0,
      ...options,
    };

    try {
      // Detectar parâmetros de saída automaticamente
      const detectedOutParams = this.detectOutputParameters(plsqlBlock);

      // Configurar binds com parâmetros de saída
      const finalBinds = { ...binds };
      for (const param of detectedOutParams) {
        if (!(param in finalBinds)) {
          finalBinds[param] = {
            dir: oracledb.BIND_OUT,
            type: oracledb.STRING,
            maxSize: 4000,
          };
        }
      }

      if (this.debugMode) {
        console.log(
          'Executando bloco PL/SQL:',
          plsqlBlock.substring(0, 200) + '...',
        );
        console.log('Parâmetros:', finalBinds);
      }

      // Configurar timeout se especificado
      if (options.timeout) {
        this.setExecutionTimeout(options.timeout);
      }

      const result = await this.connection.execute(
        plsqlBlock,
        finalBinds,
        execOptions,
      );

      const executionTime = Date.now() - startTime;

      // Processar resultados implícitos (cursors)
      const implicitResults = await this.processImplicitResults(
        result.implicitResults,
      );

      return {
        success: true,
        executionTime,
        outBinds: result.outBinds || {},
        implicitResults,
        rowsAffected: result.rowsAffected,
        warnings,
        compilationErrors: [],
      };
    } catch (error: unknown) {
      const executionTime = Date.now() - startTime;

      // Verificar se é erro de compilação
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

  /**
   * Executar stored procedure
   */
  async executeProcedure(
    procedureName: string,
    parameters: { [key: string]: any } = {},
    options: PLSQLExecutionOptions = {},
  ): Promise<PLSQLExecutionResult> {
    // Obter metadados da procedure
    const procMetadata = await this.getProcedureMetadata(procedureName);

    // Construir chamada da procedure
    const paramList = Object.keys(parameters)
      .map((param) => `:${param}`)
      .join(', ');
    const plsqlCall = `BEGIN ${procedureName}(${paramList}); END;`;

    // Configurar binds baseado nos metadados
    const configuredBinds = this.configureBindsFromMetadata(
      parameters,
      procMetadata,
    );

    return this.executeAnonymousBlock(plsqlCall, configuredBinds, options);
  }

  /**
   * Executar function
   */
  async executeFunction(
    functionName: string,
    parameters: { [key: string]: any } = {},
    returnType = 'VARCHAR2',
    options: PLSQLExecutionOptions = {},
  ): Promise<PLSQLExecutionResult> {
    // Construir chamada da function
    const paramList = Object.keys(parameters)
      .map((param) => `:${param}`)
      .join(', ');
    const plsqlCall = `BEGIN :result := ${functionName}(${paramList}); END;`;

    // Configurar bind para o valor de retorno
    const configuredBinds = {
      result: {
        dir: oracledb.BIND_OUT,
        type: this.getOracleType(returnType),
        maxSize: 4000,
      },
      ...parameters,
    };

    return this.executeAnonymousBlock(plsqlCall, configuredBinds, options);
  }

  /**
   * Executar múltiplos blocos PL/SQL em sequência
   */
  async executeBatch(
    blocks: PLSQLBlock[],
    options: PLSQLExecutionOptions & { stopOnError?: boolean } = {},
  ): Promise<PLSQLExecutionResult[]> {
    const results: PLSQLExecutionResult[] = [];
    const { stopOnError = true } = options;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      try {
        let result: PLSQLExecutionResult;

        switch (block.type) {
        case 'anonymous':
          result = await this.executeAnonymousBlock(
            block.sql,
            block.inputParams,
            options,
          );
          break;
        case 'procedure':
          result = await this.executeProcedure(
              block.name!,
              block.inputParams,
              options,
          );
          break;
        case 'function':
          result = await this.executeFunction(
              block.name!,
              block.inputParams,
              block.returnType,
              options,
          );
          break;
        default:
          throw new Error(`Tipo de bloco não suportado: ${block.type}`);
        }

        results.push(result);

        if (!result.success && stopOnError) {
          console.error(`Erro no bloco ${i + 1}, parando execução`);
          break;
        }
      } catch (error: unknown) {
        const errorResult: PLSQLExecutionResult = {
          success: false,
          executionTime: 0,
          outBinds: {},
          implicitResults: [],
          warnings: [error instanceof Error ? error.message : String(error)],
          compilationErrors: [],
        };

        results.push(errorResult);

        if (stopOnError) {
          console.error(
            `Erro no bloco ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
          );
          break;
        }
      }
    }

    return results;
  }

  /**
   * Executar package procedure/function
   */
  async executePackageItem(
    packageName: string,
    itemName: string,
    itemType: 'procedure' | 'function',
    parameters: { [key: string]: any } = {},
    returnType?: string,
    options: PLSQLExecutionOptions = {},
  ): Promise<PLSQLExecutionResult> {
    const fullName = `${packageName}.${itemName}`;

    if (itemType === 'procedure') {
      return this.executeProcedure(fullName, parameters, options);
    } else {
      return this.executeFunction(
        fullName,
        parameters,
        returnType || 'VARCHAR2',
        options,
      );
    }
  }

  /**
   * Compilar e executar bloco dinâmico
   */
  async executeDynamicPLSQL(
    template: string,
    substitutions: { [key: string]: string },
    parameters: { [key: string]: any } = {},
    options: PLSQLExecutionOptions = {},
  ): Promise<PLSQLExecutionResult> {
    // Substituir placeholders no template
    let dynamicSQL = template;
    for (const [placeholder, value] of Object.entries(substitutions)) {
      const regex = new RegExp(`\\$\\{${placeholder}\\}`, 'g');
      dynamicSQL = dynamicSQL.replace(regex, value);
    }

    // Validar SQL dinâmico
    this.validateDynamicSQL(dynamicSQL);

    return this.executeAnonymousBlock(dynamicSQL, parameters, options);
  }

  /**
   * Obter informações de compilação de objetos PL/SQL
   */
  async getCompilationInfo(
    objectName: string,
    objectType: string,
  ): Promise<any[]> {
    const sql = `
            SELECT line, position, text, attribute, message_number
            FROM user_errors 
            WHERE name = UPPER(:objectName) 
              AND type = UPPER(:objectType)
            ORDER BY sequence
        `;

    const result = await this.connection.execute(
      sql,
      {
        objectName,
        objectType,
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return result.rows as any[];
  }

  /**
   * Verificar dependências de objetos PL/SQL
   */
  async getDependencies(
    objectName: string,
    objectType: string,
  ): Promise<any[]> {
    const sql = `
            SELECT referenced_owner, referenced_name, referenced_type, referenced_link_name
            FROM user_dependencies 
            WHERE name = UPPER(:objectName) 
              AND type = UPPER(:objectType)
            ORDER BY referenced_owner, referenced_name
        `;

    const result = await this.connection.execute(
      sql,
      {
        objectName,
        objectType,
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return result.rows as any[];
  }

  /**
   * Validar sintaxe básica do bloco PL/SQL
   */
  private validatePLSQLBlock(plsqlBlock: string): void {
    const trimmed = plsqlBlock.trim().toUpperCase();

    if (!trimmed.startsWith('BEGIN') && !trimmed.startsWith('DECLARE')) {
      throw new Error('Bloco PL/SQL deve começar com BEGIN ou DECLARE');
    }

    if (!trimmed.endsWith('END;') && !trimmed.endsWith('END')) {
      throw new Error('Bloco PL/SQL deve terminar com END;');
    }

    // Verificar balanceamento básico de BEGIN/END
    const beginCount = (plsqlBlock.match(/\bBEGIN\b/gi) || []).length;
    const endCount = (plsqlBlock.match(/\bEND\b/gi) || []).length;

    if (beginCount !== endCount) {
      throw new Error(
        `Desbalanceamento de BEGIN/END: ${beginCount} BEGIN(s), ${endCount} END(s)`,
      );
    }
  }

  /**
   * Detectar parâmetros de saída no PL/SQL
   */
  private detectOutputParameters(plsqlBlock: string): string[] {
    const outParams: string[] = [];

    // Regex para detectar parâmetros com := (atribuição)
    const assignmentRegex = /:(\w+)\s*:=/g;
    let match;

    while ((match = assignmentRegex.exec(plsqlBlock)) !== null) {
      outParams.push(match[1]);
    }

    // Regex para detectar parâmetros OUT em procedures
    const outParamRegex = /:(\w+)\s+OUT/gi;
    while ((match = outParamRegex.exec(plsqlBlock)) !== null) {
      outParams.push(match[1]);
    }

    return [...new Set(outParams)]; // Remover duplicatas
  }

  /**
   * Processar resultados implícitos (cursors)
   */
  private async processImplicitResults(
    implicitResults?: any[],
  ): Promise<any[][]> {
    if (!implicitResults || implicitResults.length === 0) {
      return [];
    }

    const results: any[][] = [];

    for (const resultSet of implicitResults) {
      const rows: any[] = [];
      let row;

      while ((row = await resultSet.getRow())) {
        rows.push(row);
      }

      await resultSet.close();
      results.push(rows);
    }

    return results;
  }

  /**
   * Verificar erros de compilação
   */
  private async checkCompilationErrors(
    plsqlBlock: string,
  ): Promise<PLSQLCompilationError[]> {
    // Esta é uma implementação simplificada
    // Em um ambiente real, você faria parse dos erros do Oracle
    return [];
  }

  /**
   * Obter metadados de procedure
   */
  private async getProcedureMetadata(procedureName: string): Promise<any[]> {
    const sql = `
            SELECT argument_name, data_type, in_out, position
            FROM user_arguments 
            WHERE object_name = UPPER(:procedureName)
            ORDER BY position
        `;

    const result = await this.connection.execute(
      sql,
      {
        procedureName: procedureName.split('.').pop(), // Remover schema se presente
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return result.rows as any[];
  }

  /**
   * Configurar binds baseado em metadados
   */
  private configureBindsFromMetadata(
    parameters: { [key: string]: any },
    metadata: any[],
  ): { [key: string]: any } {
    const configuredBinds: { [key: string]: any } = {};

    for (const param of metadata) {
      const paramName = param.ARGUMENT_NAME?.toLowerCase();
      if (!paramName) continue;

      if (param.IN_OUT === 'OUT' || param.IN_OUT === 'IN OUT') {
        configuredBinds[paramName] = {
          dir: param.IN_OUT === 'OUT' ? oracledb.BIND_OUT : oracledb.BIND_INOUT,
          type: this.getOracleType(param.DATA_TYPE),
          maxSize: 4000,
          val: parameters[paramName],
        };
      } else {
        configuredBinds[paramName] = parameters[paramName];
      }
    }

    return configuredBinds;
  }

  /**
   * Mapear tipos Oracle para tipos oracledb
   */
  private typeMap: { [key: string]: any } = {
    VARCHAR2: oracledb.STRING,
    CHAR: oracledb.STRING,
    NVARCHAR2: oracledb.STRING,
    NCHAR: oracledb.STRING,
    NUMBER: oracledb.NUMBER,
    BINARY_INTEGER: oracledb.NUMBER,
    PLS_INTEGER: oracledb.NUMBER,
    DATE: oracledb.DATE,
    TIMESTAMP: oracledb.DATE,
    CLOB: oracledb.CLOB,
    BLOB: oracledb.BLOB,
    CURSOR: oracledb.CURSOR,
  };

  private getOracleType(dataType: string): any {
    return this.typeMap[dataType.toUpperCase()] || oracledb.STRING;
  }

  /**
   * Validar SQL dinâmico
   */
  private validateDynamicSQL(sql: string): void {
    // Verificar por padrões perigosos
    const dangerousPatterns = [
      /DROP\s+TABLE/i,
      /DROP\s+DATABASE/i,
      /TRUNCATE/i,
      /DELETE\s+FROM.*WHERE\s+1\s*=\s*1/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        throw new Error(
          `SQL dinâmico contém padrão perigoso: ${pattern.source}`,
        );
      }
    }
  }

  /**
   * Configurar timeout de execução
   */
  private setExecutionTimeout(timeoutSeconds: number): void {
    // Implementação simplificada do timeout
    setTimeout(() => {
      console.warn(`Execução PL/SQL excedeu timeout de ${timeoutSeconds}s`);
    }, timeoutSeconds * 1000);
  }

  /**
   * Habilitar/desabilitar modo debug
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }
}

/**
 * Factory para criar PLSQLExecutor com configurações pré-definidas
 */
export class PLSQLExecutorFactory {
  /**
   * Executor para desenvolvimento (debug habilitado)
   */
  static createDevelopmentExecutor(connection: Connection): PLSQLExecutor {
    return new PLSQLExecutor(connection, true);
  }

  /**
   * Executor para produção (debug desabilitado)
   */
  static createProductionExecutor(connection: Connection): PLSQLExecutor {
    return new PLSQLExecutor(connection, false);
  }
}
