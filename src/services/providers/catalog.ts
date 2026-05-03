export type ExternalProviderAuthMethod =
  | 'api-key'
  | 'oauth'
  | 'subscription'
  | 'cloud-credentials'
  | 'local'

export type ExternalProviderInfo = {
  id: string
  name: string
  env: readonly string[]
  npm?: string
  api?: string
  authMethods: readonly ExternalProviderAuthMethod[]
}

export type ProviderModelSelection = {
  providerId: string
  modelId: string
}

export type ResolvedModelSelection = ProviderModelSelection & {
  source: 'codex-default' | 'external-provider'
}

export type ExternalProviderModelConfig = {
  name?: string
}

export type ExternalProviderConfig = {
  api?: string
  env?: string[]
  name?: string
  npm?: string
  options?: Record<string, unknown>
  models?: Record<string, ExternalProviderModelConfig>
}

export type ExternalProviderModelOption = {
  value: string
  label: string
  description: string
}

const OPENAI_COMPATIBLE = '@ai-sdk/openai-compatible'

// Derived from OpenCode's models.dev fixture and bundled provider metadata.
// Keep this file data-only: runtime SDK loading lives in the next provider layer.
const PROVIDERS = [
  p('302ai', '302.AI', ['302AI_API_KEY'], OPENAI_COMPATIBLE, 'https://api.302.ai/v1'),
  p('abacus', 'Abacus', ['ABACUS_API_KEY'], OPENAI_COMPATIBLE, 'https://routellm.abacus.ai/v1'),
  p('aihubmix', 'AIHubMix', ['AIHUBMIX_API_KEY'], OPENAI_COMPATIBLE, 'https://aihubmix.com/v1'),
  p('alibaba', 'Alibaba', ['DASHSCOPE_API_KEY'], OPENAI_COMPATIBLE, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'),
  p('alibaba-cn', 'Alibaba (China)', ['DASHSCOPE_API_KEY'], OPENAI_COMPATIBLE, 'https://dashscope.aliyuncs.com/compatible-mode/v1'),
  p('alibaba-coding-plan', 'Alibaba Coding Plan', ['ALIBABA_CODING_PLAN_API_KEY'], OPENAI_COMPATIBLE, 'https://coding-intl.dashscope.aliyuncs.com/v1', ['api-key', 'subscription']),
  p('alibaba-coding-plan-cn', 'Alibaba Coding Plan (China)', ['ALIBABA_CODING_PLAN_API_KEY'], OPENAI_COMPATIBLE, 'https://coding.dashscope.aliyuncs.com/v1', ['api-key', 'subscription']),
  p('amazon-bedrock', 'Amazon Bedrock', ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_BEARER_TOKEN_BEDROCK'], '@ai-sdk/amazon-bedrock', undefined, ['cloud-credentials', 'api-key']),
  p('anthropic', 'Anthropic', ['ANTHROPIC_API_KEY'], '@ai-sdk/anthropic'),
  p('azure', 'Azure', ['AZURE_RESOURCE_NAME', 'AZURE_API_KEY'], '@ai-sdk/azure', undefined, ['api-key', 'oauth']),
  p('azure-cognitive-services', 'Azure Cognitive Services', ['AZURE_COGNITIVE_SERVICES_RESOURCE_NAME', 'AZURE_COGNITIVE_SERVICES_API_KEY'], '@ai-sdk/azure'),
  p('bailing', 'Bailing', ['BAILING_API_TOKEN'], OPENAI_COMPATIBLE, 'https://api.tbox.cn/api/llm/v1/chat/completions'),
  p('baseten', 'Baseten', ['BASETEN_API_KEY'], OPENAI_COMPATIBLE, 'https://inference.baseten.co/v1'),
  p('berget', 'Berget.AI', ['BERGET_API_KEY'], OPENAI_COMPATIBLE, 'https://api.berget.ai/v1'),
  p('cerebras', 'Cerebras', ['CEREBRAS_API_KEY'], '@ai-sdk/cerebras'),
  p('chutes', 'Chutes', ['CHUTES_API_KEY'], OPENAI_COMPATIBLE, 'https://llm.chutes.ai/v1'),
  p('clarifai', 'Clarifai', ['CLARIFAI_PAT'], OPENAI_COMPATIBLE, 'https://api.clarifai.com/v2/ext/openai/v1'),
  p('cloudferro-sherlock', 'CloudFerro Sherlock', ['CLOUDFERRO_SHERLOCK_API_KEY'], OPENAI_COMPATIBLE, 'https://api-sherlock.cloudferro.com/openai/v1/'),
  p('cloudflare-ai-gateway', 'Cloudflare AI Gateway', ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_GATEWAY_ID'], 'ai-gateway-provider'),
  p('cloudflare-workers-ai', 'Cloudflare Workers AI', ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_KEY'], OPENAI_COMPATIBLE, 'https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1'),
  p('cohere', 'Cohere', ['COHERE_API_KEY'], '@ai-sdk/cohere'),
  p('cortecs', 'Cortecs', ['CORTECS_API_KEY'], OPENAI_COMPATIBLE, 'https://api.cortecs.ai/v1'),
  p('deepinfra', 'Deep Infra', ['DEEPINFRA_API_KEY'], '@ai-sdk/deepinfra'),
  p('deepseek', 'DeepSeek', ['DEEPSEEK_API_KEY'], OPENAI_COMPATIBLE, 'https://api.deepseek.com'),
  p('dinference', 'DInference', ['DINFERENCE_API_KEY'], OPENAI_COMPATIBLE, 'https://api.dinference.com/v1'),
  p('drun', 'D.Run (China)', ['DRUN_API_KEY'], OPENAI_COMPATIBLE, 'https://chat.d.run/v1'),
  p('evroc', 'evroc', ['EVROC_API_KEY'], OPENAI_COMPATIBLE, 'https://models.think.evroc.com/v1'),
  p('fastrouter', 'FastRouter', ['FASTROUTER_API_KEY'], OPENAI_COMPATIBLE, 'https://go.fastrouter.ai/api/v1'),
  p('fireworks-ai', 'Fireworks AI', ['FIREWORKS_API_KEY'], OPENAI_COMPATIBLE, 'https://api.fireworks.ai/inference/v1/'),
  p('firmware', 'Firmware', ['FIRMWARE_API_KEY'], OPENAI_COMPATIBLE, 'https://app.frogbot.ai/api/v1'),
  p('friendli', 'Friendli', ['FRIENDLI_TOKEN'], OPENAI_COMPATIBLE, 'https://api.friendli.ai/serverless/v1'),
  p('github-copilot', 'GitHub Copilot', ['GITHUB_TOKEN'], '@ai-sdk/github-copilot', 'https://api.githubcopilot.com', ['oauth', 'subscription', 'api-key']),
  p('github-models', 'GitHub Models', ['GITHUB_TOKEN'], OPENAI_COMPATIBLE, 'https://models.github.ai/inference', ['oauth', 'api-key']),
  p('gitlab', 'GitLab Duo', ['GITLAB_TOKEN'], 'gitlab-ai-provider', undefined, ['oauth', 'subscription', 'api-key']),
  p('google', 'Google', ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'], '@ai-sdk/google'),
  p('google-vertex', 'Vertex', ['GOOGLE_VERTEX_PROJECT', 'GOOGLE_VERTEX_LOCATION', 'GOOGLE_APPLICATION_CREDENTIALS'], '@ai-sdk/google-vertex', undefined, ['cloud-credentials']),
  p('google-vertex-anthropic', 'Vertex (Anthropic)', ['GOOGLE_VERTEX_PROJECT', 'GOOGLE_VERTEX_LOCATION', 'GOOGLE_APPLICATION_CREDENTIALS'], '@ai-sdk/google-vertex/anthropic', undefined, ['cloud-credentials']),
  p('groq', 'Groq', ['GROQ_API_KEY'], '@ai-sdk/groq'),
  p('helicone', 'Helicone', ['HELICONE_API_KEY'], OPENAI_COMPATIBLE, 'https://ai-gateway.helicone.ai/v1'),
  p('huggingface', 'Hugging Face', ['HF_TOKEN'], OPENAI_COMPATIBLE, 'https://router.huggingface.co/v1'),
  p('iflowcn', 'iFlow', ['IFLOW_API_KEY'], OPENAI_COMPATIBLE, 'https://apis.iflow.cn/v1'),
  p('inception', 'Inception', ['INCEPTION_API_KEY'], OPENAI_COMPATIBLE, 'https://api.inceptionlabs.ai/v1/'),
  p('inference', 'Inference', ['INFERENCE_API_KEY'], OPENAI_COMPATIBLE, 'https://inference.net/v1'),
  p('io-net', 'IO.NET', ['IOINTELLIGENCE_API_KEY'], OPENAI_COMPATIBLE, 'https://api.intelligence.io.solutions/api/v1'),
  p('jiekou', 'Jiekou.AI', ['JIEKOU_API_KEY'], OPENAI_COMPATIBLE, 'https://api.jiekou.ai/openai'),
  p('kilo', 'Kilo Gateway', ['KILO_API_KEY'], OPENAI_COMPATIBLE, 'https://api.kilo.ai/api/gateway', ['api-key', 'subscription']),
  p('kimi-for-coding', 'Kimi For Coding', ['KIMI_API_KEY'], '@ai-sdk/anthropic', 'https://api.kimi.com/coding/v1'),
  p('kuae-cloud-coding-plan', 'KUAE Cloud Coding Plan', ['KUAE_API_KEY'], OPENAI_COMPATIBLE, 'https://coding-plan-endpoint.kuaecloud.net/v1', ['api-key', 'subscription']),
  p('llama', 'Llama', ['LLAMA_API_KEY'], OPENAI_COMPATIBLE, 'https://api.llama.com/compat/v1/'),
  p('llmgateway', 'LLM Gateway', ['LLMGATEWAY_API_KEY'], OPENAI_COMPATIBLE, 'https://api.llmgateway.io/v1'),
  p('lmstudio', 'LMStudio', ['LMSTUDIO_API_KEY'], OPENAI_COMPATIBLE, 'http://127.0.0.1:1234/v1', ['local', 'api-key']),
  p('lucidquery', 'LucidQuery AI', ['LUCIDQUERY_API_KEY'], OPENAI_COMPATIBLE, 'https://lucidquery.com/api/v1'),
  p('meganova', 'Meganova', ['MEGANOVA_API_KEY'], OPENAI_COMPATIBLE, 'https://api.meganova.ai/v1'),
  p('minimax', 'MiniMax (minimax.io)', ['MINIMAX_API_KEY'], '@ai-sdk/anthropic', 'https://api.minimax.io/anthropic/v1'),
  p('minimax-cn', 'MiniMax (minimaxi.com)', ['MINIMAX_API_KEY'], '@ai-sdk/anthropic', 'https://api.minimaxi.com/anthropic/v1'),
  p('minimax-cn-coding-plan', 'MiniMax Coding Plan (minimaxi.com)', ['MINIMAX_API_KEY'], '@ai-sdk/anthropic', 'https://api.minimaxi.com/anthropic/v1', ['api-key', 'subscription']),
  p('minimax-coding-plan', 'MiniMax Coding Plan (minimax.io)', ['MINIMAX_API_KEY'], '@ai-sdk/anthropic', 'https://api.minimax.io/anthropic/v1', ['api-key', 'subscription']),
  p('mistral', 'Mistral', ['MISTRAL_API_KEY'], '@ai-sdk/mistral'),
  p('moark', 'Moark', ['MOARK_API_KEY'], OPENAI_COMPATIBLE, 'https://moark.com/v1'),
  p('modelscope', 'ModelScope', ['MODELSCOPE_API_KEY'], OPENAI_COMPATIBLE, 'https://api-inference.modelscope.cn/v1'),
  p('moonshotai', 'Moonshot AI', ['MOONSHOT_API_KEY'], OPENAI_COMPATIBLE, 'https://api.moonshot.ai/v1'),
  p('moonshotai-cn', 'Moonshot AI (China)', ['MOONSHOT_API_KEY'], OPENAI_COMPATIBLE, 'https://api.moonshot.cn/v1'),
  p('morph', 'Morph', ['MORPH_API_KEY'], OPENAI_COMPATIBLE, 'https://api.morphllm.com/v1'),
  p('nano-gpt', 'NanoGPT', ['NANO_GPT_API_KEY'], OPENAI_COMPATIBLE, 'https://nano-gpt.com/api/v1'),
  p('nebius', 'Nebius Token Factory', ['NEBIUS_API_KEY'], OPENAI_COMPATIBLE, 'https://api.tokenfactory.nebius.com/v1'),
  p('nova', 'Nova', ['NOVA_API_KEY'], OPENAI_COMPATIBLE, 'https://api.nova.amazon.com/v1'),
  p('novita-ai', 'NovitaAI', ['NOVITA_API_KEY'], OPENAI_COMPATIBLE, 'https://api.novita.ai/openai'),
  p('nvidia', 'Nvidia', ['NVIDIA_API_KEY'], OPENAI_COMPATIBLE, 'https://integrate.api.nvidia.com/v1'),
  p('ollama-cloud', 'Ollama Cloud', ['OLLAMA_API_KEY'], OPENAI_COMPATIBLE, 'https://ollama.com/v1'),
  p('openai', 'OpenAI', ['OPENAI_API_KEY'], '@ai-sdk/openai'),
  p('opencode', 'OpenCode Zen', ['OPENCODE_API_KEY'], OPENAI_COMPATIBLE, 'https://opencode.ai/zen/v1', ['api-key', 'subscription']),
  p('opencode-go', 'OpenCode Go', ['OPENCODE_API_KEY'], OPENAI_COMPATIBLE, 'https://opencode.ai/zen/go/v1', ['api-key', 'subscription']),
  p('openrouter', 'OpenRouter', ['OPENROUTER_API_KEY'], '@openrouter/ai-sdk-provider', 'https://openrouter.ai/api/v1'),
  p('ovhcloud', 'OVHcloud AI Endpoints', ['OVHCLOUD_API_KEY'], OPENAI_COMPATIBLE, 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1'),
  p('perplexity', 'Perplexity', ['PERPLEXITY_API_KEY'], '@ai-sdk/perplexity'),
  p('perplexity-agent', 'Perplexity Agent', ['PERPLEXITY_API_KEY'], '@ai-sdk/openai', 'https://api.perplexity.ai/v1'),
  p('poe', 'Poe', ['POE_API_KEY'], OPENAI_COMPATIBLE, 'https://api.poe.com/v1', ['api-key', 'subscription']),
  p('privatemode-ai', 'Privatemode AI', ['PRIVATEMODE_API_KEY', 'PRIVATEMODE_ENDPOINT'], OPENAI_COMPATIBLE, 'http://localhost:8080/v1'),
  p('qihang-ai', 'QiHang', ['QIHANG_API_KEY'], OPENAI_COMPATIBLE, 'https://api.qhaigc.net/v1'),
  p('qiniu-ai', 'Qiniu', ['QINIU_API_KEY'], OPENAI_COMPATIBLE, 'https://api.qnaigc.com/v1'),
  p('requesty', 'Requesty', ['REQUESTY_API_KEY'], OPENAI_COMPATIBLE, 'https://router.requesty.ai/v1'),
  p('sap-ai-core', 'SAP AI Core', ['AICORE_SERVICE_KEY'], '@jerome-benoit/sap-ai-provider-v2'),
  p('scaleway', 'Scaleway', ['SCALEWAY_API_KEY'], OPENAI_COMPATIBLE, 'https://api.scaleway.ai/v1'),
  p('siliconflow', 'SiliconFlow', ['SILICONFLOW_API_KEY'], OPENAI_COMPATIBLE, 'https://api.siliconflow.com/v1'),
  p('siliconflow-cn', 'SiliconFlow (China)', ['SILICONFLOW_CN_API_KEY'], OPENAI_COMPATIBLE, 'https://api.siliconflow.cn/v1'),
  p('stackit', 'STACKIT', ['STACKIT_API_KEY'], OPENAI_COMPATIBLE, 'https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1'),
  p('stepfun', 'StepFun', ['STEPFUN_API_KEY'], OPENAI_COMPATIBLE, 'https://api.stepfun.com/v1'),
  p('submodel', 'submodel', ['SUBMODEL_INSTAGEN_ACCESS_KEY'], OPENAI_COMPATIBLE, 'https://llm.submodel.ai/v1'),
  p('synthetic', 'Synthetic', ['SYNTHETIC_API_KEY'], OPENAI_COMPATIBLE, 'https://api.synthetic.new/openai/v1'),
  p('tencent-coding-plan', 'Tencent Coding Plan (China)', ['TENCENT_CODING_PLAN_API_KEY'], OPENAI_COMPATIBLE, 'https://api.lkeap.cloud.tencent.com/coding/v3', ['api-key', 'subscription']),
  p('togetherai', 'Together AI', ['TOGETHER_API_KEY'], '@ai-sdk/togetherai'),
  p('upstage', 'Upstage', ['UPSTAGE_API_KEY'], OPENAI_COMPATIBLE, 'https://api.upstage.ai/v1/solar'),
  p('v0', 'v0', ['V0_API_KEY'], '@ai-sdk/vercel'),
  p('venice', 'Venice AI', ['VENICE_API_KEY'], 'venice-ai-sdk-provider'),
  p('vercel', 'Vercel AI Gateway', ['AI_GATEWAY_API_KEY'], '@ai-sdk/gateway'),
  p('vivgrid', 'Vivgrid', ['VIVGRID_API_KEY'], '@ai-sdk/openai', 'https://api.vivgrid.com/v1'),
  p('vultr', 'Vultr', ['VULTR_API_KEY'], OPENAI_COMPATIBLE, 'https://api.vultrinference.com/v1'),
  p('wandb', 'Weights & Biases', ['WANDB_API_KEY'], OPENAI_COMPATIBLE, 'https://api.inference.wandb.ai/v1'),
  p('xai', 'xAI', ['XAI_API_KEY'], '@ai-sdk/xai'),
  p('xiaomi', 'Xiaomi', ['XIAOMI_API_KEY'], OPENAI_COMPATIBLE, 'https://api.xiaomimimo.com/v1'),
  p('zai', 'Z.AI', ['ZHIPU_API_KEY'], OPENAI_COMPATIBLE, 'https://api.z.ai/api/paas/v4'),
  p('zai-coding-plan', 'Z.AI Coding Plan', ['ZHIPU_API_KEY'], OPENAI_COMPATIBLE, 'https://api.z.ai/api/coding/paas/v4', ['api-key', 'subscription']),
  p('zenmux', 'ZenMux', ['ZENMUX_API_KEY'], OPENAI_COMPATIBLE, 'https://zenmux.ai/api/v1'),
  p('zhipuai', 'Zhipu AI', ['ZHIPU_API_KEY'], OPENAI_COMPATIBLE, 'https://open.bigmodel.cn/api/paas/v4'),
  p('zhipuai-coding-plan', 'Zhipu AI Coding Plan', ['ZHIPU_API_KEY'], OPENAI_COMPATIBLE, 'https://open.bigmodel.cn/api/coding/paas/v4', ['api-key', 'subscription']),
] as const satisfies readonly ExternalProviderInfo[]

const PROVIDER_IDS = new Set(PROVIDERS.map(provider => provider.id))

function p(
  id: string,
  name: string,
  env: readonly string[],
  npm?: string,
  api?: string,
  authMethods: readonly ExternalProviderAuthMethod[] = ['api-key'],
): ExternalProviderInfo {
  return { id, name, env, npm, api, authMethods }
}

export function getProviderCatalog(): readonly ExternalProviderInfo[] {
  return PROVIDERS
}

export function getProviderInfo(
  providerId: string,
): ExternalProviderInfo | undefined {
  const normalized = normalizeProviderId(providerId)
  return PROVIDERS.find(provider => provider.id === normalized)
}

export function isKnownProviderId(providerId: string): boolean {
  return PROVIDER_IDS.has(normalizeProviderId(providerId))
}

export function parseProviderModel(
  input: string,
): ProviderModelSelection | null {
  const trimmed = input.trim()
  const separator = trimmed.indexOf('/')
  if (separator <= 0 || separator === trimmed.length - 1) {
    return null
  }

  const providerId = normalizeProviderId(trimmed.slice(0, separator))
  if (!isKnownProviderId(providerId)) {
    return null
  }

  return {
    providerId,
    modelId: trimmed.slice(separator + 1).trim(),
  }
}

export function resolveModelSelection(input: string): ResolvedModelSelection {
  const external = parseProviderModel(input)
  if (external) {
    return {
      ...external,
      source: 'external-provider',
    }
  }

  return {
    providerId: 'codex',
    modelId: input.trim().toLowerCase(),
    source: 'codex-default',
  }
}

export function isExternalProviderModel(input: string): boolean {
  return parseProviderModel(input) !== null
}

export function getConfiguredExternalModelOptions(
  providers: Record<string, ExternalProviderConfig> | undefined,
): ExternalProviderModelOption[] {
  if (!providers) return []

  const options: ExternalProviderModelOption[] = []
  for (const [rawProviderId, providerConfig] of Object.entries(providers)) {
    const providerId = normalizeProviderId(rawProviderId)
    const provider = getProviderInfo(providerId)
    if (!provider || !providerConfig.models) continue

    for (const [modelId, modelConfig] of Object.entries(
      providerConfig.models,
    )) {
      options.push({
        value: `${provider.id}/${modelId}`,
        label: modelConfig.name ?? modelId,
        description: `${providerConfig.name ?? provider.name} · ${modelId}`,
      })
    }
  }

  return options
}

function normalizeProviderId(providerId: string): string {
  return providerId.trim().toLowerCase()
}
