import Link from 'next/link';
import type { ReactNode } from 'react';

export interface Guide {
  slug: string;
  title: string;
  description: string;
  published: string;
  minutes: number;
  body: (ctx: { name: string }) => ReactNode;
}

export const guides: Guide[] = [
  {
    slug: 'how-to-run-cbt-exams-in-school',
    title: 'How to run computer-based exams in a Nigerian secondary school',
    description:
      'A practical plan for moving a school’s own tests and exams from paper to computers: who does what, how to run sittings with the computers you have, and what to do on the day.',
    published: '2026-10-04',
    minutes: 7,
    body: ({ name }) => (
      <>
        <p>
          Moving a school’s exams from paper to computers is less about software than about routine.
          The schools that do it well decide who owns each step, start small, and rehearse before
          the first real exam. This guide sets out that routine. It applies to any CBT platform, and
          notes where {name} does a step for you.
        </p>

        <h2>1. Decide what moves first</h2>
        <p>
          Do not move every subject in one term. Start with objective papers, the multiple-choice
          and true/false sections, in two or three subjects with teachers who are keen. Continuous
          assessment tests and mock exams are a good first step because the stakes are lower and
          they recur, so the routine gets practised.
        </p>
        <p>
          Theory and essay questions usually stay on paper for now. Most schools run a mixed paper:
          objective questions on the computer, theory on paper, with both scores combined.
        </p>

        <h2>2. Give every step an owner</h2>
        <p>The roles already exist in your school. Make them explicit:</p>
        <ul>
          <li>
            <strong>Teachers</strong> write questions for their subject and class level.
          </li>
          <li>
            <strong>Heads of department</strong> review and approve questions before they can be
            used.
          </li>
          <li>
            <strong>The exam officer</strong> builds exams from approved questions, opens sittings
            and watches them live.
          </li>
          <li>
            <strong>The ICT lead</strong> prepares the lab and is on hand during sittings.
          </li>
          <li>
            <strong>Invigilators</strong> supervise the lab, exactly as they would on paper.
          </li>
        </ul>
        <p>
          Question review matters more on computers than on paper, because a wrong answer key is
          marked wrong for every student at once. Make HOD approval a rule, not a courtesy.
        </p>

        <h2>3. Plan sittings around your computers</h2>
        <p>
          Few schools have one computer per student in a class. Divide each class into batches that
          fit the lab, and run the exam in sittings. With a per-student timer, each student’s time
          starts when they start, so a batch that sits down late loses nothing.
        </p>
        <p>
          Shuffling the order of questions and options for each student makes copying from a
          neighbour pointless, which matters when students sit side by side and batches follow each
          other.
        </p>

        <h2>4. Prepare the lab a week ahead</h2>
        <p>
          Check every computer’s browser, open the exam site on each one, and run a practice
          sitting. Our <Link href="/guides/cbt-lab-checklist">CBT lab checklist</Link> lists every
          step.
        </p>

        <h2>5. Run a practice sitting</h2>
        <p>
          Before the first real exam, run a ten-minute practice exam with a real class. Have every
          student start, answer a few questions, then unplug the lab’s internet for a minute,
          reconnect and submit. It tests the computers, the student accounts and the invigilators’
          routine at the same time, and it shows students that a dropped connection is not a
          disaster.
        </p>

        <h2>6. On the day</h2>
        <ul>
          <li>Seat the batch, open the sitting, and let students sign in.</li>
          <li>Students press Start only when their computer check is clear.</li>
          <li>If the connection drops, students keep answering. Nobody reloads or restarts.</li>
          <li>If a computer fails, move the student to a spare one and tell the exam officer.</li>
          <li>Record absent students, and plan their makeup sitting.</li>
        </ul>

        <h2>7. After the exam</h2>
        <p>
          Objective papers are marked as they are submitted, so results are ready when the last
          student finishes. Review them as staff first: question difficulty often reveals a
          badly-worded question or a wrong key. Publish to students when the school is satisfied.
        </p>
        <p>
          The first term is the hardest. By the second, most schools find the exam officer’s work
          has moved from marking scripts to checking results, and teachers get their weeks back.
        </p>
      </>
    ),
  },
  {
    slug: 'cbt-lab-checklist',
    title: 'CBT lab checklist: preparing school computers for an exam',
    description:
      'A step-by-step checklist for getting a school computer lab ready for a computer-based exam: browsers, the network, power, a practice sitting and the invigilator’s routine.',
    published: '2026-10-04',
    minutes: 5,
    body: ({ name }) => (
      <>
        <p>
          Most exam-day problems are lab problems, and nearly all of them can be found a week early.
          Work through this list for every computer students will use. The browser and network
          details are the ones {name} needs; other platforms will be similar.
        </p>

        <h2>A week before</h2>
        <h3>Every computer</h3>
        <ol>
          <li>
            <strong>Browser.</strong> Chrome or Edge version 111 or later. On Windows 7 or 8.1,
            install Firefox 115 ESR, since current Chrome no longer supports those systems.
          </li>
          <li>
            <strong>Open the school’s exam address once</strong> and sign in as a test student. This
            stores the exam screen on the computer, so on the day it loads from the computer rather
            than the school’s connection.
          </li>
          <li>
            <strong>Run the computer check</strong> on a test exam. Fix anything that blocks Start;
            for warnings, maximise the window and set the zoom to 100%.
          </li>
          <li>
            <strong>No private or incognito windows</strong>, and no cleanup tools that clear
            browser data between the practice and the exam. Clearing it removes the stored exam
            screen and any answers not yet sent.
          </li>
          <li>
            <strong>Label each computer</strong> so invigilators can report a faulty one.
          </li>
        </ol>

        <h3>The lab</h3>
        <ul>
          <li>
            <strong>Connection.</strong> One shared line is fine; the exam is designed for about 2
            Mbit/s. The connection must be up when students press Start. After that, short drops are
            tolerated.
          </li>
          <li>
            <strong>Power.</strong> Put computers on a UPS if you have one. If power fails, answers
            already saved on a computer survive, and the student continues after a restart.
          </li>
          <li>
            <strong>Clocks.</strong> Computer clocks don’t matter. The server times each student.
          </li>
          <li>
            <strong>Web filters.</strong> Allow the school’s exam address and its related addresses
            over HTTPS, and don’t let a firewall intercept them.
          </li>
          <li>
            <strong>Spares.</strong> Keep one or two computers ready for students whose machine
            fails.
          </li>
        </ul>

        <h2>A few days before: the practice sitting</h2>
        <p>
          Run a ten-minute practice exam with a real class. Every student starts and answers. Then
          unplug the lab’s internet for a minute, plug it back in, and have everyone submit. If
          every paper arrives, the lab is ready.
        </p>

        <h2>On the day</h2>
        <ul>
          <li>Open each computer at the school’s address and sign out any previous user.</li>
          <li>The exam officer opens the sitting before students try to start.</li>
          <li>Students press Start only when the computer check is clear.</li>
          <li>
            If the connection drops, students keep answering. Do not reload, close the browser or
            restart.
          </li>
          <li>
            If a computer fails, move the student to a spare computer, where they sign in and
            resume.
          </li>
          <li>
            Turn the failed computer back on and reopen the exam page later: anything it had not
            sent will be sent.
          </li>
        </ul>

        <h2>Afterwards</h2>
        <ul>
          <li>Leave every exam page open until the control screen shows all papers submitted.</li>
          <li>Note any computer that showed a warning, and fix it before the next sitting.</li>
        </ul>
      </>
    ),
  },
  {
    slug: 'paper-exams-vs-cbt',
    title: 'Paper exams vs CBT: what changes for teachers and exam officers',
    description:
      'What actually changes when a school moves objective exams from paper to computers: setting questions, printing, invigilation, marking, results and records.',
    published: '2026-10-04',
    minutes: 6,
    body: () => (
      <>
        <p>
          The case for computer-based tests is usually made in terms of speed. Speed is real, but
          the larger change is in where the work sits. Here is what moves, step by step, for the
          people who run a school’s exams.
        </p>

        <h2>Setting questions</h2>
        <p>
          <strong>On paper</strong>, each teacher sets a paper, often from scratch, and it is typed,
          proofread and photocopied. <strong>On computers</strong>, questions go into a shared bank
          by subject, class level and topic, are reviewed once by the HOD, and are reused. The work
          moves from producing papers each term to building a bank once and maintaining it.
        </p>

        <h2>Printing and handling</h2>
        <p>
          Paper exams mean printing, counting, sealing and storing scripts, and the risk of a paper
          leaking before the exam. With CBT there is nothing to print for the objective section, and
          the questions stay on the server until a student presses Start.
        </p>

        <h2>Invigilation</h2>
        <p>
          Invigilation does not go away; it changes. Invigilators still supervise the room. They
          also watch for computers that have stopped responding and move students to spares. The
          exam officer can see every student’s state from one screen, which paper never offered.
        </p>
        <p>
          Copying gets harder when each student sees questions and options in a different order.
          Students sitting in batches is still a risk to manage: keep the same questions within a
          day, and keep batches apart.
        </p>

        <h2>Marking</h2>
        <p>
          This is where most time comes back. On paper, a teacher marking hundreds of objective
          scripts spends days on it, and mistakes creep in by the end. On computers, objective
          answers are marked the moment a paper is submitted, the same way every time.
        </p>
        <p>
          Theory and essay answers still need a teacher. Many schools keep a mixed paper: objective
          questions on computers, theory on paper.
        </p>

        <h2>Results</h2>
        <p>
          Scores are ready when the sitting ends, so the time from exam to result shortens to the
          time the school takes to review them. Because every score traces to recorded answers,
          answering a parent’s question about a result means looking it up, not finding a script.
        </p>

        <h2>Records</h2>
        <p>
          Paper scripts are stored, then lost or discarded. A computer-based record keeps each
          student’s answers, the exact version of each question they saw, and any later correction
          with who made it and why. That history is useful for the school long after the exam.
        </p>

        <h2>What it costs the school</h2>
        <ul>
          <li>A working lab: ordinary computers and a shared connection are enough.</li>
          <li>A term of habit-building, with a practice sitting before the first real exam.</li>
          <li>HODs’ time for reviewing questions, mostly in the first term.</li>
        </ul>
        <p>
          In return, teachers lose the marking pile, the school loses the printing bill for
          objective papers, and results arrive in days rather than weeks.
        </p>
      </>
    ),
  },
];

export function guideBySlug(slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}
