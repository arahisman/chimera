import { describe, expect, test } from 'bun:test'
import {
  getConnectedExternalProviderIds,
  getModelsDevExternalModelOptions,
} from './modelsDev.js'

const fakeModelsDev = {
  openai: {
    name: 'OpenAI',
    models: {
      'gpt-5.5': {
        id: 'gpt-5.5',
        name: 'GPT-5.5',
        limit: { context: 400000, output: 128000 },
      },
      'gpt-5.4-mini': {
        id: 'gpt-5.4-mini',
        name: 'GPT-5.4 Mini',
        limit: { context: 400000, output: 128000 },
      },
    },
  },
  openrouter: {
    name: 'OpenRouter',
    models: {
      'anthropic/claude-sonnet-4.5': {
        id: 'anthropic/claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        limit: { context: 200000, output: 64000 },
      },
    },
  },
  groq: {
    name: 'Groq',
    models: {
      'llama-3.3-70b-versatile': {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile',
      },
    },
  },
}

describe('models.dev provider model discovery', () => {
  test('detects providers connected by saved API key, env key, and auth token', () => {
    expect(
      getConnectedExternalProviderIds(
        {
          openai: { options: { apiKey: 'sk-test' } },
          'github-copilot': { options: { accessToken: 'ghu-test' } },
        },
        {
          GROQ_API_KEY: 'gsk-test',
        },
      ),
    ).toEqual(['github-copilot', 'groq', 'openai'])
  })

  test('builds selector options for every model on connected providers', () => {
    expect(
      getModelsDevExternalModelOptions(
        fakeModelsDev,
        {
          openai: { options: { apiKey: 'sk-test' } },
          openrouter: { options: { apiKey: 'sk-openrouter' } },
        },
        {},
      ),
    ).toEqual([
      {
        value: 'openai/gpt-5.5',
        label: 'GPT-5.5',
        description: 'OpenAI · gpt-5.5 · 400k context',
      },
      {
        value: 'openai/gpt-5.4-mini',
        label: 'GPT-5.4 Mini',
        description: 'OpenAI · gpt-5.4-mini · 400k context',
      },
      {
        value: 'openrouter/anthropic/claude-sonnet-4.5',
        label: 'Claude Sonnet 4.5',
        description:
          'OpenRouter · anthropic/claude-sonnet-4.5 · 200k context',
      },
    ])
  })
})
