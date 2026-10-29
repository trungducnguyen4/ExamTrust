import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEnrollmentDto, BulkEnrollmentDto, BulkEnrollByEmailsDto, BulkImportStudentsDto, UpdateEnrollmentStatusDto } from './dto/enrollment.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name);

  private assertCanManageCourse(courseLecturerId: string | null, user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' }) {
    if (user.role === 'ADMIN') return;
    if (user.role !== 'LECTURER' || courseLecturerId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền quản lý ghi danh cho khóa học này');
    }
  }

  private async assertCanManageCourseById(courseId: string, user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' }) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, lecturerId: true },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    this.assertCanManageCourse(course.lecturerId, user);
    return course;
  }

  constructor(
    private prisma: PrismaService,
  ) {}

  async create(createEnrollmentDto: CreateEnrollmentDto, user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' }) {
    // Check if course exists
    const course = await this.prisma.course.findUnique({
      where: { id: createEnrollmentDto.courseId },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    this.assertCanManageCourse(course.lecturerId, user);

    // Check if student exists and is a student
    const student = await this.prisma.user.findUnique({
      where: { id: createEnrollmentDto.studentId },
    });

    if (!student) {
      throw new NotFoundException('Không tìm thấy sinh viên');
    }

    if (student.role !== 'STUDENT') {
      throw new BadRequestException('Người dùng này không phải là sinh viên');
    }

    // Check if already enrolled
    const existingEnrollment = await this.prisma.enrollment.findUnique({
      where: {
        courseId_studentId: {
          studentId: createEnrollmentDto.studentId,
          courseId: createEnrollmentDto.courseId,
        },
      },
    });

    if (existingEnrollment) {
      throw new ConflictException('Sinh viên đã được ghi danh vào khóa học này');
    }

    const enrollment = await this.prisma.enrollment.create({
      data: createEnrollmentDto,
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            studentId: true,
          },
        },
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });



    return enrollment;
  }

  async bulkEnroll(bulkEnrollmentDto: BulkEnrollmentDto, user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' }) {
    const { courseId, studentIds } = bulkEnrollmentDto;

    // Check if course exists
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    this.assertCanManageCourse(course.lecturerId, user);

    const results = {
      success: [] as string[],
      failed: [] as { studentId: string; reason: string }[],
    };

    if (studentIds.length === 0) {
      return results;
    }

    // Batch query 1: Fetch all requested users in 1 query
    const students = await this.prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, role: true },
    });
    const studentById = new Map<string, { id: string; role: string }>(students.map((s) => [s.id, s]));

    // Batch query 2: Fetch all existing enrollments in 1 query
    const existingEnrollments = await this.prisma.enrollment.findMany({
      where: {
        courseId,
        studentId: { in: studentIds },
      },
      select: { studentId: true },
    });
    const existingStudentIds = new Set(existingEnrollments.map((e) => e.studentId));

    const validNewStudentIds: string[] = [];

    for (const studentId of studentIds) {
      const student = studentById.get(studentId);
      if (!student) {
        results.failed.push({ studentId, reason: 'Không tìm thấy sinh viên' });
        continue;
      }
      if (student.role !== 'STUDENT') {
        results.failed.push({ studentId, reason: 'Người dùng này không phải là sinh viên' });
        continue;
      }
      if (existingStudentIds.has(studentId)) {
        results.failed.push({ studentId, reason: 'Đã được ghi danh trước đó' });
        continue;
      }
      validNewStudentIds.push(studentId);
    }

    if (validNewStudentIds.length > 0) {
      await this.prisma.enrollment.createMany({
        data: validNewStudentIds.map((studentId) => ({ studentId, courseId })),
        skipDuplicates: true,
      });
      results.success.push(...validNewStudentIds);
    }


    return results;
  }

  async bulkEnrollByEmails(dto: BulkEnrollByEmailsDto, user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' }) {
    const { courseId, emails } = dto;

    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');

    this.assertCanManageCourse(course.lecturerId, user);

    const results = {
      success: [] as { email: string; fullName: string; studentId: string | null }[],
      failed: [] as { email: string; reason: string }[],
      provisioned: 0,
    };

    for (const email of emails) {
      try {
        let student = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

        // Auto-provision: create student account if email not yet registered
        if (!student) {
          const tempPassword = await bcrypt.hash('Examtrust@123', 10);
          const emailPrefix = email.split('@')[0];
          student = await this.prisma.user.create({
            data: {
              email: email.toLowerCase().trim(),
              password: tempPassword,
              passwordChangedAt: new Date(),
              fullName: emailPrefix,
              role: 'STUDENT',
            },
          });
          results.provisioned = (results.provisioned ?? 0) + 1;
        }

        if (student.role !== 'STUDENT') { results.failed.push({ email, reason: 'Người dùng này không phải là sinh viên (vai trò: ' + student.role + ')' }); continue; }

        const existing = await this.prisma.enrollment.findUnique({
          where: { courseId_studentId: { studentId: student.id, courseId } },
        });
        if (existing) { results.failed.push({ email, reason: 'Đã được ghi danh trước đó' }); continue; }

        await this.prisma.enrollment.create({ data: { studentId: student.id, courseId } });
        results.success.push({ email, fullName: student.fullName, studentId: student.studentId });
      } catch (err: any) {
        this.logger.error(`Failed to enroll ${email}: ${err?.message}`);
        results.failed.push({ email, reason: err?.message ?? 'Lỗi không xác định' });
      }
    }



    return results;
  }

  async bulkImport(dto: BulkImportStudentsDto, user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' }) {
    const { courseId, students } = dto;

    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');

    this.assertCanManageCourse(course.lecturerId, user);

    const results = {
      success: [] as { email: string; fullName: string; studentId: string | null; row: number }[],
      failed: [] as { email: string; reason: string; row: number }[],
      provisioned: 0,
      totalProcessed: students.length,
    };

    for (let i = 0; i < students.length; i++) {
      const row = students[i];
      const rowNum = i + 1;
      const email = (row.email || '').toLowerCase().trim();

      if (!email) {
        results.failed.push({ email: email || '(trống)', reason: 'Cần nhập email', row: rowNum });
        continue;
      }

      try {
        let student = await this.prisma.user.findUnique({ where: { email } });

        // Auto-provision: create student account if not found
        if (!student) {
          const tempPassword = await bcrypt.hash('Examtrust@123', 10);
          const emailPrefix = email.split('@')[0];
          student = await this.prisma.user.create({
            data: {
              email,
              password: tempPassword,
              passwordChangedAt: new Date(),
              fullName: row.fullName?.trim() || emailPrefix,
              role: 'STUDENT',
              studentId: row.studentId?.trim() || null,
              department: row.department?.trim() || null,
            },
          });
          results.provisioned++;
        }

        if (student.role !== 'STUDENT') {
          results.failed.push({ email, reason: `Người dùng này không phải là sinh viên (vai trò: ${student.role})`, row: rowNum });
          continue;
        }

        // Update fullName/studentId if provided in file and currently empty
        const updateData: any = {};
        if (row.fullName?.trim() && (!student.fullName || student.fullName === email.split('@')[0])) {
          updateData.fullName = row.fullName.trim();
        }
        if (row.studentId?.trim() && !student.studentId) {
          updateData.studentId = row.studentId.trim();
        }
        if (row.department?.trim() && !student.department) {
          updateData.department = row.department.trim();
        }
        if (Object.keys(updateData).length > 0) {
          await this.prisma.user.update({ where: { id: student.id }, data: updateData });
        }

        const existing = await this.prisma.enrollment.findUnique({
          where: { courseId_studentId: { studentId: student.id, courseId } },
        });
        if (existing) {
          results.failed.push({ email, reason: 'Đã được ghi danh vào khóa học này trước đó', row: rowNum });
          continue;
        }

        await this.prisma.enrollment.create({ data: { studentId: student.id, courseId } });
        results.success.push({
          email,
          fullName: row.fullName?.trim() || student.fullName,
          studentId: row.studentId?.trim() || student.studentId,
          row: rowNum,
        });
      } catch (err: any) {
        this.logger.error(`Bulk import failed for ${email}: ${err?.message}`);
        results.failed.push({ email, reason: err?.message ?? 'Lỗi không xác định', row: rowNum });
      }
    }

    return results;
  }

  async searchTrainingSystemStudents(query?: string, courseId?: string) {
    const trimmedQuery = String(query || '').trim();
    const normalizedQuery = trimmedQuery.toLowerCase();

    const alreadyEnrolled = courseId
      ? await this.prisma.enrollment.findMany({
          where: { courseId },
          select: { studentId: true },
        })
      : [];
    const excludedStudentIds = new Set(alreadyEnrolled.map((row) => row.studentId));

    const students = await this.prisma.user.findMany({
      where: {
        role: 'STUDENT',
        status: 'active',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        studentId: true,
        department: true,
      },
      orderBy: { fullName: 'asc' },
      take: 100,
    });

    return students.filter((student) => {
      if (excludedStudentIds.has(student.id)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        student.email,
        student.fullName,
        student.studentId,
        student.department,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }

  async findByCourse(courseId: string, user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' }) {
    await this.assertCanManageCourseById(courseId, user);

    return this.prisma.enrollment.findMany({
      where: { courseId },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            studentId: true,
            department: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
  }

  async findByStudent(studentId: string) {
    return this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: {
          include: {
            lecturer: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
  }

  async updateStatus(id: string, updateStatusDto: UpdateEnrollmentStatusDto, user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' }) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            lecturerId: true,
          },
        },
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Không tìm thấy ghi danh');
    }

    this.assertCanManageCourse(enrollment.course.lecturerId, user);

    const updated = await this.prisma.enrollment.update({
      where: { id },
      data: { status: updateStatusDto.status },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            studentId: true,
          },
        },
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });



    return updated;
  }

  async remove(id: string, user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' }) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
      include: {
        course: {
          select: { id: true, code: true, name: true, lecturerId: true },
        },
        student: {
          select: { id: true, fullName: true },
        },
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Không tìm thấy ghi danh');
    }

    this.assertCanManageCourse(enrollment.course.lecturerId, user);

    await this.prisma.enrollment.delete({ where: { id } });



    return { message: 'Đã xóa ghi danh thành công' };
  }

  async removeByStudentAndCourse(studentId: string, courseId: string, user: { id: string; role: 'ADMIN' | 'LECTURER' | 'STUDENT' }) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        courseId_studentId: { studentId, courseId },
      },
      include: {
        course: {
          select: { id: true, code: true, lecturerId: true },
        },
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Không tìm thấy ghi danh');
    }

    this.assertCanManageCourse(enrollment.course.lecturerId, user);

    await this.prisma.enrollment.delete({
      where: { id: enrollment.id },
    });



    return { message: 'Đã xóa ghi danh thành công' };
  }
}
