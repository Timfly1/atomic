import { useState, useRef, useEffect } from 'react';
import { Plus, MessageCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore, ConversationWithTags } from '../../stores/chat';
import { useUIStore } from '../../stores/ui';
import { ConversationCard } from './ConversationCard';
import { Modal } from '../ui/Modal';

export function ConversationsList() {
  const { t } = useTranslation();

  const toggleChatSidebar = useUIStore(s => s.toggleChatSidebar);
  const conversations = useChatStore(s => s.conversations);
  const isLoading = useChatStore(s => s.isLoading);
  const error = useChatStore(s => s.error);
  const listFilterTagId = useChatStore(s => s.listFilterTagId);
  const createConversation = useChatStore(s => s.createConversation);
  const openConversation = useChatStore(s => s.openConversation);
  const deleteConversation = useChatStore(s => s.deleteConversation);
  const scrollToConversationId = useChatStore(s => s.scrollToConversationId);

  const [deleteTarget, setDeleteTarget] = useState<ConversationWithTags | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const handleNewChat = async () => {
    try {
      const tagIds = listFilterTagId ? [listFilterTagId] : [];
      await createConversation(tagIds);
    } catch (e) {
      console.error('Failed to create conversation:', e);
    }
  };

  const handleOpenConversation = (conversation: ConversationWithTags) => {
    openConversation(conversation.id);
  };

  const handleDeleteClick = (conversation: ConversationWithTags, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(conversation);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      await deleteConversation(deleteTarget.id);
    } catch (e) {
      console.error('Failed to delete conversation:', e);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  useEffect(() => {
    if (scrollToConversationId && !hasScrolledRef.current) {
      const element = document.getElementById(`conversation-${scrollToConversationId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        hasScrolledRef.current = true;
        setTimeout(() => {
          useChatStore.getState().scrollToConversationId = null;
          hasScrolledRef.current = false;
        }, 500);
      }
    }
  }, [scrollToConversationId, conversations]);

  if (isLoading && conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--color-text-secondary)]">
        {t('chat_loading_conversations')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with close button */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <button
          onClick={handleNewChat}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-[var(--color-bg-hover)] hover:bg-[var(--color-border)] text-[var(--color-text-primary)] rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          <span className="text-sm font-medium">{t('chat_new_conversation')}</span>
        </button>
        <button
          onClick={() => toggleChatSidebar()}
          className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors md:hidden"
          aria-label="Close chat"
        >
          <X className="w-5 h-5" strokeWidth={2} />
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto" ref={listContainerRef}>
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-bg-card)] flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-[var(--color-text-secondary)]" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[var(--color-text-primary)] font-medium mb-1">{t('chat_no_conversations')}</p>
              <p className="text-[var(--color-text-secondary)] text-sm">
                {t('chat_no_conversations_hint')}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {conversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                id={`conversation-${conversation.id}`}
                conversation={conversation}
                onClick={() => handleOpenConversation(conversation)}
                onDelete={(e) => handleDeleteClick(conversation, e)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('chat_delete_conversation')}
        confirmLabel={isDeleting ? t('chat_deleting') : t('common_delete')}
        confirmVariant="danger"
        onConfirm={handleConfirmDelete}
      >
        <p>
          {t('chat_delete_confirm', { title: deleteTarget?.title || t('chat_new_conversation') })}
        </p>
      </Modal>
    </div>
  );
}
