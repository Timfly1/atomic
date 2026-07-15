const fs = require("fs");
const file = "src/components/atoms/AtomReader.tsx";
let c = fs.readFileSync(file, "utf-8");
let lines = c.split("\n");

// Find the useEffect that adds event listeners
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`if ((e.target as HTMLElement).closest("img"))`)) {
    const start = i;
    // Replace from this line until the closing brace of the if block
    lines[i] = `      if ((e.target as HTMLElement).closest("img")) {`;
    lines[i+1] = `        e.stopPropagation();`;
    lines[i+2] = `        e.preventDefault();`;
    lines.splice(i+3, 0, `      }`);
    console.log(`Added preventDefault at line ${i+2}`);
    break;
  }
}

// Add click and touchend listeners to the addEventListener calls
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`el.removeEventListener("mousedown"`)) {
    // Replace cleanup line
    lines[i] = `    return () => { el.removeEventListener("mousedown", h, true); el.removeEventListener("touchstart", h, true); el.removeEventListener("click", h, true); };`;
    console.log(`Updated cleanup at line ${i+1}`);
    break;
  }
}

// Insert click listener after touchstart addEventListener
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`el.addEventListener("touchstart", h, true);`)) {
    lines.splice(i+1, 0, `    el.addEventListener("click", h, true);`);
    console.log(`Added click listener at line ${i+2}`);
    break;
  }
}

fs.writeFileSync(file, lines.join("\n"), "utf-8");
console.log("Done");
