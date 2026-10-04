import { z } from 'zod';

const attemptSchema = z.object({ signature: z.string(), key: z.string().uuid() });

// Persist before sending: a reload after a lost response reuses the command key.
export function onboardingAttempt(scope: string, input: unknown): string {
   const storageKey = `tream:onboarding:attempt:${scope}`;
   const signature = JSON.stringify(input);
   const saved = localStorage.getItem(storageKey);
   let previous: z.infer<typeof attemptSchema> | undefined;
   if (saved !== null) {
      try {
         previous = attemptSchema.parse(JSON.parse(saved));
         JSON.parse(previous.signature);
      } catch {
         throw new Error(
            'Saved setup request is invalid. Reload to check your workspace and team before retrying.'
         );
      }
   }
   if (previous?.signature === signature) return previous.key;
   const key = crypto.randomUUID();
   localStorage.setItem(storageKey, JSON.stringify({ signature, key }));
   return key;
}

export function readOnboardingDraft<T extends z.ZodTypeAny>(scope: string, schema: T) {
   try {
      const saved = localStorage.getItem(`tream:onboarding:attempt:${scope}`);
      const attempt = attemptSchema.safeParse(saved ? JSON.parse(saved) : null);
      if (!attempt.success) return null;
      const draft = schema.safeParse(JSON.parse(attempt.data.signature));
      return draft.success ? (draft.data as z.infer<T>) : null;
   } catch {
      return null;
   }
}
