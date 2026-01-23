if (process.argv.length < 3) {
    console.error("Usage: node find-virtual-functions-win.js <path-to-windows-binary>");
    process.exit(0);
}

const fs = require("fs");
const path = require("path");
/**
 * @type {Object.<string, string[][]>}
 */
const vfuncs = require("./virtuals-win.json");

const windows = fs.readFileSync(path.resolve(process.cwd(), process.argv[2]));

const classesDir = path.join(__dirname, "classes-win");
if (!fs.existsSync(classesDir)) fs.mkdirSync(classesDir);

const winVtables = Object.fromEntries(
    fs.readFileSync(path.join(__dirname, "tables", "win.txt"), "utf8")
        .replace(/\r/g, "")
        .split("\n")
        .map(x => x.split(" : ").map((y, i) => i == 1 ? y.split(", ").map(z => parseInt(z, 16) - 0x140001a00) : y))
);

for (const [className, tables] of Object.entries(vfuncs)) {
    if (!winVtables[className]) {
        console.error(`No vtable found for ${className}`);
        continue;
    }
    let output = "";
    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        output += table.map((x, j) => {
            const offset = winVtables[className][i] + j * 8;
            const vtable = windows.readUInt32LE(offset) - 0x40000000;
            return x.startsWith(className + "::") ? `${x} = win 0x${vtable.toString(16)};` : x + ";";
        }).join("\n") + "\n";
    }
    fs.writeFileSync(path.join(classesDir, `${className.replace(/::/g, "__")}.txt`), output);
}
