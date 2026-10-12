const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const catalogue = require('../bureau/modeles-locaux.json');
function environment() {
  const files = new Map(), storage = new Map();
  const config = { free: 10_000_000_000, truncated: false, requests: 0 };
  const FS = { documentDirectory:'file:///app/', cacheDirectory:'file:///cache/',EncodingType:{Base64:'base64'},
    getInfoAsync:async uri => files.has(uri) ? {exists:true,isDirectory:false,size:files.get(uri)} : {exists:false},
    readAsStringAsync:async ()=>'R0dVRg==',makeDirectoryAsync:async()=>{},getFreeDiskStorageAsync:async()=>config.free,
    deleteAsync:async uri=>files.delete(uri),moveAsync:async ({from,to})=>{files.set(to,files.get(from));files.delete(from);},
    createDownloadResumable:(url,uri,options,callback)=>({downloadAsync:async()=>{
      config.requests++;const model=catalogue.find(m=>m.url===url);files.set(uri,model.taille-(config.truncated ? 1 : 0));
      callback({totalBytesWritten:model.taille,totalBytesExpectedToWrite:model.taille});return {uri,status:200};
    }}) };
  const deps = {'react-native':{Platform:{OS:'android'},AppState:{addEventListener:()=>({remove(){}})}},
    'expo-file-system/legacy':FS,'@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async k=>storage.get(k)||null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)}},
    'expo-document-picker':{getDocumentAsync:async()=>({canceled:true})}};
  function load(name) {
    const filename=path.resolve(__dirname,'../src/ia',name+'.ts');
    const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const module={exports:{}};
    vm.runInNewContext(output,{module,exports:module.exports,require:id=>{
      if(id==='../../bureau/modeles-locaux.json')return catalogue;
      if(id==='./catalogueLocal')return load('catalogueLocal');
      if(deps[id])return deps[id];throw Error('Import inattendu '+id);
    },setTimeout,clearTimeout,console},{filename});
    return module.exports;
  }
  return {api:load('modeleLocal'),config,files};
}
test('installation locale réutilisée hors ligne sans second téléchargement',async()=>{
  const {api,config}=environment();await api.installerModele('qwen3-1.7b');
  assert.equal(api.etatLocal('qwen3-1.7b').phase,'pret');
  await api.installerModele('qwen3-1.7b');assert.equal(config.requests,1);
});
test('fichier tronqué refusé avant activation',async()=>{
  const {api,config}=environment();config.truncated=true;
  await assert.rejects(api.installerModele('qwen3-1.7b'),/incomplet/);
  assert.equal(await api.verifierModele('qwen3-1.7b'),false);
});
test('espace insuffisant ne déclenche pas de téléchargement',async()=>{
  const {api,config}=environment();config.free=100;
  await assert.rejects(api.installerModele('qwen3-4b'),/espace/);assert.equal(config.requests,0);
});
test('les modèles ont des fichiers distincts, partagés entre Chat et Codex',async()=>{
  const {api,files}=environment();await api.installerModele('qwen3-1.7b');await api.installerModele('qwen3-4b');
  assert.equal(files.size,2);assert.equal(await api.verifierModele('qwen3-1.7b'),true);assert.equal(await api.verifierModele('qwen3-4b'),true);
});
