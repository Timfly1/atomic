# -*- coding: utf-8 -*-
import sys
lines = open("src/components/atoms/AtomReader.tsx", "r", encoding="utf-8").readlines()

# 1. Add touchstart alongside mousedown
for i, line in enumerate(lines):
    if "el.addEventListener(\"mousedown\", h, true);" in line:
        lines[i] = "    el.addEventListener(\"mousedown\", h, true);\n"
        lines.insert(i+1, "    el.addEventListener(\"touchstart\", h, true);\n")
        for j in range(i+2, i+10):
            if "el.removeEventListener(\"mousedown\"" in lines[j]:
                lines[j] = "    return () => { el.removeEventListener(\"mousedown\", h, true); el.removeEventListener(\"touchstart\", h, true); };\n"
                break
        break

# 2. Fix image preview full-screen
for i, line in enumerate(lines):
    s = line.strip()
    if s == "wrapperClass=\\"max-w-full max-h-full\\"":
        lines[i] = "                    wrapperClass=\\"!w-screen !h-screen\\"\n"
    elif s == "contentClass=\\"max-w-full max-h-full\\"":
        lines[i] = "                    contentClass=\\"!w-full !h-full flex items-center justify-center\\"\n"

for i, line in enumerate(lines):
    s = line.strip()
    if 'max-w-[85vw]' in s and 'max-h-[80vh]' in s:
        lines[i] = "                      className=\\"max-w-full max-h-full object-contain select-none\\"\n"
        break


for i, line in enumerate(lines):
    s = line.strip()
    if 'touchstart' in s or 'max-w-[' in s or 'wrapperClass' in s or 'contentClass' in s:
        print(str(i+1) + ': ' + s)
print('Done')
