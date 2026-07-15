import { EditorView } from '@codemirror/view';
import { getTransport } from '../transport';

interface PasteImageHandlerOptions {
  atomId: string;
}

type PasteHandler = (event: ClipboardEvent, view: EditorView) => boolean;

/**
 * Creates a CodeMirror 6 extension that handles paste events containing images.
 * When images are detected in the clipboard, they are uploaded and inserted
 * along with any text content. Non-image content is preserved with basic formatting.
 */
export function pasteImageHandler(options: PasteImageHandlerOptions): Extension {
  const handler: PasteHandler = (event, view) => {
    if (event.type !== 'paste') return false;

    const clipboardEvent = event as ClipboardEvent;
    const clipboardData = clipboardEvent.clipboardData;
    if (!clipboardData) return false;

    // Try to get HTML content from clipboard
    const html = clipboardData.getData('text/html');
    if (!html) return false;

    // Parse HTML to find images
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const images = doc.querySelectorAll('img');

    if (images.length === 0) return false;

    // We have images - prevent default and handle them
    event.preventDefault();

    // Process images and text asynchronously
    handlePasteWithImages(clipboardEvent, view, options.atomId, doc, images);

    return true;
  };

  return EditorView.domEventHandlers({ paste: handler });
}

async function handlePasteWithImages(
  _event: ClipboardEvent,
  view: EditorView,
  atomId: string,
  doc: Document,
  images: NodeListOf<HTMLImageElement>
): Promise<void> {
  const transport = getTransport();

  // Extract text content from HTML, preserving paragraph structure
  const textContent = extractTextWithParagraphs(doc);

  // Upload all images and collect their URLs
  const imageInfos: Array<{ url: string; alt: string }> = [];

  for (const img of images) {
    const src = img.src;
    const alt = img.alt || 'pasted image';

    let file: File | null = null;

    if (src.startsWith('data:')) {
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        const extension = getExtensionFromMimeType(blob.type) || 'png';
        file = new File([blob], `image.${extension}`, { type: blob.type });
      } catch (err) {
        console.error('Failed to convert base64 image:', err);
        continue;
      }
    } else if (src.startsWith('http') || src.startsWith('//')) {
      try {
        const fullUrl = src.startsWith('//') ? `https:${src}` : src;
        const response = await fetch(fullUrl);
        if (!response.ok) continue;
        const blob = await response.blob();
        const extension = getExtensionFromMimeType(blob.type) || 'png';
        file = new File([blob], `image.${extension}`, { type: blob.type });
      } catch (err) {
        console.error('Failed to fetch external image:', err);
        continue;
      }
    }

    if (file) {
      try {
        const result = await transport.uploadEmbeddedImage(atomId, file);
        const config = transport.getConfig();
        const baseUrl = config.baseUrl?.replace(/\/$/, '') || '';
        const imageUrl = `${baseUrl}/api/atoms/${encodeURIComponent(atomId)}/embedded-images/${encodeURIComponent(result.image_id)}?token=${encodeURIComponent(config.authToken)}`;
        imageInfos.push({ url: imageUrl, alt });
      } catch (err) {
        console.error('Failed to upload pasted image:', err);
      }
    }
  }

  // Build combined markdown: text + images
  const parts: string[] = [];

  if (textContent.trim()) {
    parts.push(textContent.trim());
  }

  // Add images
  for (const { url, alt } of imageInfos) {
    parts.push(`![${alt}](${url})`);
  }

  if (parts.length === 0) return;

  const insertion = parts.join('\n\n');
  const pos = view.state.selection.main.head;

  view.dispatch({
    changes: { from: pos, to: pos, insert: insertion },
    selection: { anchor: pos + insertion.length },
  });
}

/**
 * Extract text content from HTML document, preserving paragraph breaks.
 * Converts basic formatting (bold, italic, code) to markdown.
 */
function extractTextWithParagraphs(doc: Document): string {
  const parts: string[] = [];

  // Get body or root element
  const root = doc.body || doc.documentElement;
  if (!root) return '';

  // Process each child element
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) parts.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      // Skip images - we handle them separately
      if (tagName === 'img') continue;

      // Get text content with basic formatting conversion
      const text = convertElementToMarkdown(el);
      if (text.trim()) parts.push(text.trim());
    }
  }

  return parts.join('\n\n');
}

/**
 * Convert an HTML element to markdown with basic formatting preserved.
 */
function convertElementToMarkdown(el: HTMLElement): string {
  const tagName = el.tagName.toLowerCase();

  // Handle block elements
  switch (tagName) {
    case 'p':
    case 'div': {
      const children = Array.from(el.childNodes)
        .map(n => nodeToMarkdown(n))
        .join('');
      return children.trim() || '';
    }
    case 'br': {
      return '\n';
    }
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = tagName[1];
      const text = el.textContent?.trim() || '';
      return '#'.repeat(parseInt(level)) + ' ' + text;
    }
    case 'blockquote': {
      const text = el.textContent?.trim() || '';
      return text.split('\n').map(line => '> ' + line).join('\n');
    }
    case 'pre':
    case 'code': {
      // Check if it's inline code
      if (tagName === 'code' && !el.closest('pre')) {
        return '`' + el.textContent + '`';
      }
      return '```\n' + el.textContent + '\n```';
    }
    case 'ul': {
      const items = Array.from(el.querySelectorAll('li'))
        .map(li => '- ' + li.textContent?.trim())
        .join('\n');
      return items;
    }
    case 'ol': {
      const items = Array.from(el.querySelectorAll('li'))
        .map((li, i) => (i + 1) + '. ' + li.textContent?.trim())
        .join('\n');
      return items;
    }
    default: {
      // For other elements, just get text content
      return Array.from(el.childNodes)
        .map(n => nodeToMarkdown(n))
        .join('');
    }
  }
}

/**
 * Convert a single node to markdown.
 */
function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tagName = el.tagName.toLowerCase();

    // Handle inline formatting
    switch (tagName) {
      case 'strong':
      case 'b':
        return '**' + el.textContent + '**';
      case 'em':
      case 'i':
        return '*' + el.textContent + '*';
      case 'u':
        return '__' + el.textContent + '__';
      case 's':
      case 'del':
        return '~~' + el.textContent + '~~';
      case 'code':
        return '`' + el.textContent + '`';
      case 'a':
        return '[' + el.textContent + '](' + (el.getAttribute('href') || '') + ')';
      case 'br':
        return '\n';
      case 'img':
        // Images are handled separately
        return '';
      default:
        return el.textContent || '';
    }
  }

  return '';
}

function getExtensionFromMimeType(mimeType: string): string | null {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };
  return mimeToExt[mimeType] || null;
}

// Type for CodeMirror Extension
type Extension = ReturnType<typeof EditorView.domEventHandlers>;