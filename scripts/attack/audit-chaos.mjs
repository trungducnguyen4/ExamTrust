#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export async function auditChaos(options = {}) {
  const issues = [];
  const passed = [];

  console.log('🐒 [Chaos Monkey & Edge Hunter] Thử nghiệm trạng thái dị và race condition trong kỳ thi...');

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

  if (fs.existsSync('FE/e2e/double-submit-race.spec.ts')) {
    passed.push('Kịch bản Playwright Chaos kiểm thử Double-Submit Race Condition đã sẵn sàng');

    if (process.env.RUN_E2E === '1' || options.runE2E) {
      console.log('🐒 [Chaos Monkey] Chạy Playwright Double-Submit Race Condition Test...');
      const res = spawnSync('npx', ['playwright', 'test', 'e2e/double-submit-race.spec.ts', '--reporter=line'], {
        cwd: 'FE',
        shell: true,
        encoding: 'utf8'
      });
      if (res.status === 0) {
        passed.push('Chaos Monkey Double Submit: Idempotency và Fast-Fail chặn click lặp thành công');
      } else {
        issues.push({
          severity: 'HIGH',
          message: `Chaos Test thất bại: ${res.stderr || res.stdout || 'Xem logs chi tiết'}`
        });
      }
    }
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
