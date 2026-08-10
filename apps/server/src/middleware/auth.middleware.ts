import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface JwtPayload {
  sub: string;   // user id
  email: string;
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
