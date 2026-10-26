import assert from "node:assert/strict"
import { getCatalogProductsForHandles } from "./api/products"

async function main() {
 const original=globalThis.fetch, backend=process.env.MEDUSA_BACKEND_INTERNAL_URL
 process.env.MEDUSA_BACKEND_INTERNAL_URL="http://scoped-catalog.invalid"
 let active=0, peak=0
 const handles:string[]=[]
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.pathname,"/store/catalog-products");assert.equal(init?.cache,"no-store")
  const handle=url.searchParams.get("handle");assert.ok(handle,"A related card read must be scoped")
  handles.push(handle);active++;peak=Math.max(peak,active)
  await new Promise<void>(resolve=>setImmediate(resolve));active--
  if(handle==="unavailable")return Response.json({message:"unavailable"},{status:503})
  return Response.json({products:[{id:handle,handle,status:"published"},{id:"extra",handle:"unrequested",status:"published"},{id:"draft",handle,status:"draft"}]})
 }
 try {
  const names=Array.from({length:17},(_,i)=>`card-${i}`)
  const result=await getCatalogProductsForHandles([...names,names[0]!,""])
  assert.equal(peak,3,"Even a large motif block bounds native request concurrency")
  assert.equal(handles.length,names.length,"Duplicate handles are read once")
  assert.deepEqual(result.products.map(p=>p.handle),names,"Unrequested and draft rows cannot borrow a card identity")
  assert.deepEqual(await getCatalogProductsForHandles([]),{products:[]})
  assert.equal(handles.length,names.length,"An empty block never reads the full catalog")
  await assert.rejects(getCatalogProductsForHandles(["unavailable"]),/unavailable/)
  console.log("catalog-scoped-read.fidelity.test.ts: ok")
 } finally {
  globalThis.fetch=original
  if(backend===undefined)delete process.env.MEDUSA_BACKEND_INTERNAL_URL;else process.env.MEDUSA_BACKEND_INTERNAL_URL=backend
 }
}
void main().catch(error=>{console.error(error);process.exitCode=1})
