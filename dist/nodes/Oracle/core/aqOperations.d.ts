import { Connection } from 'oracledb';
export interface AQMessage {
    payload: any;
    messageId?: string;
    correlationId?: string;
    delay?: number;
    expiration?: number;
    priority?: number;
    properties?: {
        [key: string]: any;
    };
}
export interface AQEnqueueOptions {
    visibility?: 'IMMEDIATE' | 'ON_COMMIT';
    deliveryMode?: 'PERSISTENT' | 'BUFFERED';
    transformation?: string;
    sequence?: number;
}
export interface AQDequeueOptions {
    consumerName?: string;
    dequeueMode?: 'BROWSE' | 'LOCKED' | 'REMOVE';
    navigation?: 'FIRST_MESSAGE' | 'NEXT_MESSAGE' | 'NEXT_TRANSACTION';
    visibility?: 'IMMEDIATE' | 'ON_COMMIT';
    waitTime?: number;
    correlationId?: string;
    condition?: string;
    transformation?: string;
    msgIdToDequeue?: string;
}
export interface AQQueueInfo {
    queueName: string;
    queueType: 'NORMAL_QUEUE' | 'EXCEPTION_QUEUE';
    maxRetries: number;
    retryDelay: number;
    retentionTime: number;
    messageCount: number;
    pendingMessages: number;
}
export interface AQOperationResult {
    success: boolean;
    messageId?: string;
    correlationId?: string;
    enqueueTime?: Date;
    dequeueTime?: Date;
    attemptCount?: number;
    payload?: any;
    error?: string;
}
export declare class AQOperations {
    private connection;
    constructor(connection: Connection);
    enqueueMessage(queueName: string, message: AQMessage, options?: AQEnqueueOptions): Promise<AQOperationResult>;
    dequeueMessage(queueName: string, options?: AQDequeueOptions): Promise<AQOperationResult>;
    enqueueBatch(queueName: string, messages: AQMessage[], options?: AQEnqueueOptions): Promise<AQOperationResult[]>;
    dequeueMultiple(queueName: string, maxMessages?: number, options?: AQDequeueOptions): Promise<AQOperationResult[]>;
    getQueueInfo(queueName: string): Promise<AQQueueInfo>;
    purgeQueue(queueName: string, purgeCondition?: string): Promise<{
        purgedCount: number;
    }>;
    createQueue(queueName: string, queueTableName: string, payloadType?: string, options?: {
        maxRetries?: number;
        retryDelay?: number;
        retentionTime?: number;
        comment?: string;
    }): Promise<boolean>;
    listQueues(): Promise<string[]>;
    private determinePayloadType;
    private getPayloadDeclaration;
    private createPayloadAssignment;
    private parsePayload;
}
export declare class AQOperationsFactory {
    static createHighFrequencyOperator(connection: Connection): AQOperations;
    static createReliableOperator(connection: Connection): AQOperations;
}
//# sourceMappingURL=aqOperations.d.ts.map