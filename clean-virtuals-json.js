if (process.argv.length < 3) {
    console.error("Usage: node clean-virtuals-json.js <path-to-virtuals-json>");
    process.exit(0);
}

const fs = require("fs");
const path = require("path");
const virtuals = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), process.argv[2]), "utf8"));

function cleanFunctionSig(sig) {
    return sig
        .replace(/__thiscall |__cdecl /g, '')
        .replace(/public: |private: |protected: /g, '')
        .replace(/enum |class |struct /g, '')
        .replace(/\(void\)/, '()')
        .replace(/ &/g, '&')
        .replace(/ \*/g, '*')
        .replace(/\)const /g, ') const')
        .replace(/,(?!\s)/g, ', ')
        .replace(/std::basic_string<char, std::char_traits<char>, std::allocator<char> ?>/g, 'gd::string')
        .replace(/std::string/g, 'gd::string')
        .replace(
            /std::set<(.*?), std::less<(.*?)>, std::allocator<(.*?)> ?>/g,
            v => `gd::set<${v.match(/(?<=std::set<)(.*?)(?=,)/)[0]}>`
        )
        .replace(
            /std::vector<(.*?), std::allocator<(.*?)> ?>/g,
            v => `gd::vector<${v.match(/(?<=std::vector<)(.*?)(?=,)/)[0]}>`
        )
        .replace(/std::_Tree_const_iterator<std::_Tree_val<std::_Tree_simple_types<cocos2d::CCObject\*> ?> ?>/g, 'cocos2d::CCSetIterator')
        .replace(
            /std::map<(.*?), (.*?), std::less<(.*?)>, std::allocator<std::pair<(.*?), (.*?)> ?> ?>/g,
            v => {
                const m = v.match(/(?<=std::map<)(.*?),(.*?)(?=,)/);
                return `gd::map<${m[1]},${m[2]}>`;
            }
        )
        .replace(
            /std::unordered_map<(.*?), std::pair<double, double>, .*?> ?> ?> ?>/g,
            v => {
                const m = v.match(/(?<=std::unordered_map<)(.*?)(?=,)/);
                return `gd::unordered_map<${m[1]}, std::pair<double, double>>`;
            }
        )
        .replace(
            /std::unordered_map<(.*?), (.*?), .*?> ?> ?>/g,
            v => {
                const m = v.match(/(?<=std::unordered_map<)(.*?),(.*?)(?=,)/);
                return `gd::unordered_map<${m[1]},${m[2]}>`;
            }
        )
        .replace(/unsigned long long/g, 'uint64_t')
        .replace(/void \(cocos2d::CCObject::\*\)\(cocos2d::CCObject\*\)/g, 'cocos2d::SEL_MenuHandler')
        .replace(/void \(cocos2d::CCObject::\*\)\(\)/g, 'cocos2d::SEL_CallFunc')
        .replace(/void \(cocos2d::CCObject::\*\)\(cocos2d::CCNode\*\)/g, 'cocos2d::SEL_CallFuncN')
        .replace(/void \(cocos2d::CCObject::\*\)\(cocos2d::CCNode\*, void\*\)/g, 'cocos2d::SEL_CallFuncND')
        .replace(/void \(cocos2d::CCObject::\*\)\(cocos2d::CCObject\*\)/g, 'cocos2d::SEL_CallFuncO')
        .replace(/void \(cocos2d::CCObject::\*\)\(cocos2d::CCEvent\*\)/g, 'cocos2d::SEL_EventHandler')
        .replace(/int \(cocos2d::CCObject::\*\)\(cocos2d::CCObject\*\)/g, 'cocos2d::SEL_Compare')
        .replace(/void \(cocos2d::CCObject::\*\)\(cocos2d::extension::CCHttpClient\*, cocos2d::extension::CCHttpResponse\*\)/g, 'cocos2d::extension::SEL_HttpResponse')
        .replace(/void \(cocos2d::CCObject::\*\)\(float\)/g, 'cocos2d::SEL_SCHEDULE')
        .replace(/cocos2d::_ccColor3B/g, 'cocos2d::ccColor3B') // cocos devs and their typedef'd structs..
        .replace(/cocos2d::_ccColor4B/g, 'cocos2d::ccColor4B')
        .replace(/cocos2d::_ccColor4F/g, 'cocos2d::ccColor4F')
        .replace(/cocos2d::_ccVertex2F/g, 'cocos2d::_ccVertex2F')
        .replace(/cocos2d::_ccVertex3F/g, 'cocos2d::_ccVertex3F')
        .replace(/cocos2d::_ccHSVValue/g, 'cocos2d::ccHSVValue');
}

fs.writeFileSync(path.join(__dirname, "virtuals.json"), JSON.stringify(Object.fromEntries(Object.entries(virtuals).map(([k, v]) => [k, v.map(x => x.map(cleanFunctionSig))]))));
