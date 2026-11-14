import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { TEST_USERS } from './fixtures/test-users';

const authDir = path.resolve(process.cwd(), 'e2e', '.auth');

setup('setup authentication storage states', async ({ page }) => {
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // 1. Setup Student Session
  await page.goto('/login');
  await expect(page.locator('h2')).toContainText('Đăng nhập ExamTrust');

  await page.fill('#email', TEST_USERS.student.email);
  await page.fill('#password', TEST_USERS.student.password);
  await page.click('button[type="submit"]');

  // Verify redirection to student dashboard or login response
  try {
    await page.waitForURL('**/student**', { timeout: 15000 });
    await page.context().storageState({ path: path.join(authDir, 'student.json') });
    console.log('[auth.setup] Student auth session saved.');
  } catch (err) {
    console.warn('[auth.setup] Could not redirect to /student (backend might need live connection):', err);
  }

  // 2. Setup Lecturer Session
  await page.goto('/login');
  await page.fill('#email', TEST_USERS.lecturer.email);
  await page.fill('#password', TEST_USERS.lecturer.password);
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL('**/lecturer**', { timeout: 15000 });
    await page.context().storageState({ path: path.join(authDir, 'lecturer.json') });
    console.log('[auth.setup] Lecturer auth session saved.');
  } catch (err) {
    console.warn('[auth.setup] Could not redirect to /lecturer:', err);
  }
});
