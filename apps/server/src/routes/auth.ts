import { FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  registerUser,
  loginUser,
  refreshSession,
  revokeSession,
  upsertGithubUser,
  getUserById,
} from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
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
      email: string; password: string; name: string;
    };

    const { accessToken, refreshToken } = await registerUser(email, password, name);
    setAuthCookies(reply, accessToken, refreshToken);
    return { accessToken };
  });

  // Login
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };
    const { accessToken, refreshToken } = await loginUser(email, password);
    setAuthCookies(reply, accessToken, refreshToken);
    return { accessToken };
  });

  // Refresh
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = (request.cookies as Record<string, string | undefined>)?.['refresh_token'];
    if (!refreshToken) {
      return reply.code(401).send({ error: 'No refresh token' });
    }
    const { accessToken, refreshToken: newRefresh } = await refreshSession(refreshToken);
    setAuthCookies(reply, accessToken, newRefresh);
    return { accessToken };
  });

  // Logout
  fastify.post('/logout', async (request, reply) => {
    const refreshToken = (request.cookies as Record<string, string | undefined>)?.['refresh_token'];
    if (refreshToken) {
      try {
        await revokeSession(refreshToken);
      } catch {
        // Ignore errors if session was already expired or revoked
      }
    }
    const isProd = config.NODE_ENV === 'production';
    reply
      .clearCookie('access_token', {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
      })
      .clearCookie('refresh_token', {
        path: '/api/v1/auth',
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
      })
      .clearCookie('refresh_token', {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
      });
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
    };
  });

  // GitHub OAuth Start
  fastify.get('/github/start', async (_request, reply) => {
    if (!config.GITHUB_CLIENT_ID) {
      return reply.code(503).send({ error: 'GitHub OAuth not configured' });
    }
    const params = new URLSearchParams({
      client_id: config.GITHUB_CLIENT_ID,
      redirect_uri: config.GITHUB_CALLBACK_URL ?? '',
      scope: 'repo read:user user:email',
    });
    reply.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  // GitHub OAuth Callback — Popup friendly
  fastify.get('/github/callback', async (request, reply) => {
    const { code } = request.query as { code?: string };
    if (!code || !config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
      return reply.code(400).send({ error: 'Invalid OAuth callback' });
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

    const { accessToken, refreshToken } = await upsertGithubUser(
      String(ghUser.id),
      email,
      ghUser.name ?? ghUser.login,
      ghUser.avatar_url,
      tokenData.access_token,
    );

    setAuthCookies(reply, accessToken, refreshToken);

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
      window.opener.postMessage({ type: 'GITHUB_AUTH_SUCCESS', accessToken: '${accessToken}' }, '*');
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
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days (1 week)
    })
    .setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
}
