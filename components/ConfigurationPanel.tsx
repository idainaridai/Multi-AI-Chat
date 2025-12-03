
import React from 'react';
import { AppConfig, AgentConfig, ChatStatus } from '../types';
import { detectProviderFromApiKey, getDefaultModelForProvider, getProviderLabel, PROVIDER_MODEL_OPTIONS } from '../services/geminiService';

interface ConfigurationPanelProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  status: ChatStatus;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onDownloadLog: () => void;
  hasMessages: boolean;
  hasApiKey: boolean;
}

const COLOR_PALETTE: AgentConfig['color'][] = ['cyan', 'pink', 'emerald', 'amber', 'violet', 'rose'];

const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  config,
  setConfig,
  status,
  onStart,
  onStop,
  onReset,
  onDownloadLog,
  hasMessages,
  hasApiKey,
}) => {
  const isRunning = status === ChatStatus.ACTIVE;
  const modelOptions = PROVIDER_MODEL_OPTIONS[config.provider] || [];
  const providerLabel = getProviderLabel(config.provider);

  const handleAgentCountChange = (count: number) => {
    const currentCount = config.agents.length;
    if (count < 2 || count > 6) return;

    if (count > currentCount) {
      // Add agents
      const newAgents = [...config.agents];
        for (let i = currentCount; i < count; i++) {
          newAgents.push({
          id: `${Date.now()}-${i}`,
          name: `エージェント ${i + 1}`,
          systemPrompt: 'あなたは個性的なAIアシスタントです。',
          color: COLOR_PALETTE[i % COLOR_PALETTE.length],
          avatarEmoji: '',
        });
      }
      setConfig(prev => ({ ...prev, agents: newAgents }));
    } else if (count < currentCount) {
      // Remove agents
      setConfig(prev => ({ ...prev, agents: prev.agents.slice(0, count) }));
    }
  };

  const handleAgentChange = (
    index: number,
    field: keyof AgentConfig,
    value: string
  ) => {
    const newAgents = [...config.agents];
    newAgents[index] = {
      ...newAgents[index],
      [field]: value
    };
    setConfig(prev => ({ ...prev, agents: newAgents }));
  };

  const handleApiKeyChange = (apiKey: string) => {
    const detected = detectProviderFromApiKey(apiKey);
    setConfig(prev => {
      const availableModels = PROVIDER_MODEL_OPTIONS[detected];
      const nextModel =
        availableModels.find((m) => m.id === prev.model)?.id ||
        availableModels[0]?.id ||
        getDefaultModelForProvider(detected);

      return {
        ...prev,
        apiKey,
        provider: detected,
        model: nextModel,
      };
    });
  };

  // Helper for agent accent colors in UI
  const getAccentColor = (color: string) => {
    switch(color) {
      case 'cyan': return 'text-cyan-400';
      case 'pink': return 'text-pink-400';
      case 'emerald': return 'text-emerald-400';
      case 'amber': return 'text-amber-400';
      case 'violet': return 'text-violet-400';
      case 'rose': return 'text-rose-400';
      default: return 'text-blue-400';
    }
  };

  return (
    <div className="w-full md:w-[360px] flex-shrink-0 h-full overflow-y-auto flex flex-col bg-black/40 backdrop-blur-3xl border-r border-white/10 shadow-2xl z-20 glass-panel">
      <div className="p-8 space-y-8 flex-grow">
        {/* Title */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-xl shadow-lg shadow-black/40 border border-white/10">
            <div className="w-3 h-3 rounded-full bg-white/70" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Gemini Sim</h1>
            <p className="text-xs text-zinc-400 font-medium">Multi-Agent Dialogue</p>
          </div>
        </div>

        {/* Section: API Configuration */}
        <div className="space-y-4 animate-fade-in">
           <div className="flex justify-between items-center">
             <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-[0.2em]">API Configuration</h2>
             <span className="text-[10px] font-semibold text-white bg-white/10 px-2 py-1 rounded-full border border-white/10 shadow-sm">
               {providerLabel} Detected
             </span>
           </div>
          
          <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md space-y-3 shadow-lg shadow-black/30">
             {/* API Key Input */}
            <div>
               <label className="block text-[10px] text-zinc-400 mb-1 font-semibold uppercase tracking-[0.18em]">API Key</label>
               <input 
                 type="password"
                 disabled={isRunning}
                 value={config.apiKey}
                 onChange={(e) => handleApiKeyChange(e.target.value)}
                 placeholder="Enter your LLM API Key"
                 className="w-full bg-white/5 text-white px-3 py-2.5 rounded-lg text-xs border border-white/10 focus:border-white/50 focus:outline-none placeholder-zinc-500 disabled:opacity-50"
               />
            </div>

            {/* Model Selection */}
            <div>
               <label className="block text-[10px] text-zinc-400 mb-1 font-semibold uppercase tracking-[0.18em]">Model</label>
               <div className="relative">
                 <select
                   disabled={isRunning}
                   value={config.model}
                   onChange={(e) => setConfig(prev => ({...prev, model: e.target.value}))}
                   className="w-full bg-white/5 text-white px-3 py-2.5 rounded-lg text-xs border border-white/10 focus:border-white/50 focus:outline-none appearance-none disabled:opacity-50 cursor-pointer"
                 >
                   {modelOptions.map(model => (
                     <option key={model.id} value={model.id} className="bg-black text-white">
                       {model.name}
                     </option>
                   ))}
                 </select>
                 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 text-xs">▼</div>
               </div>
            </div>
          </div>
        </div>

        {/* Section: Agent Count */}
        <div className="space-y-4 animate-fade-in">
           <div className="flex justify-between items-center">
             <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-[0.2em]">Settings</h2>
             <span className="text-xs bg-white/10 text-white px-2 py-1 rounded-md font-mono border border-white/10">{config.agents.length} AGENTS</span>
           </div>
          
          <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md shadow-lg shadow-black/30">
            <label className="block text-xs text-zinc-400 mb-3 font-medium">Participants</label>
            <input 
              type="range" 
              min="2" 
              max="6" 
              disabled={isRunning}
              value={config.agents.length}
              onChange={(e) => handleAgentCountChange(parseInt(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white disabled:opacity-50"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-medium">
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
              <span>6</span>
            </div>
          </div>
        </div>

        {/* Section: Agents */}
        <div className="space-y-6">
          {config.agents.map((agent, index) => (
            <div key={agent.id} className="space-y-3 animate-fade-in-up transition-all" style={{ animationDelay: `${index * 50}ms` }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-white/60 inline-block" />
                <h2 className={`text-xs font-semibold uppercase tracking-[0.2em] ${getAccentColor(agent.color)}`}>
                  Agent {index + 1}
                </h2>
              </div>
              
              <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden backdrop-blur-md focus-within:ring-1 focus-within:ring-white/40 transition-all shadow-lg shadow-black/30">
                <div className="border-b border-white/10">
                  <input
                    type="text"
                    disabled={isRunning}
                    value={agent.name}
                    placeholder="Name"
                    onChange={(e) => handleAgentChange(index, 'name', e.target.value)}
                    className="w-full bg-transparent text-white px-4 py-3 text-sm placeholder-zinc-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <textarea
                  disabled={isRunning}
                  value={agent.systemPrompt}
                  placeholder="System Prompt"
                  onChange={(e) => handleAgentChange(index, 'systemPrompt', e.target.value)}
                  rows={2}
                  className="w-full bg-transparent text-zinc-200 px-4 py-3 text-xs leading-relaxed focus:outline-none disabled:opacity-50 resize-none min-h-[80px]"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Section: Global Rules & Topic */}
        <div className="space-y-4">
          <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-[0.2em]">Conversation</h2>
          
          {/* Global Rules */}
          <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden backdrop-blur-md shadow-lg shadow-black/30">
            <div className="px-4 py-2 border-b border-white/10 bg-white/5">
               <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.18em]">Meeting Rules</label>
            </div>
            <textarea
              disabled={isRunning}
              value={config.globalRules}
              onChange={(e) => setConfig(prev => ({ ...prev, globalRules: e.target.value }))}
              rows={3}
              placeholder="e.g. Max 100 chars, Japanese only..."
              className="w-full bg-transparent text-zinc-100 px-4 py-3 text-xs leading-relaxed focus:outline-none disabled:opacity-50 resize-none"
            />
          </div>

          {/* Topic */}
          <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden backdrop-blur-md shadow-lg shadow-black/30">
             <div className="px-4 py-2 border-b border-white/10 bg-white/5">
               <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.18em]">Topic</label>
             </div>
            <div className="border-b border-white/10">
              <textarea
                disabled={isRunning}
                value={config.topic}
                onChange={(e) => setConfig(prev => ({ ...prev, topic: e.target.value }))}
                rows={2}
                placeholder="Topic of discussion..."
                className="w-full bg-transparent text-white px-4 py-3 text-sm focus:outline-none disabled:opacity-50 resize-none font-medium"
              />
            </div>
            <div className="flex items-center px-4 py-3 bg-white/5">
              <label className="text-xs text-zinc-400 mr-auto">Max Turns</label>
              <input
                type="number"
                disabled={isRunning}
                min={1}
                max={50}
                value={config.maxTurns}
                onChange={(e) => setConfig(prev => ({ ...prev, maxTurns: parseInt(e.target.value) || 1 }))}
                className="w-16 bg-white/10 text-white rounded px-2 py-1 text-xs text-right border border-white/10 focus:ring-0 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-white/10 bg-white/5 backdrop-blur-xl sticky bottom-0 z-30 space-y-3 shadow-inner">
        {status === ChatStatus.IDLE || status === ChatStatus.COMPLETED || status === ChatStatus.ERROR ? (
          <button
            onClick={onStart}
            disabled={!config.topic.trim() || !hasApiKey}
            className="w-full bg-white text-black hover:bg-zinc-100 font-semibold py-3.5 px-4 rounded-full transition-all shadow-lg shadow-white/30 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-sm active:scale-95"
            title={!config.apiKey.trim() ? "API Key required" : "Start"}
          >
            Start Simulation
          </button>
        ) : (
          <button
            onClick={onStop}
            className="w-full bg-[#ff3b30] hover:bg-[#ff453a] text-white font-semibold py-3.5 px-4 rounded-full transition-all shadow-lg shadow-red-900/30 flex justify-center items-center gap-2 text-sm active:scale-95"
          >
            Stop Conversation
          </button>
        )}
        
        {hasMessages && (
          <button
            onClick={onDownloadLog}
            className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-2.5 px-4 rounded-full transition-colors text-xs flex justify-center items-center gap-2 border border-white/10 active:scale-95"
          >
            Save Log
          </button>
        )}

        {status !== ChatStatus.IDLE && (
           <button
           onClick={onReset}
           className="w-full text-zinc-400 hover:text-white font-medium py-2 px-4 text-xs transition-colors"
         >
           Reset
         </button>
        )}
      </div>
    </div>
  );
};

export default ConfigurationPanel;
