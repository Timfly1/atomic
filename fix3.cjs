const fs = require("fs");
const file = "src/components/atoms/AtomReader.tsx";
let c = fs.readFileSync(file, "utf-8");
let lines = c.split("\n");

// Remove touchstart listener and addEventListener line
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`el.addEventListener("touchstart", h, true);`)) {
    lines.splice(i, 1); // remove the touchstart line
    console.log(`Removed touchstart listener at line ${i+1}`);
    break;
  }
}

// Update cleanup to remove touchstart reference
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`el.removeEventListener("touchstart"`)) {
    lines[i] = lines[i].replace(`, el.removeEventListener("touchstart", h, true)`, "");
    console.log(`Updated cleanup at line ${i+1}`);
    break;
  }
}

fs.writeFileSync(file, lines.join("\n"), "utf-8");
console.log("Done");
