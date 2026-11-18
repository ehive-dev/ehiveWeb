const test = require('node:test');
const assert = require('node:assert/strict');
const {calculate, defaults} = require('../mieterstrom-rendite-model.js');
const calc = values => calculate({...defaults, ...values});
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
test('Zusatzrendite verwendet ausschließlich die Umstellungskosten der vorhandenen PV',()=>{
 const r=calc({}); close(r.demand,7600);close(r.soldSolar,3800);close(r.exportedSolar,4200);
 close(r.baseSurplus,440);close(r.rentalSurplus,1000);close(r.improvement,560);
 close(r.investmentReturn,28);close(r.rentalInvestment,2000);close(r.additionalPayback,2000/560);assert.ok(!("installationCost" in defaults));
});
test('PV-Abnahme überschreitet weder Ertrag noch Wohnungsbedarf',()=>{
 const r=calc({pvYield:1000,solarCoverage:100});close(r.soldSolar,1000);close(r.exportedSolar,0);assert.equal(r.capped,true);
 const low=calc({pvYield:100000,solarCoverage:100});close(low.soldSolar,7600);close(low.soldSolar+low.exportedSolar,100000);
});
test('Gleiche Preise ohne Mehrkosten verändern den Überschuss nicht',()=>{
 const r=calc({salePrice:10,feedInPrice:10,additionalAnnualCosts:0,additionalInvestment:0});close(r.improvement,0);assert.equal(r.investmentReturn,null);
});
test('Eine Änderung der Einspeisevergütung wirkt auf beide Varianten',()=>{
 const a=calc({feedInPrice:8}),b=calc({feedInPrice:4});
 close(a.baseSurplus-b.baseSurplus,8000*0.04);
 close(a.rentalSurplus-b.rentalSurplus,4200*0.04);
 close(b.improvement-a.improvement,3800*0.04);
});
test('Mehrertrag ist vermiedene Einspeisung durch Mieterstrom abzüglich Zusatzkosten',()=>{
 for(const feedInPrice of [0,4,8,30])for(const apartments of [0,1,4,20]){
  const r=calc({feedInPrice,apartments});
  close(r.improvement,r.soldSolar*(defaults.salePrice-feedInPrice)/100-defaults.additionalAnnualCosts);
 }
});
test('Unwirtschaftliches Mieterstromszenario bleibt negativ',()=>{
 const r=calc({salePrice:1,additionalAnnualCosts:1000});assert.ok(r.improvement<0);assert.ok(r.investmentReturn<0);assert.equal(r.additionalPayback,null);
});
test('Null Wohnungen oder Null Verbrauch erzeugen keine fiktiven PV-Verkäufe',()=>{
 for(const input of [{apartments:0},{consumptionPerApartment:0}]){const r=calc(input);close(r.soldSolar,0);close(r.localRevenue,0);close(r.exportedSolar,8000);assert.ok(Number.isFinite(r.solarPerApartment));}
});
test('Ohne PV-Ertrag gibt es keine Stromerlöse',()=>{
 const r=calc({pvYield:0});close(r.localRevenue,0);close(r.fullRevenue,0);close(r.surplusRevenue,0);close(r.selfConsumption,0);
});
test('Null Investition erzeugt keine unendliche Rendite',()=>{
 const r=calc({additionalInvestment:0});assert.equal(r.investmentReturn,null);assert.equal(r.additionalPayback,null);assert.ok(Number.isFinite(r.improvement));
});
test('Fehlende, nicht endliche und unzulässige Werte werden abgelehnt',()=>{
 for(const input of [{salePrice:NaN},{apartments:1.5},{additionalInvestment:-1},{pvYield:Infinity},{solarCoverage:101},{apartments:1001},{salePrice:''}])assert.throws(()=>calc(input),RangeError);
});
test('Energiebilanz und Wohnungszuordnung bleiben über Szenarien geschlossen',()=>{
 for(const pvYield of [0,1000,8000,25000])for(const apartments of [0,1,4,20])for(const solarCoverage of [0,35,100]){
 const r=calc({pvYield,apartments,solarCoverage});close(r.soldSolar+r.exportedSolar,pvYield);assert.ok(r.soldSolar<=r.demand);close(r.solarPerApartment*apartments,r.soldSolar);
 }
});

test('Historische PV-Anschaffungskosten verändern die Zusatzrendite nicht',()=>{const a=calc({}),b=calc({installationCost:50000});close(a.improvement,b.improvement);close(a.investmentReturn,b.investmentReturn);});

test('Wallboxen rechnen ein Fahrzeug mit 10000 km je Wohnung und nur den PV-Anteil als Verkauf',()=>{
 const r=calc({wallboxesEnabled:1});
 close(r.evDemand,8000);close(r.householdDemand,7600);close(r.demand,15600);
 close(r.soldSolar,7800);close(r.exportedSolar,200);close(r.improvement,1360);
 close(r.rentalInvestment,2000);
});
test('Wallbox-Ladeorte und PV-Anteil sind getrennt, ausgeschaltete Wallboxen haben keinen Effekt',()=>{
 close(calc({wallboxesEnabled:1,homeCharging:50}).evDemand,4000);
 close(calc({wallboxesEnabled:1,evSolarCoverage:0}).improvement,calc({}).improvement);
 close(calc({wallboxesEnabled:0,annualMileage:100000}).evDemand,0);
 close(calc({wallboxesEnabled:1,apartments:0}).evDemand,0);
 const capped=calc({wallboxesEnabled:1,evSolarCoverage:100});close(capped.soldSolar,8000);close(capped.exportedSolar,0);
 for(const input of [{homeCharging:101},{evSolarCoverage:101},{wallboxesEnabled:2},{annualMileage:-1}])assert.throws(()=>calc(input),RangeError);
});
