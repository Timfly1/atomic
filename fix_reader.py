# -*- coding: utf-8 -*-
import sys
lines = open(sys.argv[1], "r", encoding="utf-8").readlines()

# 1. Find component-level return (after atomLinkExtensions) and insert callback
insert_idx = None
for i in range(410, len(lines)):
    if lines[i].strip() == "return (" and lines[i-1].strip() == "":
        insert_idx = i
        break
print(f"Insert at line {insert_idx + 1}")

cb = []
cb.append("\n")
cb.append("  const handleContentDoubleClick = useCallback((e: React.MouseEvent) => {\n")
cb.append("    const img = (e.target as HTMLElement).closest('img');\n")
cb.append("    if (img?.getAttribute('src')) {\n")
cb.append("      setPreviewImageUrl(img.getAttribute('src')!);\n")
cb.append("      setShowImagePreview(true);\n")
cb.append("    }\n")
cb.append("  }, [setPreviewImageUrl, setShowImagePreview]);\n")
cb.append("\n")
lines[insert_idx:insert_idx] = cb

# 2. Modify onLinkClick handler
for i, line in enumerate(lines):
    if "// Intercept embedded image URLs and show preview instead of opening externally" in line:
        print(f"Modify onLinkClick at line {i + 1}")
        lines[i] = "                  // Don't open images on single click; double-click to show preview\n"
        lines[i+1] = '                  const isImage = /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)/i.test(url) || url.includes("/embedded-images/");\n'
        lines[i+2] = "                  if (isImage) return;\n"
        del lines[i+3:i+7]
        break

# 3. Add onDoubleClick to flex-1 min-w-0 div
for i, line in enumerate(lines):
    if '<div className="flex-1 min-w-0">' in line and "onDoubleClick" not in line:
        print(f"Add onDoubleClick at line {i + 1}")
        lines[i] = line.rstrip() + " onDoubleClick={handleContentDoubleClick}>\n"
        break

open(sys.argv[1], "w", encoding="utf-8").writelines(lines)
print("Done")
