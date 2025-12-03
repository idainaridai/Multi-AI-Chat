
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ConfigurationPanel from './components/ConfigurationPanel';
import ChatMessage from './components/ChatMessage';
import { AppConfig, Message, ChatStatus } from './types';
import { initializeChats, generateResponse, detectProviderFromApiKey, getDefaultModelForProvider, PROVIDER_MODEL_OPTIONS } from './services/geminiService';

// Initial Configuration State
const ENV_API_KEY =
  (import.meta as any)?.env?.VITE_GEMINI_API_KEY ||
  (import.meta as any)?.env?.VITE_API_KEY ||
  (import.meta as any)?.env?.GEMINI_API_KEY ||
  (import.meta as any)?.env?.API_KEY ||
  '';

const detectedProvider = detectProviderFromApiKey(ENV_API_KEY);
const detectedModel =
  ENV_API_KEY && PROVIDER_MODEL_OPTIONS[detectedProvider]
    ? PROVIDER_MODEL_OPTIONS[detectedProvider][0].id
    : 'gemini-2.5-flash';

const INITIAL_CONFIG: AppConfig = {
  apiKey: ENV_API_KEY,
  provider: detectedProvider,
  model: detectedModel,
  agents: [
    {
      id: 'A',
      name: 'Dr. Logic',
      systemPrompt: 'あなたは非常に論理的で分析的な科学者です。データ、事実、科学的手法を重視します。回答は簡潔で構造的であり、感情には懐疑的です。',
      color: 'cyan',
      avatarEmoji: '',
    },
    {
      id: 'B',
      name: 'Poet Willow',
      systemPrompt: 'あなたは感情豊かでロマンチックな詩人です。比喩を用いて話し、事実よりも感情を重視し、すべてのものに美しさを見出します。言葉遣いは華やかで表現力豊かです。',
      color: 'pink',
      avatarEmoji: '',
    }
  ],
  topic: '人工知能は人間の創造性に対する脅威となりますか？',
  maxTurns: 10,
  globalRules: '回答は150文字以内で、日本語で答えてください。',
};

const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(INITIAL_CONFIG);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ChatStatus>(ChatStatus.IDLE);
  const [turnCount, setTurnCount] = useState(0);
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'chat' | 'text'>('chat');
  const [userInput, setUserInput] = useState('');
  
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
      id: crypto.randomUUID(),
      senderId,
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, newMessage]);
  }, []);

  const handleStart = async () => {
    if (!config.topic.trim()) return;
    if (!config.apiKey.trim()) {
      if (ENV_API_KEY) {
        const provider = detectProviderFromApiKey(ENV_API_KEY);
        const model =
          PROVIDER_MODEL_OPTIONS[provider]?.[0]?.id || getDefaultModelForProvider(provider);
        setConfig((prev) => ({ ...prev, apiKey: ENV_API_KEY, provider, model }));
      } else {
        addMessage('SYSTEM', 'API Key is missing. Please check the configuration.');
        return;
      }
    }
    
    // Reset state
    setMessages([]);
    setTurnCount(0);
    setStatus(ChatStatus.ACTIVE);
    
    // Initialize chats with current prompts and global rules
    try {
      initializeChats(config.apiKey, config.model, config.agents, config.globalRules);
    } catch (e) {
      console.error(e);
      addMessage('SYSTEM', `AIエージェントの初期化に失敗しました: ${(e as Error)?.message || 'APIキーを確認してください。'}`);
      setStatus(ChatStatus.ERROR);
      return;
    }

    addMessage('SYSTEM', `Discussion Started: "${config.topic}"`);
    
    // First agent starts
    if (config.agents.length > 0) {
      setCurrentSpeakerId(config.agents[0].id);
    }
  };

  const handleStop = () => {
    setStatus(ChatStatus.PAUSED);
    addMessage('SYSTEM', 'ユーザーによって会話が停止されました。');
    setCurrentSpeakerId(null);
  };

  const handleReset = () => {
    setStatus(ChatStatus.IDLE);
    setMessages([]);
    setTurnCount(0);
    setCurrentSpeakerId(null);
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
       if (!config.apiKey.trim()) {
          addMessage('SYSTEM', 'Please enter an API Key to start.');
          return;
       }
       
       // Initialize implicitly if needed
       try {
         initializeChats(config.apiKey, config.model, config.agents, config.globalRules);
         setStatus(ChatStatus.ACTIVE);
         // Set first speaker if none
         if (!currentSpeakerId && config.agents.length > 0) {
           setCurrentSpeakerId(config.agents[0].id);
         }
       } catch (e) {
         addMessage('SYSTEM', 'Failed to initialize chat. Check API Key.');
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
      const agent = config.agents.find(a => a.id === msg.senderId);
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

  const textLog = messages.map(msg => {
    let name = "Unknown";
    if (msg.senderId === 'USER') name = "User";
    else if (msg.senderId === 'SYSTEM') name = "System";
    else {
      const agent = config.agents.find(a => a.id === msg.senderId);
      name = agent ? agent.name : "Unknown";
    }
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `[${time}] ${name}:\n${msg.text}`;
  }).join('\n\n');

  return (
    <div className="app-surface flex flex-col md:flex-row h-screen overflow-hidden text-slate-100 font-sans selection:bg-white/30">
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />
      <div className="grain-overlay" />

      {/* Sidebar Configuration */}
      <ConfigurationPanel
        config={config}
        setConfig={setConfig}
        status={status}
        onStart={handleStart}
        onStop={handleStop}
        onReset={handleReset}
        onDownloadLog={handleDownloadLog}
        hasMessages={messages.length > 0}
      />

      {/* Main Chat Area */}
      <main className="flex-grow flex flex-col h-full relative">
        {/* Header */}
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-8 bg-white/5 backdrop-blur-xl z-10 shrink-0 sticky top-0 glass-panel">
          <div className="flex items-center gap-6">
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
              className="flex-grow overflow-y-auto p-6 md:p-10 space-y-4 relative"
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
                  const agent = config.agents.find(a => a.id === msg.senderId);
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
              </div>
            </div>

            {/* Input Bar */}
             <div className="p-4 md:p-6 bg-white/5 backdrop-blur-xl border-t border-white/10 flex justify-center sticky bottom-0 z-20 glass-panel">
               <form onSubmit={handleUserSubmit} className="relative w-full max-w-4xl flex items-center gap-2">
                 <input
                   type="text"
                   value={userInput}
                   onChange={(e) => setUserInput(e.target.value)}
                   placeholder="会話に参加する..."
                   disabled={!config.apiKey}
                   className="w-full bg-white/5 text-white placeholder-zinc-400 px-5 py-4 rounded-full border border-white/10 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm shadow-lg shadow-black/30 disabled:opacity-50 disabled:cursor-not-allowed"
                 />
                 <button
                   type="submit"
                   disabled={!userInput.trim() || !config.apiKey}
                   className="absolute right-2 p-2.5 bg-white text-black rounded-full hover:bg-zinc-200 disabled:opacity-0 transition-all disabled:scale-90 shadow-lg shadow-white/20"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 004.835 9h5.176a.75.75 0 010 1.5H4.835a1.5 1.5 0 00-1.142.836l-1.414 4.925a.75.75 0 00.826.95 28.89 28.89 0 0015.293-7.154.75.75 0 000-1.115A28.89 28.89 0 003.105 2.289z" />
                    </svg>
                 </button>
               </form>
             </div>
          </>
        ) : (
          <div className="flex-grow flex flex-col bg-black/60 overflow-hidden relative glass-panel m-6 rounded-3xl border border-white/10">
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
