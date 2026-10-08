'use client';

import { useState } from 'react';
import { useTenant } from '@/lib/tenant';
import { LoginForm } from './login-form';
import { StudentSignInForm } from './student-sign-in-form';

/**
 * The school sign-in page body. While passwordless student sign-in is on
 * for any class (`tenant/resolve`), students see the name + Login ID form
 * first, with a link to the usual password form for staff and everyone
 * else; otherwise only the password form shows.
 */
export function SchoolSignIn() {
  const { school } = useTenant();
  const [usePassword, setUsePassword] = useState(false);
  const offerStudentForm = school?.studentPasswordlessSignIn === true;

  if (offerStudentForm && !usePassword) {
    return (
      <div className="space-y-4">
        <p className="text-center text-sm text-text-secondary">
          Students: type your name and your Login ID.
        </p>
        <StudentSignInForm />
        <div className="text-center">
          <button
            type="button"
            onClick={() => setUsePassword(true)}
            className="text-sm text-brand-primary underline"
          >
            Teachers and staff: sign in with a password
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <LoginForm />
      {offerStudentForm ? (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setUsePassword(false)}
            className="text-sm text-brand-primary underline"
          >
            Student without a password? Sign in with your name
          </button>
        </div>
      ) : null}
    </div>
  );
}
