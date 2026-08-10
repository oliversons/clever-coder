import { FastifyPluginAsync, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  registerUser,
  loginUser,
  refreshSession,
  revokeSession,
  revokeUserSessions,
  updateUserSettings,
  upsertGithubUser,
  linkGithubAccount,
  saveUserGithubToken,
  removeUserGithubToken,
  getUserById,
} from '../services/auth.service.js';
import { authMiddleware, verifyToken } from '../middleware/auth.middleware.js';
import { config } from '../config.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          name: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, name } = request.body as {
      email: string;
      password: string;
      name: string;
    };
    try {
      const { accessToken, refreshToken } = await registerUser(email, password, name);
      setAuthCookies(reply, accessToken, refreshToken);
      return { accessToken };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Registration failed' });
    }
  });

  // Login
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as {
      email: string;
      password: string;
    };
    try {
      const { accessToken, refreshToken } = await loginUser(email, password);
      setAuthCookies(reply, accessToken, refreshToken);
      return { accessToken };
    } catch (err) {
      return reply.code(401).send({ error: err instanceof Error ? err.message : 'Invalid credentials' });
    }
  });

  // Refresh
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = (request.cookies as Record<string, string | undefined>)?.['refresh_token'];
    if (!refreshToken) {
      return reply.code(401).send({ error: 'Refresh token missing' });
    }
    try {
      const { accessToken, refreshToken: newRefresh } = await refreshSession(refreshToken);
      setAuthCookies(reply, accessToken, newRefresh);
      return { accessToken };
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }
  });

  // Logout
  fastify.post('/logout', async (request, reply) => {
    const refreshToken = (request.cookies as Record<string, string | undefined>)?.['refresh_token'];
    if (refreshToken) {
      try {
        await revokeSession(refreshToken);
      } catch {
        // Ignore
      }
    }

    let accessToken = (request.cookies as Record<string, string | undefined>)?.['access_token'];
    if (!accessToken && request.headers.authorization?.startsWith('Bearer ')) {
      accessToken = request.headers.authorization.slice(7);
    }

    if (accessToken) {
      try {
        const payload = verifyToken(accessToken);
        if (payload?.sub) {
          await revokeUserSessions(payload.sub);
        }
      } catch {
        // Ignore
      }
    }

    clearAuthCookies(reply);
    return { ok: true };
  });

  // Me
  fastify.get('/me', { preHandler: [authMiddleware] }, async (request) => {
    const user = (request as typeof request & { user: { sub: string; email: string } }).user;
    const dbUser = await getUserById(user.sub);
    return {
      id: user.sub,
      email: user.email,
      name: dbUser?.name ?? user.email,
      avatarUrl: dbUser?.avatarUrl ?? null,
      hasGithubToken: Boolean(dbUser?.githubTokenEnc),
      settings: dbUser?.settings ?? { theme: 'dark', palette: 'default' },
    };
  });

  // Update Settings
  fastify.patch('/settings', { preHandler: [authMiddleware] }, async (request) => {
    const user = (request as typeof request & { user: { sub: string; email: string } }).user;
    const body = request.body as Record<string, unknown>;
    const settings = await updateUserSettings(user.sub, body);
    return { settings };
  });

  // Save or update GitHub Personal Access Token directly
  fastify.post('/github/token', { preHandler: [authMiddleware] }, async (request, reply) => {
    const user = (request as typeof request & { user: { sub: string } }).user;
    const { token } = (request.body as { token?: string }) || {};
    if (!token || !token.trim()) {
      return reply.code(400).send({ error: 'Token is required' });
    }
    await saveUserGithubToken(user.sub, token.trim());
    return { ok: true, hasGithubToken: true };
  });

  // Disconnect GitHub Account
  fastify.delete('/github/token', { preHandler: [authMiddleware] }, async (request) => {
    const user = (request as typeof request & { user: { sub: string } }).user;
    await removeUserGithubToken(user.sub);
    return { ok: true, hasGithubToken: false };
  });

  // GitHub OAuth Start
  fastify.get('/github/start', async (request, reply) => {
    if (!config.GITHUB_CLIENT_ID) {
      return reply.code(503).send({ error: 'GitHub OAuth not configured' });
    }

    // Check if user is currently logged in (for account linking)
    let userId: string | undefined;
    let token = (request.cookies as Record<string, string | undefined>)?.['access_token'];
    if (!token && request.headers.authorization?.startsWith('Bearer ')) {
      token = request.headers.authorization.slice(7);
    }
    if (token) {
      try {
        const payload = verifyToken(token);
        if (payload?.sub) {
          userId = payload.sub;
        }
      } catch {
        // Ignore invalid token
      }
    }

    const state = jwt.sign(
      { userId, type: userId ? 'oauth_link' : 'oauth_login' },
      config.JWT_SECRET,
      { expiresIn: '15m' },
    );

    const params = new URLSearchParams({
      client_id: config.GITHUB_CLIENT_ID,
      redirect_uri: config.GITHUB_CALLBACK_URL ?? '',
      scope: 'repo read:user user:email',
      state,
    });
    reply.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  // GitHub OAuth Callback — Popup friendly
  fastify.get('/github/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    if (!code || !config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
      return reply.code(400).send({ error: 'Invalid OAuth callback' });
    }

    let linkUserId: string | undefined;
    if (state) {
      try {
        const statePayload = jwt.verify(state, config.JWT_SECRET) as { userId?: string };
        linkUserId = statePayload.userId;
      } catch {
        // State invalid or expired
      }
    }

    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.GITHUB_CLIENT_ID,
        client_secret: config.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return reply.code(400).send({ error: tokenData.error ?? 'OAuth failed' });
    }

    // Get user info
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'clever-coder' },
    });
    const ghUser = await userRes.json() as {
      id: number; email: string; name: string; avatar_url: string; login: string;
    };

    // Get primary email if not public
    let email = ghUser.email;
    if (!email) {
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'clever-coder' },
      });
      const emails = await emailRes.json() as Array<{ email: string; primary: boolean }>;
      email = emails?.find?.(e => e.primary)?.email ?? `${ghUser.login}@github.local`;
    }

    let authTokens;
    if (linkUserId) {
      // Link directly to current authenticated user profile
      authTokens = await linkGithubAccount(
        linkUserId,
        String(ghUser.id),
        tokenData.access_token,
        ghUser.avatar_url,
      );
    } else {
      // Login or register via GitHub
      authTokens = await upsertGithubUser(
        String(ghUser.id),
        email,
        ghUser.name ?? ghUser.login,
        ghUser.avatar_url,
        tokenData.access_token,
      );
    }

    setAuthCookies(reply, authTokens.accessToken, authTokens.refreshToken);

    // Popup-friendly HTML response
    reply.type('text/html').send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GitHub Connected — CleverCoder</title>
  <style>
    body {
      background: #0a0c14;
      color: #f0f4ff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(124, 58, 237, 0.2);
      border-top-color: #7c3aed;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>GitHub connected successfully!</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'GITHUB_AUTH_SUCCESS', accessToken: '${authTokens.accessToken}' }, '*');
      setTimeout(() => window.close(), 400);
    } else {
      window.location.href = '${config.PUBLIC_URL}/dashboard';
    }
  </script>
</body>
</html>
    `);
  });
};

function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
) {
  const isProd = config.NODE_ENV === 'production';
  reply
    .setCookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days (1 week)
    })
    .setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
}

function clearAuthCookies(reply: FastifyReply) {
  const isProd = config.NODE_ENV === 'production';
  reply
    .setCookie('access_token', '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      expires: new Date(0),
      maxAge: 0,
    })
    .setCookie('refresh_token', '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      expires: new Date(0),
      maxAge: 0,
    });

  // Also send Set-Cookie headers for any historical paths/modes
  const paths = ['/api/v1/auth', '/api/v1', '/api', '/'];
  const cookiesToClear = ['access_token', 'refresh_token'];
  const sameSites: Array<'lax' | 'strict' | 'none'> = ['lax', 'strict'];

  for (const p of paths) {
    for (const c of cookiesToClear) {
      for (const s of sameSites) {
        reply.header(
          'Set-Cookie',
          `${c}=; Path=${p}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly${isProd ? '; Secure' : ''}; SameSite=${s}`
        );
      }
    }
  }
}
