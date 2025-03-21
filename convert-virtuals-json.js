const fs = require("fs");
const path = require("path");
/**
 * @type {Object.<string, string[][]>}
 */
const virtuals = require("./virtuals.json");

for (const className of Object.keys(virtuals)) {
    const tables = virtuals[className];
    if (className == "GJBaseGameLayer") tables[0].splice(1, 1);

    // if there are two destructors, remove the second one
    const destructor = `${className}::~${className.split("::").pop()}()`;
    for (const table of tables) {
        if (table.filter(x => x == destructor).length > 1) table.splice(table.lastIndexOf(destructor), 1);
    }

    const otherTables = tables.slice(1);
    for (let i = 0; i < tables[0].length; i++) {
        const functionName = tables[0][i];
        if (functionName != destructor && otherTables.some(x => x.includes(functionName))) {
            tables[0].splice(tables[0].indexOf(functionName), 1);
            i--;
        }
    }

    for (let i = 1; i < tables.length; i++) {
        const table = tables[i];
        for (let j = 0; j < table.length; j++) {
            const functionName = table[j];
            const tableIndex = tables.findIndex((x, k) => k > i && x.includes(functionName));
            if (functionName != destructor && tableIndex != -1) tables[tableIndex].splice(tables[tableIndex].indexOf(functionName), 1, "");
        }
    }

    for (const table of tables) {
        const functionNames = [];
        for (const functionName of table) {
            const functionMatch = functionName.split("(")[0].includes("::") ? functionName.match(/(?<=::)([^:(]+)\(/) : functionName.match(/([^:(]+)\(/);
            const strippedName = functionMatch ? functionMatch[1] : functionName;
            if (!functionNames.some(x => x[0] == strippedName)) functionNames.push([strippedName, [functionName]]);
            else functionNames.find(x => x[0] == strippedName)[1].push(functionName);
        }

        table.splice(0, table.length, ...functionNames.map(x => x[1].reverse()).flat());
    }
}

fs.writeFileSync(path.join(__dirname, "virtuals-win.json"), JSON.stringify(virtuals, null, 2), "utf8");
