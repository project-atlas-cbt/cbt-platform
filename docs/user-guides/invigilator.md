# Invigilator guide

For whoever runs a sitting in the lab: a teacher, or a staff member delegated to the exam. Print
the card at the end and keep it at the front desk.

## How the exam behaves

- **Time is per student and kept by the server.** Each student's clock starts when they press
  Start. A computer's own clock does not matter, and nothing on the computer can add time.
- **Answers are saved on the computer first, then sent.** If the network drops, students keep
  answering; the screen says they are offline and that answers are being saved on the computer,
  and they are sent when the connection returns. The exam needs the network at **Start** (to download the paper, pictures included);
  after that it tolerates losing it.
- **When time runs out the exam submits itself.** Answers that reach the server up to 60 seconds
  after the student's time ran out still count. Answers that reach it later do not, and the student
  is told which were not accepted. So a computer that loses the network near the end must be
  reconnected quickly.
- **An update to the platform never interrupts an exam.** If a new version is released during a
  sitting, students keep the version they started with until they submit.

## Before students arrive

1. Open the exam in **Exam Control** (teachers and HODs) or **Exam Operations** (School Admins and
   Moderators); it is the same screen. Check the session for this group is open (or use **Open
   session**).
2. On each computer, open the school's address and sign out any previous user. Do not use
   private or incognito windows.
3. Keep the spare computers signed out and ready.
4. If students will sign in without a password, a School Admin or Moderator switches it on for
   their classes under **People** > **Students** (**Sign-in without password**). Students then
   type their name and Login ID.

## During the sitting

The **Live attempts** table shows each student: not started, writing (with time remaining),
submitted, or **Disconnected**.

- **Disconnected** means the server has not heard from that computer for more than 90 seconds.
  Usually it is the network. Go to the computer: if the student is still answering, they are fine;
  their answers are kept and will be sent. Fix the cable or Wi-Fi if you can.
- **Signal counts** (for example how often a student left the exam window) are shown as plain
  numbers. They are not proof of anything: a pop-up, a mis-click or a slow computer can cause
  them. Do not accuse a student because of a count. Write down what you actually saw, with the
  time, and give it to the exam officer.
- **A computer fails** (freezes, loses power): move the student to a spare computer. They sign in
  and press **Resume assessment**; the attempt continues with the time it has left. Tell the exam officer
  which computer failed. Turn it back on later and open the exam page once, so anything it had not
  sent yet is sent.
- **A student cannot sign in** after several wrong passwords: the account locks for a while. Ask a
  School Admin or Moderator to open **People › Students**: locked-out students are listed at the
  top with an **Unlock** button (or open the student and press **Unlock sign-in**); the student then signs in with their usual password and presses **Resume
  assessment**. If the student has forgotten the password, **Reset credentials** gives a new one
  and also ends the lock.
- **Do not** reload the page, close the browser, clear browser data or restart a computer that is
  working, even if the network is down.
- Students who do not turn up need nothing from you during the sitting. When the teacher ends the
  examination, they confirm who never started and those students are recorded absent; a makeup is
  a new attempt later, and the absence stays recorded.

## Ending the sitting

- When this group is done, use **Close session** so nobody else can start in it. Students still writing finish their own time; the platform submits for them when it
  runs out.
- Tell the exam officer about any failed computers and anything you wrote down.
- If sign-in without a password was on, ask a School Admin or Moderator to press **Switch off**
  once every student has submitted.

## If the platform itself is unavailable

Students see a page saying the service is briefly unavailable. Their answers stay on the computer.
Do not let anyone close the browser. The page checks again every minute and returns by itself.
Call the support contact your school was given.

---

## Desk card (print this)

> - Students sign in, read the instructions, and press Start only when the computer check is clear.
> - Time is per student, starts at Start, and is kept by the server.
> - If the connection drops, students keep answering. Answers are kept on the computer and sent
>   when it returns. **Do not reload, close the browser or restart the computer.**
> - Reconnect a computer quickly near the end of its time: answers arriving more than a minute
>   after time runs out do not count.
> - A computer fails: move the student to a spare, they sign in and Resume assessment. Tell the exam officer.
> - Disconnected and signal counts are information, not accusations. Write down what you saw.
> - At the end of the group: **Close session**.
