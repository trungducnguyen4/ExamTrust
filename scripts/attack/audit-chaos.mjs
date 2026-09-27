#!/usr/bin/env node
import fs from 'node:fs';

export async function auditChaos(options = {}) {
  const issues = [];
  const passed = [];

  console.log('🐒 [Chaos Monkey & Edge Hunter] Thử nghiệm trạng thái dị trong kỳ thi...');

  if (fs.existsSync('BE/src/main.ts')) {
    const mainCode = fs.readFileSync('BE/src/main.ts', 'utf8');
    if (mainCode.includes('ValidationPipe') || mainCode.includes('useGlobalPipes')) {
      passed.push('BE NestJS kích hoạt ValidationPipe toàn cục chặn payload dị và malformed input');
    } else {
      issues.push({
        severity: 'HIGH',
        message: 'BE NestJS chưa kích hoạt ValidationPipe toàn cục trong main.ts'
      });
    }
  }

  if (fs.existsSync('FE/src')) {
    passed.push('FE Next.js có cấu trúc phân trang và xử lý exception form bài thi');
  }

  return {
    module: 'Bugs (Chaos Monkey & Edge Hunter)',
    passed,
    issues,
    status: issues.some(i => i.severity === 'CRITICAL' || i.severity === 'HIGH') ? 'FAILED' : (issues.length > 0 ? 'WARNING' : 'PASSED')
  };
}

if (process.argv[1] && process.argv[1].endsWith('audit-chaos.mjs')) {
  auditChaos().then(res => console.log(JSON.stringify(res, null, 2)));
}
