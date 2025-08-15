import oracledb, { Connection, ConnectionAttributes } from 'oracledb';

import { DatabaseConnection } from './interfaces/database.interface';
import { OracleCredentials } from './types/oracle.credentials.type';

export class OracleConnection implements DatabaseConnection {
  private databaseConfig: ConnectionAttributes;

  constructor(credentials: OracleCredentials) {
    const { user, password, connectionString } = credentials;

    this.databaseConfig = {
      user,
      password,
      connectionString,
    } as ConnectionAttributes;

    // Force thin mode - eliminates need for Oracle Client installation
    // Thin mode is the default in oracledb 6.x and doesn't require initOracleClient
    oracledb.fetchAsString = [oracledb.CLOB];
  }

  async getConnection(): Promise<Connection> {
    try {
      return await oracledb.getConnection(this.databaseConfig);
    } catch (error: unknown) {
      throw new Error(
        `Failed to connect to Oracle Database: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
