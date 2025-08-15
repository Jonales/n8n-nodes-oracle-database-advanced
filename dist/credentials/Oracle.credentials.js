"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Oracle = void 0;
class Oracle {
    name = 'oracleCredentials';
    displayName = 'Oracle Credentials';
    documentationUrl = 'oracleCredentials';
    properties = [
        {
            displayName: 'User',
            name: 'user',
            type: 'string',
            default: 'system',
        },
        {
            displayName: 'Password',
            name: 'password',
            type: 'string',
            typeOptions: {
                password: true,
            },
            default: '',
        },
        {
            displayName: 'Connection String',
            name: 'connectionString',
            type: 'string',
            default: 'localhost/orcl',
        },
        {
            displayName: 'Use Thin mode',
            name: 'thinMode',
            type: 'boolean',
            default: true,
            description: 'Define type of connection with database',
        },
    ];
}
exports.Oracle = Oracle;
//# sourceMappingURL=Oracle.credentials.js.map