import { IExecuteFunctions } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
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
export declare class OracleDatabase implements INodeType {
    description: INodeTypeDescription;
    private generateUniqueId;
    validateParameters(parameters: ParameterItem[], node: any): void;
    private getOracleDataType;
    private convertValue;
    private processNormalParameter;
    private processInStatementParameter;
    private processParameters;
    validateQuery(query: string, node: any): void;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
export {};
//# sourceMappingURL=OracleDatabase.node.d.ts.map