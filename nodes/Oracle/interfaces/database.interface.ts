import { Connection } from "oracledb";

export interface DatabaseConnection {
    getConnection(): Promise<Connection>;
}
