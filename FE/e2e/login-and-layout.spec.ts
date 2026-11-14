import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

test.describe('Login & Layout Shell Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Enforce Layout Shell standard viewport (1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('TC-LOGIN-01: Displays login shell with title, demo accounts, and form inputs', async ({ page }) => {
    await page.goto('/login');

    // Title and form presence
    await expect(page.locator('h2')).toContainText('Đăng nhập ExamTrust');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Verify demo account quick-select buttons exist
    const demoStudentBtn = page.getByRole('button', { name: /sinh viên/i });
    await expect(demoStudentBtn).toBeVisible();

    // Clicking demo account auto-populates fields
    await demoStudentBtn.click();
    await expect(page.locator('#email')).toHaveValue('522h0001@tdtutdtu.edu.vn');
    await expect(page.locator('#password')).not.toBeEmpty();

    // Save visual proof screenshot for PR verification
    const screenshotDir = path.resolve(process.cwd(), '..', 'docs', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    await page.screenshot({
      path: path.join(screenshotDir, 'e2e-login-shell.png'),
      fullPage: false,
    });
  });

  test('TC-LAYOUT-02: Ensures no horizontal layout overflow on standard 1440px desktop shell', async ({ page }) => {
    await page.goto('/login');

    // Evaluate scroll width vs client width to guarantee no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth;
    });

    expect(hasHorizontalOverflow).toBe(false);
  });
});
