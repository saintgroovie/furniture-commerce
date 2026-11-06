import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require=createRequire(import.meta.url),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const dir=path.dirname(fileURLToPath(import.meta.url)),file=path.join(dir,'api/sitemap-sources.ts')
let read,observedBudget,signalFromGate;const results=[]
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const mod={exports:{}}
vm.runInNewContext(js,{exports:mod.exports,module:mod,require:name=>{
 if(name==='./base')return {getBaseUrl:()=> 'http://fixture.invalid',medusaFetchTimeoutMs:()=>20000,medusaFetch:(url,init)=>read(url.replace('http://fixture.invalid',''),init.signal)}
 if(name==='../catalog-read-budget')return {withCatalogReadBudget:(fn,signal,ms)=>{observedBudget=ms;signalFromGate=new AbortController().signal;return fn(signalFromGate)}}
 throw Error('unexpected dependency '+name)
},Response,ReadableStream,TextDecoder,AbortController,AbortSignal,Uint8Array,Promise,Error,Number,JSON},{filename:file})
const h=mod.exports,c=h.SITEMAP_SOURCE_LIMITS
const data={products:[{id:'p',handle:'real-product',status:'published',purchase:{can_purchase:true},metadata:{extra:'not used'}}]},rooms={room_sets:[{slug:'real-room',is_active:true,room_type:'bedroom',items:[{extra:'not used'}]}]},motifs={motif_themes:[{motif_slug:'real-theme',motif_available_product_count:1,preview_products:[{handle:'must-not-be-fetched'}]}]}
const reply=(value)=>new Response(JSON.stringify(value))
const baseRead=async p=>reply(p===c.catalog.path?data:p===c.rooms.path?rooms:motifs)
async function test(name,fn){await fn();results.push({name,pass:true})}
await test('one existing gate, shared eight-second cap, three sequential raw GETs and no preview/native enrichment',async()=>{
 const calls=[],signals=[];let active=0,peak=0;read=async(p,s)=>{calls.push(p);signals.push(s);active++;peak=Math.max(active,peak);await new Promise(r=>setImmediate(r));active--;return baseRead(p)}
 const output=await h.getSitemapSources();assert.equal(observedBudget,8000);assert.equal(peak,1);assert.deepEqual(calls,[c.catalog.path,c.rooms.path,c.motifs.path]);assert(signals.every(s=>s===signalFromGate));assert.equal(Object.keys(output.products[0]).sort().join(','),'handle,id,status');assert.equal(Object.keys(output.rooms[0]).sort().join(','),'is_active,room_type,slug');assert.equal(Object.keys(output.motifs[0]).sort().join(','),'motif_available_product_count,motif_slug');assert(!JSON.stringify(output).includes('must-not-be-fetched'))
})
await test('oversized declared response cancels body and makes no following directory calls',async()=>{
 const calls=[];let cancelled=false;await assert.rejects(h.readSitemapSources(async p=>{calls.push(p);return new Response(new ReadableStream({cancel(){cancelled=true}}),{headers:{'content-length':String(c.catalog.bytes+1)}})},new AbortController().signal));assert.equal(calls.length,1);assert(cancelled)
})
await test('streamed/decompressed bytes exceeding catalog cap cancel body without following requests',async()=>{
 const calls=[];let cancelled=false;await assert.rejects(h.readSitemapSources(async p=>{calls.push(p);return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(c.catalog.bytes+1))},cancel(){cancelled=true}}))},new AbortController().signal));assert.equal(calls.length,1);assert(cancelled)
})
await test('too many source rows fail instead of silently truncating a directory',async()=>{
 for(const [key,field,pathName,max,count] of [['catalog','products',c.catalog.path,c.catalog.rows,1],['rooms','room_sets',c.rooms.path,c.rooms.rows,2],['motifs','motif_themes',c.motifs.path,c.motifs.rows,3]]){
  const calls=[];await assert.rejects(h.readSitemapSources(async p=>{calls.push(p);return p===pathName?reply({[field]:Array.from({length:max+1},()=>({}))}):baseRead(p)},new AbortController().signal));assert.equal(calls.length,count,key)
 }
})
await test('already cancelled batch makes zero GETs',async()=>{const controller=new AbortController();controller.abort();let calls=0;await assert.rejects(h.readSitemapSources(async()=>{calls++;return reply(data)},controller.signal));assert.equal(calls,0)})
await test('cancellation interrupts a stalled body and cancels stream before any later GET',async()=>{
 const controller=new AbortController();let calls=0,cancelled=false;const pending=h.readSitemapSources(async()=>{calls++;return new Response(new ReadableStream({pull(){return new Promise(()=>{})},cancel(){cancelled=true}}))},controller.signal);setTimeout(()=>controller.abort(new Error('new bounded body cancellation case')),10);await assert.rejects(pending);assert.equal(calls,1);assert(cancelled)
})
process.stdout.write(JSON.stringify({status:'PASS_ONLY_NEW_SITEMAP_SOURCE_BUDGET_SEAMS',results,prior12ChecksReusedNotRerun:true,notBrowserHTTPOrBackendDBCardinalityAcceptance:true})+'\n')
