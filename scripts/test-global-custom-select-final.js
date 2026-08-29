const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
function read(p){return fs.readFileSync(path.join(root,p),'utf8')}
function ok(cond,msg){if(!cond){console.error('FAIL:',msg);process.exitCode=1}else console.log('PASS:',msg)}
const index=read('index.html'),admin=read('admin/index.html'),feedback=read('feedback.html');
const js=read('assets/js/core/custom-select.js'),css=read('assets/css/custom-select.css');
ok(index.includes('assets/css/custom-select.css')&&index.includes('assets/js/core/custom-select.js'),'public app loads global custom select assets');
ok(admin.includes('../assets/css/custom-select.css')&&admin.includes('../assets/js/core/custom-select.js'),'admin loads global custom select assets');
ok(feedback.includes('assets/css/custom-select.css')&&feedback.includes('assets/js/core/custom-select.js'),'feedback page loads global custom select assets');
ok(js.includes('MutationObserver')&&js.includes('querySelectorAll("select")'),'dynamic tool selects are auto-enhanced');
ok(js.includes('nap-native-select'),'dedicated Auto PDF custom selector is not double-enhanced');
ok(js.includes('dispatchEvent(new Event("change"'),'native change contracts are preserved');
ok(js.includes('HTMLSelectElement.prototype'),'programmatic select.value updates sync custom UI');
ok(css.includes('position:fixed')&&css.includes('z-index:2147483000'),'popover escapes modal overflow and stays above overlays');
ok(css.includes('@media (max-width:720px)'),'mobile-specific control sizing exists');
const files=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git'].includes(ent.name))continue;const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(/\.(html|js)$/.test(ent.name))files.push(p)}}
walk(root);
const selectSources=files.filter(f=>!f.includes(path.sep+'scripts'+path.sep)&&!f.includes(path.sep+'api'+path.sep)&&read(path.relative(root,f)).includes('<select'));
ok(selectSources.length>=10,`select coverage sees ${selectSources.length} source files`);
if(process.exitCode) process.exit(process.exitCode);
