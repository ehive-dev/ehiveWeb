const test = require('node:test');
const assert = require('node:assert/strict');
const {calculate, defaults} = require('../mieterstrom-rendite-model.js');
const calc = values => calculate({...defaults, ...values});
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
test('Rendite berücksichtigt unterschiedliche Investitionen, Tarife und laufende Kosten',()=>{
 const r=calc({}); close(r.demand,7600);close(r.soldSolar,3800);close(r.exportedSolar,4200);
 close(r.baseSurplus,760);close(r.rentalSurplus,1000);close(r.improvement,240);
 close(r.baseReturn,760/18000*100);close(r.rentalReturn,5);close(r.additionalPayback,2000/240);
});
test('PV-Abnahme überschreitet weder Ertrag noch Wohnungsbedarf',()=>{
 const r=calc({pvYield:1000,solarCoverage:100});close(r.soldSolar,1000);close(r.exportedSolar,0);assert.equal(r.capped,true);
 const low=calc({pvYield:100000,solarCoverage:100});close(low.soldSolar,7600);close(low.soldSolar+low.exportedSolar,100000);
});
test('Gleiche Preise ohne Mehrkosten verändern den Überschuss nicht',()=>{
 const r=calc({salePrice:10,feedInPrice:10,fullFeedInPrice:10,additionalAnnualCosts:0,additionalInvestment:0});close(r.improvement,0);close(r.returnDifference,0);
});
test('Eine höhere Volleinspeisevergütung wird im Vergleich berücksichtigt',()=>{
 const a=calc({fullFeedInPrice:8}),b=calc({fullFeedInPrice:12});close(a.improvement-b.improvement,320);
});
test('Unwirtschaftliches Mieterstromszenario bleibt negativ',()=>{
 const r=calc({salePrice:1,additionalAnnualCosts:1000});assert.ok(r.improvement<0);assert.ok(r.returnDifference<0);assert.equal(r.additionalPayback,null);
});
test('Null Wohnungen oder Null Verbrauch erzeugen keine fiktiven PV-Verkäufe',()=>{
 for(const input of [{apartments:0},{consumptionPerApartment:0}]){const r=calc(input);close(r.soldSolar,0);close(r.localRevenue,0);close(r.exportedSolar,8000);assert.ok(Number.isFinite(r.solarPerApartment));}
});
test('Ohne PV-Ertrag gibt es keine Stromerlöse',()=>{
 const r=calc({pvYield:0});close(r.localRevenue,0);close(r.fullRevenue,0);close(r.surplusRevenue,0);close(r.selfConsumption,0);
});
test('Null Investition erzeugt keine unendliche Rendite',()=>{
 const r=calc({installationCost:0,additionalInvestment:0});assert.equal(r.baseReturn,null);assert.equal(r.rentalReturn,null);assert.equal(r.returnDifference,null);assert.equal(r.additionalPayback,null);
});
test('Fehlende, nicht endliche und unzulässige Werte werden abgelehnt',()=>{
 for(const input of [{salePrice:NaN},{apartments:1.5},{installationCost:-1},{pvYield:Infinity},{solarCoverage:101},{apartments:1001},{salePrice:''}])assert.throws(()=>calc(input),RangeError);
});
test('Energiebilanz und Wohnungszuordnung bleiben über Szenarien geschlossen',()=>{
 for(const pvYield of [0,1000,8000,25000])for(const apartments of [0,1,4,20])for(const solarCoverage of [0,35,100]){
 const r=calc({pvYield,apartments,solarCoverage});close(r.soldSolar+r.exportedSolar,pvYield);assert.ok(r.soldSolar<=r.demand);close(r.solarPerApartment*apartments,r.soldSolar);
 }
});
