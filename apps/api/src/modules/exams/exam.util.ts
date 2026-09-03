import { loadExamOrThrow, toExamResponseDto } from './exam-mappers.js';
import type { ExamResponseDto } from './dto/exam.dto.js';

/** Re-loads the exam fresh (post-mutation) and maps it to its response DTO
 * — the common "return the updated resource" tail every mutating method in
 * this module shares (`exam.service.ts`, `exam-question.service.ts`,
 * `exam-configuration.service.ts`). */
export async function toExamResponseDtoFresh(
  schoolId: string,
  examId: string,
): Promise<ExamResponseDto> {
  const exam = await loadExamOrThrow(schoolId, examId);
  return toExamResponseDto(exam);
}
