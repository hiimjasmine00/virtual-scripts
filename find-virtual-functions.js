if (process.argv.length < 4) {
    console.error("Usage: node find-virtual-functions.js <path-to-macos-binary> [path-to-ios-binary]");
    process.exit(1);
}

const fs = require("fs");
const path = require("path");
const vfuncs = Object.fromEntries(Object.entries(require("./virtuals.json")).map(([k, v]) => [k, v[0]]));

function readVtables(file) {
    return Object.fromEntries(
        fs.readFileSync(file, "utf8")
            .replace(/\r/g, "")
            .split("\n")
            .map(x => x.split(" : ").map((y, i) => i == 1 ? parseInt(y, 16) - 0x100000000 : y))
    );
}

const macos = fs.readFileSync(path.resolve(process.cwd(), process.argv[2]));
const ios = process.argv[3] ? fs.readFileSync(path.resolve(process.cwd(), process.argv[3])) : null;

if (macos[0] != 0xCA || macos[1] != 0xFE || macos[2] != 0xBA || macos[3] != 0xBE) {
    console.error("Invalid magic number for macOS binary");
    process.exit(1);
}
const numBinaries = macos.readUInt32BE(4);
let aarchOffset = 0;
let x86Offset = 0;
for (let i = 0; i < numBinaries; i++) {
    const offset = 8 + i * 20;
    const cpuType = macos.readUInt32BE(offset);
    if (cpuType == 0x0100000c) aarchOffset = macos.readUInt32BE(offset + 8);
    else if (cpuType == 0x01000007) x86Offset = macos.readUInt32BE(offset + 8);
}

const classesDir = path.join(__dirname, "classes");
if (!fs.existsSync(classesDir)) fs.mkdirSync(classesDir);

const m1Vtables = readVtables(path.join(__dirname, "tables", "m1.txt"));
const imacVtables = readVtables(path.join(__dirname, "tables", "imac.txt"));
const iosVtables = ios ? readVtables(path.join(__dirname, "tables", "ios.txt")) : null;

for (const [className, table] of Object.entries(vfuncs)) {
    while (table[table.length - 1] == "") table.pop();

    fs.writeFileSync(path.join(classesDir, `${className.replace(/::/g, "__")}.txt`), table.map((x, i) => {
        const offsets = { m1: m1Vtables[className] + i * 8, imac: imacVtables[className] + i * 8, ios: ios ? iosVtables[className] + i * 8 : NaN };
        if (Number.isNaN(offsets.m1)) delete offsets.m1;
        else offsets.m1 = macos.readUInt32LE(aarchOffset + offsets.m1);
        if (Number.isNaN(offsets.imac)) delete offsets.imac;
        else offsets.imac = macos.readUInt32LE(x86Offset + offsets.imac);
        if (Number.isNaN(offsets.ios)) delete offsets.ios;
        else offsets.ios = ios.readUInt32LE(offsets.ios);
        const offsetEntries = Object.entries(offsets);
        return x.startsWith(className + "::") && offsetEntries.length > 0 ? `${x} = ${offsetEntries.map(([k, v]) => `${k} 0x${v.toString(16)}`).join(", ")};` : x + ";";
    }).join("\n"));
}
