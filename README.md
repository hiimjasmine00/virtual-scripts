# Virtual Scripts
Scripts made to find virtual functions in macOS and iOS versions of Geometry Dash.

## How To Use
1. Download or clone this repository.
2. Using the Android binary of Geometry Dash (libcocos2dcpp.so), run the `DumpVirtuals.java` script from the `ghidra` folder in Ghidra. This will dump the virtual functions of the classes in the binary.
    - The script will prompt you to save to a JSON file. This will be used in the next step.
3. Run the `clean-virtuals-json.js` script from the main folder, providing the JSON file you saved in the previous step as an argument.
4. Download the [`demumble`](https://github.com/nico/demumble/releases) tool and add it to the PATH environment variable.
5. Run the `find-virtual-tables.js` script from the main folder, providing a path to the macOS binary of Geometry Dash (GeometryDash.app/Contents/MacOS/Geometry Dash) and, optionally, a path to the iOS binary (GeometryDash.ipa/Payload/GeometryJump.app/GeometryJump) as arguments.
6. Run the `find-virtual-functions.js` script from the main folder, providing the macOS binary path and, optionally, the iOS binary path, as arguments.
7. Run the `import-virtual-bindings.js` script from the main folder, providing the path to a clone of [geode-sdk/bindings](https://github.com/geode-sdk/bindings) and the game version as arguments.
8. You will find two files in the `output` folder: `Cocos2d.bro` and `GeometryDash.bro`. These contain the bindings from the clone, as well as the bindings of the virtual functions found in the game.
9. After fixing potential quirks in the bindings, you can use them in your projects, or possibly a pull request to the [geode-sdk/bindings](https://github.com/geode-sdk/bindings) repository.

## License
This project is licensed under the [MIT License](./LICENSE).