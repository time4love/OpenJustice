import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

// ---------------------------------------------------------------------------
// Supported provider union — both classes are structurally compatible:
// they share withStructuredOutput() (for IntakeAgent / LegalMasterAgent)
// and invoke() (for TrustAgent).
// ---------------------------------------------------------------------------

export type FactoryChatModel = ChatAnthropic | ChatGoogleGenerativeAI;

// ---------------------------------------------------------------------------
// Default model names — can be overridden via env vars if needed
// ---------------------------------------------------------------------------

const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// LLMFactory
//
// Usage:
//   LLMFactory.getChatModel('INTAKE')           → reads INTAKE_PROVIDER
//   LLMFactory.getChatModel('LEGAL', { temperature: 0.2 })
//   LLMFactory.getChatModel('TRUST', { temperature: 0.7 })
//
// Provider resolution (case-insensitive):
//   INTAKE_PROVIDER=anthropic  →  ChatAnthropic (claude-sonnet-4-6)
//   INTAKE_PROVIDER=gemini     →  ChatGoogleGenerativeAI (gemini-flash-latest)
//   (unset)                    →  ChatGoogleGenerativeAI  ← default
//
// To swap an agent back to Anthropic at any time, simply set:
//   INTAKE_PROVIDER=anthropic
// in your .env — no code change required.
// ---------------------------------------------------------------------------

/**
 * Which model an agent type resolves to right now, as `provider:model`.
 *
 * Exists so a stored LLM-derived value can record WHAT JUDGED IT. classifierVersion
 * names the procedure and classifierPromptHash proves the prompt text — neither can
 * see the model. A corpus judged partly by Gemini and partly by Claude would carry
 * byte-identical provenance, which is the same defect as two code paths feeding the
 * classifier different input under one version string.
 *
 * Derived from the same env lookup getChatModel performs, and deliberately not a
 * second copy of that logic: if the two could disagree, the recorded model would be
 * a guess about the model that actually ran.
 */
export function resolveModelId(agentType: string): string {
  const provider = resolveProvider(agentType);
  return provider === 'anthropic'
    ? `anthropic:${DEFAULT_ANTHROPIC_MODEL}`
    : `gemini:${DEFAULT_GEMINI_MODEL}`;
}

function resolveProvider(agentType: string): string {
  const envKey = `${agentType.toUpperCase()}_PROVIDER`;
  return (process.env[envKey] ?? 'gemini').toLowerCase().trim();
}

export class LLMFactory {
  static getChatModel(
    agentType: string,
    options?: { temperature?: number; maxOutputTokens?: number },
  ): FactoryChatModel {
    const provider = resolveProvider(agentType);
    const temperature = options?.temperature ?? 0;
    // Named differently by the two SDKs for the same thing. Left undefined when
    // the caller does not ask, so the provider default still applies and this
    // cannot silently change any agent that has not opted in.
    const maxOutputTokens = options?.maxOutputTokens;

    if (provider === 'anthropic') {
      return new ChatAnthropic({
        model: DEFAULT_ANTHROPIC_MODEL,
        apiKey: process.env['ANTHROPIC_API_KEY'],
        temperature,
        ...(maxOutputTokens === undefined ? {} : { maxTokens: maxOutputTokens }),
      });
    }

    // Default: gemini
    const gemini = new ChatGoogleGenerativeAI({
      model: DEFAULT_GEMINI_MODEL,
      apiKey: process.env['GEMINI_API_KEY'],
      temperature,
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    });

    // LangChain's _isMultimodalModel getter only recognises hardcoded name patterns
    // (gemini-1.5*, gemini-2*, gemma-3-*, etc.). The working alias for this API key is
    // "gemini-flash-latest" which doesn't match, so we override on the instance.
    // The Gemini Flash model does support multimodal inputs — this just tells
    // LangChain to allow image_url / PDF content blocks.
    Object.defineProperty(gemini, '_isMultimodalModel', { get: () => true, configurable: true });

    return gemini;
  }
}
