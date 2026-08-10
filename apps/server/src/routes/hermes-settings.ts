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
}
