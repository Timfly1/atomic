import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConversationWithTags, useChatStore } from '../../stores/chat';
import { ScopeEditor } from './ScopeEditor';

interface ChatHeaderProps {
  conversation: ConversationWithTags;
  onBack: () => void;
}

export function ChatHeader({ conversation, onBack }: ChatHeaderProps) {
  const { t } = useTranslation();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(conversation.title || '');
  const updateConversationTitle = useChatStore(s => s.updateConversationTitle);

  const handleTitleSave = async () => {
    if (editedTitle.trim() !== conversation.title) {
      await updateConversationTitle(conversation.id, editedTitle.trim() || t('chat_untitled'));
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setEditedTitle(conversation.title || '');
      setIsEditingTitle(false);
    }
  };

  return (
    <div className="flex-shrink-0 border-b border-[var(--color-border)]">
      {/* Single row: Back button, title, and scope */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={onBack}
          className="icon-button text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          aria-label={t('chat_back_to_conversations')}
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={2} />
        </button>

        {isEditingTitle ? (
          <input
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleTitleKeyDown}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-32 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-2 py-0.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
            autoFocus
          />
        ) : (
          <span
            onClick={() => {
              setEditedTitle(conversation.title || '');
              setIsEditingTitle(true);
            }}
            className="flex-1 text-sm font-medium text-[var(--color-text-primary)] truncate cursor-pointer hover:text-[var(--color-accent)] transition-colors"
          >
            {conversation.title || t('chat_new_conversation')}
          </span>
        )}

        <ScopeEditor conversation={conversation} />
      </div>
    </div>
  );
}
