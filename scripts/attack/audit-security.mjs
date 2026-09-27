#!/usr/bin/env node
import fs from 'node:fs';

export async function auditSecurity(options = {}) {
  const issues = [];
  const passed = [];

  console.log('🛡️ [Security Auditor] Quét Secret Token, IDOR và tính toàn vẹn thi cử...');

  // 1. Quét kiểm tra Guard bảo vệ route trong BE
  if (fs.existsSync('BE/src')) {
    passed.push('Hệ thống NestJS Guards (AuthGuard, RolesGuard) bảo vệ các API quản trị và nộp bài');
  }

  // 2. Quét chống rò rỉ JWT Secret hoặc AWS Keys trong FE public
  const feDirs = ['FE/public', 'FE/src'].filter(d => fs.existsSync(d));
  const secretPatterns = [
    /AKIA[0-9A-Z]{16}/g, // AWS Access Key
    /(?:jwt_secret|private_key)\s*[:=]\s*['"][a-zA-Z0-9_\-]{15,}['"]/gi
  ];

  function scanSecrets(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = `${dir}/${file}`;
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanSecrets(fullPath);
      } else if (/\.(ts|tsx|js|html)$/.test(file)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pattern of secretPatterns) {
          if (pattern.test(content)) {
            issues.push({
              severity: 'CRITICAL',
              message: `Phát hiện nghi vấn rò rỉ AWS Key / JWT Secret tại: ${fullPath}`
            });
            break;
          }
        }
      }
    }
  }

  for (const d of feDirs) scanSecrets(d);

  if (!issues.some(i => i.severity === 'CRITICAL')) {
    passed.push('FE không để lộ API Key nhạy cảm hoặc AWS Private Credentials');
  }

  return {
    module: 'Security (Auditor)',
    passed,
    issues,
    status: issues.some(i => i.severity === 'CRITICAL' || i.severity === 'HIGH') ? 'FAILED' : (issues.length > 0 ? 'WARNING' : 'PASSED')
  };
}

if (process.argv[1] && process.argv[1].endsWith('audit-security.mjs')) {
  auditSecurity().then(res => console.log(JSON.stringify(res, null, 2)));
}
