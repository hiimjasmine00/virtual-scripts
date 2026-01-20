// @author hiimjasmine00
// @category VirtualScripts

import ghidra.app.script.GhidraScript;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolTable;
import ghidra.program.model.symbol.SymbolType;

import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class WindowsVirtuals extends GhidraScript {
    Map<String, List<Long>> vtables = new HashMap<>();

    void processSymbol(SymbolTable symbolTable, Symbol symbol) throws Exception {
        List<Long> tables = new ArrayList<>();
        List<Integer> tableOffsets = new ArrayList<>();
        List<Integer> tableIndices = new ArrayList<>();
        int i = 0;

        for (Symbol vtable : symbolTable.getChildren(symbol)) {
            if (!vtable.getName().equals("vftable")) continue;

            tables.add(vtable.getAddress().getOffset());
            tableOffsets.add(getInt(toAddr(getLong(vtable.getAddress().subtract(8)) + 4)));
            tableIndices.add(i);
            i++;
        }

        if (tables.isEmpty()) return;

        Collections.sort(tableIndices, (a, b) -> tableOffsets.get((int) a).compareTo(tableOffsets.get((int) b)));

        List<Long> sortedTables = new ArrayList<>();
        for (int index : tableIndices) {
            sortedTables.add(tables.get(index));
        }
        vtables.put(symbol.getName(), sortedTables);
    }

    @Override
    protected void run() throws Exception {
        SymbolTable symbolTable = currentProgram.getSymbolTable();
        for (Symbol symbol : symbolTable.getChildren(currentProgram.getGlobalNamespace().getSymbol())) {
            if (!symbol.getSymbolType().equals(SymbolType.CLASS) && !symbol.getSymbolType().equals(SymbolType.NAMESPACE)) continue;
            processSymbol(symbolTable, symbol);
        }

        processSymbol(symbolTable, symbolTable.getNamespace("CCLightning",
            symbolTable.getNamespace("cocos2d", currentProgram.getGlobalNamespace())).getSymbol());

        var file = askFile("Save txt output", "Save");
        if (file == null) return;

        var writer = new PrintWriter(file, "UTF-8");
        for (Map.Entry<String, List<Long>> entry : vtables.entrySet()) {
            writer.print(entry.getKey());
            writer.print(" : ");
            for (int i = 0; i < entry.getValue().size(); i++) {
                if (i != 0) writer.print(", ");
                writer.print("0x" + Long.toHexString(entry.getValue().get(i)));
            }
            writer.println();
        }
        writer.close();
    }
}
