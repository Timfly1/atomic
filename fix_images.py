# -*- coding: utf-8 -*-
import sys

lines = open("src/components/atoms/AtomReader.tsx", "r", encoding="utf-8").readlines()

# 1. Add useEffect after handleContentDoubleClick
insert_pos = None
for i, line in enumerate(lines):
    if "handleContentDoubleClick = useCallback" in line:
        for j in range(i, i + 20):
            if j < len(lines) and lines[j].strip() == "return (":
                insert_pos = j
                break
        break

effect_code = []
effect_code.append("\n")
effect_code.append("  // Prevent mousedown on images from focusing the editor\n")
effect_code.append("  useEffect(() => {\n")
effect_code.append("    const el = editorHandleRef.current?.getContentDOM();\n")
effect_code.append("    if (!el) return;\n")
effect_code.append("    const h = (e: MouseEvent) => {\n")
effect_code.append("      if ((e.target as HTMLElement).closest(\"img\")) {\n")
effect_code.append("        e.stopPropagation();\n")
effect_code.append("      }\n")
effect_code.append("    };\n")
effect_code.append('    el.addEventListener("mousedown", h, true);\n')
effect_code.append('    return () => el.removeEventListener("mousedown", h, true);\n')
effect_code.append("  }, [editorHandleRef]);\n")
effect_code.append("\n")
lines[insert_pos:insert_pos] = effect_code
print("1. Added useEffect for image click prevention at line " + str(insert_pos + 1))

# 2. Replace image preview modal with full-screen overlay
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    s = line.strip()
    if "Image Preview Modal with Zoom/Pan" in s:
        start_idx = i
    if "Document Preview Modal" in s and start_idx is not None:
        end_idx = i
        break

new_preview = []
new_preview.append("      {/* Image Preview */}\n")
new_preview.append("      {showImagePreview && (previewImageUrl || imageUrl) && (\n")
new_preview.append("        <div\n")
new_preview.append('          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 safe-area-padding"\n')
new_preview.append("          onClick={(e) => {\n")
new_preview.append("            if (e.target === e.currentTarget) setShowImagePreview(false);\n")
new_preview.append("          }}\n")
new_preview.append("        >\n")
new_preview.append("          <TransformWrapper\n")
new_preview.append("            initialScale={1}\n")
new_preview.append("            minScale={0.5}\n")
new_preview.append("            maxScale={8}\n")
new_preview.append("            centerOnInit\n")
new_preview.append("            limitToBounds={false}\n")
new_preview.append("            doubleClick={{\n")
new_preview.append('              mode: "zoomIn",\n')
new_preview.append("              step: 2,\n")
new_preview.append("            }}\n")
new_preview.append("          >\n")
new_preview.append("            {({ zoomIn, zoomOut, resetTransform }) => (\n")
new_preview.append("              <>\n")
new_preview.append("                <button\n")
new_preview.append('                  type="button"\n')
new_preview.append("                  onClick={() => setShowImagePreview(false)}\n")
new_preview.append('                  className="fixed top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"\n')
new_preview.append("                >\n")
new_preview.append('                  <X className="w-5 h-5" />\n')
new_preview.append("                </button>\n")
new_preview.append('                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/50 rounded-full px-3 py-2">\n')
new_preview.append('                  <button onClick={() => zoomOut()} className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors">\n')
new_preview.append('                    <ZoomOut className="w-4 h-4" />\n')
new_preview.append("                  </button>\n")
new_preview.append('                  <button onClick={() => resetTransform()} className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors">\n')
new_preview.append('                    <RotateCcw className="w-4 h-4" />\n')
new_preview.append("                  </button>\n")
new_preview.append('                  <button onClick={() => zoomIn()} className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors">\n')
new_preview.append('                    <ZoomIn className="w-4 h-4" />\n')
new_preview.append("                  </button>\n")
new_preview.append("                </div>\n")
new_preview.append("                <TransformComponent\n")
new_preview.append('                  wrapperClass="!w-screen !h-screen"\n')
new_preview.append('                  contentClass="!w-full !h-full flex items-center justify-center"\n')
new_preview.append("                >\n")
new_preview.append("                  <img\n")
new_preview.append("                    src={previewImageUrl || imageUrl || \"\"}\n")
new_preview.append('                    alt="Image preview"\n')
new_preview.append('                    className="max-w-[95vw] max-h-[95vh] object-contain"\n')
new_preview.append("                  />\n")
new_preview.append("                </TransformComponent>\n")
new_preview.append("              </>\n")
new_preview.append("            )}\n")
new_preview.append("          </TransformWrapper>\n")
new_preview.append("        </div>\n")
new_preview.append("      )}\n")

if start_idx is not None and end_idx is not None:
    print("2. Replaced image preview (lines " + str(start_idx + 1) + "-" + str(end_idx) + ")")
    lines[start_idx:end_idx] = new_preview
else:
    print("2. Could not find image preview section")

open("src/components/atoms/AtomReader.tsx", "w", encoding="utf-8").writelines(lines)
print("Done")
