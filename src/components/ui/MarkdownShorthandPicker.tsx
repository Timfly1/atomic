import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  Bold, Italic, Strikethrough, Code, Link, Image, List, ListOrdered,
  Quote, Heading1, Heading2, Heading3, Table, CheckSquare, Minus, Type
} from 'lucide-react';

/** Markdown shorthand item definition */
export interface ShorthandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  template: string;
  /** Position where cursor should land after insertion (-1 = end) */
  cursorOffset?: number;
  group: 'basic' | 'common';
}

/** Interface for callbacks that bridge CM6 extension to React state */
export interface QuickTriggerCallbacks {
  onTrigger: (pos: number, coords: { left: number; bottom: number }) => void;
  getTriggerPos: () => number | null;
  onClose: () => void;
  /** Cached reference to the EditorView - set by the extension for the picker to use */
  editorView: any | null;
}

/** All available markdown shorthands */
const SHORTHAND_ITEMS: ShorthandItem[] = [
  // Basic group
  { id: 'bold', label: '粗体', icon: <Bold className="w-4 h-4" />, template: '**${cursor}**', cursorOffset: 2, group: 'basic' },
  { id: 'italic', label: '斜体', icon: <Italic className="w-4 h-4" />, template: '*${cursor}*', cursorOffset: 1, group: 'basic' },
  { id: 'strikethrough', label: '删除线', icon: <Strikethrough className="w-4 h-4" />, template: '~~${cursor}~~', cursorOffset: 2, group: 'basic' },
  { id: 'inline-code', label: '行内代码', icon: <Code className="w-4 h-4" />, template: '`${cursor}`', cursorOffset: 1, group: 'basic' },
  { id: 'link', label: '链接', icon: <Link className="w-4 h-4" />, template: '[${cursor}](url)', cursorOffset: 1, group: 'basic' },
  { id: 'image', label: '图片', icon: <Image className="w-4 h-4" />, template: '![${cursor}](url)', cursorOffset: 2, group: 'basic' },
  { id: 'h1', label: '标题 1', icon: <Heading1 className="w-4 h-4" />, template: '# ${cursor}', cursorOffset: 2, group: 'basic' },
  { id: 'h2', label: '标题 2', icon: <Heading2 className="w-4 h-4" />, template: '## ${cursor}', cursorOffset: 3, group: 'basic' },
  { id: 'h3', label: '标题 3', icon: <Heading3 className="w-4 h-4" />, template: '### ${cursor}', cursorOffset: 4, group: 'basic' },
  // Common group
  { id: 'bullet-list', label: '无序列表', icon: <List className="w-4 h-4" />, template: '- ${cursor}', cursorOffset: 2, group: 'common' },
  { id: 'ordered-list', label: '有序列表', icon: <ListOrdered className="w-4 h-4" />, template: '1. ${cursor}', cursorOffset: 3, group: 'common' },
  { id: 'blockquote', label: '引用块', icon: <Quote className="w-4 h-4" />, template: '> ${cursor}', cursorOffset: 2, group: 'common' },
  { id: 'code-block', label: '代码块', icon: <Code className="w-4 h-4" />, template: '```\n${cursor}\n```', cursorOffset: 4, group: 'common' },
  { id: 'table', label: '表格', icon: <Table className="w-4 h-4" />, template: '| 列 | 列 |\n| --- | --- |\n| ${cursor} | ', cursorOffset: 4, group: 'common' },
  { id: 'task-list', label: '任务列表', icon: <CheckSquare className="w-4 h-4" />, template: '- [ ] ${cursor}', cursorOffset: 4, group: 'common' },
  { id: 'divider', label: '分割线', icon: <Minus className="w-4 h-4" />, template: '---\n${cursor}', cursorOffset: 4, group: 'common' },
  { id: 'text', label: '纯文本', icon: <Type className="w-4 h-4" />, template: '${cursor}', cursorOffset: 0, group: 'common' },
];

/**
 * Creates a CodeMirror 6 extension that intercepts the \u3001 (ideographic comma)
 * character when typed at the start of a line (only whitespace before cursor),
 * prevents its insertion, and triggers the shorthand picker instead.
 */
export function createQuickTriggerExtension(
  callbacksRef: React.MutableRefObject<QuickTriggerCallbacks | null>
): Extension {
  return EditorView.inputHandler.of((view, from, _to, text) => {
    if (text !== "、") return false;
    const cb = callbacksRef.current;
    if (!cb) return false;
    const line = view.state.doc.lineAt(from);
    const textBefore = view.state.sliceDoc(line.from, from);
    if (!/^\s*$/.test(textBefore)) return false;
    let coords = view.coordsAtPos(from);
    if (!coords) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          coords = { left: rect.left, bottom: rect.bottom, top: rect.top, right: rect.right };
        }
      }
    }
    if (coords) {
      queueMicrotask(() => {
        callbacksRef.current?.onTrigger(from, { left: coords.left, bottom: coords.bottom });
      });
    }
    return true;
  });
}


function scrollIntoViewIfNeeded(element: HTMLElement, container: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  if (elementRect.bottom > containerRect.bottom) {
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } else if (elementRect.top < containerRect.top) {
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

interface MarkdownShorthandPickerProps {
  editorHandleRef: React.MutableRefObject<{ getContentDOM: () => HTMLElement | null; getEditorView: () => any | null } | null>;
  triggerCallbacksRef: React.MutableRefObject<QuickTriggerCallbacks | null>;
}

export function MarkdownShorthandPicker({ editorHandleRef, triggerCallbacksRef }: MarkdownShorthandPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [showExitAnimation, setShowExitAnimation] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const triggerPosRef = useRef<number | null>(null);

  const basicItems = useMemo(() => SHORTHAND_ITEMS.filter(item => item.group === 'basic'), []);
  const commonItems = useMemo(() => SHORTHAND_ITEMS.filter(item => item.group === 'common'), []);
  const allItems = useMemo(() => [...basicItems, ...commonItems], [basicItems, commonItems]);

  // Helper to get EditorView from editorHandleRef
  const getEditorView = useCallback(() => {
    // Try editor handle first, then cached view from trigger extension
    const fromHandle = editorHandleRef.current?.getEditorView?.() ?? null;
    const fromCache = triggerCallbacksRef.current?.editorView ?? null;
    return fromHandle ?? fromCache;
  }, [editorHandleRef, triggerCallbacksRef]);

  // Expose callbacks to the CM6 extension via ref
  useEffect(() => {
    triggerCallbacksRef.current = {
      editorView: null,
      onTrigger: (pos, coords) => {
        triggerPosRef.current = pos;
        setPosition({ x: coords.left, y: coords.bottom + 4 });
        setIsOpen(true);
        setHighlightedIndex(0);
        setShowExitAnimation(false);
      },
      getTriggerPos: () => triggerPosRef.current,
      onClose: () => {
        setIsOpen(false);
        setPosition(null);
      },
    };
    return () => {
      triggerCallbacksRef.current = null;
    };
  }, [triggerCallbacksRef]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closePicker();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(i => {
            const next = (i + 1) % allItems.length;
            scrollToItem(next);
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(i => {
            const prev = (i - 1 + allItems.length) % allItems.length;
            scrollToItem(prev);
            return prev;
          });
          break;
        case 'Enter':
          e.preventDefault();
          if (allItems.length > 0) {
            selectItem(allItems[highlightedIndex]);
          }
          break;
        case 'Tab':
          e.preventDefault();
          if (allItems.length > 0) {
            selectItem(allItems[highlightedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          closePicker();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, highlightedIndex, allItems]);

  const scrollToItem = useCallback((index: number) => {
    if (itemsContainerRef.current && itemRefs.current[index]) {
      const el = itemRefs.current[index];
      if (el) scrollIntoViewIfNeeded(el, itemsContainerRef.current);
    }
  }, []);

  const closePicker = useCallback(() => {
    const view = getEditorView();
    if (view) {
      setShowExitAnimation(true);
      setTimeout(() => {
        setIsOpen(false);
        setPosition(null);
        triggerPosRef.current = null;
        
        setShowExitAnimation(false);
        view.focus();
      }, 100);
    } else {
      setIsOpen(false);
      setPosition(null);
      triggerPosRef.current = null;
      setShowExitAnimation(false);
    }
  }, [getEditorView]);

  const selectItem = useCallback((item: ShorthandItem) => {
    const view = getEditorView();
    const pos = triggerPosRef.current;

    if (pos !== null && view) {

      const template = item.template.replace('${cursor}', '');
      view.dispatch({
        changes: { from: pos, to: pos, insert: template },
        selection: { anchor: pos + (item.cursorOffset ?? template.length) },
        scrollIntoView: true,
      });
    }

    setIsOpen(false);
    setPosition(null);
    triggerPosRef.current = null;
    setShowExitAnimation(false);
    view?.focus();
  }, [getEditorView]);

  const adjustedPosition = useMemo(() => {
    if (!position) return { x: 0, y: 0 };
    let y = position.y;
    if (y + 420 > window.innerHeight - 8) {
      y = position.y - 420;
    }
    return { x: position.x, y };
  }, [position]);
  if (!isOpen || !position) return null;



  return createPortal(
    <div
      ref={menuRef}
className={'fixed z-50 w-72 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden ' + (showExitAnimation ? 'animate-out fade-out zoom-out-95 duration-100' : 'animate-in fade-in zoom-in-95 duration-150')}
      style={{ left: adjustedPosition.x, top: Math.max(8, adjustedPosition.y) }}
    >      {/* Items */}
      <div ref={itemsContainerRef} className="max-h-[320px] overflow-y-auto px-2 pb-2 scrollbar-thin">
        {allItems.length === 0 && (
          <div className="flex items-center justify-center py-8 text-xs text-[var(--color-text-tertiary)]">
            {'无匹配结果'}
          </div>
        )}

        {basicItems.length > 0 && (
          <>
            <div className="text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-widest px-1.5 pt-1.5 pb-1">
              {'基础'}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {basicItems.map((item) => {
                const globalIndex = allItems.indexOf(item);
                return (
                  <button
                    key={item.id}
                    ref={(el) => { itemRefs.current[globalIndex] = el; }}
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setHighlightedIndex(globalIndex)}
                    className={'flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-xs transition-all duration-100 focus:outline-none ' + (highlightedIndex === globalIndex ? 'bg-[var(--color-accent)] text-white shadow-sm shadow-[var(--color-accent)]/30 scale-[1.02]' : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]')}
                  >
                    <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>
                    <span className="leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {basicItems.length > 0 && commonItems.length > 0 && (
          <div className="border-t border-[var(--color-border)] mx-1 my-1.5" />
        )}

        {commonItems.length > 0 && (
          <>
            <div className="text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-widest px-1.5 pt-1 pb-1">
              {'常用'}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {commonItems.map((item) => {
                const globalIndex = allItems.indexOf(item);
                return (
                  <button
                    key={item.id}
                    ref={(el) => { itemRefs.current[globalIndex] = el; }}
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setHighlightedIndex(globalIndex)}
                    className={'flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-xs transition-all duration-100 focus:outline-none ' + (highlightedIndex === globalIndex ? 'bg-[var(--color-accent)] text-white shadow-sm shadow-[var(--color-accent)]/30 scale-[1.02]' : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]')}
                  >
                    <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>
                    <span className="leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

      </div>

      {/* Footer hint */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-tertiary)]">
          <span>{'↑↓ 导航'}</span>
          <span>{'⌞ 选拷'}</span>
          <span>{'Esc 关闭'}</span>
        </div>
        {allItems.length > 0 && (
          <span className="text-[10px] text-[var(--color-text-tertiary)]">{allItems.length}</span>
        )}
      </div>
    </div>,
    document.body
  );
}
