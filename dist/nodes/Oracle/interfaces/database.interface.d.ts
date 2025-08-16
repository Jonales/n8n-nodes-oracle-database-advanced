import { Connection } from 'oracledb';
export interface DatabaseConnection {
    getConnection(): Promise<Connection>;
}
//# sourceMappingURL=database.interface.d.ts.map