import { test, expect } from '@playwright/test';

test.describe('Attack Squad Chaos: Double Submit Race Condition & Rapid Clicks', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('CHAOS-01: Rapid double click on submit button does not trigger duplicate API mutations', async ({ page }) => {
    let loginRequestCount = 0;

    // Track requests to /api/auth/login or /api/
    await page.route('**/api/auth/login**', async (route) => {
      loginRequestCount++;
      // Inject 300ms network delay to simulate realistic transit latency
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    });

    await page.goto('/login');

    // Fill credentials
    await page.fill('#email', '522h0001@tdtutdtu.edu.vn');
    await page.fill('#password', '123123123Az!');

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();

    // Trigger rapid fire clicks (Chaos double-click within 10ms)
    await Promise.all([
      submitBtn.click({ clickCount: 1 }),
      submitBtn.click({ clickCount: 1 }).catch(() => {}), // may be disabled immediately
    ]);

    // Verify button state: should be disabled during isSubmitting
    await expect(submitBtn).toBeDisabled();

    // Verify network invariant: At most 1 mutation request in flight
    expect(loginRequestCount).toBeLessThanOrEqual(1);
  });

  test('CHAOS-02: Rapid double click on question choices does not crash question state', async ({ page }) => {
    await page.goto('/student/exam-taking?mode=preview');

    // In preview mode, first click to return to question answering
    const backBtn = page.getByRole('button', { name: /quay lại câu hỏi|tiếp tục chỉnh sửa/i }).first();
    if (await backBtn.isVisible()) {
      await backBtn.click();
    }

    const firstOption = page.locator('button, label').first();
    await expect(firstOption).toBeVisible();

    // Double click rapidly
    await firstOption.dblclick();

    // Page must remain responsive and not throw unhandled exception
    await expect(page.locator('#main-content')).toBeVisible();
  });
});
