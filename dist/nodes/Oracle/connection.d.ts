import { Connection } from 'oracledb';
import { DatabaseConnection } from './interfaces/database.interface';
import { OracleCredentials } from './types/oracle.credentials.type';
export declare class OracleConnection implements DatabaseConnection {
    private databaseConfig;
    constructor(credentials: OracleCredentials);
    getConnection(): Promise<Connection>;
}
//# sourceMappingURL=connection.d.ts.map