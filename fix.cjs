const fs = require("fs");
const content = fs.readFileSync("src/components/atoms/AtomReader.tsx", "utf-8");
let lines = content.split("\n");

// 1. Add touchstart alongside mousedown
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`el.addEventListener("mousedown", h, true);`)) {
    lines[i] = `    el.addEventListener("mousedown", h, true);`;
    lines.splice(i + 1, 0, `    el.addEventListener("touchstart", h, true);`);
    console.log(`Added touchstart at line ${i + 2}`);
    break;
  }
}

// Fix cleanup for both events
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`el.removeEventListener("mousedown"`)) {
    lines[i] = `    return () => { el.removeEventListener("mousedown", h, true); el.removeEventListener("touchstart", h, true); };`;
    console.log(`Fixed cleanup at line ${i + 1}`);
    break;
  }
}

// 2. Fix wrapperClass and contentClass to full-screen
for (let i = 0; i < lines.length; i++) {
  const s = lines[i].trim();
  if (s === `wrapperClass="max-w-full max-h-full"`) {
    lines[i] = `                    wrapperClass="!w-screen !h-screen"`;
    console.log(`Fixed wrapperClass at line ${i + 1}`);
  } else if (s === `contentClass="max-w-full max-h-full"`) {
    lines[i] = `                    contentClass="!w-full !h-full flex items-center justify-center"`;
    console.log(`Fixed contentClass at line ${i + 1}`);
  }
}

// 3. Fix image size to full-screen
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`max-w-[85vw]`) && lines[i].includes(`max-h-[80vh]`)) {
    lines[i] = `                      className="max-w-full max-h-full object-contain select-none"`;
    console.log(`Fixed image class at line ${i + 1}`);
    break;
  }
}

fs.writeFileSync("src/components/atoms/AtomReader.tsx", lines.join("\n"), "utf-8");
console.log("Done");
