import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Trash2, X, Eye, ArrowLeft, FileText, Download, Image } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { openExternalUrl } from '../../lib/platform';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { TagChip } from '../tags/TagChip';
import { TagSelector } from '../tags/TagSelector';
import { MiniGraphPreview } from '../canvas/MiniGraphPreview';
import { useAtomsStore, type AtomWithTags, type SemanticSearchResult, type SimilarAtomResult } from '../../stores/atoms';
import { useTagsStore } from '../../stores/tags';
import { useUIStore } from '../../stores/ui';
import { useInlineEditor, useIsMobile } from '../../hooks';
import { formatDate, formatRelativeDate } from '../../lib/date';
import { getTransport } from '../../lib/transport';
import { readerEditorActions } from '../../lib/reader-editor-bridge';
import { atomLinkExtension, type AtomLinkSuggestion, type AtomLinkSuggestionSource } from '../../editor/atom-links';
import { pasteImageHandler } from '../../lib/editor/paste-handler';
import type {
  AtomicCodeMirrorEditorHandle,
  AtomicCodeMirrorEditorProps,
} from '@atomic-editor/editor';

// Lazy-load the editor module AND the curated code-languages
// registry together. Pinning both inside the same dynamic boundary
// keeps them in one lazy chunk, and wrapping the base component
// lets us pass the default `codeLanguages` without every call site
// having to know about the sub-path import.
const AtomicCodeMirrorEditor = lazy(async () => {
  const [mod, langs] = await Promise.all([
    import('@atomic-editor/editor'),
    import('@atomic-editor/editor/code-languages'),
  ]);
  const Base = mod.AtomicCodeMirrorEditor;
  const DEFAULT_LANGUAGES = langs.ATOMIC_CODE_LANGUAGES;
  const Wrapped = (props: AtomicCodeMirrorEditorProps) => (
    <Base
      {...props}
      codeLanguages={props.codeLanguages ?? DEFAULT_LANGUAGES}
    />
  );
  return { default: Wrapped };
});

interface AtomReaderProps {
  atomId: string;
  highlightText?: string | null;
  initialEditing?: boolean;
}

export function AtomReader({ atomId, highlightText, initialEditing }: AtomReaderProps) {
  const { t } = useTranslation();
  const deleteAtom = useAtomsStore(s => s.deleteAtom);
  const fetchTags = useTagsStore(s => s.fetchTags);
  const setSelectedTag = useUIStore(s => s.setSelectedTag);
  const overlayNavigate = useUIStore(s => s.overlayNavigate);
  const overlayDismiss = useUIStore(s => s.overlayDismiss);
  const removeAtomFromTabs = useUIStore(s => s.removeAtomFromTabs);
  const redirectAtomTabToFinding = useUIStore(s => s.redirectAtomTabToFinding);
  const isMobile = useIsMobile();

  const [atom, setAtom] = useState<AtomWithTags | null>(null);
  const [isLoadingAtom, setIsLoadingAtom] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const lastFetchedAt = useRef<string | null>(null);

  const refreshAtom = useCallback(async () => {
    const fetchedAtom = await getTransport().invoke<AtomWithTags | null>('get_atom_by_id', { id: atomId });
    setAtom(fetchedAtom);
    lastFetchedAt.current = fetchedAtom?.updated_at ?? null;
  }, [atomId]);


  // Watch the atoms store for updates to the currently viewed atom
  const storeAtom = useAtomsStore((s) =>
    s.atoms.find((a) => a.id === atomId)
  );

  // Fetch atom from database
  useEffect(() => {
    setIsLoadingAtom(true);
    setShowLoading(false);

    // Only show loading indicator if fetch takes longer than 200ms
    const loadingTimer = setTimeout(() => setShowLoading(true), 200);

    refreshAtom()
      .then(() => {
        clearTimeout(loadingTimer);
        setIsLoadingAtom(false);
      })
      .catch((error) => {
        clearTimeout(loadingTimer);
        console.error('Failed to fetch atom:', error);
        setAtom(null);
        setIsLoadingAtom(false);
        // atom loaded
      });

    return () => clearTimeout(loadingTimer);
  }, [atomId, refreshAtom]);

  // Re-fetch when store summary changes (e.g., after tag extraction)
  const storeAtomUpdatedAt = storeAtom?.updated_at;
  useEffect(() => {
    if (storeAtomUpdatedAt && !isLoadingAtom && storeAtomUpdatedAt !== lastFetchedAt.current) {
      lastFetchedAt.current = storeAtomUpdatedAt;
      refreshAtom().catch(console.error);
    }
  }, [storeAtomUpdatedAt, isLoadingAtom, refreshAtom]);

  // Refresh the open reader immediately when tagging completes for this atom.
  // The list store gets its status update from the global event hook, but the
  // reader owns full atom details and needs its own refresh to pick up new tags.
  useEffect(() => {
    const transport = getTransport();
    return transport.subscribe<{ atom_id: string }>('tagging-complete', (payload) => {
      if (payload.atom_id !== atomId) return;
      refreshAtom().catch(console.error);
    });
  }, [atomId, refreshAtom]);

  // If the fetched atom turns out to be a report finding (`kind = 'report'`),
  // redirect to the specialized FindingReader view. The generic atom reader
  // can't render `[N]` citation popovers, and findings are conceptually
  // read-only output not the user's own captures. This covers any path that
  // reached us via `/atoms/:id` for a finding atom — semantic search hits,
  // stale links from before the reports view existed, etc. The redirect
  // morphs the active tab in place + URL-replaces, so neither the tab
  // strip nor the browser back stack accumulates a dead /atoms/:id entry.
  useEffect(() => {
    if (atom?.kind === 'report') {
      redirectAtomTabToFinding(atomId);
    }
  }, [atom, atomId, redirectAtomTabToFinding]);

  return (
    <div className="h-full bg-[var(--color-bg-main)]">
      {isLoadingAtom ? (
        showLoading ? (
          <div className="flex items-center justify-center h-full text-[var(--color-text-secondary)]">
            {t('common_loading')}
          </div>
        ) : null
      ) : !atom ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--color-text-secondary)]">
          <span>{t('atoms_not_found')}</span>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            该原子可能已被删除或不存在于当前数据库
          </span>
          <button
            onClick={overlayDismiss}
            className="text-xs text-[var(--color-accent)] hover:underline"
          >
            {t('common_close')}
          </button>
        </div>
      ) : (
        <AtomReaderContent
          atom={atom}
          highlightText={highlightText}
          initialEditing={initialEditing}
          onDismiss={overlayDismiss}
          onDelete={async () => {
            await deleteAtom(atomId);
            await fetchTags();
            removeAtomFromTabs(atomId);
          }}
          onTagClick={(tagId) => { setSelectedTag(tagId); overlayDismiss(); }}
          onRelatedAtomClick={(id, opts) => overlayNavigate({ type: 'reader', atomId: id }, opts)}
          onViewGraph={(opts) => overlayNavigate({ type: 'graph', atomId }, opts)}
          onAtomUpdated={(updated) => setAtom(updated)}
          refreshAtom={refreshAtom}
        />
      )}
    </div>
  );
}

interface AtomReaderContentProps {
  atom: AtomWithTags;
  highlightText?: string | null;
  initialEditing?: boolean;
  onDismiss: () => void;
  onDelete: () => Promise<void>;
  onTagClick: (tagId: string) => void;
  onRelatedAtomClick: (atomId: string, opts?: { newTab?: boolean }) => void;
  onViewGraph: (opts?: { newTab?: boolean }) => void;
  onAtomUpdated?: (atom: AtomWithTags) => void;
  refreshAtom: () => Promise<void>;
}

function AtomReaderContent({
  atom, highlightText, initialEditing,
  onDismiss, onDelete, onTagClick, onRelatedAtomClick, onViewGraph, onAtomUpdated,
  refreshAtom,
}: AtomReaderContentProps) {
  const { t } = useTranslation();
  const readerTheme = useUIStore(s => s.readerTheme);
  const setReaderEditState = useUIStore(s => s.setReaderEditState);
  const retryTagging = useAtomsStore(s => s.retryTagging);
  const closeReader = useUIStore(s => s.closeReader);
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorHandleRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const documentFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingBatchImages, setIsUploadingBatchImages] = useState(false);
  const batchImagesFileInputRef = useRef<HTMLInputElement | null>(null);
  const [showEmbeddedImagePreview, setShowEmbeddedImagePreview] = useState(false);
  const [previewEmbeddedImageUrl, setPreviewEmbeddedImageUrl] = useState<string | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

  // Listen for double-click on images in the editor to show preview
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleDoubleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const img = target.closest('.cm-atomic-image')?.querySelector('img');
      if (img && img.src) {
        e.preventDefault();
        e.stopPropagation();
        setPreviewImageUrl(img.src);
        setShowImagePreview(true);
      }
    };

    container.addEventListener('dblclick', handleDoubleClick);
    return () => container.removeEventListener('dblclick', handleDoubleClick);
  }, []);

  const {
    editContent, editSourceUrl, editTags, saveStatus,
    editorRevision,
    startEditing, setEditContent, setEditSourceUrl, setEditTags, saveNow, flushDraft, resetToAtom,
  } = useInlineEditor({ atom, onAtomUpdated });
  const isTaggingInFlight = atom.tagging_status === 'pending' || atom.tagging_status === 'processing';

  const handleAutoTag = useCallback(async () => {
    await retryTagging(atom.id);
    onAtomUpdated?.({ ...atom, tagging_status: 'pending' });
  }, [retryTagging, atom, onAtomUpdated]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      await getTransport().uploadImage(atom.id, file);
      await refreshAtom();
      resetToAtom();
    } catch (error) {
      console.error('Failed to upload image:', error);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [atom.id, refreshAtom, resetToAtom]);

  const handleImageDelete = useCallback(async () => {
    try {
      await getTransport().deleteImage(atom.id);
      await refreshAtom();
      resetToAtom();
    } catch (error) {
      console.error('Failed to delete image:', error);
    }
  }, [atom.id, refreshAtom, resetToAtom]);

  const handleBatchImagesUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingBatchImages(true);
    const transport = getTransport();
    const config = transport.getConfig();
    const baseUrl = config.baseUrl?.replace(/\/$/, '') || '';
    const uploadedImages: string[] = [];

    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;

        const result = await transport.uploadEmbeddedImage(atom.id, file);
        const imageUrl = `${baseUrl}/api/atoms/${encodeURIComponent(atom.id)}/embedded-images/${encodeURIComponent(result.id)}?token=${encodeURIComponent(config.authToken)}`;
        uploadedImages.push(`![${file.name || 'image'}](${imageUrl})`);
      }

      if (uploadedImages.length > 0) {
        // Append images at the end of the content
        const imageMarkdown = uploadedImages.join('\n\n');
        const newContent = editContent + '\n\n' + imageMarkdown;
        setEditContent(newContent);
        // Persist changes to server before refresh
        await saveNow();
        // Refresh atom to update embedded_images list
        await refreshAtom();
        // Force editor remount so it picks up the newly saved content
        resetToAtom();
      }
    } catch (error) {
      console.error('Failed to upload batch images:', error);
    } finally {
      setIsUploadingBatchImages(false);
      if (batchImagesFileInputRef.current) {
        batchImagesFileInputRef.current.value = '';
      }
    }
  }, [atom.id, editContent, setEditContent, saveNow, refreshAtom, resetToAtom]);

  const handleEmbeddedImagePreview = useCallback((imgUrl: string) => {
    setPreviewEmbeddedImageUrl(imgUrl);
    setShowEmbeddedImagePreview(true);
  }, []);

  const handleEmbeddedImageDelete = useCallback(async (imageId: string) => {
    setDeletingImageId(imageId);
    try {
      await getTransport().deleteEmbeddedImage(atom.id, imageId);
      // Remove the image markdown from content
      const config = getTransport().getConfig();
      const baseUrl = config.baseUrl?.replace(/\/$/, '') || '';
      const imageUrl = `${baseUrl}/api/atoms/${encodeURIComponent(atom.id)}/embedded-images/${encodeURIComponent(imageId)}?token=${encodeURIComponent(config.authToken)}`;
      const imageMarkdownPattern = new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegExp(imageUrl)}\\)\\n?`, 'g');
      const newContent = editContent.replace(imageMarkdownPattern, '');
      setEditContent(newContent);
      // Persist changes to server before refresh
      await saveNow();
      await refreshAtom();
      // Force editor remount so it picks up the updated content
      resetToAtom();
    } catch (error) {
      console.error('Failed to delete embedded image:', error);
    } finally {
      setDeletingImageId(null);
    }
  }, [atom.id, editContent, setEditContent, saveNow, refreshAtom, resetToAtom]);

  const handleDocumentUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDocument(true);
    try {
      await getTransport().uploadDocument(atom.id, file);
      await refreshAtom();
      resetToAtom();
    } catch (error) {
      console.error('Failed to upload document:', error);
    } finally {
      setIsUploadingDocument(false);
      if (documentFileInputRef.current) {
        documentFileInputRef.current.value = '';
      }
    }
  }, [atom.id, refreshAtom, resetToAtom]);

  const handleDocumentDelete = useCallback(async () => {
    try {
      await getTransport().deleteDocument(atom.id);
      await refreshAtom();
      resetToAtom();
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  }, [atom.id, refreshAtom, resetToAtom]);

  const imageUrl = atom.image_path ? getTransport().getImageUrl(atom.id) : null;
  const documentUrl = atom.document_path ? getTransport().getDocumentUrl(atom.id) : null;
  const embeddedImageUrls = atom.embedded_images?.map((img) => {
    const config = getTransport().getConfig();
    const baseUrl = config.baseUrl?.replace(/\/$/, '') || '';
    return `${baseUrl}/api/atoms/${encodeURIComponent(atom.id)}/embedded-images/${encodeURIComponent(img.id)}?token=${encodeURIComponent(config.authToken)}`;
  }) || [];

  useEffect(() => {
    setReaderEditState(Boolean(initialEditing), saveStatus);
    return () => {
      setReaderEditState(false, 'idle');
    };
  }, [initialEditing, saveStatus, setReaderEditState]);

  useEffect(() => {
    startEditing();
  }, [startEditing]);

  useEffect(() => {
    if (!initialEditing) return;
    const id = requestAnimationFrame(() => {
      editorHandleRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [initialEditing]);

  useEffect(() => {
    if (initialEditing) return;
    containerRef.current?.focus({ preventScroll: true });
  }, [initialEditing, atom.id]);

  useEffect(() => {
    readerEditorActions.current = {
      startEditing: () => {
        editorHandleRef.current?.focus();
      },
      stopEditing: async () => {
        await flushDraft();
      },
      undo: () => editorHandleRef.current?.undo(),
      redo: () => editorHandleRef.current?.redo(),
      openSearch: (query?: string) => editorHandleRef.current?.openSearch(query),
      closeSearch: () => editorHandleRef.current?.closeSearch(),
    };
    return () => {
      readerEditorActions.current = null;
    };
  }, [flushDraft]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editorHandleRef.current?.isSearchOpen()) {
        e.preventDefault();
        readerEditorActions.current?.closeSearch();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void saveNow();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        editorHandleRef.current?.openSearch();
        return;
      }
      if (e.key === 'Escape' && !showDeleteModal) {
        e.preventDefault();
        void (async () => {
          await flushDraft();
          onDismiss();
        })();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [flushDraft, onDismiss, saveNow, showDeleteModal]);

  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } catch (error) {
      console.error('Failed to delete atom:', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const suggestAtomLinks = useCallback(async (query: string): Promise<AtomLinkSuggestion[]> => {
    const trimmed = query.trim();
    const limit = 12;
    const transport = getTransport();

    const titleMatches = await transport.invoke<AtomLinkSuggestion[]>('get_atom_link_suggestions', {
      q: trimmed,
      limit,
    });
    const titleSuggestions = titleMatches
      .filter((suggestion) => suggestion.id !== atom.id)
      .map((suggestion) => ({
        ...suggestion,
        source: (suggestion.source ?? (trimmed ? 'title' : 'recent')) as AtomLinkSuggestionSource,
      }));

    if (!trimmed || titleSuggestions.length > 0) return titleSuggestions;

    const keywordMatches = await transport.invoke<SemanticSearchResult[]>('search_atoms_keyword', {
      query: trimmed,
      limit,
    });
    const keywordSuggestions = searchResultsToAtomLinkSuggestions(keywordMatches, atom.id, 'content');
    if (keywordSuggestions.length > 0) return keywordSuggestions;

    try {
      const hybridMatches = await transport.invoke<SemanticSearchResult[]>('search_atoms_hybrid', {
        query: trimmed,
        limit,
        threshold: 0.3,
      });
      return searchResultsToAtomLinkSuggestions(hybridMatches, atom.id, 'hybrid');
    } catch (error) {
      console.warn('Atom link hybrid fallback failed:', error);
      return [];
    }
  }, [atom.id]);

  const resolveAtomLink = useCallback(async (id: string) => {
    const linkedAtom = await getTransport().invoke<AtomWithTags | null>('get_atom_by_id', { id });
    if (!linkedAtom) return null;
    return {
      id: linkedAtom.id,
      title: linkedAtom.title,
      snippet: linkedAtom.snippet,
    };
  }, []);

  const atomLinkExtensions = useMemo(
    () => atomLinkExtension({
      currentAtomId: atom.id,
      suggestAtoms: suggestAtomLinks,
      resolveAtom: resolveAtomLink,
      openAtom: (id, opts) => onRelatedAtomClick(id, opts),
    }),
    [atom.id, onRelatedAtomClick, resolveAtomLink, suggestAtomLinks],
  );

  const pasteImageExtension = useMemo(
    () => pasteImageHandler({ atomId: atom.id }),
    [atom.id],
  );

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      data-reader-theme={readerTheme}
      className={`h-full flex flex-col bg-[var(--color-bg-main)] transition-opacity duration-300 ease-out focus:outline-none ${
        revealed ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Header — back button + icon + title + date */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border)] flex-shrink-0">
        <button
          onClick={closeReader}
          title={t('common_back')}
          aria-label={t('common_back')}
          className="
            p-1.5 rounded-md text-[var(--color-text-secondary)]
            hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]
            transition-colors
          "
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} />
        </button>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" strokeWidth={2} />
          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate min-w-0 flex-1">
            {atom.title || t('atoms_untitled')}
          </span>
        </div>
        {atom.created_at && (
          <span className="shrink-0 text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-tertiary)] tabular-nums">
            {formatRelativeDate(atom.created_at).toUpperCase()}
          </span>
        )}
      </div>

      {/* @container makes the two-column layout react to the actual reader
          pane width rather than the viewport. With the chat sidebar open,
          the viewport may be wide while the reader is narrow — without
          container queries the desktop two-column would render at ~600px
          and squeeze the editor. */}
      <div className="@container flex-1 overflow-y-auto scrollbar-auto-hide">
        <div className="max-w-6xl mx-auto px-3 py-5 sm:px-4 sm:py-6 @4xl:px-6 @4xl:flex @4xl:gap-10">
          <div className="flex-1 min-w-0">
            <Suspense fallback={null}>
              <AtomicCodeMirrorEditor
                key={`${atom.id}:${editorRevision}`}
                documentId={atom.id}
                markdownSource={editContent}
                initialRevealText={highlightText}
                blurEditorOnMount={!initialEditing}
                onMarkdownChange={setEditContent}
                onLinkClick={(url) => {
                  // Intercept embedded image URLs and show preview instead of opening externally
                  if (url.includes('/embedded-images/')) {
                    setPreviewImageUrl(url);
                    setShowImagePreview(true);
                    return;
                  }
                  void openExternalUrl(url);
                }}
                editorHandleRef={editorHandleRef}
                extensions={[atomLinkExtensions, pasteImageExtension]}
              />
            </Suspense>
          </div>

          <div className="w-full @4xl:w-80 @4xl:shrink-0 mt-6 @4xl:mt-0 border border-[var(--color-border)] rounded-lg p-4 self-start">
            <div className="mb-4">
              {/* Source URL + delete share a row — delete sits to the right
                  of the input. */}
              <div className="flex items-center gap-1.5">
                <div className="flex-1 min-w-0">
                  <Input
                    value={editSourceUrl}
                    onChange={(e) => setEditSourceUrl(e.target.value)}
                    placeholder={t('atoms_source_url_placeholder')}
                    className="text-xs"
                  />
                </div>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="shrink-0 p-2 rounded text-[var(--color-text-secondary)] hover:text-red-400 hover:bg-[var(--color-bg-hover)] transition-colors"
                  title={t('atoms_delete_atom')}
                  aria-label={t('atoms_delete_atom')}
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
              {atom.source_url && (
                <button
                  type="button"
                  onClick={() => {
                    void openExternalUrl(atom.source_url!);
                  }}
                  className="mt-2 inline-block text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)]"
                >
                  {t('atoms_open_source')}
                </button>
              )}
            </div>

            {/* Image section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('atoms_image_section')}</span>
              </div>
              {imageUrl ? (
                <div className="relative">
                  <img
                    src={imageUrl}
                    alt={t('atoms_image_alt')}
                    className="w-full h-32 object-cover rounded border border-[var(--color-border)] cursor-pointer"
                    onClick={() => setShowImagePreview(true)}
                  />
                  <button
                    type="button"
                    onClick={handleImageDelete}
                    className="absolute top-1 right-1 p-1 rounded bg-black/60 text-red-400 hover:bg-black/80"
                    title={t('atoms_delete_image')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="border border-dashed border-[var(--color-border)] rounded p-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id={`image-upload-${atom.id}`}
                  />
                  <label
                    htmlFor={`image-upload-${atom.id}`}
                    className="flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isUploadingImage ? (
                      <span className="text-xs text-[var(--color-text-tertiary)]">{t('atoms_uploading')}</span>
                    ) : (
                      <>
                        <Image className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                        <span className="text-xs text-[var(--color-text-tertiary)]">{t('atoms_upload_ocr_image')}</span>
                      </>
                    )}
                  </label>
                </div>
              )}
            </div>

            {/* Batch Images section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('atoms_batch_images_section')}</span>
                <input
                  ref={batchImagesFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleBatchImagesUpload}
                  className="hidden"
                  id={`batch-images-upload-${atom.id}`}
                />
                <label
                  htmlFor={`batch-images-upload-${atom.id}`}
                  className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer"
                >
                  {isUploadingBatchImages ? (
                    <span>{t('atoms_uploading_images')}</span>
                  ) : (
                    <>
                      <Image className="w-4 h-4" />
                      <span>{t('atoms_upload_batch_images')}</span>
                    </>
                  )}
                </label>
              </div>
              {embeddedImageUrls.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {atom.embedded_images.map((img, index) => {
                    const imgUrl = embeddedImageUrls[index];
                    const isDeleting = deletingImageId === img.id;
                    return (
                      <div key={img.id} className="relative aspect-square">
                        <img
                          src={imgUrl}
                          alt={img.original_ref || `${t('atoms_image_alt')} ${index + 1}`}
                          className="w-full h-full object-cover rounded border border-[var(--color-border)] cursor-pointer"
                          onClick={() => handleEmbeddedImagePreview(imgUrl)}
                        />
                        <button
                          type="button"
                          onClick={() => handleEmbeddedImageDelete(img.id)}
                          disabled={isDeleting}
                          className="absolute top-1 right-1 p-1 rounded bg-black/60 text-red-400 hover:bg-black/80 disabled:opacity-50"
                          title={t('atoms_delete_image')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isDeleting && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded">
                            <span className="text-white text-xs">{t('common_loading')}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="border border-dashed border-[var(--color-border)] rounded p-4 text-center">
                  <span className="text-xs text-[var(--color-text-tertiary)]">{t('atoms_no_images')}</span>
                </div>
              )}
            </div>

            {/* Document section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('atoms_document_section')}</span>
              </div>
              {documentUrl ? (
                <div className="relative group border border-[var(--color-border)] rounded p-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDocumentPreview(true)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-xs text-[var(--color-text-primary)] truncate">
                        {atom.document_name || atom.document_type || t('atoms_document')}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-tertiary)]">
                        {t('atoms_click_to_preview_download')}
                      </p>
                    </button>
                    <div className={`flex gap-1 transition-opacity ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button
                        type="button"
                        onClick={() => setShowDocumentPreview(true)}
                        className="p-1 rounded bg-black/50 text-white hover:bg-black/70"
                        title={t('atoms_view_document')}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleDocumentDelete}
                        className="p-1 rounded bg-black/50 text-red-400 hover:bg-black/70"
                        title={t('atoms_delete_document')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-[var(--color-border)] rounded p-3">
                  <input
                    ref={documentFileInputRef}
                    type="file"
                    accept=".doc,.docx,.xls,.xlsx,.pdf"
                    onChange={handleDocumentUpload}
                    className="hidden"
                    id={`document-upload-${atom.id}`}
                  />
                  <label
                    htmlFor={`document-upload-${atom.id}`}
                    className="flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isUploadingDocument ? (
                      <span className="text-xs text-[var(--color-text-tertiary)]">{t('atoms_uploading')}</span>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                        <span className="text-xs text-[var(--color-text-tertiary)]">{t('atoms_upload_document')}</span>
                      </>
                    )}
                  </label>
                </div>
              )}
            </div>

            <div className="mb-4">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editTags.map((tag) => (
                  <TagChip
                    key={tag.id}
                    name={tag.name}
                    size="sm"
                    onRemove={() => setEditTags(editTags.filter((t) => t.id !== tag.id))}
                    onClick={() => onTagClick(tag.id)}
                  />
                ))}
                <button
                  onClick={() => setShowTagSelector(!showTagSelector)}
                  className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-light)] transition-colors px-1.5 py-0.5 rounded border border-dashed border-[var(--color-border)]"
                >
                  +
                </button>
              </div>
              {showTagSelector && (
                <TagSelector selectedTags={editTags} onTagsChange={setEditTags} />
              )}
            </div>

            {editTags.length === 0 && (
              <div className="mb-4 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)]/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--color-text-primary)]">{t('atoms_no_tags_yet')}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                      {t('atoms_run_tagging_manually')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      void handleAutoTag();
                    }}
                    disabled={isTaggingInFlight}
                    className="shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isTaggingInFlight ? t('atoms_tagging_in_progress') : t('atoms_auto_tag')}
                  </button>
                </div>
              </div>
            )}

            {/* Dates */}
            <div className="text-xs text-[var(--color-text-tertiary)] space-y-0.5">
              {atom.published_at && <p>{formatDate(atom.published_at)}</p>}
              <p>{formatDate(atom.updated_at)}</p>
            </div>

            {/* Neighborhood graph — always visible */}
            {atom.embedding_status !== 'failed' && (
              <div className="mt-4">
                <MiniGraphPreview atomId={atom.id} onExpand={onViewGraph} />
              </div>
            )}

            {/* Related atoms — collapsible */}
            {atom.embedding_status !== 'failed' && (
              <SidebarRelatedAtoms atomId={atom.id} onAtomClick={onRelatedAtomClick} />
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t('atoms_delete_confirm_title')}
        confirmLabel={isDeleting ? t('common_deleting') : t('common_delete')}
        confirmVariant="danger"
        onConfirm={handleDelete}
      >
        <p>{t('atoms_delete_confirm_message')}</p>
      </Modal>

      {/* Fullscreen Image Preview */}
      {showImagePreview && (previewImageUrl || imageUrl) && (
        <FullscreenImagePreview
          src={previewImageUrl || imageUrl || ''}
          onClose={() => setShowImagePreview(false)}
        />
      )}

      {/* Embedded Image Fullscreen Preview */}
      {showEmbeddedImagePreview && previewEmbeddedImageUrl && (
        <FullscreenImagePreview
          src={previewEmbeddedImageUrl}
          onClose={() => setShowEmbeddedImagePreview(false)}
        />
      )}

      {/* Document Preview Modal */}
      <Modal
        isOpen={showDocumentPreview}
        onClose={() => setShowDocumentPreview(false)}
        title={atom.document_name || t('atoms_document_preview')}
        confirmLabel={t('common_close')}
        onConfirm={() => setShowDocumentPreview(false)}
      >
        {documentUrl && (
          <div className="flex flex-col items-center gap-4">
            {atom.document_type === 'application/pdf' ? (
              <iframe
                src={documentUrl}
                className="w-full h-[70vh] border border-[var(--color-border)] rounded"
                title={t('atoms_pdf_preview')}
              />
            ) : (
              <div className="w-full p-8 border border-dashed border-[var(--color-border)] rounded-lg text-center">
                <p className="text-sm text-[var(--color-text-secondary)] mb-2">
                  {atom.document_name || t('atoms_document')}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
                  {t('atoms_content_extracted')}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {t('atoms_scroll_up_extracted')}
                </p>
              </div>
            )}
            <a
              href={documentUrl}
              download={atom.document_name || undefined}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm hover:bg-[var(--color-accent-light)] transition-colors"
            >
              {t('atoms_download_document')}
            </a>
          </div>
        )}
      </Modal>
    </div>
  );
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchResultsToAtomLinkSuggestions(
  results: SemanticSearchResult[],
  currentAtomId: string,
  source: AtomLinkSuggestionSource,
): AtomLinkSuggestion[] {
  return results
    .filter((result) => result.id !== currentAtomId)
    .map((result) => ({
      id: result.id,
      title: result.title,
      snippet: result.matching_chunk_content || result.snippet,
      source,
    }));
}

function SidebarRelatedAtoms({ atomId, onAtomClick }: { atomId: string; onAtomClick: (id: string, opts?: { newTab?: boolean }) => void }) {
  const { t } = useTranslation();
  const [relatedAtoms, setRelatedAtoms] = useState<SimilarAtomResult[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Reset when atomId changes so we re-fetch for the new atom
  useEffect(() => {
    setRelatedAtoms([]);
    setHasLoaded(false);
  }, [atomId]);

  useEffect(() => {
    if (!isCollapsed && !hasLoaded) {
      setIsLoading(true);
      getTransport().invoke<SimilarAtomResult[]>('find_similar_atoms', { atomId, limit: 5, threshold: 0.7 })
        .then((results) => { setRelatedAtoms(results); setHasLoaded(true); })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [atomId, isCollapsed, hasLoaded]);

  return (
    <div className="mt-4">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between w-full text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <span>{t('atoms_related_atoms')}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} strokeWidth={2} />
      </button>
      {!isCollapsed && (
        <div className="mt-2 space-y-1.5">
          {isLoading ? (
            <div className="text-xs text-[var(--color-text-tertiary)]">{t('common_loading')}</div>
          ) : relatedAtoms.length > 0 ? (
            relatedAtoms.map((result) => (
              <button
                key={result.id}
                onClick={(e) => onAtomClick(result.id, { newTab: e.metaKey || e.ctrlKey })}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onAtomClick(result.id, { newTab: true });
                  }
                }}
                className="w-full text-left p-2 rounded-md hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                <p className="text-xs text-[var(--color-text-primary)] line-clamp-2">
                  {result.title || t('atoms_untitled')}
                </p>
                <span className="text-[10px] text-[var(--color-accent)]">
                  {Math.round(result.similarity_score * 100)}{t('atoms_percent_similar')}
                </span>
              </button>
            ))
          ) : hasLoaded ? (
            <div className="text-xs text-[var(--color-text-tertiary)]">{t('atoms_no_similar_atoms')}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Fullscreen image preview
function FullscreenImagePreview({ src, onClose }: { src: string; onClose: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = src;
    link.download = '';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 z-100 bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Image container */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <TransformWrapper
          initialScale={1}
          minScale={0.1}
          maxScale={10}
          centerOnInit
          limitToBounds={false}
        >
          <TransformComponent
            wrapperClass="!w-full !h-full flex items-center justify-center"
            contentClass="!w-full !h-full flex items-center justify-center"
          >
            <img
              src={src}
              alt={t('atoms_image_full_size_alt')}
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
      {/* Bottom controls */}
      <div
        className="flex items-center justify-center gap-6 px-4 py-4 bg-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleDownload}
          className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white/90 hover:text-white transition-colors"
          title={t('atoms_download_document')}
        >
          <Download className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white/90 hover:text-white transition-colors"
          title={t('common_close')}
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
