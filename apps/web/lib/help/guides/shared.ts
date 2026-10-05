import type { Guide } from '../types';

/**
 * Guides that read the same for every staff role that can run an exam, with
 * only the Control Center's name and path differing: "Exam Control" for
 * teachers and HODs, "Exam Operations" for school admins and moderators.
 * Wording follows docs/user-guides (F21) and the screens' own labels.
 */
export interface ControlCenterPlace {
  /** Navigation label, e.g. "Exam Control". */
  label: string;
  /** Path relative to the role's workspace root, e.g. "exam-control". */
  href: string;
}

export function examDayGuides(control: ControlCenterPlace): Guide[] {
  return [
    {
      id: 'run-a-sitting',
      title: 'Run an exam sitting on the day',
      summary:
        'Open a session so students can start, watch the live table, and close it at the end.',
      area: 'running',
      keywords: ['open session', 'start exam', 'batch', 'live', 'invigilate', 'close session'],
      requires: ['examAdmin.controlCenter'],
      steps: [
        `Open **${control.label}** and choose the exam. Only exams that are Ready, Open or Closed are listed.`,
        'Press **Open a session**, choose the session type (**Standard** for an ordinary sitting, **Batch** when groups take turns), then press **Open session**.',
        'If the exam is open to every eligible student, everyone in its classes can start now. If it admits only authorised students, press **Manage students** on the session, tick the students sitting now and press **Authorize selected**.',
        'Students sign in, open **Assessment** and press **Start assessment**. Each student’s time starts when they press Start, and the server keeps it.',
        'Watch **Live attempts**: who has not started, who is writing and their time left, who has submitted, and who is **Disconnected**.',
        'When this group is finished, press **Close** on its row in the **Sessions** table. Students still writing finish their own time; the exam submits for them when it runs out.',
      ],
      notes: [
        'You can run the same exam in several sessions when there are more students than computers. **Reopen** undoes a close.',
        '**Close exam to new attempts** stops anyone starting the exam in any session. **Reopen exam** undoes it. No student’s timer is ever paused.',
        '**Disconnected** means nothing has been heard from that computer for more than 90 seconds. It is usually the network: the student’s answers are kept on the computer and sent when it reconnects.',
        'Signal counts, such as leaving the exam window, are information, not proof. Write down what you actually saw.',
      ],
      screen: { label: control.label, href: control.href },
      related: ['lab-problems', 'end-an-exam', 'accommodations'],
    },
    {
      id: 'lab-problems',
      title: 'What to do when something goes wrong in the lab',
      summary: 'The connection drops, a computer fails, or a student is shown as disconnected.',
      area: 'running',
      keywords: [
        'offline',
        'network',
        'internet',
        'disconnected',
        'computer failed',
        'power',
        'invigilator',
        'reload',
      ],
      requires: ['examAdmin.viewLiveAttempts'],
      steps: [
        'If the connection drops, let students keep answering. Answers are saved on the computer and sent when the connection returns.',
        'Do not reload the page, close the browser, clear browser data or restart a computer that is working, even while the network is down.',
        'If a computer fails, move the student to a spare computer. They sign in and press **Resume assessment**; the attempt continues with the time it has left.',
        'Turn the failed computer back on later and open the exam page once, so anything it had not sent yet is sent. Tell the exam officer which computer failed.',
        'Reconnect any computer quickly near the end of its time: answers that reach the server more than one minute after time runs out do not count.',
      ],
      notes: [
        'Students need the network when they press Start, to download the paper and its pictures. After that the exam tolerates losing it.',
        'If the whole platform is unavailable, students see a notice and their answers stay on the computer. Keep the browsers open; the page checks again by itself.',
      ],
      screen: { label: control.label, href: control.href },
      related: ['run-a-sitting', 'prepare-lab'],
    },
    {
      id: 'prepare-lab',
      title: 'Prepare the lab computers before the first exam',
      summary: 'Check each computer once, a few days before students sit on it.',
      area: 'running',
      keywords: ['lab', 'browser', 'chrome', 'edge', 'firefox', 'computer check', 'practice'],
      requires: ['examAdmin.controlCenter'],
      steps: [
        'Use Chrome or Edge (version 111 or newer), or Firefox 115 ESR on Windows 7 or 8.1.',
        'On each computer, open your school’s {product} address and sign in once as a test student. This stores the app on the computer so it loads quickly on exam day.',
        'On the test student’s exam preview, check the computer check shows nothing blocking. Keep the window maximised and the zoom at 100%.',
        'Do not use private or incognito windows, and do not let a cleanup tool clear browser data between the practice and the exam.',
        'Label every computer, so you can say which one failed if something goes wrong.',
      ],
      notes: [
        'A short practice exam with a real class, before the first real one, proves the lab, the accounts and the invigilators’ routine.',
      ],
      related: ['lab-problems'],
    },
    {
      id: 'accommodations',
      title: 'Give a student extra time or larger text',
      summary: 'Record an approved accommodation for one student on one exam.',
      area: 'running',
      keywords: ['extra time', 'special needs', 'larger text', 'accommodation', 'disability'],
      requires: ['examAdmin.grantExtraTime'],
      steps: [
        `Open **${control.label}**, choose the exam and make sure a session is open.`,
        'Press **Manage students**.',
        'On the student’s row, press **Accommodations**.',
        'Enter the **Extra time (minutes)** and tick **Larger text in the exam** if needed, then press **Save accommodations**.',
      ],
      notes: [
        'Extra time is fixed when the student presses Start. A change after that applies only to their next attempt, so set it before they start.',
        'Accommodations are recorded against the student and audited.',
      ],
      screen: { label: control.label, href: control.href },
      related: ['run-a-sitting'],
    },
    {
      id: 'end-an-exam',
      title: 'End an exam and record absent students',
      summary:
        'Finish the exam once every group has sat, so students who never started are marked absent.',
      area: 'running',
      keywords: ['finish', 'complete', 'absent', 'absence', 'end examination'],
      requires: ['examAdmin.markAbsence'],
      steps: [
        `Open **${control.label}** and choose the exam.`,
        'Close every open session in the **Sessions** table.',
        'Press **End examination**. The list shows the authorised students who never started.',
        'Check the list, then press **End examination** to confirm.',
      ],
      notes: [
        'This cannot be undone. The exam becomes Completed and cannot be reopened.',
        'Absence is recorded separately from scores and is never erased, even if the student later sits a makeup.',
      ],
      screen: { label: control.label, href: control.href },
      related: ['makeup', 'run-a-sitting'],
    },
  ];
}

/** Makeup steps differ: school admins and moderators have a list of completed exams. */
export function makeupGuide(control: ControlCenterPlace, picker: string | null): Guide {
  const reach = picker
    ? `Open **${control.label}**, then **Makeup access** (the link below goes straight there), and choose the completed exam.`
    : `Straight after ending the exam, press **Participation** in **${control.label}**. Completed exams no longer appear in the ${control.label} list; for an older exam, ask your school admin or a moderator, who can reach it from **Makeup access**.`;
  return {
    id: 'makeup',
    title: 'Give an absent student a makeup attempt',
    summary: 'Let a student who missed a completed exam sit it later.',
    area: 'running',
    keywords: ['makeup', 'make up', 'missed', 'absent', 'resit', 'retake'],
    requires: ['examAdmin.grantMakeup'],
    steps: [
      reach,
      'Tick the absent students, or use the box that selects every absent student.',
      'Press **Grant makeup access**, write the reason, and set when access expires if you want a deadline.',
      'Press **Grant makeup access** to confirm. A makeup session opens for those students, and they start it from **Assessment** as usual.',
    ],
    notes: [
      'Only students recorded absent can get makeup access, and only after the exam has been ended.',
      'The makeup is a new attempt at the same exam. The original absence stays on record.',
      '**Authorize exceptional reattempt** is different: it is for a student whose attempt failed for a reason that was not theirs, and it is audited separately.',
    ],
    screen: picker
      ? { label: 'Makeup access', href: picker }
      : { label: control.label, href: control.href },
    related: ['end-an-exam'],
  };
}

/** Every staff role: their own account. */
export function ownAccountGuides(): Guide[] {
  return [
    {
      id: 'own-password',
      title: 'Change or reset your own password',
      summary: 'You forgot your password, or want to change it.',
      area: 'account',
      keywords: ['password', 'forgot', 'change password', 'locked out', 'sign in', 'login'],
      requires: [],
      steps: [
        'Sign out from the menu at the top right, or go to your school’s {product} address if you are not signed in.',
        'On the sign-in page, press **Forgot your password?** and enter your username or staff ID.',
        'Open the link emailed to you and choose a new password. The link opens on your school’s own address.',
      ],
      notes: ['If the email does not arrive, ask your school admin to reset your credentials.'],
    },
  ];
}
