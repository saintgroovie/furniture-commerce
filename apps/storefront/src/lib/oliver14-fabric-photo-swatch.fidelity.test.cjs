const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url'),path=require('node:path');
const url=pathToFileURL(path.join(__dirname,'oliver14-fabric-photo-swatch.ts')).href;
const code=`import assert from 'node:assert/strict';import {oliver14FabricPhotoSwatch as swatch} from ${JSON.stringify(url)};
const keys=['lillian-01','lillian-02','lillian-03','lillian-04','lillian-05','lorna-01','lorna-02','lorna-03','lorna-04'];
for(const key of keys){const file='/product-static/products/oliver/OL-14-2_color_'+key.replace('-','_')+'.jpg';const sample=swatch('ol-14-2',key,file);assert(sample);assert.equal(sample.src,file);assert.equal(sample.style.backgroundSize,'2000% 2000%');assert.equal(sample.style.backgroundImage,'url("'+file+'")');assert.equal(swatch('mnm-55-1',key,file),null);assert.equal(swatch('ol-14-2',key,'/product-static/products/oliver/OL-14-2_color_unknown.jpg'),null);assert.equal(swatch('ol-14-2',key,'https://external.invalid'+file),null);}
assert.equal(swatch('ol-14-2','__proto__','x'),null);assert.equal(swatch('ol-14-2','lillian','x'),null);assert.equal(swatch(undefined,'lillian-01','x'),null);
const a=swatch('ol-14-2','lillian-01','/static/products/oliver/OL-14-2_color_lillian_01.jpg');assert(a);
const [x,y]=a.style.backgroundPosition.split(' ').map(parseFloat);assert(Math.abs(x/100*.95-.10)<1e-10);assert(Math.abs(y/100*.95-.30)<1e-10);
assert.equal(swatch('ol-14-2','lillian-01','/product-static/products/oliver/OL-14-2_color_lillian_03.jpg'),null);
console.log('PASS new ROI guard: exact9 paired sourcephotos, wrongproduct/key/image/external/family refusals; CSS literal50x50 region geometry. Existing191/schema/cart/MNM suite not rerun.');`;
process.stdout.write(execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{encoding:'utf8'}));
