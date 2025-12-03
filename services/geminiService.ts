
import { GoogleGenAI, Chat } from "@google/genai";
import { AgentConfig, LLMProvider, Message } from "../types";

// Simple provider detection based on API key format
export const detectProviderFromApiKey = (apiKey: string): LLMProvider => {
  const trimmed = apiKey.trim();
  if (!trimmed) return "gemini";
  const lower = trimmed.toLowerCase();

  if (trimmed.startsWith("AIza") || lower.startsWith("ya29.")) return "gemini";
  if (trimmed.startsWith("gsk_")) return "groq";
  if (trimmed.startsWith("pplx-")) return "perplexity";
  if (trimmed.startsWith("sk-or-") || trimmed.startsWith("or-")) return "openrouter";
  if (trimmed.startsWith("sk-")) return "openai";

  // Fallback to OpenAI-compatible (Azure, Fireworks, Together, etc.)
  return "openai-compatible";
};

export const PROVIDER_MODEL_OPTIONS: Record<LLMProvider, { id: string; name: string }[]> = {
  gemini: [
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
    { id: "gemini-2.0-flash-lite-preview-02-04", name: "Gemini 2.0 Flash Lite" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
  ],
  openai: [
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "gpt-4o", name: "GPT-4o" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile" },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
  ],
  perplexity: [
    { id: "llama-3.1-sonar-large-128k-chat", name: "Llama 3.1 Sonar Large" },
    { id: "llama-3.1-70b-instruct", name: "Llama 3.1 70B Instruct" },
  ],
  openrouter: [
    { id: "gpt-4o-mini", name: "GPT-4o Mini (via OpenRouter)" },
    { id: "deepseek-chat", name: "DeepSeek Chat" },
  ],
  "openai-compatible": [
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
  ],
};

export const getDefaultModelForProvider = (provider: LLMProvider) =>
  PROVIDER_MODEL_OPTIONS[provider][0].id;

export const getProviderLabel = (provider: LLMProvider) => {
  switch (provider) {
    case "gemini":
      return "Gemini";
    case "groq":
      return "Groq";
    case "perplexity":
      return "Perplexity";
    case "openrouter":
      return "OpenRouter";
    case "openai-compatible":
      return "OpenAI Compatible";
    default:
      return "OpenAI";
  }
};

const PROVIDER_ENDPOINTS: Record<
  Exclude<LLMProvider, "gemini">,
  string
> = {
  openai: "https://api.openai.com/v1/chat/completions",
  "openai-compatible": "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  perplexity: "https://api.perplexity.ai/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

type OpenAIMessages = { role: "system" | "user" | "assistant"; content: string }[];

// Store chat sessions mapped by Agent ID
let chatSessions: Record<string, Chat> = {};
let openAISessions: Record<string, OpenAIMessages> = {};
let activeProvider: LLMProvider = "gemini";
let activeModel = "";
let activeApiKey = "";

export const initializeChats = (
  apiKey: string,
  modelName: string,
  agents: AgentConfig[],
  globalRules: string
) => {
  const normalizedKey = apiKey.trim();

  if (!normalizedKey) {
    throw new Error("API Key is required");
  }

  activeProvider = detectProviderFromApiKey(normalizedKey);
  activeModel = modelName || getDefaultModelForProvider(activeProvider);
  activeApiKey = normalizedKey;

  // Clear previous sessions
  chatSessions = {};
  openAISessions = {};

  if (activeProvider === "gemini") {
    const ai = new GoogleGenAI({ apiKey });

    agents.forEach((agent) => {
      const combinedSystemInstruction = `
${agent.systemPrompt}

【会議全体の重要ルール】
${globalRules}
`;

      chatSessions[agent.id] = ai.chats.create({
        model: activeModel,
        config: {
          systemInstruction: combinedSystemInstruction,
          temperature: 0.7,
        },
      });
    });
  } else {
    agents.forEach((agent) => {
      const combinedSystemInstruction = `
${agent.systemPrompt}

【会議全体の重要ルール】
${globalRules}
`;
      openAISessions[agent.id] = [
        { role: "system", content: combinedSystemInstruction },
      ];
    });
  }
};

export const generateResponse = async (
  agentId: string,
  inputMessage: string
): Promise<string> => {
  try {
    if (activeProvider === "gemini") {
      const session = chatSessions[agentId];
      if (!session) {
        throw new Error(`Chat Session for agent ${agentId} not initialized`);
      }

      const result = await session.sendMessage({ message: inputMessage });
      return result.text || "[No response generated]";
    }

    const messages = openAISessions[agentId];
    if (!messages) {
      throw new Error(`Chat Session for agent ${agentId} not initialized`);
    }

    const endpoint = PROVIDER_ENDPOINTS[activeProvider] || PROVIDER_ENDPOINTS["openai-compatible"];

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeApiKey}`,
        ...(activeProvider === "openrouter"
          ? { "HTTP-Referer": "gemini-dual-persona-chat", "X-Title": "Gemini Dual Persona Chat" }
          : {}),
      },
      body: JSON.stringify({
        model: activeModel || getDefaultModelForProvider("openai"),
        messages: [...messages, { role: "user", content: inputMessage }],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${text}`);
    }

    const data = await response.json();
    const answer =
      data?.choices?.[0]?.message?.content?.trim() || "[No response generated]";

    messages.push({ role: "user", content: inputMessage });
    messages.push({ role: "assistant", content: answer });
    openAISessions[agentId] = messages;

    return answer;
  } catch (error) {
    console.error(`Error generating response for Agent ${agentId}:`, error);
    throw error;
  }
};

// Summarize the full meeting transcript once conversation ends
export const generateMeetingSummary = async (
  messages: Message[],
  topic: string,
  globalRules: string,
  apiKey: string,
  provider?: LLMProvider,
  modelName?: string
): Promise<string> => {
  const key = apiKey?.trim();
  if (!key) throw new Error("API Key is missing for summary generation.");

  const summaryProvider = provider || detectProviderFromApiKey(key);
  const summaryModel = modelName || activeModel || getDefaultModelForProvider(summaryProvider);

  const transcript = messages
    .filter((m) => m.senderId !== "SYSTEM")
    .map((m) => {
      const speaker = m.senderId === "USER" ? "User" : `Agent ${m.senderId}`;
      return `${speaker}: ${m.text}`;
    })
    .join("\n");

  const prompt = `以下の会話ログを読み、議事録を要約してください。\n- トピック: ${topic}\n- ルール: ${globalRules}\n- 形式: 1) 決定事項 2) 未決事項 3) 宿題・担当 4) 次の一歩 を日本語で簡潔に箇条書き。\n\n【会話ログ】\n${transcript}`;

  if (summaryProvider === "gemini") {
    const ai = new GoogleGenAI({ apiKey: key });
    const result = await ai.models.generateContent({
      model: summaryModel,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    return result.text || "要約を生成できませんでした。";
  }

  const endpoint =
    PROVIDER_ENDPOINTS[summaryProvider] || PROVIDER_ENDPOINTS["openai-compatible"];

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(summaryProvider === "openrouter"
        ? { "HTTP-Referer": "gemini-dual-persona-chat", "X-Title": "Gemini Dual Persona Chat" }
        : {}),
    },
    body: JSON.stringify({
      model: summaryModel || getDefaultModelForProvider("openai"),
      messages: [
        { role: "system", content: "会議の要約者として、短い箇条書きで日本語の議事録を返してください。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Summary API error (${response.status}): ${text}`);
  }

  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content?.trim();
  return answer || "要約を生成できませんでした。";
};
