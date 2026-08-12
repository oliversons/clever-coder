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
  testLlmPrompt,
  fetchAvailableModels,
} from '../services/hermes.service.js';
import {
  getHermesBrowserSettings,
  upsertHermesBrowserSettings,
  maskBrowserSettings,
  testBrowserConnection,
  getHermesSyncStatus,
  syncBrowserConfigToYamlAndEnv,
} from '../services/hermes-browser.service.js';
import {
  getHermesWebSearchSettings,
  saveHermesWebSearchSettings,
  testWebSearchQuery,
} from '../services/hermes-search.service.js';
import {
  getHermesVisionImageSettings,
  saveHermesVisionImageSettings,
  discoverSatModels,
  testVisionAnalysis,
  testImageGeneration,
} from '../services/hermes-vision-image.service.js';
import { isHermesWebUIRunning, syncHermesConfigFiles, restartHermesWebUI } from '../services/hermes-webui.service.js';
import {
  getMessagingSettings,
  upsertMessagingSettings,
  maskMessagingSettings,
  syncMessagingConfigToFiles,
  testTelegramToken,
  testWhatsAppCredentials,
  testEmailConnection,
  getConfiguredGateways,
} from '../services/hermes-messaging.service.js';
import {
  getSpotifySettings,
  upsertSpotifySettings,
  syncSpotifyConfigToFiles,
  refreshSpotifyAccessToken,
} from '../services/hermes-spotify.service.js';
import {
  getTtsSettings,
  upsertTtsSettings,
  syncTtsConfigToFiles,
  discoverTtsModels,
  generateTtsAudioPreview,
} from '../services/hermes-tts.service.js';

export async function hermesSettingsRoutes(fastify: FastifyInstance) {
  // ── GET /api/v1/hermes/models ───────────────────────────────────────────────
  fastify.get('/models', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const query = (request.query as { provider?: string; baseUrl?: string; apiKey?: string; search?: string }) || {};

    let apiKey = query.apiKey;
    if (!apiKey && payload?.sub) {
      const userSettings = await getHermesSettings(payload.sub);
      if (userSettings) apiKey = getDecryptedApiKey(userSettings) || undefined;
    }

    const result = await fetchAvailableModels(
      query.provider || 'openrouter',
      query.baseUrl,
      apiKey,
      query.search
    );
    return reply.send(result);
  });
  // ── GET /api/v1/hermes/vision-image ─────────────────────────────────────────
  fastify.get('/vision-image', async (request, reply) => {
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}
    const settings = await getHermesVisionImageSettings(userId);
    return reply.send(settings);
  });

  // ── PUT /api/v1/hermes/vision-image ─────────────────────────────────────────
  fastify.put('/vision-image', async (request, reply) => {
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}
    const body = (request.body as Record<string, any>) || {};
    const updated = await saveHermesVisionImageSettings(userId, body);
    return reply.send({ success: true, settings: updated });
  });

  // ── POST /api/v1/hermes/vision-image (alias for saving) ──────────────────────
  fastify.post('/vision-image', async (request, reply) => {
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}
    const body = (request.body as Record<string, any>) || {};
    const updated = await saveHermesVisionImageSettings(userId, body);
    return reply.send({ success: true, settings: updated });
  });

  // ── GET /api/v1/hermes/sat-models ───────────────────────────────────────────
  fastify.get('/sat-models', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const query = (request.query as { baseUrl?: string; apiKey?: string }) || {};
    const result = await discoverSatModels(query.baseUrl, query.apiKey);
    return reply.send(result);
  });

  // ── POST /api/v1/hermes/vision/test ────────────────────────────────────────
  fastify.post('/vision/test', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as { prompt?: string; image?: string; settings?: any }) || {};
    const result = await testVisionAnalysis(
      body.prompt || 'Describe this image',
      body.image || '',
      body.settings
    );
    return reply.send(result);
  });

  // ── POST /api/v1/hermes/image-gen/test ──────────────────────────────────────
  fastify.post('/image-gen/test', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as { prompt?: string; settings?: any }) || {};
    const result = await testImageGeneration(
      body.prompt || 'A futuristic AI developer workstation with neon lights',
      body.settings
    );
    return reply.send(result);
  });

  // ── GET /api/v1/hermes/web-search ───────────────────────────────────────────
  fastify.get('/web-search', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const settings = await getHermesWebSearchSettings(payload.sub);
    return reply.send(settings);
  });

  // ── PUT /api/v1/hermes/web-search ───────────────────────────────────────────
  fastify.put('/web-search', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as Record<string, any>) || {};
    const updated = await saveHermesWebSearchSettings(payload.sub, body);
    return reply.send({ success: true, settings: updated });
  });

  // ── POST /api/v1/hermes/web-search (alias for saving) ────────────────────────
  fastify.post('/web-search', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as Record<string, any>) || {};
    const updated = await saveHermesWebSearchSettings(payload.sub, body);
    return reply.send({ success: true, settings: updated });
  });

  // ── POST /api/v1/hermes/web-search/test ─────────────────────────────────────
  fastify.post('/web-search/test', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as { query?: string; settings?: any }) || {};
    const result = await testWebSearchQuery(body.query || 'Hermes AI Agent', body.settings);
    return reply.send(result);
  });
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
    let userId = 'default_user';
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      if (payload?.sub) userId = payload.sub;
    } catch {}

    const body = request.body as Record<string, unknown>;

    // Never allow apiKeyEncrypted to be set directly from client
    delete body.apiKeyEncrypted;
    delete body.id;
    delete body.userId;
    delete body.createdAt;

    const apiKeyInput = typeof body.apiKey === 'string' && body.apiKey.trim() && !body.apiKey.includes('••••')
      ? body.apiKey.trim()
      : undefined;

    const settings = await upsertHermesSettings(userId, {
      provider: typeof body.provider === 'string' ? body.provider : undefined,
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : null,
      apiKey: apiKeyInput,
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
        restartHermesWebUI({ userId }).catch((e: unknown) =>
          console.error('[Hermes Settings] Failed to restart WebUI after settings save:', e)
        );
      } else {
        syncHermesConfigFiles(userId).catch((e: unknown) =>
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

  // ── POST /api/v1/hermes/settings/test-prompt ──────────────────────────────────
  fastify.post('/settings/test-prompt', async (request, reply) => {
    let userId = '';
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub ?? '';
    } catch {}

    const body = request.body as { provider?: string; baseUrl?: string; apiKey?: string; model?: string; prompt?: string; temperature?: number };
    const settings = userId ? await getHermesSettings(userId) : null;

    const provider = body.provider ?? settings?.provider ?? 'openrouter';
    const baseUrl = body.baseUrl ?? settings?.baseUrl ?? null;
    const model = body.model ?? settings?.model ?? '';
    const prompt = body.prompt || 'Describe your capabilities and reasoning architecture.';
    let apiKey = body.apiKey;

    if (!apiKey && settings) {
      apiKey = getDecryptedApiKey(settings) ?? '';
    }

    if (!apiKey && provider !== 'ollama') {
      return reply.code(400).send({ ok: false, message: 'No API key configured' });
    }

    const result = await testLlmPrompt(provider, apiKey ?? '', model, prompt, baseUrl, body.temperature ?? settings?.temperature);
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

  // ── GET /api/v1/hermes/messaging ────────────────────────────────────────────
  fastify.get('/messaging', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const settings = await getMessagingSettings(payload.sub);
    if (!settings) {
      // Return safe defaults — row will be created on first save
      return reply.send({
        telegramEnabled: false, telegramBotToken: '', telegramBotTokenSet: false,
        telegramAllowedUsers: '', telegramAllowedChats: '', telegramGroupAllowedChats: '',
        telegramRequireMention: true, telegramStatusIndicator: true,
        telegramStatusOnline: '🟢 Online', telegramStatusOffline: '🔴 Offline',
        telegramCommandMenuMax: 60, telegramCommandMenuPriorityMode: 'prepend',
        telegramObserveUnmentioned: false,
        telegramWebhookUrl: '', telegramWebhookSecret: '', telegramWebhookSecretSet: false, telegramWebhookPort: 8443,
        whatsappEnabled: false, whatsappAccessToken: '', whatsappAccessTokenSet: false,
        whatsappPhoneNumberId: '', whatsappWabaId: '', whatsappVerifyToken: '',
        whatsappAllowedUsers: '', whatsappTextBatchDelay: 2,
        emailEnabled: false, emailAddress: '', emailPassword: '', emailPasswordSet: false,
        emailImapHost: 'imap.gmail.com', emailSmtpHost: 'smtp.gmail.com',
        emailImapPort: 993, emailSmtpPort: 587, emailPollInterval: 15, emailAllowedUsers: '',
        webhookEnabled: false, webhookPort: 8644, webhookSecret: '', webhookSecretSet: false, webhookRoutes: [],
        configured: { telegram: false, whatsapp: false, email: false, webhooks: false },
      });
    }
    return reply.send({
      ...maskMessagingSettings(settings),
      configured: getConfiguredGateways(settings),
    });
  });

  // ── PUT /api/v1/hermes/messaging ────────────────────────────────────────────
  fastify.put('/messaging', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as Record<string, any>) ?? {};

    // Strip read-only and masked fields
    delete body.id;
    delete body.userId;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.configured;
    delete body.telegramBotTokenSet;
    delete body.whatsappAccessTokenSet;
    delete body.emailPasswordSet;
    delete body.webhookSecretSet;
    delete body.telegramWebhookSecretSet;

    // Don't overwrite secrets with mask placeholders
    const existing = await getMessagingSettings(payload.sub);
    if (body.telegramBotToken?.includes('••••')) body.telegramBotToken = existing?.telegramBotToken ?? '';
    if (body.whatsappAccessToken?.includes('••••')) body.whatsappAccessToken = existing?.whatsappAccessToken ?? '';
    if (body.emailPassword?.includes('••••')) body.emailPassword = existing?.emailPassword ?? '';
    if (body.webhookSecret?.includes('••••')) body.webhookSecret = existing?.webhookSecret ?? '';
    if (body.telegramWebhookSecret?.includes('••••')) body.telegramWebhookSecret = existing?.telegramWebhookSecret ?? '';

    const saved = await upsertMessagingSettings(payload.sub, body);

    // Sync to disk and restart the gateway daemon to pick up changes
    try {
      await syncMessagingConfigToFiles(saved);
    } catch (syncErr) {
      console.warn('[Hermes Messaging] Config file sync warning:', syncErr);
    }

    try {
      const { restartGateway } = await import('../services/hermes-gateway.service.js');
      restartGateway(payload.sub).catch((e: unknown) =>
        console.warn('[Hermes Messaging] Gateway restart notice:', e)
      );
    } catch {
      // non-critical
    }

    return reply.send({
      success: true,
      message: 'Messaging gateway settings saved and gateway daemon restarting.',
      settings: {
        ...maskMessagingSettings(saved),
        configured: getConfiguredGateways(saved),
      },
    });
  });

  // ── POST /api/v1/hermes/messaging/test-telegram ──────────────────────────────
  fastify.post('/messaging/test-telegram', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as { token?: string }) ?? {};
    const result = await testTelegramToken(body.token || '');
    return reply.send(result);
  });

  // ── POST /api/v1/hermes/messaging/test-whatsapp ──────────────────────────────
  fastify.post('/messaging/test-whatsapp', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as { accessToken?: string; phoneNumberId?: string }) ?? {};
    const result = await testWhatsAppCredentials(body.accessToken || '', body.phoneNumberId || '');
    return reply.send(result);
  });

  // ── POST /api/v1/hermes/messaging/test-email ────────────────────────────────
  fastify.post('/messaging/test-email', async (request, reply) => {
    verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as { imapHost?: string; imapPort?: number }) ?? {};
    const result = await testEmailConnection(
      body.imapHost || 'imap.gmail.com',
      body.imapPort || 993,
    );
    return reply.send(result);
  });

  // ── GET /api/v1/hermes/messaging/status ─────────────────────────────────────
  fastify.get('/messaging/status', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const settings = await getMessagingSettings(payload.sub);
    return reply.send({
      configured: getConfiguredGateways(settings),
    });
  });

  // ── GET /api/v1/hermes/spotify ──────────────────────────────────────────────
  fastify.get('/spotify', async (request, reply) => {
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}

    const settings = await getSpotifySettings(userId);
    const host = request.headers.host || 'localhost:8080';
    const protocol = (request.headers['x-forwarded-proto'] as string) || 'http';
    const defaultRedirect = `${protocol}://${host}/api/v1/hermes/spotify/callback`;

    if (!settings) {
      return reply.send({
        enabled: false,
        clientId: '',
        clientSecret: '',
        clientSecretSet: false,
        redirectUri: defaultRedirect,
        defaultDeviceId: '',
        defaultVolume: 70,
        autoTransfer: true,
        market: 'US',
        isConnected: false,
        hasRefreshToken: false,
      });
    }

    return reply.send({
      ...settings,
      clientSecret: settings.clientSecret ? '••••••••••••••••' : '',
      clientSecretSet: Boolean(settings.clientSecret),
      redirectUri: settings.redirectUri || defaultRedirect,
      isConnected: Boolean(settings.refreshToken || settings.accessToken),
      hasRefreshToken: Boolean(settings.refreshToken),
    });
  });

  // ── PUT /api/v1/hermes/spotify ──────────────────────────────────────────────
  fastify.put('/spotify', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as Record<string, any>) ?? {};

    // Don't overwrite secret with mask
    const existing = await getSpotifySettings(payload.sub);
    if (body.clientSecret?.includes('••••')) {
      body.clientSecret = existing?.clientSecret ?? '';
    }

    delete body.id;
    delete body.userId;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.isConnected;
    delete body.clientSecretSet;

    const saved = await upsertSpotifySettings(payload.sub, body);

    try {
      await syncSpotifyConfigToFiles(saved);
    } catch (syncErr) {
      console.warn('[Hermes Spotify] File sync notice:', syncErr);
    }

    return reply.send({
      success: true,
      message: 'Spotify configuration saved successfully.',
      settings: {
        ...saved,
        clientSecret: saved.clientSecret ? '••••••••••••••••' : '',
        clientSecretSet: Boolean(saved.clientSecret),
        isConnected: Boolean(saved.refreshToken || saved.accessToken),
      },
    });
  });

  // ── POST /api/v1/hermes/spotify ─────────────────────────────────────────────
  fastify.post('/spotify', async (request, reply) => {
    const payload = verifyToken(
      (request.cookies as Record<string, string | undefined>)?.access_token ??
      request.headers.authorization?.slice(7) ?? '',
    );
    const body = (request.body as Record<string, any>) ?? {};

    const existing = await getSpotifySettings(payload.sub);
    if (body.clientSecret?.includes('••••')) {
      body.clientSecret = existing?.clientSecret ?? '';
    }

    delete body.id;
    delete body.userId;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.isConnected;
    delete body.clientSecretSet;

    const saved = await upsertSpotifySettings(payload.sub, body);
    await syncSpotifyConfigToFiles(saved);

    return reply.send({
      success: true,
      message: 'Spotify configuration saved successfully.',
      settings: {
        ...saved,
        clientSecret: saved.clientSecret ? '••••••••••••••••' : '',
        clientSecretSet: Boolean(saved.clientSecret),
        isConnected: Boolean(saved.refreshToken || saved.accessToken),
      },
    });
  });

  // ── GET /api/v1/hermes/spotify/authorize ─────────────────────────────────────
  fastify.get('/spotify/authorize', async (request, reply) => {
    const query = (request.query as { clientId?: string; redirectUri?: string }) || {};
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}

    const settings = await getSpotifySettings(userId);
    const clientId = query.clientId || settings?.clientId;
    const host = request.headers.host || 'localhost:8080';
    const protocol = (request.headers['x-forwarded-proto'] as string) || 'http';
    const redirectUri = query.redirectUri || settings?.redirectUri || `${protocol}://${host}/api/v1/hermes/spotify/callback`;

    if (!clientId) {
      return reply.status(400).send({ error: 'Spotify Client ID is required before authorization.' });
    }

    const scopes = [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'playlist-read-private',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-library-read',
      'user-library-modify',
      'user-read-recently-played',
    ].join(' ');

    const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${encodeURIComponent(
      clientId
    )}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&show_dialog=true`;

    return reply.send({ authUrl, clientId, redirectUri });
  });

  // ── GET /api/v1/hermes/spotify/callback ──────────────────────────────────────
  fastify.get('/spotify/callback', async (request, reply) => {
    const query = (request.query as { code?: string; error?: string }) || {};

    if (query.error) {
      reply.type('text/html');
      return reply.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Spotify Connection Error</title></head>
          <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #090d16; color: #ef4444; margin: 0;">
            <div style="text-align: center; padding: 2rem; background: rgba(255,255,255,0.05); border-radius: 12px; border: 1px solid rgba(239,68,68,0.3);">
              <h2 style="margin: 0 0 10px;">❌ Authorization Rejected</h2>
              <p style="color: #9ca3af; font-size: 14px;">Error: ${query.error}</p>
            </div>
          </body>
        </html>
      `);
    }

    if (!query.code) {
      reply.type('text/html');
      return reply.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Missing Code</title></head>
          <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #090d16; color: #f59e0b; margin: 0;">
            <div style="text-align: center; padding: 2rem; background: rgba(255,255,255,0.05); border-radius: 12px; border: 1px solid rgba(245,158,11,0.3);">
              <h2>⚠️ Missing Authorization Code</h2>
            </div>
          </body>
        </html>
      `);
    }

    const settings = await getSpotifySettings();
    if (!settings || !settings.clientId) {
      reply.type('text/html');
      return reply.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Configuration Missing</title></head>
          <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #090d16; color: #ef4444; margin: 0;">
            <div style="text-align: center; padding: 2rem; background: rgba(255,255,255,0.05); border-radius: 12px;">
              <h2>❌ Client Credentials Not Saved</h2>
              <p style="color: #9ca3af;">Please save your Client ID and Client Secret in Hermes Settings first.</p>
            </div>
          </body>
        </html>
      `);
    }

    const host = request.headers.host || 'localhost:8080';
    const protocol = (request.headers['x-forwarded-proto'] as string) || 'http';
    const redirectUri = settings.redirectUri || `${protocol}://${host}/api/v1/hermes/spotify/callback`;

    try {
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code: query.code,
        redirect_uri: redirectUri,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      if (settings.clientSecret) {
        headers['Authorization'] = `Basic ${Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64')}`;
      } else {
        tokenBody.append('client_id', settings.clientId);
      }

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers,
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        const errJson: any = await tokenRes.json().catch(() => ({}));
        reply.type('text/html');
        return reply.send(`
          <!DOCTYPE html>
          <html>
            <head><title>Token Exchange Failed</title></head>
            <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #090d16; color: #ef4444; margin: 0;">
              <div style="text-align: center; padding: 2rem; background: rgba(255,255,255,0.05); border-radius: 12px; border: 1px solid rgba(239,68,68,0.3);">
                <h2>❌ Token Exchange Error</h2>
                <p style="color: #9ca3af;">${errJson.error_description || errJson.error || 'Failed to exchange code for access token'}</p>
              </div>
            </body>
          </html>
        `);
      }

      const tokenData: any = await tokenRes.json();
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

      await upsertSpotifySettings(settings.userId, {
        enabled: true,
        refreshToken: tokenData.refresh_token || settings.refreshToken,
        accessToken: tokenData.access_token,
        tokenExpiresAt: expiresAt,
        scope: tokenData.scope || settings.scope,
      });

      reply.type('text/html');
      return reply.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Spotify Connected</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0a0e1a; color: #fff; margin: 0; }
              .card { text-align: center; padding: 2.5rem 3rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 16px; backdrop-filter: blur(12px); max-width: 420px; }
              h2 { color: #10b981; margin: 0 0 10px; font-size: 22px; }
              p { color: #9ca3af; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
              .icon { font-size: 48px; margin-bottom: 12px; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">🎵</div>
              <h2>Spotify Connected Successfully!</h2>
              <p>Your Spotify account is now linked with Hermes Agent. This window will close automatically.</p>
              <script>
                if (window.opener) {
                  try { window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, '*'); } catch (e) {}
                }
                setTimeout(() => { window.close(); }, 2000);
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (err: any) {
      reply.type('text/html');
      return reply.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Spotify OAuth Error</title></head>
          <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #090d16; color: #ef4444; margin: 0;">
            <div style="text-align: center; padding: 2rem; background: rgba(255,255,255,0.05); border-radius: 12px;">
              <h2>❌ OAuth Callback Exception</h2>
              <p style="color: #9ca3af;">${err?.message || 'Unknown error occurred'}</p>
            </div>
          </body>
        </html>
      `);
    }
  });

  // ── GET /api/v1/hermes/spotify/devices ───────────────────────────────────────
  fastify.get('/spotify/devices', async (request, reply) => {
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}

    const settings = await getSpotifySettings(userId);
    if (!settings || (!settings.refreshToken && !settings.accessToken)) {
      return reply.status(400).send({ error: 'Spotify account is not connected yet.' });
    }

    let token = settings.accessToken;
    if (!token || !settings.tokenExpiresAt || new Date(settings.tokenExpiresAt).getTime() < Date.now() + 60000) {
      token = await refreshSpotifyAccessToken(settings);
    }

    if (!token) {
      return reply.status(401).send({ error: 'Failed to refresh Spotify access token.' });
    }

    try {
      const devRes = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!devRes.ok) {
        const errJson: any = await devRes.json().catch(() => ({}));
        return reply.status(devRes.status).send({ error: errJson?.error?.message || 'Failed to fetch Spotify devices' });
      }

      const devData: any = await devRes.json();
      return reply.send({ devices: devData.devices || [] });
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Failed to query Spotify API' });
    }
  });

  // ── POST /api/v1/hermes/spotify/test ────────────────────────────────────────
  fastify.post('/spotify/test', async (request, reply) => {
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}

    const settings = await getSpotifySettings(userId);
    if (!settings || (!settings.refreshToken && !settings.accessToken)) {
      return reply.send({ success: false, message: 'Spotify account is not connected yet.' });
    }

    let token = settings.accessToken;
    if (!token || !settings.tokenExpiresAt || new Date(settings.tokenExpiresAt).getTime() < Date.now() + 60000) {
      token = await refreshSpotifyAccessToken(settings);
    }

    if (!token) {
      return reply.send({ success: false, message: 'Failed to refresh Spotify access token.' });
    }

    try {
      const userRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!userRes.ok) {
        return reply.send({ success: false, message: `Spotify API check returned status ${userRes.status}` });
      }

      const userData: any = await userRes.json();
      return reply.send({
        success: true,
        message: `Connected to Spotify as ${userData.display_name || userData.id} (${userData.product || 'user'})`,
        user: {
          displayName: userData.display_name,
          email: userData.email,
          product: userData.product, // 'premium' or 'free'
          country: userData.country,
          id: userData.id,
        },
      });
    } catch (err: any) {
      return reply.send({ success: false, message: `Test failed: ${err?.message}` });
    }
  });

  // ── POST /api/v1/hermes/spotify/disconnect ──────────────────────────────────
  fastify.post('/spotify/disconnect', async (request, reply) => {
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}

    if (!userId) {
      const settings = await getSpotifySettings();
      if (settings) userId = settings.userId;
    }

    if (userId) {
      const saved = await upsertSpotifySettings(userId, {
        enabled: false,
        refreshToken: '',
        accessToken: '',
        tokenExpiresAt: undefined,
      });
      await syncSpotifyConfigToFiles(saved);
    }

    return reply.send({ success: true, message: 'Spotify account disconnected successfully.' });
  });

  // ── GET /api/v1/hermes/tts ──────────────────────────────────────────────────
  fastify.get('/tts', async (request, reply) => {
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}

    const settings = await getTtsSettings(userId);
    const result = settings || {
      enabled: true,
      provider: 'custom_openai',
      baseUrl: 'https://api.sat.ai/v1',
      apiKey: '',
      model: 'sat-tts-hd',
      voice: 'alloy',
      speed: 1.0,
      format: 'mp3',
      autoPlayInWebui: true,
    };

    return reply.send({
      ...result,
      apiKeySet: Boolean(result.apiKey),
      apiKey: result.apiKey ? '••••••••' : '',
    });
  });

  // ── PUT /api/v1/hermes/tts & POST /api/v1/hermes/tts ───────────────────────
  const saveTtsHandler = async (request: any, reply: any) => {
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}

    if (!userId) {
      const existing = await getTtsSettings();
      if (existing) userId = existing.userId;
    }

    if (!userId) {
      const { getDb } = await import('../db/index.js');
      const { users } = await import('../db/schema.js');
      const [firstUser] = await getDb().select().from(users).limit(1);
      if (firstUser) userId = firstUser.id;
    }

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized: User ID required to save settings' });
    }

    const body = (request.body as Record<string, any>) || {};
    const existing = await getTtsSettings(userId);

    let apiKey = body.apiKey;
    if (apiKey === '••••••••' || apiKey === '' || apiKey === undefined) {
      apiKey = existing?.apiKey || '';
    }

    const saved = await upsertTtsSettings(userId, {
      enabled: body.enabled ?? true,
      provider: body.provider || 'custom_openai',
      baseUrl: body.baseUrl || 'https://api.sat.ai/v1',
      apiKey,
      model: body.model || 'sat-tts-hd',
      voice: body.voice || 'alloy',
      speed: body.speed !== undefined ? Number(body.speed) : 1.0,
      format: body.format || 'mp3',
      autoPlayInWebui: body.autoPlayInWebui ?? true,
    });

    await syncTtsConfigToFiles(saved);

    return reply.send({
      success: true,
      message: 'Voice & TTS configuration saved and synced to ~/.hermes state files.',
      settings: {
        ...saved,
        apiKeySet: Boolean(saved.apiKey),
        apiKey: saved.apiKey ? '••••••••' : '',
      },
    });
  };

  fastify.put('/tts', saveTtsHandler);
  fastify.post('/tts', saveTtsHandler);

  // ── GET /api/v1/hermes/tts/models ───────────────────────────────────────────
  fastify.get('/tts/models', async (request, reply) => {
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}

    const query = (request.query as Record<string, string>) || {};
    let baseUrl = query.baseUrl;
    let apiKey = query.apiKey;

    const existing = await getTtsSettings(userId);
    if (!baseUrl) baseUrl = existing?.baseUrl || 'https://api.sat.ai/v1';
    if (!apiKey || apiKey === '••••••••') apiKey = existing?.apiKey || '';

    try {
      const models = await discoverTtsModels(baseUrl, apiKey);
      return reply.send({ success: true, baseUrl, models });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err?.response?.data?.error?.message || err?.message || 'Failed to discover TTS models from endpoint',
      });
    }
  });

  // ── POST /api/v1/hermes/tts/preview ─────────────────────────────────────────
  fastify.post('/tts/preview', async (request, reply) => {
    let userId: string | undefined;
    try {
      const payload = verifyToken(
        (request.cookies as Record<string, string | undefined>)?.access_token ??
        request.headers.authorization?.slice(7) ?? '',
      );
      userId = payload?.sub;
    } catch {}

    const body = (request.body as Record<string, any>) || {};
    const existing = await getTtsSettings(userId);

    let baseUrl = body.baseUrl || existing?.baseUrl || 'https://api.sat.ai/v1';
    let apiKey = body.apiKey;
    if (!apiKey || apiKey === '••••••••') apiKey = existing?.apiKey || '';

    try {
      const result = await generateTtsAudioPreview({
        baseUrl,
        apiKey,
        model: body.model || existing?.model || 'sat-tts-hd',
        voice: body.voice || existing?.voice || 'alloy',
        speed: body.speed !== undefined ? Number(body.speed) : existing?.speed || 1.0,
        text: body.text || 'Hello! Voice and Text to Speech synthesis is successfully configured on Hermes Agent.',
        format: body.format || existing?.format || 'mp3',
      });

      return reply.send({
        success: true,
        audioDataUrl: result.audioDataUrl,
        contentType: result.contentType,
      });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err?.response?.data?.error?.message || err?.message || 'Speech generation preview failed',
      });
    }
  });
}
