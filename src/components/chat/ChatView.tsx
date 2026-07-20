import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/chat';
import { useUIStore } from '../../stores/ui';
import { useChatEvents } from '../../hooks/useChatEvents';
import { useContentSearch } from '../../hooks';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { ChatHeader } from './ChatHeader';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { SearchBar } from '../ui/SearchBar';

export function ChatView() {
  const { t } = useTranslation();

  const currentConversation = useChatStore(s => s.currentConversation);
  const messages = useChatStore(s => s.messages);
  const isLoading = useChatStore(s => s.isLoading);
  const isStreaming = useChatStore(s => s.isStreaming);
  const streamingContent = useChatStore(s => s.streamingContent);
  const streamingToolCalls = useChatStore(s => s.streamingToolCalls);
  const error = useChatStore(s => s.error);
  const sendMessage = useChatStore(s => s.sendMessage);
  const goBack = useChatStore(s => s.goBack);

  const openReader = useUIStore(s => s.openReader);

  const [inputValue, setInputValue] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Speech recognition
  const {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    isSupported: isVoiceSupported,
  } = useSpeechRecognition();

  // Combine all message content for search
  const allContent = useMemo(() => {
    return messages.map(m => m.content).join('\n\n');
  }, [messages]);

  // Content search across all messages
  const {
    isOpen: isSearchOpen,
    query: searchQuery,
    searchedQuery,
    currentIndex,
    totalMatches,
    setQuery: setSearchQuery,
    openSearch,
    closeSearch,
    goToNext,
    goToPrevious,
    highlightText,
  } = useContentSearch(allContent);

  // Keyboard handler for Ctrl+F / Cmd+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openSearch]);

  // Subscribe to chat events for streaming
  useChatEvents(currentConversation?.id ?? null);

  // Check if user is near the bottom of the scroll container
  const checkIfNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;

    const threshold = 100;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < threshold;
  }, []);

  // Update near-bottom state on scroll
  const handleScroll = useCallback(() => {
    isNearBottomRef.current = checkIfNearBottom();
  }, [checkIfNearBottom]);

  // Auto-scroll to bottom only if user is already near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  // Always scroll to bottom when a new message is sent (user action)
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    isNearBottomRef.current = true;
  }, []);

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isStreaming) return;

    const content = inputValue.trim();
    setInputValue('');
    scrollToBottom();
    await sendMessage(content);
  }, [inputValue, isStreaming, scrollToBottom, sendMessage]);

  // Handle voice mode change
  const handleVoiceModeChange = useCallback((mode: boolean) => {
    setIsVoiceMode(mode);
    if (!mode) {
      setIsRecording(false);
    }
  }, []);

  // Handle recording state change
  const handleRecordingChange = useCallback((recording: boolean) => {
    setIsRecording(recording);
  }, []);

  // Handle voice recording events from ChatInput
  useEffect(() => {
    const handleVoiceStart = () => {
      startListening();
    };

    const handleVoiceEnd = () => {
      stopListening();
    };

    const handleVoiceCancel = () => {
      isCancelledRef.current = true;
      stopListening();
    };

    window.addEventListener('voice-recording-start', handleVoiceStart);
    window.addEventListener('voice-recording-end', handleVoiceEnd);
    window.addEventListener('voice-recording-cancel', handleVoiceCancel);

    return () => {
      window.removeEventListener('voice-recording-start', handleVoiceStart);
      window.removeEventListener('voice-recording-end', handleVoiceEnd);
      window.removeEventListener('voice-recording-cancel', handleVoiceCancel);
    };
  }, [startListening, stopListening]);

  // Track if this was a cancel to prevent auto-send
  const isCancelledRef = useRef(false);

  // When listening stops and we have transcript, auto-send (only if not cancelled)
  useEffect(() => {
    if (!isListening && transcript && !isCancelledRef.current) {
      const newText = transcript.trim();
      if (newText) {
        // 直接发送语音文字
        sendMessage(newText);
        scrollToBottom();
        // 发送后保持语音模式，不切换回键盘
      } else {
        // 没有文字，退出语音模式
        setIsVoiceMode(false);
      }
    }
  }, [isListening, transcript, sendMessage, scrollToBottom]);

  // Reset cancel flag when starting new recording
  useEffect(() => {
    if (isListening) {
      isCancelledRef.current = false;
    }
  }, [isListening]);

  // Handle viewing an atom from citation
  const handleViewAtom = useCallback((atomId: string, highlightText?: string) => {
    goBack();
    openReader(atomId, highlightText);
  }, [goBack, openReader]);

  // Handle keyboard showing - ensure input is visible
  useEffect(() => {
    const handleVisualViewportChange = () => {
      setTimeout(() => {
        inputRef.current?.focus();
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    };

    const viewport = window.visualViewport;
    if (viewport) {
      viewport.addEventListener('resize', handleVisualViewportChange);
      viewport.addEventListener('scroll', handleVisualViewportChange);
    }

    return () => {
      if (viewport) {
        viewport.removeEventListener('resize', handleVisualViewportChange);
        viewport.removeEventListener('scroll', handleVisualViewportChange);
      }
    };
  }, []);

  // On mount, ensure input is properly positioned
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setTimeout(() => {
        inputRef.current?.focus();
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      }, 150);
    });
    return () => cancelAnimationFrame(rafId);
  }, [currentConversation?.id]);

  if (!currentConversation) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--color-text-secondary)]">
        {isLoading ? t('chat_loading_conversation') : t('chat_no_conversation_selected')}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with back button and scope */}
      <ChatHeader conversation={currentConversation} onBack={goBack} />

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 relative"
        style={{ overflowAnchor: 'none' }}
      >
        {/* Search bar */}
        {isSearchOpen && (
          <SearchBar
            query={searchQuery}
            searchedQuery={searchedQuery}
            onQueryChange={setSearchQuery}
            currentIndex={currentIndex}
            totalMatches={totalMatches}
            onNext={goToNext}
            onPrevious={goToPrevious}
            onClose={closeSearch}
          />
        )}
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-bg-card)] flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-[var(--color-accent)]" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[var(--color-text-primary)] font-medium mb-1">{t('chat_start_conversation')}</p>
              <p className="text-[var(--color-text-secondary)] text-sm max-w-sm">
                {t('chat_ask_about_knowledge_base')}
              </p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onViewAtom={handleViewAtom}
            searchQuery={isSearchOpen ? searchQuery : ''}
            highlightText={highlightText}
          />
        ))}

        {/* Streaming bubble */}
        {isStreaming && (
          <ChatMessage
            message={{
              id: 'streaming',
              conversation_id: currentConversation.id,
              role: 'assistant',
              content: streamingContent,
              created_at: new Date().toISOString(),
              message_index: messages.length,
              tool_calls: streamingToolCalls,
              citations: [],
            }}
            isStreaming
            onViewAtom={handleViewAtom}
            searchQuery={isSearchOpen ? searchQuery : ''}
            highlightText={highlightText}
          />
        )}

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ChatInput
        ref={inputRef}
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        disabled={isStreaming}
        placeholder={
          currentConversation.tags.length > 0
            ? t('chat_ask_about_tags', { tags: currentConversation.tags.map(t => t.name).join(', ') })
            : t('chat_placeholder')
        }
        isVoiceSupported={isVoiceSupported}
        isVoiceMode={isVoiceMode}
        onVoiceModeChange={handleVoiceModeChange}
        isRecording={isRecording}
        onRecordingChange={handleRecordingChange}
        interimTranscript={interimTranscript}
      />
    </div>
  );
}