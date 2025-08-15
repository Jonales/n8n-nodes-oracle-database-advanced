const fs = require('fs');

const filesToFix = [
    'nodes/Oracle/connection.ts',
    'nodes/Oracle/core/aqOperations.ts',
    'nodes/Oracle/core/bulkOperations.ts',
    'nodes/Oracle/core/plsqlExecutor.ts',
    'nodes/Oracle/core/transactionManager.ts',
    'nodes/Oracle/OracleDatabase.node.ts'
];

filesToFix.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Corrigir error handling
        content = content.replace(/catch \(error\)/g, 'catch (error: unknown)');
        content = content.replace(/error\.message/g, 'error instanceof Error ? error.message : String(error)');
        
        // Corrigir outBinds
        content = content.replace(/result\.outBinds\?\.(\w+)/g, '(result.outBinds as { [key: string]: any } | undefined)?.$1');
        
        // Corrigir imports
        content = content.replace(/import { IExecuteFunctions } from "n8n-core";/g, 'import { IExecuteFunctions } from "n8n-workflow";');
        
        fs.writeFileSync(filePath, content);
        console.log(`✅ Corrigido: ${filePath}`);
    }
});

console.log('🎉 Correções aplicadas! Execute: npm run build');
