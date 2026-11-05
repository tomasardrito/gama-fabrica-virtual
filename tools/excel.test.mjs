import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DBR_REFERENCE as R} from '../dbr-reference.js';
import {FILM_EXCEL as X} from '../film-excel.js';
import {MPS_PLAN} from '../mps-simulation.js';
import {DBR_PARAMETERS as P} from '../dbr-simulation.js';

// Read the workbook's cached results, without recalculating or writing it.
const path=fileURLToPath(new URL('../dados/PCPIII-Case-GAMA-completo.xlsx',import.meta.url));
const cells=JSON.parse(execFileSync('python3',['-c',`
import sys,json,zipfile,xml.etree.ElementTree as E
n={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
out={}
with zipfile.ZipFile(sys.argv[1]) as z:
 strings=[''.join(e.itertext()) for e in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',n)]
 links={r.get('Id'):r.get('Target') for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
 for sheet in E.fromstring(z.read('xl/workbook.xml')).find('s:sheets',n):
  name=sheet.get('name')
  if name not in ['Simulação DBR','RCCP (TOC) Personalizado']:continue
  p=links[sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
  data={}
  for c in E.fromstring(z.read(p.lstrip('/') if p.startswith('/') else 'xl/'+p)).findall('.//s:c',n):
   v=c.find('s:v',n)
   if v is None or v.text is None:continue
   value=strings[int(v.text)] if c.get('t')=='s' else float(v.text) if c.get('t') not in ['str','e'] else v.text
   data[c.get('r')]=value
  out[name]=data
print(json.dumps(out))
`,path],{encoding:'utf8'}));

test('MPS by product/week and industrial parameters match the workbook',()=>{
  const mps=cells['RCCP (TOC) Personalizado'], sim=cells['Simulação DBR'];
  for(let w=0;w<8;w++)for(const [i,product] of ['Z','Z1','Z2','Z3'].entries()) {
    const expected=mps[`${String.fromCharCode(66+w)}${4+i}`];
    assert.equal(MPS_PLAN[w].products[product],expected);
    assert.equal(X.mps[w].products[product],expected);
  }
  assert.equal(P.initialBufferUnits,sim.B8);
  assert.equal(P.target,sim.B8);
  assert.ok(Math.abs(P.min-sim.B9)<1e-8);
  assert.ok(Math.abs(P.drumRate-sim.B7)<1e-8);
  for(const [i,id] of ['lap','rosq','m1','m2','insp'].entries()) {
    assert.ok(Math.abs(P.rates[id]-sim[`I${6+i}`])<1e-8,id);
    assert.equal(P.shifts[id],sim[`H${6+i}`]);
  }
  assert.equal(X.breakdown.offsetHours,sim.B15);
  assert.equal(X.breakdown.durationHours,sim.B16);
});

test('all 121 buffer/zone rows of the comparison come directly from Excel',()=>{
  const sim=cells['Simulação DBR'];
  for(const [scenario,bufferColumn,zoneColumn] of [['A','N','P'],['B','AK','AM']]) {
    for(const row of R.hourlyRows[scenario]) {
      assert.ok(Math.abs(row.buffer-sim[`${bufferColumn}${row.sourceRow}`])<1e-8);
      assert.equal(row.zone,sim[`${zoneColumn}${row.sourceRow}`]);
    }
  }
  assert.ok(Math.abs(R.metricsA.minimumBufferUnits-sim.L11)<1e-8);
  assert.equal(R.metricsA.yellowZoneHours,sim.L12);
  assert.equal(R.metricsA.redZoneHours,sim.L13);
  assert.equal(R.metricsA.belowDrumRateHours,sim.L8);
});
