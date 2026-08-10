import { hash, verify } from 'argon2';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { randomToken, encrypt, decrypt } from '../utils/crypto.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from '../middleware/auth.middleware.js';
import { config } from '../config.js';
import { addDays } from '../utils/date.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(
  email: string,
  password: string,
  name: string,
): Promise<AuthTokens> {
  const db = getDb();
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  if (existing) throw new Error('Email already registered');

  const passwordHash = await hash(password);
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash, name })
    .returning();

  return createSession(user.id, user.email);
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthTokens> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (!user || !user.passwordHash) {
    throw new Error('Invalid credentials');
  }

  const valid = await verify(user.passwordHash, password);
  if (!valid) throw new Error('Invalid credentials');

  return createSession(user.id, user.email);
}

export async function refreshSession(refreshToken: string): Promise<AuthTokens> {
  const db = getDb();
  const payload = verifyToken(refreshToken);
  if ((payload as { type?: string }).type !== 'refresh') {
    throw new Error('Invalid token type');
  }

  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, refreshToken),
  });
  if (!session || session.expiresAt < new Date()) {
    throw new Error('Session expired');
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, payload.sub),
  });
  if (!user) throw new Error('User not found');

  // Rotate refresh token
  await db.delete(schema.sessions).where(eq(schema.sessions.id, refreshToken));
  return createSession(user.id, user.email);
}

export async function revokeSession(refreshToken: string): Promise<void> {
  const db = getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.id, refreshToken));
}

export async function revokeUserSessions(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

async function createSession(userId: string, email: string): Promise<AuthTokens> {
  const db = getDb();
  const accessToken = signAccessToken({ sub: userId, email });
  const refreshToken = signRefreshToken(userId);

  const expiresAt = addDays(new Date(), 30);
  await db.insert(schema.sessions).values({
    id: refreshToken,
    userId,
    expiresAt,
  });

  return { accessToken, refreshToken };
}

export async function upsertGithubUser(
  githubId: string,
  email: string,
  name: string,
  avatarUrl: string,
  githubToken: string,
): Promise<AuthTokens> {
  const db = getDb();
  const encrypted = encrypt(githubToken);

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.githubId, githubId),
  });

  let userId: string;
  let userEmail: string;

  if (existing) {
    await db
      .update(schema.users)
      .set({ githubTokenEnc: encrypted, avatarUrl, updatedAt: new Date() })
      .where(eq(schema.users.id, existing.id));
    userId = existing.id;
    userEmail = existing.email;
  } else {
    const [user] = await db
      .insert(schema.users)
      .values({ githubId, email, name, avatarUrl, githubTokenEnc: encrypted })
      .returning();
    userId = user.id;
    userEmail = user.email;
  }

  return createSession(userId, userEmail);
}

export async function getUserById(id: string) {
  const db = getDb();
  return db.query.users.findFirst({ where: eq(schema.users.id, id) });
}

export async function getUserGithubToken(userId: string): Promise<string | null> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!user || !user.githubTokenEnc) return null;
  try {
    return decrypt(user.githubTokenEnc);
  } catch {
    return null;
  }
}
