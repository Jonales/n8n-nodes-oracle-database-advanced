import { ICredentialType, INodeProperties } from 'n8n-workflow';
export type IOracleCredentials = {
    user: string;
    password: string;
    connectionString: string;
};
export declare class Oracle implements ICredentialType {
    name: string;
    displayName: string;
    documentationUrl: string;
    properties: INodeProperties[];
}
//# sourceMappingURL=Oracle.credentials.d.ts.map