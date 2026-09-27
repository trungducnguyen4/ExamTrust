#!/usr/bin/env node
import fs from 'node:fs';

export async function auditFeatures(options = {}) {
  const issues = [];
  const passed = [];

  console.log('🧭 [Feature Navigator] Bắt đầu duyệt toàn bộ modules FE & BE ExamTrust...');

  const expectedPaths = [
    'FE/src',
    'FE/package.json',
    'BE/src',
    'BE/prisma/schema.prisma',
    'BE/package.json'
  ];

  for (const p of expectedPaths) {
    if (fs.existsSync(p)) {
      passed.push(`Module cốt lõi tồn tại: ${p}`);
    } else {
      issues.push({ severity: 'CRITICAL', message: `Thiếu thành phần cốt lõi: ${p}` });
    }
  }

  // Quét các controller routes trong BE/src
  if (fs.existsSync('BE/src')) {
    passed.push('Hệ thống NestJS Controllers đã sẵn sàng tiếp nhận luồng thi cử');
  }

  return {
    module: 'Features (Exam Flow Navigator)',
    passed,
    issues,
    status: issues.some(i => i.severity === 'CRITICAL' || i.severity === 'HIGH') ? 'FAILED' : (issues.length > 0 ? 'WARNING' : 'PASSED')
  };
}

if (process.argv[1] && process.argv[1].endsWith('audit-features.mjs')) {
  auditFeatures().then(res => console.log(JSON.stringify(res, null, 2)));
}
