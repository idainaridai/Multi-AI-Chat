
export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  color: 'cyan' | 'pink' | 'emerald' | 'amber' | 'violet';
  avatarEmoji: string;
}

export interface Message {
  id: string;
  senderId: string; // Agent ID or 'SYSTEM'
  text: string;
  timestamp: number;
}

export interface AppConfig {
  apiKey: string;
  provider: LLMProvider;
  model: string;
  agents: AgentConfig[];
  topic: string;
  maxTurns: number;
  globalRules: string;
}

export type LLMProvider =
  | 'gemini'
  | 'openai'
  | 'groq'
  | 'perplexity'
  | 'openrouter'
  | 'openai-compatible';

export enum ChatStatus {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
