# -*- coding: utf-8 -*-
import sys
lines = open("src/components/atoms/AtomReader.tsx", "r", encoding="utf-8").readlines()
for i, line in enumerate(lines):
    s = line.strip()
    if "bg-black/90 safe-area-padding tabIndex=" in s:
        lines[i] = line.replace(' safe-area-padding tabIndex={-1}>', ' safe-area-padding" tabIndex={-1}>')
        print("Fixed line " + str(i+1))
        break
open("src/components/atoms/AtomReader.tsx", "w", encoding="utf-8").writelines(lines)
print("Done")