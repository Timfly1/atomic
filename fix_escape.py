# -*- coding: utf-8 -*-
import sys
lines = open("src/components/atoms/AtomReader.tsx", "r", encoding="utf-8").readlines()

# Add tabIndex to overlay
for i, line in enumerate(lines):
    s = line.strip()
    if 'className="fixed inset-0 z-50 bg-black/90 safe-area-padding"' in s:
        lines[i] = s[:s.rfind(">")] + " tabIndex={-1}>\n"
        print("Add tabIndex line " + str(i + 1))
        break

# Add Escape useEffect
for i, line in enumerate(lines):
    if "previewAreaRef" in line and "useRef" in line:
        for j in range(i, i + 30):
            if "}, []);" in lines[j]:
                escape = []
                escape.append("  // Close image preview on Escape\n")
                escape.append("  useEffect(() => {\n")
                escape.append("    if (!showImagePreview) return;\n")
                escape.append("    const h = (e: KeyboardEvent) => {\n")
                escape.append("      if (e.key === \"Escape\") setShowImagePreview(false);\n")
                escape.append("    };\n")
                escape.append("    document.addEventListener(\"keydown\", h);\n")
                escape.append("    return () => document.removeEventListener(\"keydown\", h);\n")
                escape.append("  }, [showImagePreview]);\n")
                lines.insert(j + 1, "\n")
                for k, l in enumerate(escape):
                    lines.insert(j + 2 + k, l)
                print("Add Escape effect at line " + str(j + 2))
                break
        break

open("src/components/atoms/AtomReader.tsx", "w", encoding="utf-8").writelines(lines)
print("Done")
