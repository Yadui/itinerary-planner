import Anthropic from '@anthropic-ai/sdk';
import { AzureOpenAI } from 'openai';
import 'dotenv/config';

let anthropic = null;
let azure = null;

function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

function getAzure() {
  if (!process.env.AZURE_ENDPOINT || !process.env.AZURE_API_KEY) return null;
  if (!azure) {
    const endpoint = process.env.AZURE_ENDPOINT.replace(/\/+$/, '');
    azure = new AzureOpenAI({
      endpoint,
      apiKey: process.env.AZURE_API_KEY,
      apiVersion: process.env.AZURE_API_VERSION || '2025-01-01-preview',
      deployment: process.env.AZURE_MODEL || 'gpt-4.1',
    });
  }
  return azure;
}

/**
 * Send a message to the best available AI provider.
 * Tries Claude first, falls back to Azure OpenAI.
 *
 * @param {object} opts
 * @param {string} opts.prompt - user message
 * @param {string} [opts.system] - system message
 * @param {number} [opts.maxTokens] - max response tokens
 * @returns {{ text: string, provider: string }}
 */
export async function aiChat({ prompt, system, maxTokens = 2048 }) {
  const errors = [];

  // Try Claude first
  const claude = getAnthropic();
  if (claude) {
    try {
      const params = {
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      };
      if (system) params.system = system;

      const res = await claude.messages.create(params);
      return { text: res.content[0].text, provider: 'claude' };
    } catch (err) {
      console.warn('Claude failed, trying Azure:', err.message);
      errors.push(`Claude: ${err.message}`);
    }
  }

  // Fallback to Azure OpenAI
  const azureClient = getAzure();
  if (azureClient) {
    try {
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });

      const res = await azureClient.chat.completions.create({
        model: process.env.AZURE_MODEL || 'gpt-4.1',
        max_tokens: maxTokens,
        messages,
      });
      return { text: res.choices[0].message.content, provider: 'azure' };
    } catch (err) {
      console.warn('Azure failed:', err.message);
      errors.push(`Azure: ${err.message}`);
    }
  }

  throw new Error(`All AI providers failed. ${errors.join('; ') || 'No providers configured (set ANTHROPIC_API_KEY or AZURE_ENDPOINT + AZURE_API_KEY)'}`);
}

/**
 * Check which providers are available and working.
 */
export async function checkProviders() {
  const results = { claude: { ok: false }, azure: { ok: false } };

  const claude = getAnthropic();
  if (claude) {
    try {
      await claude.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      results.claude = { ok: true };
    } catch (err) {
      results.claude = { ok: false, error: err.message };
    }
  } else {
    results.claude = { ok: false, error: 'API key not configured' };
  }

  const azureClient = getAzure();
  if (azureClient) {
    try {
      await azureClient.chat.completions.create({
        model: process.env.AZURE_MODEL || 'gpt-4.1',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      results.azure = { ok: true };
    } catch (err) {
      results.azure = { ok: false, error: err.message };
    }
  } else {
    results.azure = { ok: false, error: 'Not configured' };
  }

  return results;
}
