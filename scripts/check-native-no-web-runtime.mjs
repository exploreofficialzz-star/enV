import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const roots=[fileURLToPath(new URL('../apps/android/app/src/main/',import.meta.url)),fileURLToPath(new URL('../apps/ios/enV/',import.meta.url))];
const forbidden=[/\bWebView\b/i,/\bWKWebView\b/i,/react-native-webview/i,/NativeWebFallback/i,/hybrid-tool-coverage/i];const exts=new Set(['.kt','.swift','.xml','.plist','.kts']);const hits=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())walk(f);else if(exts.has(path.extname(f).toLowerCase()))fs.readFileSync(f,'utf8').split(/\r?\n/).forEach((l,i)=>{if(forbidden.some(r=>r.test(l)))hits.push(`${f}:${i+1}:${l.trim()}`)})}}
roots.forEach(walk);if(hits.length)throw new Error(`Native source still contains frontend runtime references:\n${hits.join('\n')}`);console.log('Native no-web-runtime guard: PASS');
