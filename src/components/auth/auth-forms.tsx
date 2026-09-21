'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { registerAction, signInAction } from '@/app/actions/auth';
import { Button, FieldError, FormAlert, Label, inputClass } from '@/components/ui/primitives';
import type { ActionResult } from '@/lib/errors';

const initial: ActionResult<undefined> = { ok: false, error: '', code: '' };

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(signInAction, initial);

  useEffect(() => {
    if (state.ok) router.push(next ?? '/dashboard');
  }, [state, router, next]);

  const errors = state.ok ? undefined : state.fieldErrors;

  return (
    <form action={action} className="space-y-4" noValidate>
      {!state.ok && state.error ? <FormAlert message={state.error} /> : null}
      <div>
        <Label htmlFor="email" required>
          Email address
        </Label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={errors?.email ? true : undefined}
          aria-describedby={errors?.email ? 'email-error' : undefined}
          className={inputClass}
        />
        <FieldError id="email-error" errors={errors?.email} />
      </div>
      <div>
        <Label htmlFor="password" required>
          Password
        </Label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={errors?.password ? true : undefined}
          aria-describedby={errors?.password ? 'password-error' : undefined}
          className={inputClass}
        />
        <FieldError id="password-error" errors={errors?.password} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(registerAction, initial);

  useEffect(() => {
    if (state.ok) router.push('/dashboard');
  }, [state, router]);

  const errors = state.ok ? undefined : state.fieldErrors;

  return (
    <form action={action} className="space-y-4" noValidate>
      {!state.ok && state.error ? <FormAlert message={state.error} /> : null}
      <div>
        <Label htmlFor="name" required>
          Full name
        </Label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          required
          className={inputClass}
          aria-describedby={errors?.name ? 'name-error' : undefined}
        />
        <FieldError id="name-error" errors={errors?.name} />
      </div>
      <div>
        <Label htmlFor="reg-email" required>
          Email address
        </Label>
        <input
          id="reg-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
          aria-describedby={errors?.email ? 'reg-email-error' : undefined}
        />
        <FieldError id="reg-email-error" errors={errors?.email} />
      </div>
      <div>
        <Label htmlFor="reg-password" hint="at least 12 characters" required>
          Password
        </Label>
        <input
          id="reg-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className={inputClass}
          aria-describedby={errors?.password ? 'reg-password-error' : undefined}
        />
        <FieldError id="reg-password-error" errors={errors?.password} />
      </div>
      <div>
        <Label htmlFor="confirm-password" required>
          Confirm password
        </Label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
          aria-describedby={errors?.confirmPassword ? 'confirm-password-error' : undefined}
        />
        <FieldError id="confirm-password-error" errors={errors?.confirmPassword} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
