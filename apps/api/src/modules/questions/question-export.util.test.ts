import { describe, expect, it } from 'vitest';
import { buildQuestionsExportCsv } from './question-export.util.js';

describe('buildQuestionsExportCsv', () => {
  it('quotes carriage returns and neutralizes formula-shaped question content', () => {
    const output = buildQuestionsExportCsv([
      {
        content: '=unsafe\rcontent',
        options: [{ content: 'A', correctFlag: true }],
        subjectName: 'Math',
        level: 'SS2',
        topicName: null,
        difficulty: 'EASY',
        marks: 1,
        currentStatus: 'DRAFT',
      },
    ]);
    expect(output).toContain('"\'=unsafe\rcontent"');
    expect(output.split('\r\n')).toHaveLength(4);
  });
});
