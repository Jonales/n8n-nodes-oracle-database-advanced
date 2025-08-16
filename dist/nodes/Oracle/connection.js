"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OracleConnection = void 0;
const oracledb_1 = __importDefault(require("oracledb"));
class OracleConnection {
    databaseConfig;
    constructor(credentials) {
        const { user, password, connectionString } = credentials;
        this.databaseConfig = {
            user,
            password,
            connectionString,
        };
        oracledb_1.default.fetchAsString = [oracledb_1.default.CLOB];
    }
    async getConnection() {
        try {
            return await oracledb_1.default.getConnection(this.databaseConfig);
        }
        catch (error) {
            throw new Error(`Failed to connect to Oracle Database: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.OracleConnection = OracleConnection;
//# sourceMappingURL=connection.js.map