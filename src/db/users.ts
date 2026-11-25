import { db } from './index.ts';
import { users } from './schema.ts';

export const SUPER_ADMIN_EMAIL = 'nmurthy27@gmail.com';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string
) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const role = normalizedEmail === SUPER_ADMIN_EMAIL ? 'super_admin' : 'owner';

    const result = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        displayName: displayName?.trim() || normalizedEmail.split('@')[0],
        role,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          displayName: displayName?.trim() || normalizedEmail.split('@')[0],
          role,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Unable to synchronize user profile. Please try again.', {
      cause: error,
    });
  }
}
