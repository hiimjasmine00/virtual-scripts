if (process.argv.length < 3) {
    console.error("Usage: node import-virtual-bindings.js <path-to-bindings> <version>");
    process.exit(1);
}

const fs = require("fs");
const path = require("path");
const bindingsPath = path.resolve(process.cwd(), process.argv[2]);
const cocosPath = path.join(bindingsPath, "bindings", process.argv[3], "Cocos2d.bro");
const gdPath = path.join(bindingsPath, "bindings", process.argv[3], "GeometryDash.bro");

const classesPath = path.join(__dirname, "classes");
const virtualClasses = Object.fromEntries(
    fs.readdirSync(classesPath)
        .filter(x => x.endsWith(".txt"))
        .map(x => [x.split(".")[0].replace(/__/g, "::"), fs.readFileSync(path.join(classesPath, x), "utf8").replace(/\r/g, "").split("\n")])
);

const gdBro = fs.readFileSync(gdPath, "utf8").replace(/\r/g, "") + "\n" + fs.readFileSync(cocosPath, "utf8").replace(/\r/g, "");
/** @type {Record<string, string>} */
const gdClasses = {};
let curlyBracketCount = 0;
let currentClass = "";
const gdBroLines = gdBro.split("\n");
for (let i = 0; i < gdBroLines.length; i++) {
    const line = gdBroLines[i];
    const oldBracketCount = curlyBracketCount;
    if (line.includes("{")) curlyBracketCount++;
    if (line.includes("}")) curlyBracketCount--;
    if (line.startsWith("class") && curlyBracketCount == 1 && oldBracketCount == 0) {
        currentClass = line.split(" ")[1];
        // find the last index before the class name that is a blank line
        let j = i - 1;
        for (; j >= -1; j--) {
            if (j == -1 || gdBroLines[j].length == 0) {
                j++;
                break;
            }
        }
        if (i == j) {
            gdClasses[currentClass] = line + "\n";
            continue;
        }

        gdClasses[currentClass] = gdBroLines.slice(j, i).join("\n") + "\n" + line + "\n";
        continue;
    }
    if (curlyBracketCount == 0 && oldBracketCount > 0) {
        gdClasses[currentClass] += line;
        currentClass = "";
        continue;
    }

    if (currentClass.length > 0) gdClasses[currentClass] += line + "\n";
}

const newGdClasses = {...gdClasses};
for (const [className, funcs] of Object.entries(virtualClasses)) {
    if (!(className in gdClasses)) continue;

    const gdClass = gdClasses[className];
    const gdFuncs = gdClass.split("\n");
    const gdVirtuals = gdFuncs.filter(x => x.match(/\s+virtual/));
    const strippedFuncs = gdVirtuals.map(x => {
        // split by first opening parenthesis and last closing parenthesis
        const start = x.indexOf("(");
        const end = x.lastIndexOf(")");
        const args = x.slice(start + 1, end);
        // split by commas, but be careful of commas in function argument types
        const parts = args.split(/,(?![^<]*>)/).map(x => {
            return (x.match(/(?<lconst>\bconst\s+)?(?<sign>\b(?:signed|unsigned)\s+)?(?<name>(?:\w+::)*\w+)(?<template><(?:(?:\bconst\s+)?(?:\b(?:signed|unsigned)\s+)?(?:(?:\w+::)*\w+)(?:<(?:(?:\bconst\s+)?(?:\b(?:signed|unsigned)\s+)?(?:(?:\w+::)*\w+)(?:<(?:__depth_limit)(?:\s*,\s*(?:__depth_limit))*>)?(?:\s+const\b)?(?:\s*\*+)?(?:\s*&+)?)(?:\s*,\s*(?:(?:\bconst\s+)?(?:\b(?:signed|unsigned)\s+)?(?:(?:\w+::)*\w+)(?:<(?:__depth_limit)(?:\s*,\s*(?:__depth_limit))*>)?(?:\s+const\b)?(?:\s*\*+)?(?:\s*&+)?))*>)?(?:\s+const\b)?(?:\s*\*+)?(?:\s*&+)?)(?:\s*,\s*(?:(?:\bconst\s+)?(?:\b(?:signed|unsigned)\s+)?(?:(?:\w+::)*\w+)(?:<(?:(?:\bconst\s+)?(?:\b(?:signed|unsigned)\s+)?(?:(?:\w+::)*\w+)(?:<(?:__depth_limit)(?:\s*,\s*(?:__depth_limit))*>)?(?:\s+const\b)?(?:\s*\*+)?(?:\s*&+)?)(?:\s*,\s*(?:(?:\bconst\s+)?(?:\b(?:signed|unsigned)\s+)?(?:(?:\w+::)*\w+)(?:<(?:__depth_limit)(?:\s*,\s*(?:__depth_limit))*>)?(?:\s+const\b)?(?:\s*\*+)?(?:\s*&+)?))*>)?(?:\s+const\b)?(?:\s*\*+)?(?:\s*&+)?))*>)?(?<rconst>\s+const\b)?(?<ptr>\s*\*+)?(?<ref>\s*&+)?/) || "")[0];
        }).map(x => {
            return x ? x.replace(/_ccColor3B/g, "ccColor3B").replace(/_ccColor4B/g, "ccColor4B").replace(/_ccColor4F/g, "ccColor4F").replace(/_ccHSVValue/g, "ccHSVValue") : x;
        }).map(x => {
            // replace "const char*" with "char const*" and "const Type&" with "Type const&"
            return x ? x.replace(/const [^&*]+(?=[&*])/g, x => x.split(" ").reverse().join(" ")) : x;
        });
        // remove parameter names
        return x.slice(0, start + 1) + parts.join(", ") + x.slice(end);
    });

    const newFuncs = funcs.filter(x => x.includes(" = "));
    for (let i = 0; i < newFuncs.length; i++) {
        const func = newFuncs[i];
        const [funcName, platformValues] = func.split(" = ");
        const strippedFuncName = funcName.split("(")[0].split("::").pop() + "(" + funcName.split("(").slice(1).join("(");
        if (strippedFuncName.startsWith("~")) continue;
        let gdFunc = strippedFuncs.findIndex(x => x.includes(strippedFuncName));
        if (gdFunc < 0 && strippedFuncName.endsWith(" const")) {
            gdFunc = strippedFuncs.findIndex(x => x.includes(strippedFuncName.slice(0, -6)));
            if (gdFunc < 0) {
                console.error(`No function found for ${func}`);
                continue;
            }
        } else if (gdFunc < 0) {
            console.error(`No function found for ${func}`);
            continue;
        }
        const originalFuncIndex = gdFuncs.findIndex(x => x == gdVirtuals[gdFunc]);
        if (originalFuncIndex < 0) {
            console.error(`No virtual found for ${func}\n${gdVirtuals[gdFunc]}\n${strippedFuncs[gdFunc]}`);
            continue;
        }
        let funcToSet = gdFuncs[originalFuncIndex];
        for (const platformValue of platformValues.slice(0, -1).split(", ")) {
            const [platform] = platformValue.split(" ");
            if (funcToSet.includes(platform + " 0x")) {
                const platformRegex = new RegExp(platform + " 0x[0-9a-fA-F]+");
                const originalPlatformValue = funcToSet.match(platformRegex)[0];
                if (originalPlatformValue.toLowerCase() == platformValue) continue;
                console.log("Replacing existing binding", originalPlatformValue, "with", platformValue);
                funcToSet = funcToSet.replace(platformRegex, platformValue);
            }
            else {
                const end = funcToSet.indexOf(" {") >= 0 ? funcToSet.indexOf(" {") : funcToSet.indexOf(";");
                if (funcToSet[end - 1] == ")") {
                    // no bindings for other platforms
                    funcToSet = funcToSet.slice(0, end) + " = " + platformValue + funcToSet.slice(end);
                } else {
                    // bindings for other platforms
                    funcToSet = funcToSet.slice(0, end) + (funcToSet.slice(0, end).endsWith("const") ? " = " : ", ")
                        + platformValue + funcToSet.slice(end);
                }
            }
        }

        gdFuncs[originalFuncIndex] = funcToSet;
    }

    newGdClasses[className] = gdFuncs.join("\n");
}

const newGdBro = {...newGdClasses};
const newCocosBro = {...newGdClasses};
let intoCocos = false;
for (const [className, funcs] of Object.entries(newGdClasses)) {
    if (intoCocos) {
        newCocosBro[className] = funcs;
        delete newGdBro[className];
    } else {
        newGdBro[className] = funcs;
        delete newCocosBro[className];
    }
    if (className == "WorldSelectLayer") intoCocos = true;
}

const outputDir = path.join(__dirname, "output");
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

fs.writeFileSync(path.join(outputDir, "GeometryDash.bro"), Object.values(newGdBro).join("\n\n") + "\n");
fs.writeFileSync(path.join(outputDir, "Cocos2d.bro"), Object.values(newCocosBro).join("\n\n") + "\n");
