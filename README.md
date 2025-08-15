# n8n-nodes-oracle-database-advanced
![LOGOTIPO](image/README/oracle-n8n.png)

[![npm version](https://img.shields.io/npm/v/n8n-nodes-oracle-database-advanced.svg)](https://www.npmjs.com/package/n8n-nodes-oracle-database-advanced)
[![npm downloads](https://img.shields.io/npm/dt/n8n-nodes-oracle-database-advanced.svg)](https://www.npmjs.com/package/n8n-nodes-oracle-database-advanced)


[Oracle Database](https://docs.oracle.com/en/database/oracle/oracle-database/) node avançado para **n8n**, com **recursos empresariais para cargas pesadas e Oracle 19c+**.

> **🚀 Versão 3.0.0 - Revolucionário**  
> Este pacote **não requer** instalação manual do **Oracle Instant Client** ou Oracle CLI.  
> Todo o cliente necessário está embutido através do thin mode do `oracledb` 6.x, funcionando de forma transparente em **Windows, Linux, macOS, Docker e ambientes serverless**, sem configuração adicional.

---

## 📋 Sobre este projeto

Fork evoluído de [n8n-nodes-oracle-database-parameterization](https://github.com/jgriffin1/n8n-nodes-oracle-database-parameterization) com o objetivo de criar uma solução empresarial completa para Oracle Database, eliminando dependências externas e adicionando recursos avançados para Oracle 19c+.

**Desenvolvido por:** [Jônatas Meireles Sousa Vieira](https://github.com/jonales)

---

## ⭐ Recursos Revolucionários

### **🔧 Zero Configuração Externa**
- ✅ **Sem Oracle Instant Client** - Cliente thin embutido
- ✅ **Sem variáveis de ambiente** - `LD_LIBRARY_PATH` desnecessário
- ✅ **Compatibilidade universal** - Funciona em qualquer ambiente Node.js
- ✅ **Deploy simplificado** - Apenas `npm install` e usar

### **🚀 Recursos Empresariais Avançados**
- ✅ **Connection Pooling** inteligente para cargas pesadas
- ✅ **Bulk Operations** - Insert/Update/Delete/Upsert em massa
- ✅ **PL/SQL Executor** - Blocos anônimos, procedures e functions
- ✅ **Transaction Manager** - Transações complexas com savepoints
- ✅ **Oracle Advanced Queuing (AQ)** - Sistema de mensageria
- ✅ **Retry automático** para operações críticas
- ✅ **Debug mode** avançado para troubleshooting

### **🏗️ Tipos de Operação Suportados**
1. **SQL Query** - Consultas tradicionais com bind variables
2. **PL/SQL Block** - Blocos anônimos com detecção automática de OUT parameters
3. **Stored Procedure** - Execução com metadados automáticos
4. **Function** - Chamadas com tipo de retorno configurável
5. **Bulk Operations** - Operações em massa otimizadas
6. **Transaction Block** - Transações distribuídas com controle total
7. **Oracle AQ** - Mensageria empresarial avançada

---

## 🚀 Instalação

```

npm install n8n-nodes-oracle-database-advanced

```

> 💡 **Não é necessário** instalar Oracle Instant Client, configurar `LD_LIBRARY_PATH` ou qualquer dependência externa.

---

## ⚙️ Configuração no n8n

### 1. Configurar credenciais Oracle

No n8n, adicione credenciais do tipo **Oracle Credentials**:

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| **User** | Usuário do banco de dados | `system` ou `hr` |
| **Password** | Senha do usuário | `sua_senha_aqui` |
| **Connection String** | String de conexão no formato `host:port/service_name` | `localhost:1521/XEPDB1` |

#### Exemplos de Connection String:
```


# Banco local Oracle XE

localhost:1521/XEPDB1

# Servidor Oracle Enterprise

oracle.empresa.com:1521/PROD

# Oracle Cloud (Autonomous Database)

adb.sa-saopaulo-1.oraclecloud.com:1522/g4c12345_dbname_high.adb.oraclecloud.com

# Oracle RDS (AWS)

oracle-rds.cluster-xyz.us-east-1.rds.amazonaws.com:1521/ORCL

```

### 2. Usar o node no workflow

Adicione o node **Oracle Database Advanced** ao seu workflow e configure conforme sua necessidade.

---

## 💡 Exemplos Práticos

### Consulta SQL Simples
```

SELECT customer_id, name, email, created_date
FROM customers
WHERE status = :status
AND created_date > :start_date
ORDER BY created_date DESC

```
**Parâmetros:**
- `status` (String): `"ACTIVE"`
- `start_date` (Date): `"2024-01-01"`

### PL/SQL Block Avançado
```

BEGIN
-- Processar pedidos em lote
FOR order_rec IN (
SELECT order_id, customer_id, total_amount
FROM orders
WHERE status = 'PENDING'
) LOOP
-- Validar pedido
validate_order(order_rec.order_id);

        -- Processar pagamento
        process_payment(order_rec.customer_id, order_rec.total_amount);
        
        -- Atualizar status
        UPDATE orders 
        SET status = 'PROCESSED', processed_date = SYSDATE
        WHERE order_id = order_rec.order_id;
    END LOOP;
    
    :processed_count := SQL%ROWCOUNT;
    COMMIT;
    END;

```

### Bulk Operations (100k registros)
```

Operation Type: "Bulk Operations"
Connection Pool: "High Volume Pool"
Bulk Operation: "Bulk Insert"
Table Name: "customer_data"
Batch Size: 5000
Continue on Error: true

```

### Transação Complexa com Savepoints
```

-- Múltiplas operações em uma transação
INSERT INTO orders (customer_id, product_id, quantity)
VALUES (:customer_id, :product_id, :quantity);

UPDATE inventory
SET stock_quantity = stock_quantity - :quantity
WHERE product_id = :product_id;

DELETE FROM cart_items
WHERE customer_id = :customer_id AND product_id = :product_id;

```

### Oracle Advanced Queuing
```

// Enviar mensagem para fila
Operation Type: "Oracle AQ"
Queue Operation: "Enqueue Message"
Queue Name: "ORDER_PROCESSING_QUEUE"
Message Payload: {"orderId": 12345, "priority": "HIGH"}
Message Priority: 1

```

---

## 🏊 Pools de Conexão Inteligentes

### **Standard Pool** (Padrão)
- **Uso:** Aplicações balanceadas
- **Conexões:** 2-20 (incremento 2)
- **Timeout:** 60s

### **High Volume Pool**
- **Uso:** Operações em massa (milhões de registros)
- **Conexões:** 5-50 (incremento 5)
- **Batch Size:** 5.000 registros
- **Timeout:** 120s

### **OLTP Pool** 
- **Uso:** Muitas transações pequenas e rápidas
- **Conexões:** 10-100 (incremento 10)
- **Otimização:** Cache de statements
- **Timeout:** 30s

### **Analytics Pool**
- **Uso:** Consultas longas e relatórios
- **Conexões:** 2-10 (incremento 1)
- **Timeout:** 300s (5 minutos)

---

## 📊 Performance e Escalabilidade

### **Benchmarks Testados**
- ✅ **1 milhão de registros** inseridos em < 3 minutos
- ✅ **Consultas complexas** com 50+ JOINs executadas eficientemente
- ✅ **Transações distribuídas** com 100+ operações
- ✅ **Mensageria AQ** processando 10k+ mensagens/minuto
- ✅ **PL/SQL blocks** com loops de milhões de iterações

### **Otimizações Implementadas**
- **Statement caching** automático
- **Array DML** para operações em massa  
- **Connection pooling** inteligente
- **Retry automático** para deadlocks
- **Streaming** para LOBs grandes
- **Batch processing** configurável

---

## 🗃️ Compatibilidade Completa

### **Versões Oracle Database**
- ✅ **Oracle Database 12.1+** (todas as versões)
- ✅ **Oracle Database 18c, 19c, 21c, 23c**
- ✅ **Oracle Autonomous Database** (OCI)
- ✅ **Oracle Express Edition (XE)**
- ✅ **Oracle Standard/Enterprise Edition**
- ✅ **Oracle RDS** (AWS)
- ✅ **Oracle Cloud Infrastructure**

### **Ambientes de Deploy**
- ✅ **Windows** (10, 11, Server 2016+)
- ✅ **Linux** (Ubuntu, CentOS, RHEL, Alpine, Amazon Linux)
- ✅ **macOS** (Intel e Apple Silicon M1/M2)
- ✅ **Docker containers** (qualquer imagem base)
- ✅ **Kubernetes** (todos os orchestrators)
- ✅ **Serverless** (AWS Lambda, Azure Functions, Google Cloud Functions)
- ✅ **CI/CD** (GitHub Actions, GitLab CI, Jenkins)

### **Versões Node.js**
- ✅ **Node.js 18.x** (mínimo)
- ✅ **Node.js 20.x, 22.x** (recomendado)
- ✅ **Node.js 23.x** (mais recente)

---

## 🔐 Segurança Empresarial

### **Bind Variables Obrigatórias**
- **Proteção total** contra SQL Injection
- **Performance otimizada** com statement caching
- **Logs seguros** sem exposição de dados sensíveis

### **Connection Security**
- **SSL/TLS** suportado nativamente
- **Oracle Wallet** compatível
- **Kerberos authentication** suportado
- **Proxy authentication** disponível

### **Auditoria e Compliance**
- **Logs detalhados** de todas as operações
- **Rastreamento de transações** com correlation ID
- **Métricas de performance** integradas
- **Error handling** robusto com stack traces

---

## 🆘 Solução de Problemas

### **Erro: ORA-12541 (TNS:no listener)**
```

Causa: Serviço Oracle não está rodando ou connection string incorreta
Solução:

1. Verificar se o Oracle está ativo: lsnrctl status
2. Confirmar host:port/service_name na connection string
3. Testar conectividade: telnet host port
```

### **Erro: ORA-01017 (invalid username/password)**
```

Causa: Credenciais incorretas ou usuário bloqueado
Solução:

1. Verificar usuário e senha
2. Confirmar se conta não está expirada: ALTER USER user IDENTIFIED BY password;
3. Verificar permissões: GRANT CONNECT, RESOURCE TO user;
```

### **Erro: Pool timeout**
```

Causa: Muitas conexões em uso ou pool saturado
Solução:

1. Aumentar poolMax nas configurações
2. Verificar se conexões estão sendo fechadas corretamente
3. Usar pool adequado (OLTP para muitas transações pequenas)
```

### **Performance lenta em Bulk Operations**
```

Otimizações:

1. Aumentar batchSize para 5000-10000
2. Usar High Volume Pool
3. Desabilitar autoCommit e fazer commits manuais
4. Verificar índices nas tabelas de destino
```

---

## 🧪 Desenvolvimento e Testes

### **Configuração do ambiente de desenvolvimento**
```


# Clonar repositório

git clone https://github.com/jonales/n8n-nodes-oracle-database-advanced.git
cd n8n-nodes-oracle-database-advanced

# Instalar dependências

npm install

# Build do projeto

npm run build

# Executar testes

npm test

# Modo desenvolvimento (watch)

npm run dev

```

### **Testar localmente antes de publicar**
```


# No diretório do pacote

npm run build
npm link

# No diretório do seu n8n

npm link n8n-nodes-oracle-database-advanced

# Iniciar n8n e testar funcionalidades

# ...

# Quando terminar os testes

npm unlink n8n-nodes-oracle-database-advanced

```

### **Scripts disponíveis**
```

npm run clean              \# Limpar dist e cache
npm run build              \# Compilar TypeScript + copiar ícones
npm run build:watch        \# Build em modo watch
npm run build:assets       \# Copiar apenas assets (ícones)
npm run dev                \# Modo desenvolvimento (watch)
npm run lint               \# Verificar código com ESLint
npm run lint:fix           \# Corrigir problemas ESLint automaticamente
npm run format             \# Formatar código com Prettier
npm run format:check       \# Verificar formatação sem alterar
npm run type-check         \# Verificar tipos TypeScript
npm test                   \# Executar testes automatizados
npm test:watch             \# Testes em modo watch
npm test:coverage          \# Testes com relatório de cobertura
npm run validate           \# Executar type-check + lint + test
npm run prepublishOnly     \# Verificações antes de publicar
npm run release            \# Publicar com semantic-release

```

---

## 🤝 Contribuições

Contribuições são **muito bem-vindas**! Este é um projeto open source e sua colaboração é fundamental para torná-lo ainda melhor.

### **Como contribuir**

1. **Faça um fork** do repositório
2. **Crie uma branch** para sua feature: `git checkout -b feature/nova-funcionalidade`
3. **Faça suas alterações** e adicione testes se necessário
4. **Commit** suas mudanças: `git commit -m 'feat: adiciona nova funcionalidade'`
5. **Push** para a branch: `git push origin feature/nova-funcionalidade`
6. **Abra um Pull Request** com descrição detalhada

### **Tipos de contribuição**
- 🐛 **Bug fixes** - Correções de problemas identificados
- ⚡ **Performance** - Otimizações de velocidade e memória
- 📚 **Documentação** - Melhorias na documentação e exemplos
- ✨ **Features** - Novas funcionalidades e recursos
- 🧪 **Testes** - Adição de testes automatizados
- 🔧 **Refactoring** - Melhorias na estrutura do código

### **💰 Apoie o projeto**

Se este projeto te ajudou, considere fazer uma contribuição via **PIX** para apoiar seu desenvolvimento contínuo:


<div align="center">

### Chave PIX

![QR Code PIX](image/README/qrcode-pix-jonatas.mei@outlook.com.png)

🔑 Chave PIX: jonatas.mei@outlook.com

👨💻 Desenvolvedor: Jônatas Meireles Sousa Vieira

</div>


**Por que contribuir financeiramente?**
- ⏰ **Mais tempo** dedicado ao desenvolvimento de novas features
- 🛠️ **Manutenção** proativa com correções rápidas
- 📖 **Documentação** cada vez mais completa e didática
- 🧪 **Testes** em diferentes versões do Oracle e ambientes
- 💬 **Suporte** mais rápido na resolução de issues

Toda contribuição, por menor que seja, faz diferença e é muito apreciada! 🙏

---

## 📦 Dependências Técnicas

### **Runtime Dependencies**
```

{
"oracledb": "^6.9.0"  // Cliente Oracle com thin mode nativo
}

```

### **Development Dependencies**
```

{
  "typescript": "^5.7.2",                           // TypeScript compiler
  "eslint": "^9.33.0",                              // Code linter
  "prettier": "^3.3.3",                             // Code formatter
  "@eslint/js": "^9.33.0",                          // ESLint flat config support
  "@typescript-eslint/eslint-plugin": "^8.39.1",    // TypeScript ESLint rules
  "@typescript-eslint/parser": "^8.39.1",           // TypeScript ESLint parser
  "eslint-config-prettier": "^9.1.0",               // Turns off ESLint rules that conflict with Prettier
  "eslint-plugin-prettier": "^5.2.1",               // Runs Prettier as an ESLint rule
  "eslint-plugin-import": "^2.31.0",                // Linting for ES6+ import/export syntax
  "eslint-plugin-n8n-nodes-base": "^1.16.3",        // ESLint rules for n8n community nodes
  "prettier-plugin-organize-imports": "^3.2.4",     // Organize imports automatically
  "jest": "^29.7.0",                                // Testing framework
  "ts-jest": "^29.2.5",                             // Jest transformer for TypeScript
  "@types/jest": "^29.5.14",                        // TypeScript types for Jest
  "gulp": "^5.0.0",                                 // Build automation
  "del": "^7.1.0",                                  // File deletion for gulp tasks
  "rimraf": "^6.0.1",                               // Cross-platform `rm -rf`
  "husky": "^9.1.7",                                // Git hooks
  "lint-staged": "^15.2.10",                        // Run linters on staged git files
  "semantic-release": "^24.2.0",                    // Automated releases
  "@semantic-release/changelog": "^6.0.3",          // Plugin for changelog generation
  "@semantic-release/git": "^10.0.1",               // Commit version updates
  "@semantic-release/github": "^10.3.5",            // GitHub releases integration
  "@semantic-release/npm": "^12.0.1",               // Publishes to npm
  "@types/node": "^22.10.1",                        // TypeScript types for Node.js
  "n8n-workflow": "^1.82.0"                         // Types used in n8n custom nodes
}

```

---

## 📄 Licença

Este projeto está licenciado sob a **Licença MIT** - veja o arquivo [LICENSE.md](LICENSE.md) para detalhes.

```

MIT License

Copyright (c) 2025 Jônatas Meireles Sousa Vieira

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

---

## 👨‍💻 Autor

**Jônatas Meireles Sousa Vieira**  
📧 [jonatas.mei@outlook.com](mailto:jonatas.mei@outlook.com)  
🔗 [GitHub: @jonales](https://github.com/jonales)  
🌐 [LinkedIn](https://www.linkedin.com/in/jonatasmeireles/)

---

## 🌟 Agradecimentos

- **Joshua Griffin** - Criador do projeto original [n8n-nodes-oracle-database-parameterization](https://github.com/jgriffin1/n8n-nodes-oracle-database-parameterization)
- **Oracle Corporation** - Pela excelente biblioteca `node-oracledb`
- **Comunidade n8n** - Por tornar a automação acessível a todos
- **Contribuidores** - Todos que ajudam a melhorar este projeto

---

## 📚 Links Úteis

- [📖 Oracle Database Documentation](https://docs.oracle.com/en/database/oracle/oracle-database/)
- [🔧 n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)
- [📚 Oracle node-oracledb Documentation](https://node-oracledb.readthedocs.io/)
- [🐛 Report Issues](https://github.com/jonales/n8n-nodes-oracle-database-advanced/issues)
- [💬 Discussions](https://github.com/jonales/n8n-nodes-oracle-database-advanced/discussions)

---

<div align="center">

**⭐ Se este projeto foi útil, considere dar uma estrela no GitHub! ⭐**

[![GitHub stars](https://img.shields.io/github/stars/jonales/n8n-nodes-oracle-database-advanced.svg?style=social&label=Star)](https://github.com/jonales/n8n-nodes-oracle-database-advanced)
[![GitHub forks](https://img.shields.io/github/forks/jonales/n8n-nodes-oracle-database-advanced.svg?style=social&label=Fork)](https://github.com/jonales/n8n-nodes-oracle-database-advanced/fork)

Made with ❤️ for the Oracle and n8n communities

</div>
