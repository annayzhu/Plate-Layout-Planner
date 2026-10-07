const test = require('node:test');
const assert = require('node:assert/strict');
const Prep = require('../preparation-core.js');
const Workspace = require('../workspace-core.js');
require('../preparation-ui.js');
const scope = { plateId: 'plate1', plateName: 'Plate 1', wells: ['A1','A2','A3','B1','B2','B3'].map(id => ({ id, group: 'PCR' })) };
const recipe = { finalVolume: 20, overagePercent: 10, diluent: 'Water', rows: [
  { name: '2× Mix', volume: '10', premix: true },
  { name: 'F', volume: '0.5', premix: true },
  { name: 'R', volume: '0.5', premix: true },
  { name: 'Template', volume: '2', premix: false },
] };
test('reaction preparation keeps templates separate and scales premix once', () => {
  const result = Prep.calculate('reaction', recipe, scope);
  assert.equal(result.status, 'valid');
  assert.equal(result.groups[0].dispenseUL, 18);
  assert.ok(Math.abs(result.groups[0].preparedVolumeUL - 118.8) < 1e-10);
  assert.equal(result.groups[0].components.find(c => c.name === 'Water').perWellUL, 7);
  assert.equal(result.groups[0].components.find(c => c.name === 'Template').preparedVolumeUL, null);
  assert.deepEqual(result.groups[0].wellIds, ['A1','A2','A3','B1','B2','B3']);
  assert.ok(result.contributions.every(c => c.component !== 'Template'));
  assert.ok(Workspace.mergeLiquidContributions(result.contributions,{overagePercent:10}).groups[0].components.every(c=>!c.warning),'premix uses actual batch transfers, not theoretical per-well shares');
});
test('cross-plate totals merge compatible premix once, but never add overage to normalization samples', () => {
  const a = Prep.calculate('reaction', {...recipe,mergeCompatible:true},scope);
  const b = Prep.calculate('reaction', {...recipe,mergeCompatible:true},{...scope,plateId:'plate2'});
  const merged = Workspace.mergeLiquidContributions([...a.contributions,...b.contributions],{overagePercent:10});
  assert.equal(merged.groups.length,1);
  assert.ok(Math.abs(merged.groups[0].components[0].preparedVolume-132)<1e-10);
  assert.equal(merged.groups[0].sources[0].preparation.separate[0].name,'Template');
  const n = Prep.calculate('normalization',{target:10,finalVolume:20,unit:'ng/µL',diluent:'Water',rows:[{id:'S',concentration:'50',available:''}]},{...scope,wells:scope.wells.slice(0,1)});
  const norm = Workspace.mergeLiquidContributions(n.contributions,{overagePercent:10});
  assert.equal(norm.groups[0].components[0].preparedVolume,4);
});
test('dilution distinguishes adding to existing liquid from final volume and supports ratios', () => {
  const input = { mode: 'add', stock: 100, target: 10, initial: 0, stockUnit: 'µM', targetUnit: 'µM', volume: 90, volumeUnit: 'µL', volumeMode: 'per-well', overagePercent: 0, stockName: 'Stock', diluent: 'Medium' };
  const result = Prep.calculate('dilution', input, scope);
  assert.equal(result.perWell.stockUL, 10);
  assert.equal(result.perWell.finalUL, 100);
  assert.equal(result.groups[0].components[0].preparedVolumeUL, 60);
  assert.equal(result.contributions.length, 1, 'existing medium must not be prepared again');
  assert.equal(result.contributions[0].preparation.dispenseUL, 10);
  assert.equal(result.contributions[0].preparation.addToExistingUL, 90);
  const ratio = Prep.calculate('dilution', { ...input, mode:'ratio', volume:100, ratio:10 }, scope);
  assert.equal(ratio.perWell.diluentUL, 90);
  const parts = Prep.calculate('dilution', { ...input, mode:'parts', volume:100, stockParts:1, diluentParts:9 }, scope);
  assert.equal(parts.perWell.stockUL, 10);
});
test('sample and diluent identities cannot collide, copied plate-local plans remain separate', () => {
  assert.throws(() => Prep.calculate('normalization', {target:10,finalVolume:20,unit:'ng/µL',diluent:'Water',rows:[{id:'Water',concentration:'50',available:''}]}, {...scope,wells:scope.wells.slice(0,1)}), /different|不同/);
  const a=Prep.calculate('reaction',recipe,scope);
  const copied=a.contributions.map(c=>({...c,plateId:'copy'}));
  assert.equal(Workspace.mergeLiquidContributions([...a.contributions,...copied]).groups.length,2);
});
test('normalization retains bad rows and maps exact sample volumes to wells', () => {
  const result = Prep.calculate('normalization', { target: 10, finalVolume: 20, unit: 'ng/µL', diluent: 'Water', rows: [
    { id: 'S1', concentration: '50', available: '5' },
    { id: 'S2', concentration: '5', available: '' },
    { id: 'S3', concentration: '40', available: '1' },
  ] }, { ...scope, wells: scope.wells.slice(0,3) });
  assert.equal(result.status, 'partial');
  assert.equal(result.samples[0].wellId, 'A1');
  assert.equal(result.samples[0].sampleUL, 4);
  assert.equal(result.samples[0].diluentUL, 16);
  assert.equal(result.samples[1].sampleUL, null);
  assert.equal(result.samples[2].sampleUL, null);
  assert.equal(result.contributions.length, 0, 'partial plans cannot enter project totals');
});
test('concentration rows and parameter groups conserve volume and count each well once', () => {
  const grouped={...scope,wells:scope.wells.map((w,i)=>({...w,group:i<2?'Target A':'Target B'}))};
  const input={...recipe,rows:[{name:'Primer',inputMode:'concentration',stock:'10',stockUnit:'µM',target:'500',targetUnit:'nM',premix:true},{name:'Template',volume:'2',premix:false}]};
  const result=Prep.calculate('reaction',input,grouped);
  assert.deepEqual(result.groups.map(g=>g.wellIds.length),[2,4]);
  for(const group of result.groups) {
    assert.ok(Math.abs(group.components[0].perWellUL-1)<1e-12);
    assert.equal(group.components.reduce((sum,c)=>sum+c.perWellUL,0),20);
    assert.equal(group.dispenseUL,18);
  }
  assert.equal(result.groups.flatMap(g=>g.wellIds).length,6);
  const changed=Prep.calculate('reaction',{...recipe,mergeCompatible:true,rows:recipe.rows.map((r,i)=>i===0?{...r,volume:'9'}:r)},scope);
  const original=Prep.calculate('reaction',{...recipe,mergeCompatible:true},{...scope,plateId:'plate2'});
  assert.equal(Workspace.mergeLiquidContributions([...changed.contributions,...original.contributions]).groups.length,2);
});
test('invalid normalization identities stay visible and block the complete publication', () => {
  const input={target:10,finalVolume:20,unit:'µM',diluent:'Buffer',rows:[{id:'Same',concentration:'50',available:''},{id:'Same',concentration:'50',available:''}]};
  const result=Prep.calculate('normalization',input,{...scope,wells:scope.wells.slice(0,2)});
  assert.equal(result.samples.length,2);
  assert.ok(result.samples.every(row=>row.sampleUL===null&&/duplicate/.test(row.status)));
  assert.deepEqual(result.contributions,[]);
  assert.throws(()=>Prep.calculate('reaction',{...recipe,rows:[{name:'Template',volume:'20',premix:false}]},scope),/No premix/);
  assert.throws(()=>Prep.calculate('reaction',{...recipe,finalVolume:5},scope),/exceed/);
  assert.throws(()=>Prep.calculate('reaction',{...recipe,diluent:'template'},scope),/separate sample/);
});
test('separate sample identities remain attached to exact wells without entering the pooled recipe',()=>{
  const result=Prep.calculate('reaction',recipe,{...scope,wells:[{id:'A1',sample:'S1',group:0},{id:'A2',sample:'S2',group:'Missing'}]});
  assert.deepEqual(result.groups.map(g=>g.label),['0','Missing']);
  assert.deepEqual(result.contributions[0].preparation.samples,[{wellId:'A1',sample:'S1'}]);
  assert.ok(!result.contributions.some(c=>['S1','S2','Template'].includes(c.component)));
});
test('total dosing instructions retain actual transfer volume independently of per-well fields',()=>{
  const input={mode:'add',stock:100,stockUnit:'µM',target:1,targetUnit:'µM',initial:0,volume:94.05,volumeUnit:'µL',volumeMode:'total',overagePercent:10,stockName:'Stock',diluent:'Medium'};
  const result=Prep.calculate('dilution',input,scope);
  const step=globalThis.PreparationUI.create('en').executionSteps(result.groups[0].preparation,'Stock')[0];
  assert.equal(step.perWellVolume,0);
  assert.ok(Math.abs(step.transferVolumeUL-.95)<1e-12);
  assert.match(step.action,/For this batch/);
});
