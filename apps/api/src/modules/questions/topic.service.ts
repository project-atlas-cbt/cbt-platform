import { Injectable } from '@nestjs/common';
import { Prisma, prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import type { CreateTopicDto, TopicResponseDto } from './dto/question.dto.js';

function toResponseDto(topic: {
  id: string;
  subjectId: string;
  parentTopicId: string | null;
  name: string;
}): TopicResponseDto {
  return {
    id: topic.id,
    subjectId: topic.subjectId,
    parentTopicId: topic.parentTopicId,
    name: topic.name,
  };
}

/**
 * ADR-0001 §3 / DoD item 9 — first-class, (school, subject)-scoped topics,
 * resolved case-insensitively and auto-created on first use. `findOrCreate`
 * is the shared entry point both the interactive question editor
 * (`topicName` on `CreateQuestionDto`/`UpdateQuestionRevisionDto`) and the
 * bulk-import pipeline (`import-row-validator.ts`) go through, so the two
 * surfaces can never resolve the same name to two different rows.
 */
@Injectable()
export class TopicService {
  async list(
    schoolId: string,
    subjectId: string,
    parentTopicId?: string,
  ): Promise<TopicResponseDto[]> {
    const topics = await withTenant(prisma, schoolId, (tx) =>
      tx.topic.findMany({
        where: {
          schoolId,
          subjectId,
          parentTopicId: parentTopicId !== undefined ? parentTopicId : null,
        },
        orderBy: { name: 'asc' },
      }),
    );
    return topics.map(toResponseDto);
  }

  async create(schoolId: string, dto: CreateTopicDto): Promise<TopicResponseDto> {
    const topic = await this.findOrCreate(schoolId, dto.subjectId, {
      name: dto.name,
      parentTopicId: dto.parentTopicId ?? null,
    });
    return toResponseDto(topic);
  }

  /**
   * Case-insensitive find-or-create against the school's own (subject,
   * parent) scope — races (e.g. two import rows resolving the same
   * brand-new name simultaneously) are caught by the migration's own
   * functional unique index (`topics_school_subject_parent_name_ci`) and
   * resolved by re-reading, never a duplicate row nor a crashed request.
   */
  async findOrCreate(
    schoolId: string,
    subjectId: string,
    ref: { id?: string; name?: string; parentTopicId?: string | null },
  ): Promise<{ id: string; subjectId: string; parentTopicId: string | null; name: string }> {
    if (ref.id) {
      // Captured into a plain const, not read as `ref.id` directly inside
      // the closure below — a narrowing guard's effect doesn't reliably
      // survive being read from inside a nested `withTenant(...)` closure
      // (same rationale as `import-validation.service.ts`'s own
      // `templateVersion` capture).
      const topicId = ref.id;
      const topic = await withTenant(prisma, schoolId, (tx) =>
        tx.topic.findUnique({ where: { id: topicId } }),
      );
      if (!topic || topic.schoolId !== schoolId || topic.subjectId !== subjectId) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Topic not found.' });
      }
      return topic;
    }

    const name = (ref.name ?? '').trim();
    if (!name) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'A topic id or name is required.',
      });
    }
    const parentTopicId = ref.parentTopicId ?? null;

    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.topic.findFirst({
        where: { schoolId, subjectId, parentTopicId, name: { equals: name, mode: 'insensitive' } },
      }),
    );
    if (existing) return existing;

    try {
      return await withTenant(prisma, schoolId, (tx) =>
        tx.topic.create({ data: { schoolId, subjectId, parentTopicId, name } }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Lost the race to a concurrent create of the same name — the
        // winner's row is what we wanted anyway.
        const winner = await withTenant(prisma, schoolId, (tx) =>
          tx.topic.findFirst({
            where: {
              schoolId,
              subjectId,
              parentTopicId,
              name: { equals: name, mode: 'insensitive' },
            },
          }),
        );
        if (winner) return winner;
      }
      throw error;
    }
  }
}
