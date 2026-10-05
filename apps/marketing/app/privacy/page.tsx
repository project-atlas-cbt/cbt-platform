import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal-page';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy notice',
  description: `How ${site.name} handles personal data on this website and in the platform.`,
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" updated="4 October 2026">
      <p>
        This notice explains what personal data this website collects and how the {site.name}{' '}
        platform handles the data schools put into it. It is written to meet the Nigeria Data
        Protection Act 2023.
      </p>

      <h2>This website</h2>
      <h3>What we collect</h3>
      <p>
        When you request a demo or a quote, we collect what you type into the form: your name, role,
        school, state, number of students, phone number, email address and message.
      </p>
      <p>
        This website sets no cookies and runs no analytics or advertising trackers. Our servers keep
        short-lived technical logs, such as the time of a request and the address it came from, to
        keep the site secure.
      </p>
      <h3>Why, and on what basis</h3>
      <p>
        We use your request only to contact you about it, by phone, WhatsApp or email, with your
        consent, which you give when you send the form. We do not sell it or use it for advertising.
      </p>
      <h3>How long we keep it</h3>
      <p>
        Requests are kept while we are in contact with you. If your school does not become a
        customer, we delete the request within 12 months.
      </p>

      <h2>The platform</h2>
      <p>
        When a school uses {site.name}, the school decides what data about its students and staff
        goes in and why. The school is the data controller; we process that data on its behalf,
        under a written data processing agreement, and only to provide the service.
      </p>
      <ul>
        <li>Each school’s data is kept separate from every other school’s.</li>
        <li>We do not sell school data or use it for advertising.</li>
        <li>Data is kept according to the retention schedule in the data processing agreement.</li>
        <li>
          Questions about a student’s data should go to their school first; we help the school
          answer them.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask us for a copy of the personal data we hold about you from this website, ask us
        to correct or delete it, or withdraw your consent to be contacted. You can also complain to
        the Nigeria Data Protection Commission.
      </p>

      <h2>Contact</h2>
      <p>
        {site.email ? (
          <>
            Email <a href={`mailto:${site.email}`}>{site.email}</a> about anything in this notice.
          </>
        ) : (
          <>
            Contact us through the <Link href="/request-a-demo">request form</Link> about anything
            in this notice.
          </>
        )}
      </p>
    </LegalPage>
  );
}
