import type { RoleGuideSet } from '../types';
import { examDayGuides, makeupGuide, ownAccountGuides } from './shared';

const control = { label: 'Exam Control', href: 'exam-control' };

/** ADR-0035 — the HOD's guides. */
export const HOD_GUIDES: RoleGuideSet = {
  role: 'HOD',
  guides: [
    {
      id: 'review-questions',
      title: 'Review questions waiting for you',
      summary: 'Approve, reject or send back the questions your teachers submitted.',
      area: 'questions',
      keywords: [
        'review',
        'approve',
        'reject',
        'request changes',
        'queue',
        'pending',
        'moderation',
      ],
      requires: ['questionBank.review'],
      steps: [
        'Open **Question Review**. The queue lists every question waiting in your department, oldest first.',
        'Press **Open review** on a question. You see the question, its options, the correct answer, its details and its history.',
        'Press **Approve**, **Reject** or **Request changes**. Rejecting and requesting changes ask for a reason the teacher will read.',
        'Use **Next** and **Previous** to move through the queue without going back to the list.',
      ],
      notes: [
        'Keyboard shortcuts: **A** approve, **R** reject, **C** request changes.',
        'Only approved questions can be put into exams. An approved revision never changes; a correction comes back to you as a new revision.',
        'You never review a question you wrote. It goes to another HOD of the department, or to the School Admin if you are its only HOD. Questions in a subject with no department also go to the School Admin.',
      ],
      screen: { label: 'Question Review', href: 'question-review' },
      related: ['rejected-questions'],
    },
    {
      id: 'rejected-questions',
      title: 'See questions you sent back',
      summary: 'Check which questions are rejected and waiting for the teacher to fix.',
      area: 'questions',
      keywords: ['rejected', 'sent back', 'changes requested'],
      requires: ['questionLifecycle.rejected.view'],
      steps: [
        'Open **Question Bank** and press **Rejected questions**.',
        'Open a question to read the reason you gave in its **Revision history**.',
      ],
      notes: ['When the teacher resubmits, the question returns to your review queue.'],
      screen: { label: 'Rejected questions', href: 'question-bank/rejected' },
      related: ['review-questions'],
    },
    {
      id: 'check-an-exam',
      title: 'Check an exam in your department',
      summary: 'Look over an exam a teacher has built before it is sat.',
      area: 'exams',
      keywords: ['exam', 'check', 'readiness', 'cancel'],
      requires: ['exam.viewAll'],
      steps: [
        'Open **Exams**. Filter by subject, class, teacher or status.',
        'Open the exam to see its questions, marks, duration, rules and readiness checklist.',
      ],
      notes: [
        '**Cancel exam** stops an exam that should not go ahead. It asks for a reason and is recorded.',
      ],
      screen: { label: 'Exams', href: 'exams' },
    },
    ...examDayGuides(control),
    makeupGuide(control, null),
    ...ownAccountGuides(),
    {
      id: 'publish-results',
      title: 'Check and publish results',
      summary: 'See an exam’s results and release them to students.',
      area: 'results',
      keywords: ['results', 'scores', 'publish', 'release', 'marks', 'grades'],
      requires: ['results.viewExamResults'],
      steps: [
        'Open **Results** and choose the exam.',
        'Check the results table and the summary (average, highest, lowest, pass rate).',
        'If you are the one releasing results, press **Publish results**. Every result is released except those withheld or voided.',
      ],
      notes: [
        '**Withhold from student**, on a student’s result, keeps that one result back. **Release to student** undoes it.',
        '**Unpublish** takes results back from students and asks for a reason.',
      ],
      screen: { label: 'Results', href: 'results' },
      related: ['adjust-a-question'],
    },
    {
      id: 'adjust-a-question',
      title: 'Correct marks for a faulty question',
      summary:
        'Void a question, or award or deduct marks for it, for every student who sat the exam.',
      area: 'results',
      keywords: ['adjust', 'void', 'wrong answer key', 'mistake', 'award marks', 'deduct'],
      requires: ['results.adjust'],
      steps: [
        'Open **Results**, choose the exam and open any student’s result.',
        'In the question breakdown, press **Adjust…** on the faulty question.',
        'Choose to void the question for every student, award additional marks, or deduct marks. Enter the marks if asked.',
        'Write the reason and press **Apply adjustment**.',
      ],
      notes: [
        'The adjustment applies to every result for that question and runs in the background; its progress shows under **Adjustment history**.',
        'Original scores are kept, and the reason is recorded against every result it changes.',
      ],
      screen: { label: 'Results', href: 'results' },
      related: ['publish-results'],
    },
    {
      id: 'department-performance',
      title: 'See how your department is performing',
      summary: 'Compare results across your department’s subjects and classes.',
      area: 'results',
      keywords: ['analytics', 'performance', 'department', 'compare', 'statistics'],
      requires: ['analytics.department'],
      steps: ['Open **Department Analytics**.'],
      screen: { label: 'Department Analytics', href: 'department-analytics' },
    },
    {
      id: 'export-results',
      title: 'Download or print an exam’s results',
      summary: 'Get a CSV file or a printable broadsheet of one exam’s results.',
      area: 'reports',
      keywords: ['export', 'csv', 'excel', 'print', 'broadsheet', 'download'],
      requires: ['results.exportCsv'],
      steps: [
        'Open **Results** and choose the exam.',
        'Press **Export CSV** for a spreadsheet, **Print Broadsheet** for a printable results sheet, or **Print Analysis** for question-by-question performance.',
      ],
      screen: { label: 'Results', href: 'results' },
    },
  ],
};
