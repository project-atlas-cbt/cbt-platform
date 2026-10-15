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
    <LegalPage title="Privacy notice" updated="15 October 2026">
      <p>
        This notice explains what personal data this website collects and how the {site.name}{' '}
        platform handles the data schools put into it. It is written to meet the Nigeria Data
        Protection Act 2023.
      </p>
      {site.company ? (
        <p>
          {site.name} is operated by {site.company}
          {site.address ? `, ${site.address}` : ''}. In this notice, “we” means {site.company}.
        </p>
      ) : null}

      <h2>This website</h2>
      <h3>What we collect</h3>
      <p>
        When you request a demo or a quote, we collect what you type into the form: your name, role,
        school, state, number of students, phone number, email address and message. When you ask us
        to call you back, we collect your name, your phone number and, if you give it, your school.
      </p>
      <p>
        When you send either form, we also note which pages of this website you viewed earlier the
        same day and how you arrived (for example, from a LinkedIn post), so we know what interests
        you when we get in touch.
      </p>
      <h3>Counting visits</h3>
      <p>
        We count visits to this website to see how many people it reaches, which pages they read and
        where they came from. We do this ourselves, without cookies, without storing anything in
        your browser and without any third-party analytics or advertising tracker. Our server turns
        your network address and browser type into a code that changes every day and cannot be
        turned back into your address, then discards the address. These counts do not tell us who
        you are, and we do not try to find out. If your browser sends a “Do Not Track” or “Global
        Privacy Control” signal, your visit is not counted at all.
      </p>
      <p>
        Our servers also keep short-lived technical logs, such as the time of a request and the
        address it came from, to keep the site secure.
      </p>
      <h3>Why, and on what basis</h3>
      <p>
        We use a request or a call-back number only to contact you about it, by phone, WhatsApp or
        email, with your consent, which you give when you send the form. We do not sell it or use it
        for advertising. We count visits because we have a legitimate interest in knowing whether
        the website is useful, and the counts are anonymous.
      </p>
      <h3>How long we keep it</h3>
      <p>
        Requests and call-back numbers are kept while we are in contact with you. If your school
        does not become a customer, we delete them within 12 months. Visit counts are deleted after
        about 13 months.
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
