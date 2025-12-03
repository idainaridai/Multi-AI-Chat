import React from 'react';
import { Message, AgentConfig } from '../types';
import ReactMarkdown from 'react-markdown';

interface ChatMessageProps {
  message: Message;
  agent?: AgentConfig;
  isLeftAligned: boolean;
}

// Map color names to refined Apple-style gradients
const colorStyles: Record<string, { bg: string, text: string }> = {
  cyan: { bg: 'bg-gradient-to-br from-cyan-400/80 via-blue-500/80 to-blue-700/80', text: 'text-white' },
  pink: { bg: 'bg-gradient-to-br from-pink-400/80 via-fuchsia-500/80 to-purple-700/80', text: 'text-white' },
  emerald: { bg: 'bg-gradient-to-br from-emerald-400/80 via-teal-500/80 to-emerald-700/80', text: 'text-white' },
  amber: { bg: 'bg-gradient-to-br from-amber-300/90 via-orange-400/80 to-amber-600/80', text: 'text-slate-900' },
  violet: { bg: 'bg-gradient-to-br from-indigo-400/80 via-violet-500/80 to-indigo-700/80', text: 'text-white' },
};

const ChatMessage: React.FC<ChatMessageProps> = ({ message, agent, isLeftAligned }) => {
  const isSystem = message.senderId === 'SYSTEM';
  const isUser = message.senderId === 'USER';
  const badgeText = agent?.name?.[0]?.toUpperCase() || agent?.id?.[0]?.toUpperCase() || 'A';

  if (isSystem) {
    return (
      <div className="flex justify-center my-8 animate-fade-in">
        <span className="bg-zinc-800/80 backdrop-blur text-zinc-400 text-[11px] font-medium py-1.5 px-4 rounded-full border border-white/5 shadow-sm tracking-wide">
          {message.text}
        </span>
      </div>
    );
  }

  // Styles configuration
  let bubbleClass = '';
  let alignClass = '';
  let bubbleShape = '';
  let avatarDisplay = null;
  let nameDisplay = null;

  if (isUser) {
    // User Message (Always Right, Blue)
    alignClass = 'justify-end';
    bubbleClass = 'bg-[#007AFF] text-white shadow-lg shadow-blue-900/20'; // Classic iOS Blue
    bubbleShape = 'rounded-2xl rounded-tr-sm';
    
    // User usually doesn't show name/avatar in this layout style to save space/keep focus on agents,
    // or we can show a simple "You" label.
    nameDisplay = (
      <div className="flex items-center gap-2 mb-2 px-1 flex-row-reverse">
        <span className="text-[11px] font-medium text-zinc-400 opacity-80">You</span>
        <span className="text-[10px] text-zinc-600 font-medium">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    );

  } else {
    // Agent Message
    const styles = agent && agent.color ? colorStyles[agent.color] : colorStyles['cyan'];
    
    alignClass = isLeftAligned ? 'justify-start' : 'justify-end';
    
    bubbleShape = isLeftAligned 
      ? 'rounded-2xl rounded-tl-sm' 
      : 'rounded-2xl rounded-tr-sm';
    
    bubbleClass = isLeftAligned 
      ? 'bg-white/5 text-zinc-100 border border-white/10 shadow-md shadow-black/30' // Left bubbles are soft glass
      : `${styles.bg} ${styles.text} shadow-xl shadow-black/40 border border-white/10`; // Right bubbles are colored

    avatarDisplay = (
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs bg-white/10 border border-white/10 shrink-0 font-semibold text-white">
        {badgeText}
      </div>
    );

    nameDisplay = (
      <div className={`flex items-center gap-2 mb-2 px-1 ${isLeftAligned ? 'flex-row' : 'flex-row-reverse'}`}>
        {avatarDisplay}
        <span className="text-[11px] font-medium text-zinc-400 opacity-80">
          {agent?.name}
        </span>
        <span className="text-[10px] text-zinc-600 font-medium">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex w-full ${alignClass} mb-6 group animate-fade-in-up`}>
      <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isUser || !isLeftAligned ? 'items-end' : 'items-start'}`}>
        
        {/* Header: Avatar and Name */}
        {nameDisplay}

        {/* Message Bubble */}
        <div className={`relative px-5 py-3.5 ${bubbleClass} ${bubbleShape} backdrop-blur-md`}>
           <div className="markdown-body text-[14px] leading-relaxed font-normal tracking-wide">
             <ReactMarkdown>{message.text}</ReactMarkdown>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
