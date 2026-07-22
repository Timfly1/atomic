import { forwardRef, useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Mic, Keyboard } from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  isVoiceSupported?: boolean;
  isVoiceMode?: boolean;
  onVoiceModeChange?: (mode: boolean) => void;
  isRecording?: boolean;
  onRecordingChange?: (recording: boolean) => void;
  interimTranscript?: string;
}

export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  isVoiceSupported = false,
  isVoiceMode = false,
  onVoiceModeChange,
  isRecording = false,
  onRecordingChange,
  interimTranscript = '',
}, ref) => {
  const [isPressing, setIsPressing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startYRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasStartedRecordingRef = useRef(false);
  const lastHeightRef = useRef<number>(0);

  // Auto-resize textarea - only updates DOM when height actually changes
  const adjustHeight = useCallback((textarea: HTMLTextAreaElement) => {
    const newHeight = Math.min(textarea.scrollHeight, 120);
    if (newHeight !== lastHeightRef.current) {
      lastHeightRef.current = newHeight;
      textarea.style.height = 'auto';
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  // 暴露ref给父组件
  useEffect(() => {
    if (ref && 'current' in ref) {
      ref.current = textareaRef.current;
    }
  }, [ref]);

  // 点击键盘图标 - 退出语音模式
  const handleKeyboardClick = useCallback(() => {
    onVoiceModeChange?.(false);
    // 延迟弹出键盘，等待 UI 更新
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        // iOS 需要先设置 selection 来触发键盘
        const len = textarea.value.length;
        textarea.setSelectionRange(len, len);
        // 强制触发键盘
        textarea.scrollIntoView({ block: 'end' });
        // 模拟点击来确保键盘弹出
        const rect = textarea.getBoundingClientRect();
        const touchEvent = new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({
            identifier: 1,
            target: textarea,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
          })],
        });
        textarea.dispatchEvent(touchEvent);
        setTimeout(() => {
          const touchEndEvent = new TouchEvent('touchend', {
            bubbles: true,
            cancelable: true,
            touches: [],
          });
          textarea.dispatchEvent(touchEndEvent);
        }, 50);
      }
    }, 150);
  }, [onVoiceModeChange]);

  // 点击语音图标 - 进入语音模式
  const handleVoiceIconClick = useCallback(() => {
    onVoiceModeChange?.(true);
  }, [onVoiceModeChange]);

  // 触感反馈函数
  const triggerHaptic = useCallback((duration: number = 10) => {
    // 尝试使用 Web Vibration API
    if (navigator.vibrate) {
      navigator.vibrate(duration);
    }
    // iOS 触感引擎备用方案 - 使用 AudioContext
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 100;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1;
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (e) {
      // AudioContext 不可用，忽略
    }
  }, []);

  // 触摸开始 - 开始计时
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isVoiceMode || disabled) return;
    e.preventDefault();
    startYRef.current = e.touches[0].clientY;
    setIsPressing(true);
    setIsCancelling(false);
    hasStartedRecordingRef.current = false;

    // 触感反馈 - 按下时立即触发
    triggerHaptic(10);

    // 300ms后开始录音
    pressTimerRef.current = setTimeout(() => {
      hasStartedRecordingRef.current = true;
      onRecordingChange?.(true);
      window.dispatchEvent(new CustomEvent('voice-recording-start'));
    }, 300);
  }, [isVoiceMode, disabled, onRecordingChange, triggerHaptic]);

  // 触摸移动 - 检测上滑取消
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPressing || !isVoiceMode) return;
    e.preventDefault();
    const deltaY = e.touches[0].clientY - startYRef.current;
    if (deltaY < -50) {
      setIsCancelling(true);
    } else {
      setIsCancelling(false);
    }
  }, [isPressing, isVoiceMode]);

  // 触摸结束 - 发送或取消
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isVoiceMode) return;
    e.preventDefault();

    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    const wasRecording = hasStartedRecordingRef.current;
    hasStartedRecordingRef.current = false;
    onRecordingChange?.(false);

    // 触感反馈
    triggerHaptic(10);

    if (isCancelling) {
      // 上滑取消，不发送
      window.dispatchEvent(new CustomEvent('voice-recording-cancel'));
    } else if (isPressing && wasRecording) {
      // 真正开始录音了，才发送
      window.dispatchEvent(new CustomEvent('voice-recording-end'));
    }
    // 如果没有真正开始录音（300ms内松手），什么都不做

    setIsPressing(false);
    setIsCancelling(false);
  }, [isVoiceMode, isPressing, isCancelling, onRecordingChange, triggerHaptic]);

  // 发送文字
  const handleSendClick = useCallback(() => {
    if (value.trim()) {
      onSend();
      textareaRef.current?.blur();
    }
  }, [value, onSend]);

  return (
    <>
      {/* Desktop: flex layout */}
      <div
        className="flex-shrink-0 flex items-center md:flex max-md:hidden"
        style={{
          height: 'auto',
          backgroundColor: 'var(--color-bg-panel)',
        }}
      >
        <div
          data-chat-input
          className={`
            relative flex items-end rounded-2xl w-full mx-3
            bg-[var(--color-bg-elevated)] border border-[var(--color-border)]
            shadow-lg shadow-black/20
            transition-all duration-300 ease-out
            focus-within:outline-none focus-within:ring-0 focus-within:border-[var(--color-border)]
          `}
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)',
            outline: '2px solid transparent',
            outlineOffset: '0px',
            borderColor: 'var(--color-border)',
            minHeight: '44px',
          }}
        >
          {/* 内容 */}
          <div className="flex items-center w-full min-h-[48px] relative z-10">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="send"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
                  e.preventDefault();
                  handleSendClick();
                }
              }}
              className="
                flex-1 resize-none overflow-hidden bg-transparent
                text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)]
                focus:outline-none focus:ring-0 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed
                text-base leading-relaxed py-3
              "
              style={{ minHeight: '48px', maxHeight: '120px' }}
              onInput={(e) => {
                adjustHeight(e.target as HTMLTextAreaElement);
              }}
            />
          </div>
        </div>
      </div>

      {/* Mobile: fixed position */}
      <div
        className="fixed left-0 right-0 flex items-center md:hidden"
        style={{
          bottom: 'calc(13px + env(safe-area-inset-bottom, 0px))',
          height: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          backgroundColor: 'var(--color-bg-panel)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
          zIndex: 25,
        }}
      >
        <div
          data-chat-input
          className={`
            relative flex items-end rounded-2xl w-full mx-3
            bg-[var(--color-bg-elevated)] border border-[var(--color-border)]
            shadow-lg shadow-black/20
            transition-all duration-300 ease-out
            focus-within:outline-none focus-within:ring-0 focus-within:border-[var(--color-border)]
          `}
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)',
            outline: '2px solid transparent',
            outlineOffset: '0px',
            borderColor: 'var(--color-border)',
            minHeight: '44px',
          }}
        >
          {/* 语音模式内容 */}
          {isVoiceMode ? (
            <div className="flex items-center w-full min-h-[48px] px-3 relative z-10">
              <button
                type="button"
                onClick={handleKeyboardClick}
                className="p-2 rounded-full hover:bg-[var(--color-bg-hover)] transition-colors flex-shrink-0"
                title="切换到键盘输入"
              >
                <Keyboard className="w-5 h-5 text-[var(--color-accent)]" />
              </button>
              {/* 声波 + 文字容器 */}
              <div
                className={`
                  flex-1 flex items-center justify-center relative
                  ${isCancelling
                    ? 'text-red-400'
                    : isRecording
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-secondary)]'
                  }
                  transition-colors duration-200 select-none
                `}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* 左边12根声波 - 紧靠文字 */}
                <div className="absolute right-0 flex items-center gap-px mr-0.5">
                  {[...Array(12)].map((_, i) => {
                    const distanceFromText = 11 - i;
                    const baseHeight = 5;
                    const randomHeight = baseHeight + Math.random() * 16 + distanceFromText * 0.6;
                    return (
                      <motion.div
                        key={`left-${i}`}
                        className={`w-0.5 rounded-full ${
                          isCancelling
                            ? 'bg-red-500'
                            : isRecording
                              ? 'bg-[var(--color-accent)]'
                              : 'bg-[var(--color-text-tertiary)]'
                        }`}
                        animate={isRecording ? {
                          height: [
                            baseHeight,
                            randomHeight,
                            baseHeight + Math.random() * 8,
                            randomHeight * 0.7,
                            baseHeight,
                          ],
                        } : isCancelling ? {
                          height: [5, 10, 5],
                        } : {
                          height: baseHeight,
                        }}
                        transition={{
                          duration: isRecording ? 0.5 + Math.random() * 0.3 : 0.2,
                          repeat: isRecording ? Infinity : 0,
                          ease: 'easeInOut',
                          delay: i * 0.04,
                        }}
                      />
                    );
                  })}
                </div>
                {/* 文字 */}
                <span className="text-sm font-medium px-2 z-10">
                  {isCancelling
                    ? '松手取消'
                    : isRecording
                      ? '松手发送'
                      : '按住说话'}
                </span>
                {/* 右边12根声波 - 紧靠文字 */}
                <div className="absolute left-0 flex items-center gap-px ml-0.5">
                  {[...Array(12)].map((_, i) => {
                    const distanceFromText = 11 - i;
                    const baseHeight = 5;
                    const randomHeight = baseHeight + Math.random() * 16 + distanceFromText * 0.6;
                    return (
                      <motion.div
                        key={`right-${i}`}
                        className={`w-0.5 rounded-full ${
                          isCancelling
                            ? 'bg-red-500'
                            : isRecording
                              ? 'bg-[var(--color-accent)]'
                              : 'bg-[var(--color-text-tertiary)]'
                        }`}
                        animate={isRecording ? {
                          height: [
                            baseHeight,
                            randomHeight,
                            baseHeight + Math.random() * 8,
                            randomHeight * 0.7,
                            baseHeight,
                          ],
                        } : isCancelling ? {
                          height: [5, 10, 5],
                        } : {
                          height: baseHeight,
                        }}
                        transition={{
                          duration: isRecording ? 0.5 + Math.random() * 0.3 : 0.2,
                          repeat: isRecording ? Infinity : 0,
                          ease: 'easeInOut',
                          delay: i * 0.04,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* 键盘模式内容 */
            <div className="flex items-center w-full min-h-[48px] relative z-10">
              {/* 输入框 */}
              <div className="flex-1 relative flex items-center">
                {/* 语音图标 - 在输入框内部左侧 */}
                {isVoiceSupported && (
                  <button
                    type="button"
                    onClick={handleVoiceIconClick}
                    className="p-2 rounded-full hover:bg-[var(--color-bg-hover)] transition-colors flex-shrink-0"
                    title="切换到语音输入"
                  >
                    <Mic className="w-5 h-5 text-[var(--color-text-secondary)]" />
                  </button>
                )}
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder={placeholder}
                  disabled={disabled}
                  rows={1}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
                      e.preventDefault();
                      handleSendClick();
                    }
                  }}
                  className="
                    flex-1 resize-none overflow-hidden bg-transparent
                    text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)]
                    focus:outline-none focus:ring-0 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed
                    text-base leading-relaxed py-3
                  "
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                  onInput={(e) => {
                    adjustHeight(e.target as HTMLTextAreaElement);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
});

ChatInput.displayName = 'ChatInput';