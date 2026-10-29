import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { PaginationDto, buildPaginatedResult } from '../common/dto/pagination.dto';

interface AuthUser {
  id: string;
  role: 'ADMIN' | 'LECTURER' | 'STUDENT';
}

@Injectable()
export class CoursesService {
  constructor(
    private prisma: PrismaService,
  ) {}

  private async assertLecturerExists(lecturerId: string) {
    const lecturer = await this.prisma.user.findUnique({
      where: { id: lecturerId },
      select: { id: true, role: true, status: true },
    });

    if (!lecturer || lecturer.role !== 'LECTURER' || lecturer.status !== 'active') {
      throw new BadRequestException('Giảng viên được gán không hợp lệ hoặc không hoạt động');
    }
  }

  private async assertCanAccessCourse(courseId: string, courseLecturerId: string | null, user: AuthUser) {
    if (user.role === 'ADMIN') return;

    if (user.role === 'LECTURER') {
      if (courseLecturerId !== user.id) {
        throw new ForbiddenException('Bạn không có quyền truy cập khóa học này');
      }
      return;
    }

    if (user.role === 'STUDENT') {
      const isEnrolled = await this.prisma.enrollment.findFirst({
        where: {
          studentId: user.id,
          courseId,
        },
      });

      if (!isEnrolled) {
        throw new ForbiddenException('Bạn không có quyền truy cập khóa học này');
      }
      return;
    }

    throw new ForbiddenException('Bạn không có quyền truy cập khóa học này');
  }

  private toAsciiUpper(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .toUpperCase();
  }

  private buildToken(value: string, maxLength: number, fallback: string) {
    const compact = this.toAsciiUpper(value)
      .split(/\s+/)
      .filter(Boolean)
      .join('');

    return (compact.slice(0, maxLength) || fallback).toUpperCase();
  }

  private async generateCourseCode(courseName: string, creatorId: string) {
    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
      select: { fullName: true, email: true },
    });

    const courseToken = this.buildToken(courseName, 6, 'COURSE');
    const creatorToken = this.buildToken(
      creator?.fullName || creator?.email?.split('@')[0] || '',
      4,
      'USER',
    );

    const base = `${courseToken}-${creatorToken}`;

    const existingCodes = await this.prisma.course.findMany({
      where: { code: { startsWith: `${base}-` } },
      select: { code: true },
    });

    const usedNumbers = new Set<number>();

    for (const item of existingCodes) {
      const suffix = item.code.slice(base.length + 1);
      const parsed = Number.parseInt(suffix, 10);
      if (!Number.isNaN(parsed)) {
        usedNumbers.add(parsed);
      }
    }

    let sequence = 1;
    while (usedNumbers.has(sequence)) {
      sequence += 1;
    }

    return `${base}-${String(sequence).padStart(2, '0')}`;
  }

  async create(createCourseDto: CreateCourseDto, user: AuthUser) {
    const { lecturerId: requestedLecturerId, ...courseData } = createCourseDto;
    const lecturerId = user.role === 'ADMIN' ? requestedLecturerId ?? null : user.id;
    const generatedCode = await this.generateCourseCode(createCourseDto.name, user.id);

    if (lecturerId) {
      await this.assertLecturerExists(lecturerId);
    }

    const createdCourse = await this.prisma.course.create({
      data: {
        ...courseData,
        code: generatedCode,
        lecturerId,
      },
      include: {
        lecturer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });



    return createdCourse;
  }

  async findAll(lecturerId?: string, pagination?: PaginationDto, archiveStatus = 'active') {
    const where: any = lecturerId ? { lecturerId } : {};
    if (archiveStatus === 'archived') where.status = 'archived';
    else if (archiveStatus !== 'all') where.status = { not: 'archived' };
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;

    const [courses, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        include: {
          lecturer: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
              exams: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.course.count({ where }),
    ]);

    return buildPaginatedResult(courses, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        lecturer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            department: true,
          },
        },
        enrollments: {
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                email: true,
                studentId: true,
              },
            },
          },
        },
        exams: {
          select: {
            id: true,
            title: true,
            status: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    await this.assertCanAccessCourse(course.id, course.lecturerId, user);

    if (user.role === 'STUDENT' && course.status === 'archived') {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    return course;
  }

  async update(id: string, updateCourseDto: UpdateCourseDto, user: AuthUser) {
    const course = await this.prisma.course.findUnique({ where: { id } });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    await this.assertCanAccessCourse(course.id, course.lecturerId, user);

    const { lecturerId: requestedLecturerId, ...courseData } = updateCourseDto;

    if (requestedLecturerId !== undefined && user.role !== 'ADMIN') {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể gán lại giảng viên cho khóa học');
    }

    if (requestedLecturerId) {
      await this.assertLecturerExists(requestedLecturerId);
    }

    const data: UpdateCourseDto = {
      ...courseData,
      ...(user.role === 'ADMIN' && requestedLecturerId !== undefined ? { lecturerId: requestedLecturerId } : {}),
    };

    const updatedCourse = await this.prisma.course.update({
      where: { id },
      data,
      include: {
        lecturer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });



    return updatedCourse;
  }

  async remove(id: string, user: AuthUser) {
    await this.archive(id, user);
    return { message: 'Đã lưu trữ khóa học thành công' };
  }

  async archive(id: string, user: AuthUser) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    await this.assertCanAccessCourse(course.id, course.lecturerId, user);
    if (course.status === 'archived') {
      throw new ConflictException('Khóa học đã được lưu trữ');
    }

    const activeWork = await this.prisma.exam.count({
      where: {
        courseId: id,
        OR: [
          { status: 'ONGOING' },
          { submissions: { some: { status: 'IN_PROGRESS' } } },
        ],
      },
    });
    if (activeWork > 0) {
      throw new ConflictException('Không thể lưu trữ khóa học khi đang có bài thi hoặc lượt làm bài đang diễn ra.');
    }

    return this.prisma.course.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date(), archivedById: user.id },
    });
  }

  async restore(id: string, user: AuthUser) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    await this.assertCanAccessCourse(course.id, course.lecturerId, user);
    if (course.status !== 'archived') {
      throw new ConflictException('Khóa học chưa được lưu trữ');
    }
    return this.prisma.course.update({
      where: { id },
      data: { status: 'active', archivedAt: null, archivedById: null },
    });
  }

  async getMyCoursesAsStudent(studentId: string, limit?: number) {
    const courses = await this.prisma.course.findMany({
      where: {
        status: { not: 'archived' },
        enrollments: {
          some: { studentId },
        },
      },
      include: {
        lecturer: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit, // Limit the number of courses if the limit is provided
    });

    const courseIds = courses.map((course) => course.id);

    if (courseIds.length === 0) return [];

    const [enrollmentCounts, exams] = await Promise.all([
      this.prisma.enrollment.groupBy({
        by: ['courseId'],
        where: { courseId: { in: courseIds } },
        _count: { _all: true },
      }),
      this.prisma.exam.findMany({
        where: {
          courseId: { in: courseIds },
          status: { in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] },
        },
        select: {
          id: true,
          courseId: true,
          title: true,
          status: true,
          startTime: true,
          endTime: true,
          duration: true,
          maxAttempts: true,
          settings: true,
        },
        orderBy: [{ endTime: 'asc' }, { startTime: 'asc' }],
      }),
    ]);

    const examIds = exams.map((exam) => exam.id);
    const submissions = examIds.length
      ? await this.prisma.examSubmission.findMany({
          where: {
            studentId,
            examId: { in: examIds },
          },
          select: {
            id: true,
            examId: true,
            status: true,
            score: true,
            attemptNo: true,
            startedAt: true,
            submittedAt: true,
            createdAt: true,
          },
          orderBy: [{ submittedAt: 'desc' }, { startedAt: 'desc' }, { createdAt: 'desc' }],
        })
      : [];

    const enrollmentCountByCourseId = new Map(
      enrollmentCounts.map((item) => [item.courseId, item._count._all]),
    );
    const latestSubmissionByExamId = new Map<string, (typeof submissions)[number]>();

    for (const submission of submissions) {
      if (!latestSubmissionByExamId.has(submission.examId)) {
        latestSubmissionByExamId.set(submission.examId, submission);
      }
    }

    const examsByCourseId = new Map<string, any[]>();
    for (const exam of exams) {
      const rows = examsByCourseId.get(exam.courseId) ?? [];
      rows.push({
        id: exam.id,
        title: exam.title,
        status: exam.status,
        startTime: exam.startTime,
        endTime: exam.endTime,
        duration: exam.duration,
        maxAttempts: exam.maxAttempts,
        settings: exam.settings,
        latestSubmission: latestSubmissionByExamId.get(exam.id) ?? null,
      });
      examsByCourseId.set(exam.courseId, rows);
    }

    return courses.map((course) => {
      const courseExams = examsByCourseId.get(course.id) ?? [];
      const latestSubmission = courseExams
        .map((exam) => exam.latestSubmission)
        .filter(Boolean)
        .sort((a, b) => {
          const aTime = new Date(a.submittedAt ?? a.startedAt ?? a.createdAt ?? 0).getTime();
          const bTime = new Date(b.submittedAt ?? b.startedAt ?? b.createdAt ?? 0).getTime();
          return bTime - aTime;
        })[0];
      const enrolledCount = enrollmentCountByCourseId.get(course.id) ?? 0;

      return {
        id: course.id,
        code: course.code,
        name: course.name,
        academicYear: course.academicYear,
        term: course.term,
        description: course.description,
        credits: course.credits,
        lecturer: course.lecturer,
        enrolledStudents: enrolledCount,
        totalStudents: enrolledCount,
        exams: courseExams,
        lastAccessed: latestSubmission
          ? latestSubmission.submittedAt ?? latestSubmission.startedAt ?? latestSubmission.createdAt
          : null,
      };
    });
  }

  async getMyCoursesAsLecturer(lecturerId: string, archiveStatus = 'active') {
    const courses = await this.prisma.course.findMany({
      where: {
        lecturerId,
        ...(archiveStatus === 'archived'
          ? { status: 'archived' }
          : archiveStatus === 'all' ? {} : { status: { not: 'archived' } }),
      },
      include: {
        _count: {
          select: {
            enrollments: true,
            exams: true,
            questions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (courses.length === 0) {
      return [];
    }

    const results = await Promise.all(
      courses.map(async (c: any) => {
        const enrolledCount = c._count?.enrollments ?? 0;
        const totalExamsCount = c._count?.exams ?? 0;

        let publishedExamsCount = 0;
        let totalSubmissions = 0;
        let lastSubmission: any = null;

        if (totalExamsCount > 0) {
          const [pubExams, subCount, lastSub] = await Promise.all([
            this.prisma.exam.count({ where: { courseId: c.id, status: 'PUBLISHED' } }),
            this.prisma.examSubmission.count({ where: { exam: { courseId: c.id, status: 'PUBLISHED' } } }),
            this.prisma.examSubmission.findFirst({
              where: { exam: { courseId: c.id } },
              orderBy: { submittedAt: 'desc' },
              select: { submittedAt: true, startedAt: true, createdAt: true },
            }),
          ]);
          publishedExamsCount = pubExams;
          totalSubmissions = subCount;
          lastSubmission = lastSub;
        }

        const progress = publishedExamsCount > 0 && enrolledCount > 0
          ? Math.round((totalSubmissions / (publishedExamsCount * Math.max(1, enrolledCount))) * 100)
          : 0;

        const lastAccessed = lastSubmission ? lastSubmission.submittedAt ?? lastSubmission.startedAt ?? lastSubmission.createdAt : null;

        return {
          id: c.id,
          code: c.code,
          name: c.name,
          academicYear: c.academicYear,
          term: c.term,
          description: c.description,
          credits: c.credits,
          lecturerId: c.lecturerId,
          enrolledStudents: enrolledCount,
          totalStudents: enrolledCount,
          exams: totalExamsCount,
          _count: c._count,
          progress,
          lastAccessed,
        };
      }),
    );

    return results;
  }
}
