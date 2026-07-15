const fs = require("fs");
const file = "src/components/atoms/AtomReader.tsx";
let c = fs.readFileSync(file, "utf-8");
let lines = c.split("\n");

// Remove preventDefault from the image click handler (line after stopPropagation)
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`e.preventDefault();`) && lines[i-1].includes(`e.stopPropagation();`)) {
    // Only remove preventDefault that is paired immediately after stopPropagation in the image handler
    if (lines[i-2].includes(`closest("img")`)) {
      lines.splice(i, 1);
      console.log(`Removed preventDefault at line ${i+1}`);
      break;
    }
  }
}

fs.writeFileSync(file, lines.join("\n"), "utf-8");
console.log("Done");
