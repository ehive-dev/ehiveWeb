const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validAggregate,withAggregateRating}=require('../product-ratings.js');
const aggregate={'@type':'AggregateRating',ratingValue:4.5,ratingCount:2,bestRating:5,worstRating:1};
test('adds the same valid aggregate to both actual product structures and preserves offers',()=>{
 const fs=require('node:fs');
 for(const filename of ['shop.html','ehive-one.html']) {
  const html=fs.readFileSync(require('node:path').join(__dirname,'..',filename),'utf8');
  const data=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const result=withAggregateRating(data,aggregate);
  const target=result['@graph']?.find(n=>n['@type']==='ProductGroup')||result;
  assert.deepEqual(target.aggregateRating,aggregate);
  const original=data['@graph']?.find(n=>n['@type']==='ProductGroup')||data;
  if(original.offers)assert.deepEqual(target.offers,original.offers);
  if(original.hasVariant)assert.deepEqual(target.hasVariant,original.hasVariant);
  assert.equal(original.aggregateRating,undefined);
  assert.match(html,/data-product-ratings/);
 }
});
test('does not emit invalid or empty ratings',()=>{
 for(const value of [null,{}, {...aggregate,ratingCount:0},{...aggregate,ratingCount:1.5},{...aggregate,ratingValue:6},{...aggregate,ratingValue:NaN}]) {
  assert.ok(!validAggregate(value));
  assert.equal(withAggregateRating({'@type':'Product',name:'eHive One',aggregateRating:aggregate},value).aggregateRating,undefined);
 }
});
test('does not apply eHive One ratings to unrelated products',()=>{
 assert.equal(withAggregateRating({'@type':'Product',name:'Netzteil'},aggregate).aggregateRating,undefined);
});
