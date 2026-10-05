/**
 * Claims the site makes, kept in one place so each can be checked against
 * the product. Every line here is true of the shipped platform; the
 * proposal (/mnt/project-files/marketing-site/proposal.md §2) lists what
 * the site must not claim yet (testimonials, NDPA compliance, uptime
 * figures, essay marking, PDF reports, AI proctoring).
 */

export const worries = [
  {
    question: 'What happens if the power or the internet goes during an exam?',
    answer:
      'Every answer is saved on the student’s computer the moment it is chosen, then sent to the server. If the connection drops, the student keeps working; answers go through when it returns. A student who has to restart the computer picks up where they stopped, with their saved answers.',
    href: '/exam-day-reliability',
    link: 'How exam day stays steady',
  },
  {
    question: 'Will it run on the computers in our lab?',
    answer:
      'It is designed for ordinary lab machines: a 1366 × 768 screen, about 4 GB of memory and a dual-core processor, on a shared, slow connection. Older Windows 7 and 8.1 computers are supported through Firefox. Each computer is checked before a student starts.',
    href: '/exam-day-reliability#lab-computers',
    link: 'See the lab requirements',
  },
  {
    question: 'Can we trust the scores?',
    answer:
      'The correct answers are never sent to a student’s computer, so they cannot be read from it. Every score traces back to the answers the student recorded, and any change to a result is recorded with who made it and why.',
    href: '/security',
    link: 'How results are protected',
  },
] as const;

export const examSteps = [
  {
    title: 'Teachers write questions; HODs approve them',
    body: 'Questions are written by subject and class level, then reviewed by the head of department. An approved question cannot be quietly edited afterwards: changes create a new version that is reviewed again.',
  },
  {
    title: 'Build the exam from approved questions',
    body: 'Pick the questions, set the duration and marks, and choose the classes it is for. One exam can serve several arms of the same class, such as SS2A, SS2B and SS2C.',
  },
  {
    title: 'Open it for a class or a batch',
    body: 'Run the exam in sittings to fit the number of computers you have. There is no single school-wide start time: each batch is opened when its students are seated.',
  },
  {
    title: 'Each student sits with their own clock',
    body: 'A student’s time starts when they start, and is kept by the server, not the computer. Question order and option order can be shuffled for each student.',
  },
  {
    title: 'Marked at once; published when you decide',
    body: 'Objective answers are marked automatically as each paper is submitted. Results stay with staff until the school chooses to publish them to students.',
  },
] as const;

export const roles = [
  {
    role: 'School admin',
    summary: 'Sets up the school, its sessions and terms, and keeps an eye on everything.',
    points: [
      'A guided setup: school profile, logo and colour, session, terms, departments, classes, subjects, staff and students',
      'A dashboard of what needs attention across the school',
      'A record of sensitive actions: who did what, and when',
    ],
  },
  {
    role: 'Moderator',
    summary: 'Keeps the school’s people and classes correct, often the exam officer.',
    points: [
      'Bulk import of students and teachers from CSV or Excel, checked row by row before anything is saved',
      'Printable sign-in sheets for new students',
      'Running exam sittings and handling absent students',
    ],
  },
  {
    role: 'HOD',
    summary: 'Owns the quality of the department’s questions and exams.',
    points: [
      'A review queue: approve a question or request changes with a note',
      'Question difficulty and class performance for the department',
      'Oversight of the department’s exams and results',
    ],
  },
  {
    role: 'Teacher',
    summary: 'Writes questions and sees how students performed.',
    points: [
      'A question bank by subject, class level and topic, with pictures in questions',
      'Bulk question upload from a spreadsheet',
      'Results and question-by-question analysis for their classes',
    ],
  },
  {
    role: 'Student',
    summary: 'Sits the exam, and nothing else gets in the way.',
    points: [
      'A calm exam screen with a clear timer and a question navigator',
      'Answers saved on the computer as they work',
      'Results to view once the school publishes them',
    ],
  },
] as const;

export const featureGroups = [
  {
    id: 'exam-day',
    title: 'Exam day',
    lead: 'Run sittings across your lab with a live view of every student.',
    items: [
      {
        title: 'Live control of every sitting',
        body: 'See who has started, who is working, who has submitted and who is absent, refreshed as it happens.',
      },
      {
        title: 'Disconnected students stand out',
        body: 'A student whose computer has not been heard from for 90 seconds is flagged and moved to the top, so an invigilator can walk over.',
      },
      {
        title: 'Batches, not one global clock',
        body: 'Open the exam for one group at a time to match the computers you have. Each student’s timer is their own.',
      },
      {
        title: 'Absent students handled properly',
        body: 'Absence is recorded separately from scores. A makeup sitting is a new attempt that never erases the original absence.',
      },
      {
        title: 'A computer check before Start',
        body: 'Each student’s computer is checked for local answer storage, network and space before the exam can begin.',
      },
      {
        title: 'Fair timing after a dropped connection',
        body: 'Work done offline near the end is accepted within a short, recorded grace period, judged by when the server receives it.',
      },
    ],
  },
  {
    id: 'question-bank',
    title: 'Questions and review',
    lead: 'A shared question bank your HODs can stand behind.',
    items: [
      {
        title: 'Organised the way schools are',
        body: 'Questions are filed by subject, class level (SS2, not SS2A) and topic, so they can be reused across arms and years.',
      },
      {
        title: 'Reviewed before use',
        body: 'Teachers submit questions; HODs approve them or request changes with a note. Only approved questions go into exams.',
      },
      {
        title: 'Approved questions don’t change underneath you',
        body: 'An approved question is locked. Editing it creates a new version, and every past exam keeps the exact version students saw.',
      },
      {
        title: 'Bulk upload',
        body: 'Upload questions from a spreadsheet. Every row is checked and errors are shown before anything is saved.',
      },
      {
        title: 'Pictures in questions',
        body: 'Diagrams and images are loaded onto each computer before the exam starts, so they appear even if the connection is slow.',
      },
      {
        title: 'Objective question types',
        body: 'Single-answer multiple choice and true/false, marked automatically.',
      },
    ],
  },
  {
    id: 'results',
    title: 'Marking and results',
    lead: 'From the last submission to published results without a marking pile.',
    items: [
      {
        title: 'Automatic marking',
        body: 'Each paper is marked as it is submitted. Scores are worked out on the server from the answers recorded.',
      },
      {
        title: 'You choose when results are published',
        body: 'Staff see results first. Students see them only when the school publishes, and publication can be withdrawn.',
      },
      {
        title: 'Every adjustment is on the record',
        body: 'Corrections are explicit, with the reason and the person who made them. The original stays traceable.',
      },
      {
        title: 'Grading your way',
        body: 'Results are graded on the school’s own grading scale.',
      },
      {
        title: 'Analysis that helps teaching',
        body: 'Score distributions, pass rates and question difficulty for each exam, class and student.',
      },
      {
        title: 'Print and export',
        body: 'Printable result and performance views from the browser, and CSV export for your own records.',
      },
    ],
  },
  {
    id: 'school-admin',
    title: 'Running the school',
    lead: 'Your school’s own space, set up in a guided wizard.',
    items: [
      {
        title: 'Your own address',
        body: 'Each school has its own web address, such as yourschool.{root}, with its logo and colour on the sign-in page and throughout.',
      },
      {
        title: 'Guided setup',
        body: 'A step-by-step wizard covers profile, branding, session, terms, departments, classes, subjects, staff and students, and can be resumed.',
      },
      {
        title: 'Clear roles',
        body: 'School admin, moderator, HOD, teacher and student, each seeing only what their role and subjects allow.',
      },
      {
        title: 'Session rollover',
        body: 'Close a session and carry classes and students into the next one, reviewing each promotion, without losing last session’s records.',
      },
      {
        title: 'A record of sensitive actions',
        body: 'Approvals, result publications, result changes and other sensitive actions are written to an audit trail.',
      },
      {
        title: 'Your records stay yours',
        body: 'If a subscription lapses, nothing is deleted. Running exams finish, and there is a 14-day grace period before new activity pauses.',
      },
    ],
  },
] as const;

export interface Faq {
  q: string;
  a: string;
}

export const faqs: { group: string; items: Faq[] }[] = [
  {
    group: 'Buying and getting started',
    items: [
      {
        q: 'How do we get started?',
        a: 'Request a demo. We walk you through the platform, agree the number of students, and send an invoice. Once paid, you receive an activation key and your school’s own web address, and your school admin sets the school up in a guided wizard.',
      },
      {
        q: 'Can we sign up and try it ourselves?',
        a: 'Not yet. Every school is set up by us after payment, so that each school’s space, address and data are created correctly. A demo shows you everything first.',
      },
      {
        q: 'How is it priced?',
        a: 'By the number of students, per academic year. See the pricing page for the starting price, or request a quote for your school.',
      },
      {
        q: 'How long does setup take?',
        a: 'The wizard itself takes an afternoon for most schools. Most of the time goes into gathering class lists, which can be uploaded from a spreadsheet.',
      },
    ],
  },
  {
    group: 'Exam day',
    items: [
      {
        q: 'What if the internet goes off during an exam?',
        a: 'Students keep working. Answers are saved on each computer and sent when the connection returns. Starting an exam needs a connection; finishing it does not need a constant one.',
      },
      {
        q: 'What if a computer shuts down?',
        a: 'The student signs in again and continues, with the time the server has recorded. On the same computer, every saved answer is still there. On a different computer, everything that had reached the server is kept.',
      },
      {
        q: 'Do all students need to start at the same time?',
        a: 'No. Each student has their own timer, and you can run the exam in batches to fit your computers.',
      },
      {
        q: 'What about students who miss the exam?',
        a: 'They are recorded as absent. You can give them a makeup sitting later; the original absence stays on the record.',
      },
      {
        q: 'Can students sit the exam at home?',
        a: 'The platform is designed for supervised exams in a school computer lab. It does not include remote proctoring.',
      },
    ],
  },
  {
    group: 'Questions and marking',
    items: [
      {
        q: 'Which question types are supported?',
        a: 'Single-answer multiple choice and true/false, both marked automatically. Questions can include pictures. Essay and theory questions are not supported yet.',
      },
      {
        q: 'Is this for JAMB or WAEC practice?',
        a: 'No. It runs your school’s own exams and tests, with your own questions, set and approved by your own teachers and HODs.',
      },
      {
        q: 'Can we upload our existing questions?',
        a: 'Yes, from a spreadsheet. Uploaded questions come in as drafts and go through HOD review like any other question.',
      },
    ],
  },
  {
    group: 'Data and security',
    items: [
      {
        q: 'Who can see our school’s data?',
        a: 'Only your school’s users, according to their role. Each school’s data is kept separate from every other school’s, enforced in the database itself.',
      },
      {
        q: 'What happens to our records if we stop paying?',
        a: 'Nothing is deleted. You keep full access for 14 days after expiry. After that, exams already running still finish and are marked, and you can still read every record, but new exams pause until you renew.',
      },
      {
        q: 'Can students see the answers?',
        a: 'No. Correct answers never reach a student’s computer during an exam. Students see results only after the school publishes them.',
      },
    ],
  },
  {
    group: 'Technical',
    items: [
      {
        q: 'Which browsers and computers are supported?',
        a: 'Chrome or Edge 111 and later, or Firefox 115 ESR for Windows 7 and 8.1. The exam screen is designed for 1366 × 768 screens and about 4 GB of memory.',
      },
      {
        q: 'Do we need to install anything?',
        a: 'No. It runs in the browser. Opening your school’s address once on each lab computer before exam day lets it load from the computer itself on the day.',
      },
      {
        q: 'How much internet do we need?',
        a: 'Less than you might think. It was tested on a shared 2 Mbit/s connection with high delay and packet loss, the kind of line many school labs share.',
      },
    ],
  },
];
