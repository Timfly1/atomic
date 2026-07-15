# -*- coding: utf-8 -*-
import sys

lines = open("src/components/atoms/AtomReader.tsx", "r", encoding="utf-8").readlines()

# 1. Fix the useEffect - replace with ref-based approach
# Find the existing useEffect for image prevention
for i, line in enumerate(lines):
    if "Prevent mousedown on images from focusing the editor" in line:
        start = i
        # Find the closing of this useEffect - look for "}, [editorHandleRef]);"
        for j in range(i, i + 20):
            if "}, [editorHandleRef]);" in lines[j] or "], [editorHandleRef]);" in lines[j]:
                end = j + 1
                break
        break

# Replace with ref-based version
new_effect = []
new_effect.append("  // Prevent mousedown on images from focusing the editor\n")
new_effect.append("  const previewAreaRef = useRef<HTMLDivElement>(null);\n")
new_effect.append("  useEffect(() => {\n")
new_effect.append("    const el = previewAreaRef.current;\n")
new_effect.append("    if (!el) return;\n")
new_effect.append("    const h = (e: MouseEvent) => {\n")
new_effect.append('      if ((e.target as HTMLElement).closest("img")) {\n')
new_effect.append("        e.stopPropagation();\n")
new_effect.append("      }\n")
new_effect.append("    };\n")
new_effect.append('    el.addEventListener("mousedown", h, true);\n')
new_effect.append('    return () => el.removeEventListener("mousedown", h, true);\n')
new_effect.append("  }, []);\n")
new_effect.append("\n")
print("Replacing effect at lines " + str(start) + "-" + str(end))
lines[start:end] = new_effect

# 2. Add ref to the flex-1 min-w-0 div
for i, line in enumerate(lines):
    s = line.strip()
    if 'flex-1 min-w-0" onDoubleClick={handleContentDoubleClick}' in s:
        lines[i] = line.replace(
            '<div className="flex-1 min-w-0" onDoubleClick={handleContentDoubleClick}>',
            '<div ref={previewAreaRef} className="flex-1 min-w-0" onDoubleClick={handleContentDoubleClick}>'
        )
        print("Added ref at line " + str(i + 1))
        break

# 3. Replace image preview with fixed layout
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    s = line.strip()
    if "Image Preview */" in s:
        start_idx = i
    if "Document Preview Modal" in s and start_idx is not None:
        end_idx = i
        break

new_preview = []
new_preview.append("      {/* Image Preview */}\n")
new_preview.append("      {showImagePreview && (previewImageUrl || imageUrl) && (\n")
new_preview.append("        <div\n")
new_preview.append('          className="fixed inset-0 z-50 bg-black/90 safe-area-padding"\n')
new_preview.append("          onKeyDown={(e) => {\n")
new_preview.append("            if (e.key === 'Escape') setShowImagePreview(false);\n")
new_preview.append("          }}\n")
new_preview.append("        >\n")
new_preview.append("          {/* Close button - accessible on mobile */}\n")
new_preview.append("          <button\n")
new_preview.append('            type="button"\n')
new_preview.append("            onClick={() => setShowImagePreview(false)}\n")
new_preview.append('            className="absolute top-[calc(env(safe-area-inset-top,0px)+12px)] right-[calc(env(safe-area-inset-right,0px)+12px)] z-10 w-11 h-11 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors text-lg"\n')
new_preview.append("          >\n")
new_preview.append('            <X className="w-5 h-5" />\n')
new_preview.append("          </button>\n")
new_preview.append("          <div\n")
new_preview.append('            className="w-full h-full flex items-center justify-center"\n')
new_preview.append("            onClick={(e) => {\n")
new_preview.append("              if (e.target === e.currentTarget) setShowImagePreview(false);\n")
new_preview.append("            }}\n")
new_preview.append("          >\n")
new_preview.append("            <TransformWrapper\n")
new_preview.append("              initialScale={1}\n")
new_preview.append("              minScale={0.5}\n")
new_preview.append("              maxScale={8}\n")
new_preview.append("              centerOnInit\n")
new_preview.append("              limitToBounds={false}\n")
new_preview.append("              doubleClick={{\n")
new_preview.append('                mode: "zoomIn",\n')
new_preview.append("                step: 2,\n")
new_preview.append("              }}\n")
new_preview.append("            >\n")
new_preview.append("              {({ zoomIn, zoomOut, resetTransform }) => (\n")
new_preview.append("                <>\n")
new_preview.append("                  {/* Zoom controls - bottom center */}\n")
new_preview.append('                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-black/60 rounded-full px-4 py-2.5">\n')
new_preview.append('                    <button onClick={() => zoomOut()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 text-white transition-colors">\n')
new_preview.append('                      <ZoomOut className="w-4 h-4" />\n')
new_preview.append("                    </button>\n")
new_preview.append('                    <button onClick={() => resetTransform()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 text-white transition-colors">\n')
new_preview.append('                      <RotateCcw className="w-4 h-4" />\n')
new_preview.append("                    </button>\n")
new_preview.append('                    <button onClick={() => zoomIn()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 text-white transition-colors">\n')
new_preview.append('                      <ZoomIn className="w-4 h-4" />\n')
new_preview.append("                    </button>\n")
new_preview.append("                  </div>\n")
new_preview.append("                  <TransformComponent\n")
new_preview.append('                    wrapperClass="max-w-full max-h-full"\n')
new_preview.append('                    contentClass="max-w-full max-h-full"\n')
new_preview.append("                  >\n")
new_preview.append("                    <img\n")
new_preview.append("                      src={previewImageUrl || imageUrl || \"\"}\n")
new_preview.append('                      alt="Image preview"\n')
new_preview.append('                      className="max-w-[85vw] max-h-[80vh] object-contain select-none"\n')
new_preview.append("                    />\n")
new_preview.append("                  </TransformComponent>\n")
new_preview.append("                </>\n")
new_preview.append("              )}\n")
new_preview.append("            </TransformWrapper>\n")
new_preview.append("          </div>\n")
new_preview.append("        </div>\n")
new_preview.append("      )}\n")

if start_idx is not None and end_idx is not None:
    print("Replaced image preview (lines " + str(start_idx + 1) + "-" + str(end_idx) + ")")
    lines[start_idx:end_idx] = new_preview

# 4. Add useEffect for Escape key close on the overlay
# We're adding onKeyDown to the overlay div, but it needs tabIndex to receive keyboard events
# Actually, let me just add a separate useEffect for Escape key
for i, line in enumerate(lines):
    if "showImagePreview" in line and "useState" in line:
        # Find the first showImagePreview state
        continue
    if "// Prevent mousedown on images" in line:
        # Add Escape key handler after this effect
        escape_effect = []
        escape_effect.append("  // Close image preview on Escape\n")
        escape_effect.append("  useEffect(() => {\n")
        escape_effect.append("    if (!showImagePreview) return;\n")
        escape_effect.append("    const h = (e: KeyboardEvent) => {\n")
        escape_effect.append("      if (e.key === 'Escape') setShowImagePreview(false);\n")
        escape_effect.append("    };\n")
        escape_effect.append('    document.addEventListener("keydown", h);\n')
        escape_effect.append('    return () => document.removeEventListener("keydown", h);\n')
        escape_effect.append("  }, [showImagePreview]);\n")
        escape_effect.append("\n")
        # Insert after the image prevention effect
        for j in range(i, i + 30):
            if "useEffect" in lines[j] and "}, []);" in lines[j]:
                lines.insert(j + 1, "")
                for k, line_text in enumerate(escape_effect):
                    lines.insert(j + 2 + k, line_text)
                break
        break

open("src/components/atoms/AtomReader.tsx", "w", encoding="utf-8").writelines(lines)
print("Done")
