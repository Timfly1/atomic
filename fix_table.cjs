const fs = require("fs");
const file = "crates/atomic-core/src/document/docx_parser.rs";
let c = fs.readFileSync(file, "utf-8");
let lines = c.split("\n");

// 1. Add row_cells variable
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("let mut table_cells: Vec<String> = Vec::new();")) {
    lines.splice(i + 1, 0, "    let mut row_cells: Vec<String> = Vec::new();");
    console.log("Added row_cells at line " + (i + 2));
    break;
  }
}

// 2. Fix w:tc end
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === '"w:tc" => {' && i < lines.length - 1 && lines[i + 1].includes("in_cell = false;")) {
    lines[i] = '                    "w:tc" => {\n';
    lines[i + 1] = '                        in_cell = false;\n';
    lines[i + 2] = '                        if in_table {\n';
    lines[i + 3] = '                            row_cells.push(std::mem::take(&mut cell_content));\n';
    lines[i + 4] = '                        }\n';
    console.log("Fixed w:tc end at line " + (i + 1));
    break;
  }
}

// 3. Fix w:tr end
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === '"w:tr" => {' && i > 400) {
    const oldEnd = (() => {
      for (let j = i + 6; j < Math.min(i + 15, lines.length); j++) {
        if (lines[j].trim() === "}") return j;
      }
      return i + 10;
    })();
    const replacement = [
      '                    "w:tr" => {\n',
      '                        if in_table && !row_cells.is_empty() {\n',
      "                        let row_str = format!(\"|{}|\", row_cells.join(\"|\").replace('\\n', \" \"));\n",
      '                            table_cells.push(row_str);\n',
      '                            row_cells.clear();\n',
      '                        }\n',
      '                    }\n'
    ];
    lines.splice(i, oldEnd - i + 1, ...replacement);
    console.log("Fixed w:tr end");
    break;
  }
}

// 4. Fix separator calculation
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("row.matches('|').count()).max().unwrap_or(0).max(1)")) {
    lines[i] = lines[i].replace(
      "row.matches('|').count()).max().unwrap_or(0).max(1)",
      "row.matches('|').count()).max().unwrap_or(1).saturating_sub(1).max(1)"
    );
    console.log("Fixed separator calc at line " + (i + 1));
    break;
  }
}

// 5. Simplify table output
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("let first_pipe = table_cells[0].find")) {
    lines[i] = "                            content.push_str(&table_cells[0]);\n";
    lines.splice(i + 1, 4);
    console.log("Simplified header output");
    break;
  }
}

// 6. Simplify row loop
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("let first_pipe = row.find")) {
    lines[i] = "                                content.push_str(row);\n";
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      if (lines[j].includes("content.push_str") || lines[j].includes("let last_pipe") || lines[j].includes("let first_pipe")) {
        lines[j] = "";
      }
    }
    console.log("Simplified row output");
    break;
  }
}

// Clean up
lines = lines.filter(l => l.trim() || l === "\n");
let result = "";
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() || lines[i] === "\n") {
    result += lines[i];
  } else if (result.length > 0 && result[result.length - 1] !== "\n") {
    result += "\n";
  }
}

fs.writeFileSync(file, result, "utf-8");
console.log("Done");