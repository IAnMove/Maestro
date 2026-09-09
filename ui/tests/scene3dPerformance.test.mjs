import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AnimationClip, NumberKeyframeTrack, Object3D, InterpolateDiscrete } from 'three'
import { fitClipPlayback, performanceClipTime, slotPoseAtTime, paintClipNumber } from '../src/features/scene3d/performance.ts'
import { createDefaultScene3DDocument, parseScene3DDocument } from '../src/features/scene3d/document.ts'
import { bindMixer, seekBoundMixer } from '../src/features/scene3d/gpu.ts'
import { remountScene3DTemplate } from '../src/features/scene3d/templates.ts'
import { numberedShots } from '../../pinokio_agent/skills/api/Maestro-next.git/clients/shot_plan.mjs'

test('fitting root motion prevents a four-second animation jumping inside a longer shot', () => {
 const root=new Object3D();const clip=new AnimationClip('Advance',4,[new NumberKeyframeTrack('.position[z]',[0,4],[0,2.4])]);
 const doc=createDefaultScene3DDocument();doc.duration=4.6;doc.slots[0].clip={index:0,name:'Advance'};
 const mixer=bindMixer(root,[clip],doc.slots[0]);
 const position=(seconds,playback)=>{seekBoundMixer(mixer,clip,performanceClipTime(seconds,4,playback));return root.position.z;};
 assert.ok(position(3.99,{loop:true})-position(4,{loop:true})>2.3);
 const fitted=fitClipPlayback(4,4.6,{start:0,loop:true});
 let previous=-1;
 for(let frame=0;frame<=138;frame++){const value=position(frame/30,fitted);assert.ok(value>=previous);if(previous>=0)assert.ok(value-previous<.018);previous=value;}
 assert.ok(Math.abs(previous-2.4)<1e-6);
 doc.slots[0].clipPlayback=fitted;
 assert.deepEqual(parseScene3DDocument(JSON.parse(JSON.stringify(doc))).slots[0].clipPlayback,fitted);
 assert.deepEqual(fitClipPlayback(6,10,{start:2,speed:3,loop:true}),{start:2,speed:.4,loop:false});
 assert.deepEqual(fitClipPlayback(.3,1,{start:.2}),{start:.2,speed:.1,loop:false});
 assert.deepEqual(fitClipPlayback(.8,.15,{start:.2}),{start:.2,speed:4,loop:false});
 for(const [duration,shot,start] of [[null,4,0],[NaN,4,0],[4,0,0],[4,Infinity,0],[4,4,4],[4,50,0],[10,1,0]])assert.equal(fitClipPlayback(duration,shot,{start}),undefined);
})

test('clean export plans retain editorial identity without adding burned-in numbers', () => {
 const plan={shots:[{document:{}},{number:6,document:{}},{document:{clipNumber:16}}]};
 const before=structuredClone(plan);assert.deepEqual(numberedShots(plan).map(item=>item.number),[1,6,16]);assert.deepEqual(plan,before);
 assert.throws(()=>numberedShots({shots:[{number:1,document:{}},{number:1,document:{}}]}),/duplicate/);
 assert.throws(()=>numberedShots({shots:[{number:0,document:{}}]}),/Invalid/);
 assert.throws(()=>numberedShots({shots:[]}),/contain shots/);
})

test('the assembler resolves the same clean identities and rejects duplicates before publication', () => {
 const directory=mkdtempSync(join(tmpdir(),'world3d-clean-plan-'));
 const script=fileURLToPath(new URL('../../pinokio_agent/skills/api/Maestro-next.git/clients/world3d_assemble.py',import.meta.url));
 const run=shots=>{
  writeFileSync(join(directory,'plan.json'),JSON.stringify({shots}));
  return spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),[script,'--base-url','http://127.0.0.1:1','--plan',join(directory,'plan.json'),'--render-dir',directory,'--workspace','test','--output',join(directory,'out.mp4')],{encoding:'utf8'});
 };
 try {
  for(const [shot,expected] of [[{document:{}},'clip-01'],[{number:6,document:{clipNumber:16}},'clip-06'],[{document:{clipNumber:16}},'clip-16']]){
   const result=run([shot]);assert.equal(result.status,1);assert.match(result.stderr,new RegExp(`${expected}\\.publication\\.json`));
  }
  const invalid=run([{number:6,document:{}},{number:6,document:{}}]);assert.equal(invalid.status,1);assert.match(invalid.stderr,/Invalid or duplicate shot number: 6/);assert.doesNotMatch(invalid.stderr,/FileNotFoundError/);
 }finally{rmSync(directory,{recursive:true,force:true});}
})

test('single playback holds the final pose instead of wrapping back to zero', () => {
 const root=new Object3D();const clip=new AnimationClip('exact | Ä', 2, [new NumberKeyframeTrack('.position[x]',[0,2],[0,10])]);
 const slot={...createDefaultScene3DDocument().slots[0],clip:{index:0,name:clip.name}};
 const mixer=bindMixer(root,[clip],slot);
 seekBoundMixer(mixer,clip,performanceClipTime(3,2,{loop:false}));assert.ok(root.position.x>9.99);
 seekBoundMixer(mixer,clip,performanceClipTime(0.25,2,{start:1,speed:2}));assert.equal(root.position.x,7.5);
 seekBoundMixer(mixer,clip,performanceClipTime(3,2,{loop:true}));assert.equal(root.position.x,5);
 clip.tracks[0].setInterpolation(InterpolateDiscrete);
 const stepped=new AnimationClip('STEP',2,[new NumberKeyframeTrack('.position[x]',[0,2],[0,10],InterpolateDiscrete)]);const sm=bindMixer(root,[stepped],{...slot,clip:{index:0,name:'STEP'}});
 seekBoundMixer(sm,stepped,performanceClipTime(3,2,{loop:false}));assert.equal(root.position.x,10);seekBoundMixer(sm,stepped,0);assert.equal(root.position.x,0);
 assert.equal(performanceClipTime(1,null),null);assert.equal(performanceClipTime(1,0),null);
 assert.equal(bindMixer(root,[clip],{...slot,clip:{index:0,name:'wrong'}}),null);
})

test('animated travel is deterministic under backward seeks and preserves the source', () => {
 const slot={...createDefaultScene3DDocument().slots[0],position:[0,0,0],rotationY:0,motion:{to:[4,2,-2],turnTo:Math.PI,easing:'linear'}};
 const before=structuredClone(slot);assert.deepEqual(slotPoseAtTime(slot,2,4),{position:[2,1,-1],rotationY:Math.PI/2});
 slotPoseAtTime(slot,4,4);assert.deepEqual(slotPoseAtTime(slot,0,4),{position:[0,0,0],rotationY:0});assert.deepEqual(slot,before);
})

test('save and reopen preserves exact clip identity, performance and review number', () => {
 const doc=createDefaultScene3DDocument();doc.clipNumber=10;doc.slots[0].sourceUrl='/api/v1/uploads/hero.glb';
 doc.slots[0].clip={index:2,name:'Duplicate | exact'};doc.slots[0].clipPlayback={speed:0.7,start:1.2,loop:false};doc.slots[0].motion={to:[1,0,2],easing:'smooth'};
 const parsed=parseScene3DDocument(JSON.parse(JSON.stringify(doc)));assert.equal(parsed.clipNumber,10);assert.deepEqual(parsed.slots[0].clip,doc.slots[0].clip);assert.deepEqual(parsed.slots[0].clipPlayback,doc.slots[0].clipPlayback);assert.deepEqual(parsed.slots[0].motion.to,[1,0,2]);
 const next=remountScene3DTemplate('spell-duel',parsed);assert.equal(next.clipNumber,10);assert.deepEqual(next.slots[0].clipPlayback,doc.slots[0].clipPlayback);
})

test('malformed imports fail without mounting corrupt cameras or duplicate objects', () => {
 const doc=createDefaultScene3DDocument();
 for (const patch of [{duration:-1},{width:0},{camera:{...doc.camera,orbitRadius:'oops'}},{camera:{...doc.camera,family:'bad'}},{camera:{...doc.camera,eye:[0,0]}},{slots:[doc.slots[0],doc.slots[0]]},{slots:[null]},{slots:[{...doc.slots[0],clip:{index:-1,name:'Run'}}]}]) assert.equal(parseScene3DDocument({...doc,...patch}),null);
})

test('review number is drawn inside the encoded frame and is optional', () => {
 const drawn=[];const ctx={save(){},restore(){},measureText(){return {width:80}},fillRect(...a){drawn.push(a)},fillText(...a){drawn.push(a)}};
 paintClipNumber(ctx,1280,720,10);assert.equal(drawn[1][0],'CLIP 10');assert.ok(drawn[0][0]>1000);const length=drawn.length;
 paintClipNumber(ctx,1280,720,undefined);paintClipNumber(ctx,1280,720,-1);assert.equal(drawn.length,length);
})
