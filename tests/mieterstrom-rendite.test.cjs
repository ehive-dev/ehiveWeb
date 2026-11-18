const test = require('node:test');
const assert = require('node:assert/strict');
const {calculate, defaults} = require('../mieterstrom-rendite-model.js');
const calc = values => calculate({...defaults, ...values});
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
test('Zusatzrendite verwendet ausschließlich die Umstellungskosten der vorhandenen PV',()=>{
 const r=calc({}); close(r.demand,7600);close(r.soldSolar,3376);close(r.exportedSolar,4624);
 close(r.baseSurplus,440);close(r.rentalSurplus,915.2);close(r.improvement,475.2);
 close(r.investmentReturn,23.76);close(r.rentalInvestment,2000);close(r.additionalPayback,2000/475.2);assert.ok(!("installationCost" in defaults));
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
 close(a.rentalSurplus-b.rentalSurplus,4624*0.04);
 close(b.improvement-a.improvement,3376*0.04);
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
 close(r.soldSolar,5875.479452054795);close(r.exportedSolar,2124.520547945206);close(r.improvement,975.095890410959);
 close(r.rentalInvestment,2000);
});
test('Wallbox-Ladeorte und PV-Anteil sind getrennt, ausgeschaltete Wallboxen haben keinen Effekt',()=>{
 close(calc({wallboxesEnabled:1,homeCharging:50}).evDemand,4000);
 close(calc({wallboxesEnabled:1,evSolarCoverage:0}).improvement,calc({}).improvement);
 close(calc({wallboxesEnabled:0,annualMileage:100000}).evDemand,0);
 close(calc({wallboxesEnabled:1,apartments:0}).evDemand,0);
 const capped=calc({wallboxesEnabled:1,evSolarCoverage:100});assert.ok(capped.soldSolar<8000);assert.ok(capped.exportedSolar>0);
 for(const input of [{homeCharging:101},{evSolarCoverage:101},{wallboxesEnabled:2},{annualMileage:-1}])assert.throws(()=>calc(input),RangeError);
});

test('Monatsgrenzen verhindern Verschieben von Sommerüberschüssen in den Winter',()=>{
 const r=calc({});
 // Handrechnung: Jan 160 kWh PV vs 380 kWh Ziel, Jun 1120 vs 266.
 close(r.months[0].pv,160);close(r.months[0].pvHousehold,160);close(r.months[0].grid,600);
 close(r.months[5].pv,1120);close(r.months[5].pvHousehold,266);close(r.months[5].exported,854);
 close(r.soldSolar,[160,240,342,304,304,266,266,266,304,342,342,240].reduce((a,b)=>a+b,0));
 assert.ok(r.soldSolar<r.requestedSolar);
});
test('Monatliche Energieflüsse schließen sich für jede Last getrennt und im Jahr',()=>{
 for(const pvYield of [0,1000,8000,100000])for(const apartments of [0,1,4,20])for(const solarCoverage of [0,50,100])for(const evSolarCoverage of [0,50,100]){
  const r=calc({pvYield,apartments,solarCoverage,evSolarCoverage,wallboxesEnabled:1});
  assert.equal(r.months.length,12);
  for(const m of r.months){
   for(const key of ['pv','pvHousehold','pvEv','exported','gridHousehold','gridEv'])assert.ok(m[key]>=0);
   close(m.pv,m.pvHousehold+m.pvEv+m.exported);
   close(m.household,m.pvHousehold+m.gridHousehold);close(m.ev,m.pvEv+m.gridEv);
  }
  const sum=k=>r.months.reduce((a,m)=>a+m[k],0);
  close(sum('pv'),pvYield);close(sum('household'),r.householdDemand);close(sum('ev'),r.evDemand);
  close(r.soldSolar+r.grid,r.demand);close(r.pvHousehold+r.gridHousehold,r.householdDemand);close(r.pvEv+r.gridEv,r.evDemand);
  close(r.improvement,r.soldSolar*(defaults.salePrice-defaults.feedInPrice)/100-defaults.additionalAnnualCosts);
 }
});
test('PV-Knappheit bevorzugt keine Last und 100-Prozent-Ziele garantieren keine Jahresautarkie',()=>{
 const r=calc({wallboxesEnabled:1,solarCoverage:100,evSolarCoverage:100});const jan=r.months[0];
 close(jan.pvHousehold/jan.household,jan.pvEv/jan.ev);assert.ok(r.grid>0);assert.ok(r.exportedSolar>0);
});
