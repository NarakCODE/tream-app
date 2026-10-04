// Persist before sending so retries after uncertain responses use the same command identity.
export function invitationAttempt(scope: string) {
   const storageKey = `tream:invitation-command:${scope}`;
   const saved = localStorage.getItem(storageKey);
   if (saved !== null) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved))
         throw new Error(
            'Saved invitation progress is invalid. Clear this site’s saved data before retrying.'
         );
      return saved;
   }
   const key = crypto.randomUUID();
   localStorage.setItem(storageKey, key);
   return key;
}
