/**
 * Test user credentials for ExamTrust Playwright E2E suites.
 * Matches default seeded credentials in BE/prisma/seed-users.ts.
 */
export const TEST_USERS = {
  admin: {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@tdtutdtu.edu.vn',
    password: process.env.TEST_ADMIN_PASSWORD || '123123123Az!',
    role: 'ADMIN',
    expectedPath: '/admin',
  },
  lecturer: {
    email: process.env.TEST_LECTURER_EMAIL || 'lecturer01@tdtutdtu.edu.vn',
    password: process.env.TEST_LECTURER_PASSWORD || '123123123Az!',
    role: 'LECTURER',
    expectedPath: '/lecturer',
  },
  student: {
    email: process.env.TEST_STUDENT_EMAIL || '522h0001@tdtutdtu.edu.vn',
    password: process.env.TEST_STUDENT_PASSWORD || '123123123Az!',
    role: 'STUDENT',
    expectedPath: '/student',
  },
} as const;
