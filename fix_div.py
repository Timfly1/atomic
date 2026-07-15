import sys
lines = open("src/components/atoms/AtomReader.tsx", "r", encoding="utf-8").readlines()
for i, line in enumerate(lines):
    s = line.strip()
    if s.startswith('<div className="flex-1 min-w-0"'):
        lines[i] = '          <div className="flex-1 min-w-0" onDoubleClick={handleContentDoubleClick}>\n'
        print("Fixed line " + str(i + 1))
        break
open("src/components/atoms/AtomReader.tsx", "w", encoding="utf-8").writelines(lines)
print("Done")