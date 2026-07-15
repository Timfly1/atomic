# -*- coding: utf-8 -*-
import sys
lines = open("src/components/atoms/AtomReader.tsx", "r", encoding="utf-8").readlines()
# Check current content
for i in range(745, 755):
    print(str(i+1) + ": " + repr(lines[i]))
# Find the broken div opening
for i, line in enumerate(lines):
    s = line.strip()
    if 'className="fixed inset-0 z-50 bg-black/90 safe-area-padding"' in s and "tabIndex={-1}" in s:
        lines[i] = '          className="fixed inset-0 z-50 bg-black/90 safe-area-padding"\n'
        lines[i+1] = '          tabIndex={-1}\n'
        lines[i+2] = '          onKeyDown={(e) => {\n'
        lines[i+3] = '            if (e.key === "Escape") setShowImagePreview(false);\n'
        lines[i+4] = '          }}\n'
        lines[i+5] = '        >\n'
        print("Fixed at line " + str(i+1))
        break
open("src/components/atoms/AtomReader.tsx", "w", encoding="utf-8").writelines(lines)
print("Done")