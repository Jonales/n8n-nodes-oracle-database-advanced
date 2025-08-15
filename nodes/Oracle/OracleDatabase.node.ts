import { randomUUID } from 'crypto';

import { IExecuteFunctions } from 'n8n-workflow';
import {
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  NodeConnectionType,
} from 'n8n-workflow';
import oracledb from 'oracledb';

import { OracleConnection } from './connection';

// Polyfill para versões mais antigas do Node.js
if (typeof String.prototype.replaceAll === 'undefined') {
  String.prototype.replaceAll = function (
    searchValue: string | RegExp,
    replaceValue: string | ((substring: string, ...args: any[]) => string)
  ): string {
    if (typeof replaceValue === 'function') {
      return this.replace(new RegExp(searchValue as string, 'g'), replaceValue);
    }
    return this.replace(new RegExp(searchValue as string, 'g'), replaceValue);
  };
}

// Declaração global para o polyfill
declare global {
  interface String {
    replaceAll(searchValue: string | RegExp, replaceValue: string | ((substring: string, ...args: any[]) => string)): string;
  }
}

interface ParameterItem {
  name: string;
  value: string | number;
  datatype: string;
  parseInStatement: boolean;
}

export class OracleDatabase implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Oracle Database with Parameterization',
    name: 'oracleDatabaseParameterized',
    icon: 'file:oracle.svg',
    group: ['input'],
    version: 1,
    description:
      'Execute SQL queries on Oracle database with parameter support - embedded thin client',
    defaults: {
      name: 'Oracle Database',
    },
    inputs: ['main' as NodeConnectionType],
    outputs: ['main' as NodeConnectionType],
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
        description:
          'The SQL query to execute. Use :param_name for parameters.',
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

  /**
   * Gera um ID único para parâmetros
   */
  private generateUniqueId(): string {
    try {
      return randomUUID().replaceAll('-', '_');
    } catch {
      // Fallback para ambientes que não suportam randomUUID
      return (
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15)
      );
    }
  }

  /**
   * Valida os parâmetros fornecidos pelo usuário
   */
  public validateParameters(parameters: ParameterItem[], node: any): void {
    for (const param of parameters) {
      if (!param.name || param.name.trim() === '') {
        throw new NodeOperationError(
          node,
          'Parameter name cannot be empty'
        );
      }

      if (param.parseInStatement && (!param.value || param.value.toString().trim() === '')) {
        throw new NodeOperationError(
          node,
          `Parameter '${param.name}' marked for IN statement but has no values`
        );
      }
    }
  }

  /**
   * Converte o tipo de dados para o formato do OracleDB
   */
  private getOracleDataType(datatype: string): oracledb.DbType {
    return datatype === 'number' ? oracledb.NUMBER : oracledb.STRING;
  }

  /**
   * Converte o valor para o tipo apropriado
   */
  private convertValue(value: string | number, datatype: string): string | number {
    return datatype === 'number' ? Number(value) : String(value);
  }

  /**
   * Processa parâmetros normais (não IN statement)
   */
  private processNormalParameter(
    item: ParameterItem,
    bindParameters: { [key: string]: oracledb.BindParameter }
  ): void {
    bindParameters[item.name] = {
      type: this.getOracleDataType(item.datatype),
      val: this.convertValue(item.value, item.datatype),
    };
  }

  /**
   * Processa parâmetros para IN statement
   */
  private processInStatementParameter(
    item: ParameterItem,
    bindParameters: { [key: string]: oracledb.BindParameter },
    query: string,
    node: any
  ): string {
    const valList = item.value.toString().split(',').map(v => v.trim());
    
    if (valList.length === 0) {
      throw new NodeOperationError(
        node,
        `Parameter '${item.name}' for IN statement cannot be empty`
      );
    }

    const placeholders: string[] = [];
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

  /**
   * Processa todos os parâmetros e constrói o objeto de bind parameters
   */
  private processParameters(
    parameters: ParameterItem[],
    query: string,
    node: any
  ): { bindParameters: { [key: string]: oracledb.BindParameter }; processedQuery: string } {
    this.validateParameters(parameters, node);

    const bindParameters: { [key: string]: oracledb.BindParameter } = {};
    let processedQuery = query;

    for (const item of parameters) {
      if (item.parseInStatement) {
        processedQuery = this.processInStatementParameter(item, bindParameters, processedQuery, node);
      } else {
        this.processNormalParameter(item, bindParameters);
      }
    }

    return { bindParameters, processedQuery };
  }

  /**
   * Valida a query SQL
   */
  public validateQuery(query: string, node: any): void {
    if (!query || query.trim() === '') {
      throw new NodeOperationError(
        node,
        'SQL query cannot be empty'
      );
    }
  }

  /**
   * Executa o nó
   */
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials('oracleCredentials');

    const oracleCredentials = {
      user: String(credentials.user),
      password: String(credentials.password),
      connectionString: String(credentials.connectionString),
    };

    const db = new OracleConnection(oracleCredentials);
    let connection;
    let returnItems: INodeExecutionData[] = [];

    try {
      connection = await db.getConnection();

      // Obter e validar a query
      const query = this.getNodeParameter('query', 0) as string;
      
      // Criar uma instância da classe para acessar os métodos privados
      const oracleInstance = new OracleDatabase();
      oracleInstance.validateQuery(query, this.getNode());

      // Obter parâmetros do usuário
      const parameterList = ((this.getNodeParameter('params', 0, {}) as IDataObject).values as ParameterItem[]) || [];

      // Processar parâmetros
      const { bindParameters, processedQuery } = oracleInstance.processParameters(parameterList, query, this.getNode());

      // Log para debug (opcional - remova em produção)
      console.log('Executing query:', processedQuery);
      console.log('Parameters:', Object.keys(bindParameters));

      // Executar query
      const result = await connection.execute(processedQuery, bindParameters, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: true,
      });

      returnItems = this.helpers.returnJsonArray(
        result.rows as unknown as IDataObject[]
      );

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log detalhado para debug
      console.error('Oracle Database execution failed:', {
        error: errorMessage,
        nodeId: this.getNode().id,
      });

      throw new NodeOperationError(
        this.getNode(),
        `Oracle Database Error: ${errorMessage}`,
        { 
          description: 'Check your SQL query and parameters for syntax errors'
        }
      );

    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeError: unknown) {
          console.error(
            `OracleDB: Failed to close the database connection: ${closeError instanceof Error ? closeError.message : String(closeError)}`
          );
        }
      }
    }

    return this.prepareOutputData(returnItems);
  }
}