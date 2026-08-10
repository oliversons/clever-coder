import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export interface JwtPayload {
  sub: string;   // user id
  email: string;
  v?: number;    // token version for immediate revocation
  iat?: number;
  exp?: number;
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    let token: string | undefined;

    // 1. Cookie (preferred for browser clients)
    const cookieToken = (request.cookies as Record<string, string | undefined>)?.['access_token'];
    if (cookieToken) {
      token = cookieToken;
    }

    // 2. Authorization header fallback
    if (!token) {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    // 3. Query param fallback (essential for WebSockets & iframe embeds)
    if (!token) {
      const queryToken = (request.query as Record<string, string | undefined>)?.[
        'token'
      ];
      if (queryToken) {
        token = queryToken;
      }
    }

    if (!token) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    if (!payload?.sub) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    // Verify against DB to ensure user exists and token has not been revoked
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, payload.sub),
    });

    if (!user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    // Check token version against user's current tokenVersion
    if (payload.v !== undefined && user.tokenVersion !== undefined && payload.v !== user.tokenVersion) {
      reply.code(401).send({ error: 'Session revoked' });
      return;
    }

    (request as FastifyRequest & { user: JwtPayload }).user = payload;
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, config.JWT_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
}
