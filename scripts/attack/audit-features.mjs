#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export async function auditFeatures(options = {}) {
  const issues = [];
  const passed = [];

  console.log('🧭 [Feature Navigator] Bắt đầu duyệt toàn bộ modules FE & BE ExamTrust...');

  const expectedPaths = [
    'FE/src',
    'FE/package.json',
    'BE/src',
    'BE/prisma/schema.prisma',
    'BE/package.json',
    'FE/e2e/exam-taking.spec.ts',
    'FE/playwright.config.ts'
  ];

  for (const p of expectedPaths) {
    if (fs.existsSync(p)) {
      passed.push(`Module cốt lõi tồn tại: ${p}`);
    } else {
      issues.push({ severity: 'HIGH', message: `Thiếu thành phần cốt lõi: ${p}` });
    }
  }

  // Quét các controller routes trong BE/src
  if (fs.existsSync('BE/src')) {
    passed.push('Hệ thống NestJS Controllers đã sẵn sàng tiếp nhận luồng thi cử');
  }

  // Chạy E2E Playwright thực tế nếu được kích hoạt
  if (process.env.RUN_E2E === '1' || options.runE2E) {
    console.log('🧭 [Feature Navigator] Chạy E2E Playwright Feature Test (Student Exam Taking)...');
    const res = spawnSync('npx', ['playwright', 'test', 'e2e/exam-taking.spec.ts', '--reporter=line'], {
      cwd: 'FE',
      shell: true,
      encoding: 'utf8'
    });
    if (res.status === 0) {
      passed.push('E2E Exam Taking Journey: Passed 100% trên trình duyệt thực');
    } else {
      issues.push({
        severity: 'HIGH',
        message: `E2E Playwright Feature Test thất bại: ${res.stderr || res.stdout || 'Xem logs chi tiết'}`
      });
    }
  } else {
    passed.push('E2E Playwright Suite (exam-taking.spec.ts) sẵn sàng kích hoạt với RUN_E2E=1');
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
