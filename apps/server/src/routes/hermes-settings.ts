/**
 * Hermes Settings Routes — /api/v1/hermes/settings
 */

import type { FastifyInstance } from 'fastify';
import { verifyToken } from '../middleware/auth.middleware.js';
import {
  getHermesSettings,
  upsertHermesSettings,
  maskSettings,
  getDecryptedApiKey,
  testProviderConnection,
} from '../services/hermes.service.js';
import {
  getHermesBrowserSettings,
  upsertHermesBrowserSettings,
  maskBrowserSettings,
  testBrowserConnection,
  getHermesSyncStatus,
  syncBrowserConfigToYamlAndEnv,
} from '../services/hermes-browser.service.js';
import { isHermesWebUIRunning, syncHermesConfigFiles, restartHermesWebUI } from '../services/hermes-webui.service.js';

export async function hermesSettingsRoutes(fastify: FastifyInstance) {
  // ── GET /api/v1/hermes/settings ──────────────────────────────────────────────
  fastify.get('/settings', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );

    const settings = await getHermesSettings(payload.sub);
    if (!settings) {
      // Return defaults — will be created on first save
      return reply.send({
        provider: 'openrouter',
        baseUrl: null,
        apiKeySet: false,
        apiKeyEncrypted: null,
        model: 'nousresearch/hermes-3-llama-3.1-405b',
        temperature: 70,
        contextWindow: 128000,
        executionBackend: 'docker',
        containerCpu: 2,
        containerMemoryMb: 4096,
        timeoutSeconds: 300,
        commandApprovalMode: 'ask_destructive',
        persistentMemory: true,
        autoSkillCreation: false,
        systemPrompt: null,
        enabledTools: ['shell', 'web_search', 'code_runner'],
        s3ArchivingEnabled: true,
        webuiEnabled: true,
        webuiPort: 8787,
        webuiPassword: null,
      });
    }
    return reply.send(maskSettings(settings));
  });

  // ── PUT /api/v1/hermes/settings ──────────────────────────────────────────────
  fastify.put('/settings', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );

    const body = request.body as Record<string, unknown>;

    // Never allow apiKeyEncrypted to be set directly from client
    delete body.apiKeyEncrypted;
    delete body.id;
    delete body.userId;
    delete body.createdAt;

    const settings = await upsertHermesSettings(payload.sub, {
      provider: typeof body.provider === 'string' ? body.provider : undefined,
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : null,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
      contextWindow: typeof body.contextWindow === 'number' ? body.contextWindow : undefined,
      executionBackend: typeof body.executionBackend === 'string' ? body.executionBackend : undefined,
      containerCpu: typeof body.containerCpu === 'number' ? body.containerCpu : undefined,
      containerMemoryMb: typeof body.containerMemoryMb === 'number' ? body.containerMemoryMb : undefined,
      timeoutSeconds: typeof body.timeoutSeconds === 'number' ? body.timeoutSeconds : undefined,
      commandApprovalMode: typeof body.commandApprovalMode === 'string' ? body.commandApprovalMode : undefined,
      persistentMemory: typeof body.persistentMemory === 'boolean' ? body.persistentMemory : undefined,
      autoSkillCreation: typeof body.autoSkillCreation === 'boolean' ? body.autoSkillCreation : undefined,
      systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
      enabledTools: Array.isArray(body.enabledTools) ? body.enabledTools as string[] : undefined,
      s3ArchivingEnabled: typeof body.s3ArchivingEnabled === 'boolean' ? body.s3ArchivingEnabled : undefined,
      webuiEnabled: typeof body.webuiEnabled === 'boolean' ? body.webuiEnabled : undefined,
      webuiPort: typeof body.webuiPort === 'number' ? body.webuiPort : undefined,
      webuiPassword: typeof body.webuiPassword === 'string' ? body.webuiPassword : undefined,
    });

    // Re-sync ~/.hermes/ config files with the freshly saved (decrypted) API key
    // If the WebUI daemon is already running, restart it so the new key takes effect immediately
    try {
      if (isHermesWebUIRunning()) {
        restartHermesWebUI({ userId: payload.sub }).catch((e: unknown) =>
          console.error('[Hermes Settings] Failed to restart WebUI after settings save:', e)
        );
      } else {
        syncHermesConfigFiles(payload.sub).catch((e: unknown) =>
          console.error('[Hermes Settings] Failed to sync config files after settings save:', e)
        );
      }
    } catch (e) {
      // Non-critical — don't fail the settings save
      console.error('[Hermes Settings] Non-critical WebUI sync error:', e);
    }

    return reply.send(maskSettings(settings));
  });

  // ── POST /api/v1/hermes/settings/test ────────────────────────────────────────
  fastify.post('/settings/test', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );

    const body = request.body as { provider?: string; baseUrl?: string; apiKey?: string; model?: string };
    const settings = await getHermesSettings(payload.sub);

    // Use request body values, falling back to stored settings
    const provider = body.provider ?? settings?.provider ?? 'openrouter';
    const baseUrl = body.baseUrl ?? settings?.baseUrl ?? null;
    const model = body.model ?? settings?.model ?? '';
    let apiKey = body.apiKey;

    if (!apiKey && settings) {
      apiKey = getDecryptedApiKey(settings) ?? '';
    }

    if (!apiKey && provider !== 'ollama') {
      return reply.code(400).send({ ok: false, message: 'No API key configured' });
    }

    const result = await testProviderConnection(provider, apiKey ?? '', model, baseUrl);
    return reply.send(result);
  });

  // ── GET /api/v1/hermes/browser ──────────────────────────────────────────────
  fastify.get('/browser', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );

    const settings = await getHermesBrowserSettings(payload.sub);
    return reply.send(maskBrowserSettings(settings));
  });

  // ── PUT /api/v1/hermes/browser ──────────────────────────────────────────────
  fastify.put('/browser', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );

    const body = (request.body as Record<string, unknown>) ?? {};
    delete body.id;
    delete body.userId;
    delete body.createdAt;
    delete body.updatedAt;

    const saved = await upsertHermesBrowserSettings(payload.sub, body);
    return reply.send(maskBrowserSettings(saved));
  });

  // ── POST /api/v1/hermes/browser/test ────────────────────────────────────────
  fastify.post('/browser/test', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );

    const body = (request.body as Record<string, unknown>) ?? {};
    const existing = await getHermesBrowserSettings(payload.sub);

    const testInput = {
      provider: typeof body.provider === 'string' ? body.provider : existing?.provider,
      backend: typeof body.backend === 'string' ? body.backend : existing?.backend,
      cdpUrl: typeof body.cdpUrl === 'string' ? body.cdpUrl : existing?.cdpUrl,
      headless: typeof body.headless === 'boolean' ? body.headless : existing?.headless,
      browserbaseApiKey: body.browserbaseApiKey && body.browserbaseApiKey !== '••••••••'
        ? String(body.browserbaseApiKey)
        : existing?.browserbaseApiKey,
      browserUseApiKey: body.browserUseApiKey && body.browserUseApiKey !== '••••••••'
        ? String(body.browserUseApiKey)
        : existing?.browserUseApiKey,
      firecrawlApiKey: body.firecrawlApiKey && body.firecrawlApiKey !== '••••••••'
        ? String(body.firecrawlApiKey)
        : existing?.firecrawlApiKey,
      firecrawlApiUrl: typeof body.firecrawlApiUrl === 'string' ? body.firecrawlApiUrl : existing?.firecrawlApiUrl,
      camofoxUrl: typeof body.camofoxUrl === 'string' ? body.camofoxUrl : existing?.camofoxUrl,
    };

    const result = await testBrowserConnection(testInput);
    return reply.send(result);
  });

  // ── GET /api/v1/hermes/browser/sync-status ───────────────────────────────────
  fastify.get('/browser/sync-status', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const status = await getHermesSyncStatus(payload.sub);
    return reply.send(status);
  });

  // ── POST /api/v1/hermes/browser/sync-now ─────────────────────────────────────
  fastify.post('/browser/sync-now', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    await syncHermesConfigFiles(payload.sub);
    const settings = await getHermesBrowserSettings(payload.sub);
    if (settings) {
      await syncBrowserConfigToYamlAndEnv(settings);
    }
    const status = await getHermesSyncStatus(payload.sub);
    return reply.send({ success: true, status });
  });

  // ── GET /api/v1/hermes/gateway/status ─────────────────────────────────────────
  fastify.get('/gateway/status', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const { getGatewayStatus } = await import('../services/hermes-gateway.service.js');
    const status = await getGatewayStatus();
    return reply.send(status);
  });

  // ── POST /api/v1/hermes/gateway/start ──────────────────────────────────────────
  fastify.post('/gateway/start', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const { startGateway } = await import('../services/hermes-gateway.service.js');
    const result = await startGateway({ userId: payload.sub });
    return reply.send(result);
  });

  // ── POST /api/v1/hermes/gateway/stop ───────────────────────────────────────────
  fastify.post('/gateway/stop', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const { stopGateway } = await import('../services/hermes-gateway.service.js');
    const result = await stopGateway();
    return reply.send(result);
  });

  // ── POST /api/v1/hermes/gateway/restart ────────────────────────────────────────
  fastify.post('/gateway/restart', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const { restartGateway } = await import('../services/hermes-gateway.service.js');
    const result = await restartGateway(payload.sub);
    return reply.send(result);
  });

  // ── GET /api/v1/hermes/gateway/logs ────────────────────────────────────────────
  fastify.get('/gateway/logs', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const { getGatewayRecentLogs, getGatewayStatus } = await import('../services/hermes-gateway.service.js');
    const logs = getGatewayRecentLogs(60);
    const status = await getGatewayStatus();
    return reply.send({ logs, logPath: status.logPath, active: status.active });
  });

  // ── GET /api/v1/hermes/cron/jobs ───────────────────────────────────────────────
  fastify.get('/cron/jobs', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const { listCronJobs } = await import('../services/hermes-gateway.service.js');
    const jobs = await listCronJobs();
    return reply.send({ jobs });
  });

  // ── POST /api/v1/hermes/cron/jobs ──────────────────────────────────────────────
  fastify.post('/cron/jobs', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as Record<string, unknown>) || {};
    const { createCronJob } = await import('../services/hermes-gateway.service.js');
    const job = await createCronJob(body);
    return reply.send({ success: true, job });
  });

  // ── PATCH /api/v1/hermes/cron/jobs/:id ─────────────────────────────────────────
  fastify.patch('/cron/jobs/:id', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const { id } = request.params as { id: string };
    const body = (request.body as { enabled?: boolean }) || {};
    const { toggleCronJob } = await import('../services/hermes-gateway.service.js');
    const updated = await toggleCronJob(id, body.enabled !== false);
    if (!updated) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    return reply.send({ success: true, job: updated });
  });

  // ── DELETE /api/v1/hermes/cron/jobs/:id ────────────────────────────────────────
  fastify.delete('/cron/jobs/:id', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const { id } = request.params as { id: string };
    const { deleteCronJob } = await import('../services/hermes-gateway.service.js');
    const deleted = await deleteCronJob(id);
    return reply.send({ success: deleted });
  });

  // ── POST /api/v1/hermes/cron/jobs/:id/run ──────────────────────────────────────
  fastify.post('/cron/jobs/:id/run', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const { id } = request.params as { id: string };
    const { runCronJobNow } = await import('../services/hermes-gateway.service.js');
    const result = await runCronJobNow(id);
    return reply.send(result);
  });
}
