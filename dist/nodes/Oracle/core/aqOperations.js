"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AQOperationsFactory = exports.AQOperations = void 0;
const oracledb_1 = __importDefault(require("oracledb"));
class AQOperations {
    connection;
    constructor(connection) {
        this.connection = connection;
    }
    async enqueueMessage(queueName, message, options = {}) {
        const { visibility = 'ON_COMMIT', deliveryMode = 'PERSISTENT', transformation, sequence, } = options;
        try {
            const payloadType = this.determinePayloadType(message.payload);
            const plsqlBlock = `
                DECLARE
                    enqueue_options    DBMS_AQ.ENQUEUE_OPTIONS_T;
                    message_properties DBMS_AQ.MESSAGE_PROPERTIES_T;
                    message_handle     RAW(16);
                    ${this.getPayloadDeclaration(payloadType)}
                BEGIN
                    -- Configurar opções de enqueue
                    enqueue_options.visibility := DBMS_AQ.${visibility};
                    enqueue_options.delivery_mode := DBMS_AQ.${deliveryMode};
                    ${sequence ? `enqueue_options.sequence := ${sequence};` : ''}
                    ${transformation ? `enqueue_options.transformation := '${transformation}';` : ''}
                    
                    -- Configurar propriedades da mensagem
                    ${message.correlationId ? `message_properties.correlation := '${message.correlationId}';` : ''}
                    ${message.delay ? `message_properties.delay := ${message.delay};` : ''}
                    ${message.expiration ? `message_properties.expiration := ${message.expiration};` : ''}
                    ${message.priority ? `message_properties.priority := ${message.priority};` : ''}
                    
                    -- Criar payload da mensagem
                    ${this.createPayloadAssignment(payloadType, message.payload)}
                    
                    -- Enfileirar mensagem
                    DBMS_AQ.ENQUEUE(
                        queue_name => :queue_name,
                        enqueue_options => enqueue_options,
                        message_properties => message_properties,
                        payload => message_payload,
                        msgid => message_handle
                    );
                    
                    :message_id := RAWTOHEX(message_handle);
                    :enqueue_time := SYSTIMESTAMP;
                    
                    ${visibility === 'IMMEDIATE' ? 'COMMIT;' : ''}
                END;
            `;
            const binds = {
                queue_name: queueName,
                message_id: {
                    dir: oracledb_1.default.BIND_OUT,
                    type: oracledb_1.default.STRING,
                    maxSize: 32,
                },
                enqueue_time: { dir: oracledb_1.default.BIND_OUT, type: oracledb_1.default.DATE },
            };
            const result = await this.connection.execute(plsqlBlock, binds);
            return {
                success: true,
                messageId: result.outBinds
                    ?.message_id,
                enqueueTime: result.outBinds
                    ?.enqueue_time,
                correlationId: message.correlationId,
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Erro ao enfileirar mensagem: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    async dequeueMessage(queueName, options = {}) {
        const { consumerName, dequeueMode = 'REMOVE', navigation = 'FIRST_MESSAGE', visibility = 'ON_COMMIT', waitTime = 5, correlationId, condition, transformation, msgIdToDequeue, } = options;
        try {
            const plsqlBlock = `
                DECLARE
                    dequeue_options    DBMS_AQ.DEQUEUE_OPTIONS_T;
                    message_properties DBMS_AQ.MESSAGE_PROPERTIES_T;
                    message_handle     RAW(16);
                    message_payload    SYS.AQ$_JMS_TEXT_MESSAGE;
                    no_messages        EXCEPTION;
                    PRAGMA EXCEPTION_INIT(no_messages, -25228);
                BEGIN
                    -- Configurar opções de dequeue
                    dequeue_options.dequeue_mode := DBMS_AQ.${dequeueMode};
                    dequeue_options.navigation := DBMS_AQ.${navigation};
                    dequeue_options.visibility := DBMS_AQ.${visibility};
                    dequeue_options.wait := ${waitTime};
                    ${consumerName ? `dequeue_options.consumer_name := '${consumerName}';` : ''}
                    ${correlationId ? `dequeue_options.correlation := '${correlationId}';` : ''}
                    ${condition ? `dequeue_options.deq_condition := '${condition}';` : ''}
                    ${transformation ? `dequeue_options.transformation := '${transformation}';` : ''}
                    ${msgIdToDequeue ? `dequeue_options.msgid := HEXTORAW('${msgIdToDequeue}');` : ''}
                    
                    -- Desenfileirar mensagem
                    DBMS_AQ.DEQUEUE(
                        queue_name => :queue_name,
                        dequeue_options => dequeue_options,
                        message_properties => message_properties,
                        payload => message_payload,
                        msgid => message_handle
                    );
                    
                    :message_id := RAWTOHEX(message_handle);
                    :correlation_id := message_properties.correlation;
                    :dequeue_time := SYSTIMESTAMP;
                    :attempt_count := message_properties.attempts;
                    :payload_text := message_payload.get_text();
                    :success := 1;
                    
                    ${visibility === 'IMMEDIATE' ? 'COMMIT;' : ''}
                    
                EXCEPTION
                    WHEN no_messages THEN
                        :success := 0;
                        :error_msg := 'Nenhuma mensagem disponível na fila';
                    WHEN OTHERS THEN
                        :success := 0;
                        :error_msg := SQLERRM;
                END;
            `;
            const binds = {
                queue_name: queueName,
                message_id: {
                    dir: oracledb_1.default.BIND_OUT,
                    type: oracledb_1.default.STRING,
                    maxSize: 32,
                },
                correlation_id: {
                    dir: oracledb_1.default.BIND_OUT,
                    type: oracledb_1.default.STRING,
                    maxSize: 128,
                },
                dequeue_time: { dir: oracledb_1.default.BIND_OUT, type: oracledb_1.default.DATE },
                attempt_count: { dir: oracledb_1.default.BIND_OUT, type: oracledb_1.default.NUMBER },
                payload_text: {
                    dir: oracledb_1.default.BIND_OUT,
                    type: oracledb_1.default.STRING,
                    maxSize: 4000,
                },
                success: { dir: oracledb_1.default.BIND_OUT, type: oracledb_1.default.NUMBER },
                error_msg: {
                    dir: oracledb_1.default.BIND_OUT,
                    type: oracledb_1.default.STRING,
                    maxSize: 1000,
                },
            };
            const result = await this.connection.execute(plsqlBlock, binds);
            const outBinds = result.outBinds;
            if (outBinds.success === 1) {
                return {
                    success: true,
                    messageId: outBinds.message_id,
                    correlationId: outBinds.correlation_id,
                    dequeueTime: outBinds.dequeue_time,
                    attemptCount: outBinds.attempt_count,
                    payload: this.parsePayload(outBinds.payload_text),
                };
            }
            else {
                return {
                    success: false,
                    error: outBinds.error_msg,
                };
            }
        }
        catch (error) {
            return {
                success: false,
                error: `Erro ao desenfileirar mensagem: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    async enqueueBatch(queueName, messages, options = {}) {
        const results = [];
        for (const message of messages) {
            const result = await this.enqueueMessage(queueName, message, options);
            results.push(result);
        }
        return results;
    }
    async dequeueMultiple(queueName, maxMessages = 10, options = {}) {
        const results = [];
        let messagesReceived = 0;
        while (messagesReceived < maxMessages) {
            const result = await this.dequeueMessage(queueName, {
                ...options,
                waitTime: messagesReceived === 0 ? options.waitTime || 5 : 0,
            });
            if (result.success) {
                results.push(result);
                messagesReceived++;
            }
            else {
                if (result.error?.includes('Nenhuma mensagem disponível')) {
                    break;
                }
                results.push(result);
                break;
            }
        }
        return results;
    }
    async getQueueInfo(queueName) {
        const sql = `
            SELECT 
                q.name as queue_name,
                q.queue_type,
                q.max_retries,
                q.retry_delay,
                q.retention_time,
                qt.ready + qt.waiting as message_count,
                qt.ready as pending_messages
            FROM user_queues q
            JOIN user_queue_tables qt ON q.queue_table = qt.queue_table
            WHERE UPPER(q.name) = UPPER(:queue_name)
        `;
        try {
            const result = await this.connection.execute(sql, { queue_name: queueName }, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT,
            });
            if (result.rows && result.rows.length > 0) {
                const row = result.rows[0];
                return {
                    queueName: row.QUEUE_NAME,
                    queueType: row.QUEUE_TYPE,
                    maxRetries: row.MAX_RETRIES,
                    retryDelay: row.RETRY_DELAY,
                    retentionTime: row.RETENTION_TIME,
                    messageCount: row.MESSAGE_COUNT,
                    pendingMessages: row.PENDING_MESSAGES,
                };
            }
            else {
                throw new Error(`Fila '${queueName}' não encontrada`);
            }
        }
        catch (error) {
            throw new Error(`Erro ao obter informações da fila: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async purgeQueue(queueName, purgeCondition) {
        try {
            const plsqlBlock = `
                DECLARE
                    purge_options DBMS_AQADM.AQ$_PURGE_OPTIONS_T;
                BEGIN
                    ${purgeCondition ? `purge_options.condition := '${purgeCondition}';` : ''}
                    
                    DBMS_AQADM.PURGE_QUEUE_TABLE(
                        queue_table => (SELECT queue_table FROM user_queues WHERE name = :queue_name),
                        purge_condition => purge_options.condition
                    );
                    
                    :result := 'Success';
                EXCEPTION
                    WHEN OTHERS THEN
                        :result := SQLERRM;
                END;
            `;
            const binds = {
                queue_name: queueName,
                result: {
                    dir: oracledb_1.default.BIND_OUT,
                    type: oracledb_1.default.STRING,
                    maxSize: 1000,
                },
            };
            const result = await this.connection.execute(plsqlBlock, binds);
            if (result.outBinds?.result ===
                'Success') {
                return { purgedCount: -1 };
            }
            else {
                throw new Error(result.outBinds
                    ?.result);
            }
        }
        catch (error) {
            throw new Error(`Erro ao purgar fila: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async createQueue(queueName, queueTableName, payloadType = 'SYS.AQ$_JMS_TEXT_MESSAGE', options = {}) {
        const { maxRetries = 5, retryDelay = 0, retentionTime = 0, comment, } = options;
        try {
            const plsqlBlock = `
                BEGIN
                    -- Criar queue table se não existir
                    BEGIN
                        DBMS_AQADM.CREATE_QUEUE_TABLE(
                            queue_table => :queue_table_name,
                            queue_payload_type => :payload_type,
                            sort_list => 'PRIORITY,ENQ_TIME',
                            multiple_consumers => TRUE,
                            message_grouping => DBMS_AQADM.NONE,
                            compatible => '10.0.0'
                        );
                    EXCEPTION
                        WHEN OTHERS THEN
                            IF SQLCODE != -24001 THEN -- Table already exists
                                RAISE;
                            END IF;
                    END;
                    
                    -- Criar queue
                    DBMS_AQADM.CREATE_QUEUE(
                        queue_name => :queue_name,
                        queue_table => :queue_table_name,
                        queue_type => DBMS_AQADM.NORMAL_QUEUE,
                        max_retries => :max_retries,
                        retry_delay => :retry_delay,
                        retention_time => :retention_time
                        ${comment ? `, comment => '${comment}'` : ''}
                    );
                    
                    -- Iniciar queue
                    DBMS_AQADM.START_QUEUE(queue_name => :queue_name);
                    
                    :result := 'SUCCESS';
                EXCEPTION
                    WHEN OTHERS THEN
                        :result := SQLERRM;
                END;
            `;
            const binds = {
                queue_name: queueName,
                queue_table_name: queueTableName,
                payload_type: payloadType,
                max_retries: maxRetries,
                retry_delay: retryDelay,
                retention_time: retentionTime,
                result: {
                    dir: oracledb_1.default.BIND_OUT,
                    type: oracledb_1.default.STRING,
                    maxSize: 1000,
                },
            };
            const result = await this.connection.execute(plsqlBlock, binds);
            return (result.outBinds?.result ===
                'SUCCESS');
        }
        catch (error) {
            throw new Error(`Erro ao criar fila: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async listQueues() {
        const sql = `
            SELECT name 
            FROM user_queues 
            WHERE queue_type = 'NORMAL_QUEUE'
            ORDER BY name
        `;
        const result = await this.connection.execute(sql, {}, {
            outFormat: oracledb_1.default.OUT_FORMAT_OBJECT,
        });
        return result.rows.map((row) => row.NAME);
    }
    determinePayloadType(payload) {
        if (typeof payload === 'string') {
            return 'TEXT';
        }
        else if (typeof payload === 'object') {
            return 'JSON';
        }
        else {
            return 'RAW';
        }
    }
    getPayloadDeclaration(payloadType) {
        switch (payloadType) {
            case 'TEXT':
                return 'message_payload SYS.AQ$_JMS_TEXT_MESSAGE;';
            case 'JSON':
                return 'message_payload SYS.AQ$_JMS_TEXT_MESSAGE;';
            default:
                return 'message_payload RAW(2000);';
        }
    }
    createPayloadAssignment(payloadType, payload) {
        switch (payloadType) {
            case 'TEXT':
                return `
                    message_payload := SYS.AQ$_JMS_TEXT_MESSAGE.construct;
                    message_payload.set_text('${payload.toString().replace(/'/g, '\'\'')}');
                `;
            case 'JSON':
                return `
                    message_payload := SYS.AQ$_JMS_TEXT_MESSAGE.construct;
                    message_payload.set_text('${JSON.stringify(payload).replace(/'/g, '\'\'')}');
                `;
            default:
                return `message_payload := UTL_RAW.CAST_TO_RAW('${payload}');`;
        }
    }
    parsePayload(payloadText) {
        if (!payloadText)
            return null;
        try {
            return JSON.parse(payloadText);
        }
        catch {
            return payloadText;
        }
    }
}
exports.AQOperations = AQOperations;
class AQOperationsFactory {
    static createHighFrequencyOperator(connection) {
        return new AQOperations(connection);
    }
    static createReliableOperator(connection) {
        return new AQOperations(connection);
    }
}
exports.AQOperationsFactory = AQOperationsFactory;
//# sourceMappingURL=aqOperations.js.map