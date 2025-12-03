
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ConfigurationPanel from './components/ConfigurationPanel';
import ChatMessage from './components/ChatMessage';
import { AppConfig, Message, ChatStatus } from './types';
import { initializeChats, generateResponse, generateMeetingSummary, detectProviderFromApiKey, getDefaultModelForProvider, PROVIDER_MODEL_OPTIONS } from './services/geminiService';

const safeRandomId = () => {
  const cryptoObj = (typeof crypto !== 'undefined') ? crypto : (window as any)?.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  if (cryptoObj?.getRandomValues) {
    const array = new Uint8Array(16);
    cryptoObj.getRandomValues(array);
    array[6] = (array[6] & 0x0f) | 0x40;
    array[8] = (array[8] & 0x3f) | 0x80;
    const hex = Array.from(array, b => b.toString(16).padStart(2, '0'));
    return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex.slice(10).join('')}`;
  }
  return `id-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
};

const buildLocalSummary = (messages: Message[], topic: string) => {
  const nonSystem = messages.filter(m => m.senderId !== 'SYSTEM');
  const lastFew = nonSystem.slice(-6);
  const bullets = lastFew.map(m => {
    const name = m.senderId === 'USER' ? 'User' : m.senderId;
    const text = m.text.replace(/\s+/g, ' ').slice(0, 120);
    return `• ${name}: ${text}${m.text.length > 120 ? '…' : ''}`;
  });

  return [
    `トピック: ${topic || '未設定'}`,
    bullets.length ? '直近の発言ハイライト:\n' + bullets.join('\n') : '直近の発言がありません。'
  ].join('\n');
};

const SUMMARY_AGENT = {
  id: 'SUMMARY',
  name: 'サマリーエージェント',
  color: 'violet' as const,
  avatarEmoji: '',
};

const SCENARIO_PRESETS: {
  id: string;
  name: string;
  description: string;
  config: Pick<AppConfig, 'agents' | 'topic' | 'maxTurns' | 'globalRules'>;
}[] = [
  {
    id: 'saas-planning',
    name: 'SaaS企画会議',
    description: '業務SaaSの課題→解決→売り方まで一気通貫で詰めるモード',
    config: {
      topic: '請求・経理が不安な小規模事業者向けSaaSのMVPを決める',
      maxTurns: 10,
      globalRules: '回答は120文字以内。日本語で、数字や具体例を入れる。前提が曖昧なら質問を1つ返す。',
      agents: [
        {
          id: 'A',
          name: 'ドメインエキスパート（現場の痛み役）',
          systemPrompt: 'あなたは現場で苦労する当事者として、課題（Pain）を具体的なシーンや数字で突き付ける。机上の空論を嫌い、本当にお金を払ってでも解決したい「切実な悩み」だけを強調する。口癖は「現場ではそんな暇ないよ」「ここが一番面倒くさいんだ」。',
          color: 'amber',
          avatarEmoji: '',
        },
        {
          id: 'B',
          name: 'テック・リアリスト（技術の現実主義者）',
          systemPrompt: 'あなたは既存の技術やNoCode・APIを駆使し、最小の労力で最大の効果を出す方法を即答する現実主義者。「それAPI叩けば一瞬です」「その機能は開発コストに見合わない」といった口癖で過剰開発を止め、実現手順を具体的に提示する。',
          color: 'emerald',
          avatarEmoji: '',
        },
        {
          id: 'C',
          name: 'グロース・マーケター（売り方の戦略家）',
          systemPrompt: 'あなたは「売れること」を前提に、価格設定・差別化ポイント・集客チャネルを最優先で設計する。「で、いくらなら買う？」「どうやって集客するの？」と問い続け、市場性（Viability）を担保する提案を行う。',
          color: 'violet',
          avatarEmoji: '',
        },
        {
          id: 'D',
          name: 'UXデザイナー（体験の設計者）',
          systemPrompt: 'あなたは忙しい個人事業主が説明書なしで使えるシンプルさを守り抜く。入力項目を極力減らし、離脱ポイントを潰すことに執着する。「説明書なしで使える？」「入力項目が多すぎて離脱するよ」を合言葉に、最短の動線と摩擦を指摘する。',
          color: 'cyan',
          avatarEmoji: '',
        },
        {
          id: 'E',
          name: 'プロダクトマネージャー（冷徹な優先順位係）',
          systemPrompt: 'あなたはスコープ管理と意思決定を担い、MVPで「何をしないか」を決める。「それは今回のMVPでは捨てよう」「リリース日は死守ね」と言い切り、最小機能での着地とリソース配分を指示する。',
          color: 'pink',
          avatarEmoji: '',
        },
        {
          id: 'F',
          name: 'デビルズ・アドボケイト（批判役）',
          systemPrompt: 'あなたは敢えて批判し、リスクを炙り出す役割。法務・競合・依存リスクに敏感で、「大手無料ツールが参入したら即死じゃない？」「法的にグレーだよ」と水を差し、致命的な欠陥を事前に洗い出す。',
          color: 'rose',
          avatarEmoji: '',
        },
      ],
    },
  },
  {
    id: 'product-dev',
    name: '企画開発会議',
    description: '新規プロダクトを短期間で形にするためのクロスファンクション構成',
    config: {
      topic: '次世代リモートワーク支援ツールの初期プロトタイプ方針を決める',
      maxTurns: 8,
      globalRules: '結論→根拠→次の一歩の順で90〜120文字。ユーザー行動の事実を優先。',
      agents: [
        {
          id: 'PD-A',
          name: 'プロダクトオーナー（事業責任者）',
          systemPrompt: 'あなたは事業目標とROIを守る。顧客価値と収益性が両立しない案を止め、期間・コストから優先度を決める。',
          color: 'amber',
          avatarEmoji: '',
        },
        {
          id: 'PD-B',
          name: '技術リード（実装現実チェック）',
          systemPrompt: 'あなたは実装の現実とリスクを即答する。複雑な案は分解し、既存技術やAPIで置き換える。',
          color: 'emerald',
          avatarEmoji: '',
        },
        {
          id: 'PD-C',
          name: 'UXリサーチャー（ユーザー代弁者）',
          systemPrompt: 'あなたはユーザーの声と行動を代弁する。「なぜ今困るのか」「現在の回避策」を具体的な引用で提示する。',
          color: 'cyan',
          avatarEmoji: '',
        },
        {
          id: 'PD-D',
          name: 'QA/リスク管理',
          systemPrompt: 'あなたは品質と安全性を守る。失敗シナリオ、法規制、SLAを洗い出し、検証計画を提案する。',
          color: 'rose',
          avatarEmoji: '',
        },
        {
          id: 'PD-E',
          name: 'スクラムマスター（進行係）',
          systemPrompt: 'あなたは進行を仕切り、スプリント計画を具体化する。機能をタスクに分解し、タイムラインと担当を決める。',
          color: 'violet',
          avatarEmoji: '',
        },
      ],
    },
  },
  {
    id: 'love-advice',
    name: '恋愛相談',
    description: '安心感と実用的なアドバイスを両立する相談モード',
    config: {
      topic: '3回デートした相手に自然に気持ちを伝えるタイミングを相談したい',
      maxTurns: 6,
      globalRules: '相手も自分も尊重する表現で80〜110文字。決めつけず、次の一歩を1〜2個具体的に。',
      agents: [
        {
          id: 'L-A',
          name: '共感カウンセラー',
          systemPrompt: 'あなたは相談者の気持ちを丁寧に受け止め、安全な場をつくる。批判せず感情の言語化を助ける。',
          color: 'pink',
          avatarEmoji: '',
        },
        {
          id: 'L-B',
          name: '現実的な友人',
          systemPrompt: 'あなたは率直に状況を整理する友人。相手の行動から読み取れるサインを冷静に伝え、期待値を整える。',
          color: 'emerald',
          avatarEmoji: '',
        },
        {
          id: 'L-C',
          name: '行動コーチ',
          systemPrompt: 'あなたは実行しやすいステップを提案する。簡単なメッセージ例や場面づくりを具体的に提示する。',
          color: 'cyan',
          avatarEmoji: '',
        },
        {
          id: 'L-D',
          name: 'リスク・境界線ケア',
          systemPrompt: 'あなたは安全と境界線を守る。無理をしない選択肢、断られた場合のケア、個人情報の扱いに注意を促す。',
          color: 'rose',
          avatarEmoji: '',
        },
      ],
    },
  },
  {
    id: 'user-custom',
    name: 'ユーザー設定',
    description: '自分好みに書き換える前提の軽量テンプレート',
    config: {
      topic: 'ここに話したいテーマを書き換えてください（例：新機能のリリース計画）',
      maxTurns: 8,
      globalRules: '敬意をもって簡潔に。過去の発言を引用しながら具体的な提案を短くまとめる。',
      agents: [
        {
          id: 'U-A',
          name: 'ファシリテーター',
          systemPrompt: 'あなたは議論を整理し、結論と宿題を明確にする進行役。論点を3つ以内に絞り、次の一手を促す。',
          color: 'violet',
          avatarEmoji: '',
        },
        {
          id: 'U-B',
          name: '仮説検証係',
          systemPrompt: 'あなたは前提を疑い、足りない情報を質問で埋める。実験や調査の提案を短く出す。',
          color: 'emerald',
          avatarEmoji: '',
        },
        {
          id: 'U-C',
          name: 'クリティカルシンカー',
          systemPrompt: 'あなたは意図的に弱点を突き、リスクや抜け漏れを指摘する。代替案を1つ添える。',
          color: 'amber',
          avatarEmoji: '',
        },
        {
          id: 'U-D',
          name: 'サマリー係',
          systemPrompt: 'あなたは議論をリアルタイムにまとめる。要点・決定・TODOを短く列挙し、合意形成を助ける。',
          color: 'cyan',
          avatarEmoji: '',
        },
      ],
    },
  },
];
// Initial Configuration State
const ENV_API_KEY =
  (import.meta as any)?.env?.VITE_GEMINI_API_KEY ||
  (import.meta as any)?.env?.VITE_API_KEY ||
  (import.meta as any)?.env?.GEMINI_API_KEY ||
  (import.meta as any)?.env?.API_KEY ||
  '';

const getPresetById = (presetId: string) =>
  SCENARIO_PRESETS.find((preset) => preset.id === presetId) || SCENARIO_PRESETS[0];

const buildConfigFromPreset = (presetId: string, apiKey: string): AppConfig => {
  const preset = getPresetById(presetId);
  const provider = detectProviderFromApiKey(apiKey);
  const model = PROVIDER_MODEL_OPTIONS[provider]?.[0]?.id || getDefaultModelForProvider(provider);

  return {
    apiKey,
    provider,
    model,
    agents: preset.config.agents.map((agent) => ({ ...agent })),
    topic: preset.config.topic,
    maxTurns: preset.config.maxTurns,
    globalRules: preset.config.globalRules,
  };
};

const DEFAULT_PRESET_ID = 'saas-planning';
const INITIAL_CONFIG: AppConfig = buildConfigFromPreset(DEFAULT_PRESET_ID, ENV_API_KEY);

const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(INITIAL_CONFIG);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ChatStatus>(ChatStatus.IDLE);
  const [turnCount, setTurnCount] = useState(0);
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'chat' | 'text'>('chat');
  const [userInput, setUserInput] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const hasSummarizedRef = useRef(false);

  const getEffectiveApiKey = useCallback(() => {
    const provided = config.apiKey?.trim();
    const fallback = ENV_API_KEY?.trim();
    return provided || fallback || '';
  }, [config.apiKey]);

  const resetConversationState = useCallback(() => {
    setStatus(ChatStatus.IDLE);
    setMessages([]);
    setTurnCount(0);
    setCurrentSpeakerId(null);
    hasSummarizedRef.current = false;
    setIsSummarizing(false);
  }, []);

  const handlePresetChange = useCallback(
    (presetId: string) => {
      const preset = getPresetById(presetId);
      if (!preset) return;

      const apiKey = (config.apiKey || ENV_API_KEY || '').trim();
      const provider = detectProviderFromApiKey(apiKey);
      const model =
        PROVIDER_MODEL_OPTIONS[provider]?.[0]?.id || getDefaultModelForProvider(provider);

      setConfig((prev) => ({
        ...prev,
        ...preset.config,
        agents: preset.config.agents.map((agent) => ({ ...agent })),
        apiKey: prev.apiKey,
        provider,
        model,
      }));
      setSelectedPresetId(presetId);
      resetConversationState();
    },
    [config.apiKey, resetConversationState]
  );
  
  // Ref for scrolling to bottom
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textLogRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (viewMode === 'chat' && chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    } else if (viewMode === 'text' && textLogRef.current) {
      textLogRef.current.scrollTop = textLogRef.current.scrollHeight;
    }
  }, [messages, viewMode]);

  const addMessage = useCallback((senderId: string, text: string) => {
    const newMessage: Message = {
      id: safeRandomId(),
      senderId,
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, newMessage]);
  }, []);

  const handleStart = async () => {
    if (!config.topic.trim()) return;

    const normalizedApiKey = getEffectiveApiKey();
    if (!normalizedApiKey) {
      addMessage('SYSTEM', 'API Key is missing. Please check the configuration.');
      return;
    }

    // Normalize provider/model based on the final API key we will use
    const provider = detectProviderFromApiKey(normalizedApiKey);
    const model = PROVIDER_MODEL_OPTIONS[provider]?.[0]?.id || getDefaultModelForProvider(provider);
    setConfig((prev) => ({ ...prev, apiKey: normalizedApiKey, provider, model }));
    
    // Reset state
    setMessages([]);
    setTurnCount(0);
    setStatus(ChatStatus.ACTIVE);
    hasSummarizedRef.current = false;
    setIsSummarizing(false);
    
    // Initialize chats with current prompts and global rules
    try {
      initializeChats(normalizedApiKey, model, config.agents, config.globalRules);
    } catch (e) {
      console.error(e);
      addMessage('SYSTEM', `AIエージェントの初期化に失敗しました: ${(e as Error)?.message || 'APIキーを確認してください。'}`);
      setStatus(ChatStatus.ERROR);
      return;
    }

    addMessage('SYSTEM', `Discussion Started: "${config.topic}"`);
    setIsConfigOpen(false);
    
    // First agent starts
    if (config.agents.length > 0) {
      setCurrentSpeakerId(config.agents[0].id);
    }
  };

  const handleStop = () => {
    setStatus(ChatStatus.COMPLETED);
    addMessage('SYSTEM', 'ユーザーによって会話が終了しました。');
    setCurrentSpeakerId(null);
  };

  const handleReset = () => {
    resetConversationState();
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    // Add user message
    addMessage('USER', userInput);
    
    // Clear input
    setUserInput('');

    // If chat was not active/initialized, treat as a "start" or just inject message
    // If we haven't initialized chats yet, we should.
    if (status === ChatStatus.IDLE || status === ChatStatus.ERROR) {
       // Validate API Key before implicit start
       const normalizedApiKey = getEffectiveApiKey();
       if (!normalizedApiKey) {
          addMessage('SYSTEM', 'Please enter an API Key to start.');
          return;
       }
       const provider = detectProviderFromApiKey(normalizedApiKey);
       const model = config.model || PROVIDER_MODEL_OPTIONS[provider]?.[0]?.id || getDefaultModelForProvider(provider);

       // Initialize implicitly if needed
       try {
         initializeChats(normalizedApiKey, model, config.agents, config.globalRules);
         setConfig(prev => ({ ...prev, apiKey: normalizedApiKey, provider, model }));
         setStatus(ChatStatus.ACTIVE);
         // Set first speaker if none
         if (!currentSpeakerId && config.agents.length > 0) {
           setCurrentSpeakerId(config.agents[0].id);
         }
       } catch (e) {
         addMessage('SYSTEM', `Failed to initialize chat. ${(e as Error)?.message || 'Check API Key.'}`);
         return;
       }
    } else if (status === ChatStatus.PAUSED || status === ChatStatus.COMPLETED) {
       // Reactivate
       setStatus(ChatStatus.ACTIVE);
       if (!currentSpeakerId && config.agents.length > 0) {
         setCurrentSpeakerId(config.agents[0].id);
       }
    }
  };

  const handleDownloadLog = () => {
    if (messages.length === 0) return;

    // Define styles mapping matching ChatMessage.tsx to replicate the look
    const colorStyles: Record<string, { bg: string }> = {
      cyan: { bg: 'background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white;' },
      pink: { bg: 'background: linear-gradient(135deg, #db2777, #7e22ce); color: white;' },
      emerald: { bg: 'background: linear-gradient(135deg, #059669, #0f766e); color: white;' },
      amber: { bg: 'background: linear-gradient(135deg, #f97316, #d97706); color: white;' },
      violet: { bg: 'background: linear-gradient(135deg, #7c3aed, #4338ca); color: white;' },
      rose: { bg: 'background: linear-gradient(135deg, #fb7185, #ef4444); color: white;' },
    };

    const timestamp = new Date().toLocaleString();
    
    // HTML Header and Layout
    let htmlContent = `
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gemini Dialogue Log</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Inter', 'Noto Sans JP', sans-serif; background-color: #000000; color: #f5f5f7; }
  .bubble { padding: 12px 20px; border-radius: 18px; font-size: 14px; line-height: 1.6; max-width: 100%; position: relative; }
  .bubble-left { background-color: #27272a; color: #e4e4e7; border-top-left-radius: 4px; }
  .bubble-right { border-top-right-radius: 4px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
  .bubble-user { background-color: #007AFF; color: white; border-top-right-radius: 4px; margin-left: auto;}
</style>
</head>
<body class="bg-black min-h-screen p-6 md:p-12">
  <div class="max-w-3xl mx-auto">
    <div class="mb-12 text-center">
      <h1 class="text-3xl font-bold text-white mb-2 tracking-tight">Dialogue Log</h1>
      <p class="text-zinc-500 text-sm font-medium uppercase tracking-widest">${timestamp}</p>
      <div class="mt-4 inline-block px-4 py-2 bg-zinc-900 rounded-lg text-zinc-300 text-sm border border-zinc-800">
        ${config.topic}
      </div>
    </div>
    <div class="space-y-4">
`;

    // Generate HTML for each message
    messages.forEach(msg => {
      const isSystem = msg.senderId === 'SYSTEM';
      const isUser = msg.senderId === 'USER';
      const safeText = msg.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (isSystem) {
        htmlContent += `
      <div class="flex justify-center my-8">
        <span class="bg-zinc-900 text-zinc-500 text-xs font-medium py-1 px-3 rounded-full border border-zinc-800">
          ${safeText}
        </span>
      </div>`;
        return;
      }

      if (isUser) {
        htmlContent += `
        <div class="flex w-full justify-end mb-6">
          <div class="flex flex-col max-w-[85%] md:max-w-[70%] items-end">
            <div class="flex items-center gap-2 mb-1 flex-row-reverse">
              <span class="text-xs font-bold text-zinc-400">You</span>
              <span class="text-[10px] text-zinc-600">${time}</span>
            </div>
            <div class="bubble bubble-user">
               <div style="white-space: pre-wrap;">${safeText}</div>
            </div>
          </div>
        </div>`;
        return;
      }

      // Agents
      const agent = msg.senderId === SUMMARY_AGENT.id
        ? SUMMARY_AGENT
        : config.agents.find(a => a.id === msg.senderId);
      const agentIndex = config.agents.findIndex(a => a.id === msg.senderId);
      const isLeftAligned = agentIndex === -1 ? true : agentIndex % 2 === 0;
      
      const colorKey = agent?.color || 'cyan';
      const style = colorStyles[colorKey] || colorStyles['cyan'];

      const alignClass = isLeftAligned ? 'justify-start' : 'justify-end';
      const flexDirection = isLeftAligned ? 'flex-row' : 'flex-row-reverse';
      const itemsAlign = isLeftAligned ? 'items-start' : 'items-end';
      const bubbleStyle = isLeftAligned ? '' : style.bg;
      const bubbleClass = isLeftAligned ? 'bubble-left' : 'bubble-right';
      
      htmlContent += `
      <div class="flex w-full ${alignClass} mb-6">
        <div class="flex flex-col max-w-[85%] md:max-w-[70%] ${itemsAlign}">
          <div class="flex items-center gap-2 mb-1 ${flexDirection}">
            <span class="text-xs font-bold text-zinc-400">
              ${agent?.name || 'Unknown'}
            </span>
            <span class="text-[10px] text-zinc-600">
               ${time}
            </span>
          </div>
          <div class="bubble ${bubbleClass}" style="${bubbleStyle}">
             <div style="white-space: pre-wrap;">${safeText}</div>
          </div>
        </div>
      </div>`;
    });

    htmlContent += `
    </div>
  </div>
</body>
</html>`;

    // Create Blob and trigger download
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-dialogue-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Main Orchestration Loop
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const processTurn = async () => {
      if (status !== ChatStatus.ACTIVE || !currentSpeakerId) return;

      // Check max turns constraint
      if (turnCount >= config.maxTurns * config.agents.length) {
        setStatus(ChatStatus.COMPLETED);
        addMessage('SYSTEM', `Conversation Limit Reached.`);
        return;
      }

      // Determine prompt input
      let promptText = config.topic;
      if (messages.length > 0) {
        const lastContentMessage = [...messages].reverse().find(m => m.senderId !== 'SYSTEM');
        if (lastContentMessage) {
           if (lastContentMessage.senderId === 'USER') {
             promptText = `ユーザーの発言: ${lastContentMessage.text}`;
           } else {
             const senderAgent = config.agents.find(a => a.id === lastContentMessage.senderId);
             const senderName = senderAgent ? senderAgent.name : "Other";
             promptText = `${senderName}の発言: ${lastContentMessage.text}`;
           }
        }
      } 
      else if (currentSpeakerId !== config.agents[0].id) {
         return;
      }

      try {
        await new Promise(resolve => {
          timeoutId = setTimeout(resolve, 1500);
        });

        const responseText = await generateResponse(currentSpeakerId, promptText);

        addMessage(currentSpeakerId, responseText);
        setTurnCount(prev => prev + 1);

        // Switch speaker (Round Robin)
        const currentIndex = config.agents.findIndex(a => a.id === currentSpeakerId);
        const nextIndex = (currentIndex + 1) % config.agents.length;
        setCurrentSpeakerId(config.agents[nextIndex].id);

      } catch (error) {
        console.error("Error in chat loop:", error);
        addMessage('SYSTEM', `LLM APIエラー: ${(error as Error)?.message || '詳細不明です。APIキーとモデルを確認してください。'}`);
        setStatus(ChatStatus.ERROR);
      }
    };

    if (status === ChatStatus.ACTIVE && currentSpeakerId) {
       processTurn();
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpeakerId, status, messages, config.maxTurns, addMessage, config.agents]);

  const currentSpeakerAgent = config.agents.find(a => a.id === currentSpeakerId);

  // Generate meeting minutes once conversation ends
  useEffect(() => {
    if (status !== ChatStatus.COMPLETED) return;
    if (hasSummarizedRef.current) return;
    if (messages.length === 0) return;

    hasSummarizedRef.current = true;
    setIsSummarizing(true);
    addMessage('SYSTEM', '議事録をまとめています...');

    const summarize = async () => {
      try {
        const summary = await generateMeetingSummary(
          messages,
          config.topic,
          config.globalRules,
          getEffectiveApiKey(),
          config.provider,
          config.model
        );
        addMessage(SUMMARY_AGENT.id, summary);
      } catch (e) {
        const fallback = buildLocalSummary(messages, config.topic);
        addMessage(SUMMARY_AGENT.id, `要約生成に失敗しました: ${(e as Error)?.message || '理由不明のエラー'}\n\nローカル要約:\n${fallback}`);
      } finally {
        setIsSummarizing(false);
      }
    };

    summarize();
  }, [status, messages, config.topic, config.globalRules, addMessage]);

  const textLog = messages.map(msg => {
    let name = "Unknown";
    if (msg.senderId === 'USER') name = "User";
    else if (msg.senderId === 'SYSTEM') name = "System";
    else if (msg.senderId === SUMMARY_AGENT.id) name = SUMMARY_AGENT.name;
    else {
      const agent = config.agents.find(a => a.id === msg.senderId);
      name = agent ? agent.name : "Unknown";
    }
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `[${time}] ${name}:\n${msg.text}`;
  }).join('\n\n');

  return (
    <div className="app-surface flex flex-col md:flex-row min-h-screen md:h-screen overflow-hidden text-slate-100 font-sans selection:bg-white/30">
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />
      <div className="grain-overlay" />

      {/* Sidebar Configuration */}
      <aside
        className={`md:relative md:block ${isConfigOpen ? 'fixed inset-0 z-40' : 'hidden'} md:w-[360px]`}
        aria-label="Configuration Panel"
      >
        {isConfigOpen && (
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setIsConfigOpen(false)}
          />
        )}
        <div
          className={`relative h-full md:h-screen w-full md:w-[360px] ml-auto transform transition-transform duration-300 ${
            isConfigOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
          }`}
        >
          <ConfigurationPanel
            config={config}
            setConfig={setConfig}
            status={status}
            onStart={handleStart}
            onStop={handleStop}
            onReset={handleReset}
            onDownloadLog={handleDownloadLog}
            hasMessages={messages.length > 0}
            hasApiKey={!!getEffectiveApiKey()}
            presetOptions={SCENARIO_PRESETS}
            selectedPresetId={selectedPresetId}
            onPresetChange={handlePresetChange}
          />
          <button
            type="button"
            onClick={() => setIsConfigOpen(false)}
            className="md:hidden absolute top-3 right-3 bg-white/10 text-white rounded-full px-3 py-1 text-xs border border-white/20 shadow-lg backdrop-blur"
          >
            閉じる
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-grow flex flex-col h-full relative">
        {/* Header */}
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-4 md:px-8 bg-white/5 backdrop-blur-xl z-10 shrink-0 sticky top-0 glass-panel">
          <div className="flex items-center gap-4 md:gap-6">
            <button
              type="button"
              className="md:hidden bg-white text-black rounded-full px-3 py-2 text-xs font-semibold shadow-sm border border-white/40"
              onClick={() => setIsConfigOpen(true)}
            >
              設定を開く
            </button>
            <div className="flex flex-col">
              <h2 className="text-sm font-semibold text-white tracking-wide">Live Simulation</h2>
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${status === ChatStatus.ACTIVE ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`}></span>
                <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">
                  {status === ChatStatus.IDLE && 'Ready'}
                  {status === ChatStatus.ACTIVE && 'Active'}
                  {status === ChatStatus.PAUSED && 'Paused'}
                  {status === ChatStatus.COMPLETED && 'Done'}
                  {status === ChatStatus.ERROR && 'Error'}
                </p>
              </div>
            </div>
            
            {/* View Mode Toggles */}
            <div className="flex bg-white/5 rounded-full p-1 border border-white/10 shadow-inner">
              <button 
                onClick={() => setViewMode('chat')}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-full transition-all flex items-center gap-1.5 ${viewMode === 'chat' ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'}`}
              >
                Chat
              </button>
              <button 
                onClick={() => setViewMode('text')}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-full transition-all flex items-center gap-1.5 ${viewMode === 'text' ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'}`}
              >
                Log
              </button>
            </div>
          </div>

          <div className="text-xs font-mono text-zinc-200 bg-white/5 px-3 py-1 rounded-full border border-white/10 shadow-sm">
             Turns: {turnCount} / {config.maxTurns * config.agents.length}
          </div>
        </header>

        {/* Content Area */}
        {viewMode === 'chat' ? (
          <>
            <div 
              ref={chatContainerRef}
              className="flex-grow overflow-y-auto p-4 md:p-10 space-y-4 relative"
            >
              <div className="radial-highlight" />
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                  <div className="w-16 h-16 mb-6 rounded-2xl bg-white/10 border border-white/10 shadow-xl shadow-black/40" />
                  <p className="text-sm font-medium tracking-wide">APIキーを入力して会話を開始しましょう。</p>
                </div>
              )}
              
              <div className="max-w-4xl mx-auto w-full pb-16">
                {messages.map((msg) => {
      const agent = msg.senderId === SUMMARY_AGENT.id
        ? SUMMARY_AGENT
        : config.agents.find(a => a.id === msg.senderId);
      const agentIndex = config.agents.findIndex(a => a.id === msg.senderId);
      const isLeftAligned = agentIndex === -1 ? true : agentIndex % 2 === 0;

                  return (
                    <ChatMessage
                      key={msg.id}
                      message={msg}
                      agent={agent}
                      isLeftAligned={isLeftAligned}
                    />
                  );
                })}

                {/* Typing Indicator */}
                {status === ChatStatus.ACTIVE && currentSpeakerAgent && (
                  <div className={`flex w-full mt-4 ${config.agents.findIndex(a => a.id === currentSpeakerId) % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium text-zinc-200 bg-white/10 border border-white/10 backdrop-blur-sm animate-pulse shadow-lg shadow-black/40">
                        <span>Thinking...</span>
                    </div>
                  </div>
                )}

                {isSummarizing && (
                  <div className="flex w-full mt-4 justify-center">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium text-zinc-200 bg-white/10 border border-white/10 backdrop-blur-sm animate-pulse shadow-lg shadow-black/40">
                        <span>議事録生成中...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Input Bar */}
             <div className="p-3 md:p-6 bg-white/5 backdrop-blur-xl border-t border-white/10 flex justify-center sticky bottom-0 z-20 glass-panel">
               <form onSubmit={handleUserSubmit} className="relative w-full max-w-4xl flex items-center gap-2">
                 <input
                   type="text"
                   value={userInput}
                   onChange={(e) => setUserInput(e.target.value)}
                   placeholder="会話に参加する..."
                   disabled={!config.apiKey}
                   className="w-full bg-white/5 text-white placeholder-zinc-400 px-4 md:px-5 py-3 md:py-4 rounded-full border border-white/10 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm shadow-lg shadow-black/30 disabled:opacity-50 disabled:cursor-not-allowed"
                 />
                 <button
                   type="submit"
                   disabled={!userInput.trim() || !config.apiKey}
                   className="absolute right-1.5 md:right-2 p-2 md:p-2.5 bg-white text-black rounded-full hover:bg-zinc-200 disabled:opacity-0 transition-all disabled:scale-90 shadow-lg shadow-white/20"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 004.835 9h5.176a.75.75 0 010 1.5H4.835a1.5 1.5 0 00-1.142.836l-1.414 4.925a.75.75 0 00.826.95 28.89 28.89 0 0015.293-7.154.75.75 0 000-1.115A28.89 28.89 0 003.105 2.289z" />
                    </svg>
                 </button>
               </form>
             </div>
          </>
        ) : (
          <div className="flex-grow flex flex-col bg-black/60 overflow-hidden relative glass-panel m-3 md:m-6 rounded-2xl md:rounded-3xl border border-white/10">
            <div className="absolute top-4 right-6 z-10">
               <button 
                 onClick={() => navigator.clipboard.writeText(textLog)}
                 className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md shadow-lg border border-white/10 transition-colors"
               >
                 Copy All
               </button>
            </div>
            <textarea 
               ref={textLogRef}
               readOnly 
               className="flex-grow w-full bg-transparent text-[#e5e7eb] font-mono text-sm p-8 focus:outline-none resize-none leading-relaxed"
               value={textLog || 'No conversation log yet.'}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
