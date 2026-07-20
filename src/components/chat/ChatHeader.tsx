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
      {/* Top row: Back button and title */}
      <div className="flex items-center gap-3 px-4 py-3">
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
            className="flex-1 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
            autoFocus
          />
        ) : (
          <h2
            onClick={() => {
              setEditedTitle(conversation.title || '');
              setIsEditingTitle(true);
            }}
            className="flex-1 text-[var(--color-text-primary)] font-medium cursor-pointer hover:text-[var(--color-accent-light)] transition-colors truncate"
            title={t('chat_click_to_edit_title')}
          >
            {conversation.title || t('chat_new_conversation')}
          </h2>
        )}
      </div>

      {/* Scope editor row */}
      <div className="px-4 pb-3">
        <ScopeEditor conversation={conversation} />
      </div>
    </div>
  );
}
