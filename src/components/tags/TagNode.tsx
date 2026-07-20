import { memo, MouseEvent, useCallback, useState } from 'react';
import { ChevronRight, MessageCircle, FileText, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TagWithCount, useTagsStore } from '../../stores/tags';
import { useUIStore } from '../../stores/ui';
import { useIsMobile } from '../../hooks';
import { Modal } from '../ui/Modal';

interface TagNodeProps {
  tag: TagWithCount;
  level: number;
  selectedTagId: string | null;
  onSelect: (tagId: string) => void;
  onContextMenu: (e: MouseEvent, tag: TagWithCount) => void;
  onDelete?: (tagId: string) => void;
}

export const TagNode = memo(function TagNode({ tag, level, selectedTagId, onSelect, onContextMenu, onDelete }: TagNodeProps) {
  const { t } = useTranslation();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const isMobile = useIsMobile();
  const openChatSidebar = useUIStore(s => s.openChatSidebar);
  const isExpanded = useUIStore(s => !!s.expandedTagIds[tag.id]);
  const toggleTagExpanded = useUIStore(s => s.toggleTagExpanded);
  const fetchTagChildren = useTagsStore(s => s.fetchTagChildren);
  const hasChildren = (tag.children && tag.children.length > 0) || tag.children_total > 0;
  const isSelected = selectedTagId === tag.id;

  const handleDeleteClick = (e: MouseEvent) => {
    e.stopPropagation();
    setShowDeleteModal(true);
  };

  const handleToggle = useCallback(async (e: MouseEvent) => {
    e.stopPropagation();
    // If expanding and there are more children than currently loaded, fetch all
    if (!isExpanded && tag.children_total > tag.children.length) {
      await fetchTagChildren(tag.id);
    }
    toggleTagExpanded(tag.id);
  }, [isExpanded, tag.children_total, tag.children.length, tag.id, fetchTagChildren, toggleTagExpanded]);

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, tag);
  };

  const openWikiReader = useUIStore(s => s.openWikiReader);
  const setLeftPanelOpen = useUIStore(s => s.setLeftPanelOpen);

  const handleWikiClick = (e: MouseEvent) => {
    e.stopPropagation();
    setLeftPanelOpen(false);
    openWikiReader(tag.id, tag.name, undefined, { newTab: e.metaKey || e.ctrlKey });
  };

  const handleChatClick = (e: MouseEvent) => {
    e.stopPropagation();
    openChatSidebar(tag.id);
  };

  return (
    <>
      <div
        className={`group relative flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? 'bg-[var(--color-accent)]/20 text-[var(--color-text-primary)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]'
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={(e) => hasChildren ? handleToggle(e) : onSelect(tag.id)}
        onContextMenu={handleContextMenu}
      >
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="w-4 h-4 flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} strokeWidth={2} />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="flex-1 truncate text-sm">{tag.name}</span>
        {/* Chat icon - visible on hover */}
        <button
          onClick={handleChatClick}
          className={`icon-button text-[var(--color-text-secondary)] hover:text-[var(--color-accent-light)] ${
            isMobile
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100'
          }`}
          title="Chat with this tag"
        >
          <MessageCircle className="w-4 h-4" strokeWidth={2} />
        </button>
        {/* Article icon - visible on hover */}
        <button
          onClick={handleWikiClick}
          className={`icon-button text-[var(--color-text-secondary)] hover:text-[var(--color-accent-light)] ${
            isMobile
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100'
          }`}
          title="View wiki article"
        >
          <FileText className="w-4 h-4" strokeWidth={2} />
        </button>
        {!hasChildren && onDelete && (
          <button
            onClick={handleDeleteClick}
            className={`icon-button danger ${
              isMobile
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            }`}
            title={t('common_delete')}
          >
            <Trash2 className="w-4 h-4" strokeWidth={2} />
          </button>
        )}
        {!hasChildren && <span className="text-xs text-[var(--color-text-tertiary)] tabular-nums">{tag.atom_count}</span>}
      </div>
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t('common_delete_confirm_title')}
        confirmLabel={t('common_delete')}
        confirmVariant="danger"
        onConfirm={() => {
          onDelete?.(tag.id);
          setShowDeleteModal(false);
        }}
      >
        <p>{t('tags_delete_message', { name: tag.name })}</p>
      </Modal>
    </>
  );
});
