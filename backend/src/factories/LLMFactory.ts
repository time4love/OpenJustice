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

export class LLMFactory {
  static getChatModel(agentType: string, options?: { temperature?: number }): FactoryChatModel {
    const envKey = `${agentType.toUpperCase()}_PROVIDER`;
    const provider = (process.env[envKey] ?? 'gemini').toLowerCase().trim();
    const temperature = options?.temperature ?? 0;

    if (provider === 'anthropic') {
      return new ChatAnthropic({
        model: DEFAULT_ANTHROPIC_MODEL,
        apiKey: process.env['ANTHROPIC_API_KEY'],
        temperature,
      });
    }

    // Default: gemini
    const gemini = new ChatGoogleGenerativeAI({
      model: DEFAULT_GEMINI_MODEL,
      apiKey: process.env['GEMINI_API_KEY'],
      temperature,
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
