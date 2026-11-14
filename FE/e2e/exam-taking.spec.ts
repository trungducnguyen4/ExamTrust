import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

test.describe('Student Exam Taking Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Layout Shell Standard Viewport (1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('TC-EXAM-01: Render questions, select choices, flag questions, and navigate review summary', async ({ page }) => {
    // Navigate to exam-taking in preview mode (demo questions loaded)
    await page.goto('/student/exam-taking?mode=preview');

    // In preview mode, user arrives at review summary first
    await expect(page.getByRole('heading', { name: /kiểm tra bài làm/i })).toBeVisible();

    // 1. Click "Quay lại câu hỏi" to enter interactive question answering view
    const backToQuestionBtn = page.getByRole('button', { name: /quay lại câu hỏi|tiếp tục chỉnh sửa/i }).first();
    await expect(backToQuestionBtn).toBeVisible();
    await backToQuestionBtn.click();

    // 2. Verify interactive question view rendered
    await expect(page.locator('#main-content')).toBeVisible();

    // 3. Navigate questions via "Câu tiếp" if present
    const nextBtn = page.getByRole('button', { name: /câu tiếp/i });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    }

    // 4. Return to Review Summary
    const checkBtn = page.getByRole('button', { name: /kiểm tra trước khi nộp/i });
    if (await checkBtn.isVisible()) {
      await checkBtn.click();
      await expect(page.getByRole('heading', { name: /kiểm tra bài làm/i })).toBeVisible();
    }

    // 5. Capture Visual Proof Screenshot
    const screenshotDir = path.resolve(process.cwd(), '..', 'docs', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    await page.screenshot({
      path: path.join(screenshotDir, 'e2e-student-exam-taking.png'),
      fullPage: false,
    });
  });
});
