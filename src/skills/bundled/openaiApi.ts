import { readdir } from 'fs/promises'
import { getCwd } from '../../utils/cwd.js'
import { registerBundledSkill } from '../bundledSkills.js'

type DetectedLanguage = 'python' | 'typescript' | 'curl'

const LANGUAGE_INDICATORS: Record<DetectedLanguage, string[]> = {
  python: ['.py', 'requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
  typescript: ['.ts', '.tsx', 'tsconfig.json', 'package.json'],
  curl: [],
}

async function detectLanguage(): Promise<DetectedLanguage> {
  let entries: string[]
  try {
    entries = await readdir(getCwd())
  } catch {
    return 'typescript'
  }

  for (const [lang, indicators] of Object.entries(LANGUAGE_INDICATORS) as [
    DetectedLanguage,
    string[],
  ][]) {
    if (indicators.some(indicator =>
      indicator.startsWith('.')
        ? entries.some(entry => entry.endsWith(indicator))
        : entries.includes(indicator),
    )) {
      return lang
    }
  }
  return 'typescript'
}

function buildPrompt(lang: DetectedLanguage, args: string): string {
  const examples =
    lang === 'python'
      ? PYTHON_EXAMPLES
      : lang === 'curl'
        ? CURL_EXAMPLES
        : TYPESCRIPT_EXAMPLES

  return [
    `# OpenAI API Skill

Use this skill when the user wants to build, debug, or migrate code that uses the OpenAI API, the Responses API, OpenAI tools, or Chimera/Codex-compatible model calls.

Prefer the Responses API for new work. It supports text and image input, text output, conversation state, function calling, and built-in tools such as web search, file search, and computer use. Use Chat Completions only when maintaining legacy code.

Model guidance for this Chimera build:

- Use real OpenAI model IDs, for example \`gpt-5.5\`, \`gpt-5.4\`, \`gpt-5.3\`, and their documented variants.
- Do not use Claude, Anthropic, Sonnet, Opus, or Haiku aliases.
- If the code is using ChatGPT/Codex OAuth through Chimera, do not ask the user for an API key unless they are explicitly building a standalone OpenAI API application.
- For standalone API apps, use \`OPENAI_API_KEY\` and the official OpenAI SDK.

Official docs to prefer when live details matter:

- Responses API: https://platform.openai.com/docs/api-reference/responses
- Tools overview: https://platform.openai.com/docs/guides/tools
- Function calling: https://platform.openai.com/docs/guides/function-calling
- Web search: https://platform.openai.com/docs/guides/tools-web-search
- Image input: https://platform.openai.com/docs/guides/images-vision

## Implementation Checklist

1. Identify whether the app is using standalone OpenAI API keys or Chimera/Codex OAuth.
2. Use \`client.responses.create(...)\` for new calls.
3. Define function tools with strict JSON schemas when the model needs local code.
4. Return tool outputs as \`function_call_output\` items and continue the response loop.
5. Use \`web_search\` only when fresh internet data is required.
6. Preserve citations from web search annotations in user-visible output.
7. Keep secrets in environment variables, never in source files.

## ${lang} Examples

${examples}`,
    args ? `## User Request\n\n${args}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

const TYPESCRIPT_EXAMPLES = `\`\`\`ts
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await client.responses.create({
  model: "gpt-5.5",
  input: "Summarize the important risks in this diff.",
});

console.log(response.output_text);
\`\`\`

\`\`\`ts
const response = await client.responses.create({
  model: "gpt-5.5",
  tools: [{ type: "web_search" }],
  input: "Find the latest OpenAI Responses API function calling docs and cite sources.",
});
\`\`\`

\`\`\`ts
const response = await client.responses.create({
  model: "gpt-5.5",
  tools: [{
    type: "function",
    name: "lookup_issue",
    description: "Look up an issue by id",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  }],
  input: "What is the status of issue CHIM-42?",
});
\`\`\``

const PYTHON_EXAMPLES = `\`\`\`py
from openai import OpenAI

client = OpenAI()

response = client.responses.create(
    model="gpt-5.5",
    input="Summarize the important risks in this diff.",
)

print(response.output_text)
\`\`\`

\`\`\`py
response = client.responses.create(
    model="gpt-5.5",
    tools=[{"type": "web_search"}],
    input="Find the latest OpenAI Responses API function calling docs and cite sources.",
)
\`\`\``

const CURL_EXAMPLES = `\`\`\`sh
curl https://api.openai.com/v1/responses \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.5",
    "input": "Summarize the important risks in this diff."
  }'
\`\`\`

\`\`\`sh
curl https://api.openai.com/v1/responses \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.5",
    "tools": [{ "type": "web_search" }],
    "input": "Find fresh sources for the current OpenAI Responses API."
  }'
\`\`\``

export function registerOpenAIApiSkill(): void {
  registerBundledSkill({
    name: 'openai-api',
    description:
      'Build apps with the OpenAI Responses API, OpenAI SDKs, tools, web search, image input, or Chimera/Codex-compatible model calls.',
    aliases: ['responses-api', 'openai'],
    allowedTools: ['Read', 'Grep', 'Glob', 'WebFetch'],
    userInvocable: true,
    async getPromptForCommand(args) {
      return [{ type: 'text', text: buildPrompt(await detectLanguage(), args) }]
    },
  })
}
