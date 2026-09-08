import assert from 'node:assert/strict'
import test from 'node:test'
import { AnimationClip, NumberKeyframeTrack, Object3D, InterpolateDiscrete } from 'three'
import { performanceClipTime, slotPoseAtTime, paintClipNumber } from '../src/features/scene3d/performance.ts'
import { createDefaultScene3DDocument, parseScene3DDocument } from '../src/features/scene3d/document.ts'
import { bindMixer, seekBoundMixer } from '../src/features/scene3d/gpu.ts'
import { remountScene3DTemplate } from '../src/features/scene3d/templates.ts'

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
