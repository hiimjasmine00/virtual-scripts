if (process.argv.length < 4) {
    console.error("Usage: node find-virtual-tables.js <path-to-macos-binary> [path-to-ios-binary]");
    process.exit(0);
}

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

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

/**
 * @param {Buffer} binary
 * @param {number} offset
 * @returns {{ dataAddress: number, dataSize: number, dataOffset: number, textAddress: number, textSize: number, textOffset: number }}
 */
function readSegments(binary, offset = 0) {
    const commandsEnd = binary.readUInt32LE(offset + 20);
    let dataAddress = 0;
    let dataSize = 0;
    let dataOffset = 0;
    let textAddress = 0;
    let textSize = 0;
    let textOffset = 0;

    let i = 32;
    while (i < commandsEnd) {
        const fullOffset = offset + i;
        const cmd = binary.readUInt32LE(fullOffset);
        const cmdSize = binary.readUInt32LE(fullOffset + 4);
        if (cmd != 0x19) {
            i += cmdSize;
            continue;
        }

        const segmentName = binary.toString("utf8", fullOffset + 8, fullOffset + 24).replace(/\0/g, "");
        if (segmentName != "__TEXT" && segmentName != "__DATA" && segmentName != "__DATA_CONST") {
            i += cmdSize;
            continue;
        }

        for (let j = fullOffset + 72; j < fullOffset + cmdSize; j += 80) {
            const sectionName = binary.toString("utf8", j, j + 16).replace(/\0/g, "");
            if (sectionName != "__const") continue;

            if (segmentName == "__TEXT") {
                textAddress = Number(binary.readBigUint64LE(j + 32));
                textSize = binary.readUInt32LE(j + 40);
                textOffset = binary.readUInt32LE(j + 48) + offset;
            }
            else if (segmentName == "__DATA" || segmentName == "__DATA_CONST") {
                dataAddress = Number(binary.readBigUint64LE(j + 32));
                dataSize = binary.readUInt32LE(j + 40);
                dataOffset = binary.readUInt32LE(j + 48) + offset;
            }
        }

        i += cmdSize;
    }

    return { dataAddress, dataSize, dataOffset, textAddress, textSize, textOffset };
}

let {
    dataAddress: dataAddressAarch,
    dataOffset: dataOffsetAarch,
    dataSize: dataSizeAarch,
    textAddress: textAddressAarch,
    textOffset: textOffsetAarch,
    textSize: textSizeAarch
} = readSegments(macos, aarchOffset);
let {
    dataAddress: dataAddressX86,
    dataOffset: dataOffsetX86,
    dataSize: dataSizeX86,
    textAddress: textAddressX86,
    textOffset: textOffsetX86,
    textSize: textSizeX86
} = readSegments(macos, x86Offset);
let {
    dataAddress: dataAddressIos,
    dataOffset: dataOffsetIos,
    dataSize: dataSizeIos,
    textAddress: textAddressIos,
    textOffset: textOffsetIos,
    textSize: textSizeIos
} = ios ? readSegments(ios) : { dataOffset: 0, dataSize: 0, textOffset: 0, textSize: 0 };

const tablesDir = path.join(__dirname, "tables");
if (!fs.existsSync(tablesDir)) fs.mkdirSync(tablesDir);

/**
 * @param {string} name
 * @param {Buffer} binary
 * @param {number} dataAddress
 * @param {number} dataOffset
 * @param {number} dataSize
 * @param {number} textAddress
 * @param {number} textOffset
 * @param {number} textSize
 */
function readVtables(name, binary, dataAddress, dataOffset, dataSize, textAddress, textOffset, textSize) {
    const typeinfoNames = {};
    const typeinfos = {};
    const vtables = {};

    const textDiff = textAddress - textOffset;
    for (let i = dataOffset; i < dataOffset + dataSize; i += 8) {
        try {
            const offset = Number(binary.readBigUint64LE(i) & 0x7fffffffffffffffn);
            if (offset < textAddress || offset >= textAddress + textSize) continue;

            const startingChar = binary[offset - textDiff];
            if (startingChar != 0x4e && (startingChar < 0x30 || startingChar > 0x39)) continue;

            // create possible typeinfo name, break if it hits a null byte or exceeds 100 characters
            let typeinfoName = "";
            for (let j = offset; j < offset + 100; j++) {
                const character = binary[j - textDiff];
                if (character == 0) break;
                typeinfoName += String.fromCharCode(character);
            }

            typeinfoNames[offset] = typeinfoName;
        } catch (e) {}
    }

    console.log(`Found ${Object.keys(typeinfoNames).length} typeinfo names for ${name}`);
    
    const dataDiff = dataAddress - dataOffset;
    for (let i = dataOffset; i < dataOffset + dataSize; i += 8) {
        try {
            const offset = Number(binary.readBigUint64LE(i) & 0x7fffffffffffffffn);
            if (!(offset in typeinfoNames)) continue;

            typeinfos[i + dataDiff - 8] = typeinfoNames[offset];
        } catch (e) {}
    }

    console.log(`Found ${Object.keys(typeinfos).length} typeinfos for ${name}`);

    for (let i = dataOffset; i < dataOffset + dataSize; i += 8) {
        try {
            const offset = Number(binary.readBigUint64LE(i) & 0x7fffffffffffffffn);
            if (!(offset in typeinfos)) continue;

            const thunkOffset = binary.readBigUint64LE(i - 8);
            if (thunkOffset > 0) continue;

            vtables[i + dataDiff + 8] = typeinfos[offset];
        } catch (e) {}
    }

    console.log(`Found ${Object.keys(vtables).length} vtables for ${name}`);

    const vtableEntries = Object.entries(vtables).sort((a, b) => a[0] - b[0])
        .map(([offset, typeinfoName]) => `_ZTV${typeinfoName} : 0x${parseInt(offset).toString(16)}`).join("\n");
    // run demumble, then put content in stdin
    try {
        const demumble = cp.spawn("demumble");
        demumble.stdin.write(vtableEntries);
        demumble.stdin.end();
        let demumbled = "";
        demumble.stdout.on("data", data => demumbled += data.toString());

        demumble.on("close", code => {
            if (code != 0) {
                console.error(`Failed to demangle vtables for ${name}`);
                return;
            }

            fs.writeFileSync(path.join(tablesDir, `${name}.txt`), demumbled.replace(/\r/g, "").replace(/vtable for /g, ""));
            console.log(`Wrote ${name} vtable to ${path.join(tablesDir, `${name}.txt`)}`);
        });
    } catch (e) {
        console.error(`Failed to demangle vtables for ${name}`);
        console.error(e);
        fs.writeFileSync(path.join(tablesDir, `${name}.txt`), vtableEntries);
        console.log(`Wrote ${name} vtable to ${path.join(tablesDir, `${name}.txt`)}`);
    }
}

readVtables("m1", macos, dataAddressAarch, dataOffsetAarch, dataSizeAarch, textAddressAarch, textOffsetAarch, textSizeAarch);
readVtables("imac", macos, dataAddressX86, dataOffsetX86, dataSizeX86, textAddressX86, textOffsetX86, textSizeX86);
if (ios) readVtables("ios", ios, dataAddressIos, dataOffsetIos, dataSizeIos, textAddressIos, textOffsetIos, textSizeIos);
