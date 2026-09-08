import assert from 'node:assert/strict'
import test from 'node:test'
import { AnimationClip, QuaternionKeyframeTrack, Bone, Group, Quaternion, Vector3, Mesh, BoxGeometry, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three'
import { createDefaultScene3DDocument, parseScene3DDocument } from '../src/features/scene3d/document.ts'
import { applyScene3DTemplate } from '../src/features/scene3d/templates.ts'
import { slotPoseAtTime } from '../src/features/scene3d/performance.ts'
import { slotMountKey } from '../src/features/scene3d/backdrop.ts'
import { bindMixer, imageBackdropMesh, paintWorld, syncSlotClip } from '../src/features/scene3d/gpu.ts'
import { applyTypingPose, resetTypingPose } from '../src/features/scene3d/typingPose.ts'

test('curved travel changes world position and follows its tangent deterministically', () => {
  const slot={...createDefaultScene3DDocument().slots[0],position:[0,0,0],motion:{to:[4,0,0],via:[2,0,4],faceTravel:true}}
  assert.deepEqual(slotPoseAtTime(slot,2,4).position,[2,0,2])
  assert.equal(slotPoseAtTime(slot,2,4).rotationY,Math.PI/2)
  assert.ok(slotPoseAtTime(slot,0,4).rotationY < Math.PI/2)
  assert.ok(slotPoseAtTime(slot,4,4).rotationY > Math.PI/2)
  assert.deepEqual(slotPoseAtTime(slot,0,4).position,[0,0,0])
  const doc=applyScene3DTemplate('clone-chase')
  assert.notDeepEqual(slotPoseAtTime(doc.slots[0],0,doc.duration).position,slotPoseAtTime(doc.slots[0],doc.duration,doc.duration).position)
  doc.slots[0].motion=slot.motion;doc.camera.eyeOffset=[1,2,3];doc.camera.targetOffset=[-2,0,0]
  const copy=parseScene3DDocument(JSON.parse(JSON.stringify(doc)))
  assert.deepEqual(copy.slots[0].motion.via,[2,0,4]);assert.deepEqual(copy.camera.eyeOffset,[1,2,3])
})

test('floor yaw stays horizontal and surface changes invalidate mounted geometry', () => {
  const slot={...createDefaultScene3DDocument().slots[0],media:'image',surface:'floor',rotationY:Math.PI/3}
  const mesh=imageBackdropMesh(slot,null)
  const normal=new Vector3(0,0,1).applyQuaternion(mesh.quaternion)
  assert.ok(normal.distanceTo(new Vector3(0,1,0))<1e-6)
  const wall={...slot,surface:'wall',loop:{cylinder:false,speed:0}}
  assert.notEqual(slotMountKey(wall),slotMountKey({...wall,loop:{cylinder:true,speed:0}}))
  assert.notEqual(slotMountKey(slot),slotMountKey({...slot,textureRepeat:8}))
  mesh.geometry.dispose();mesh.material.dispose()
})

function rig() {
  const root=new Group()
  const upper=new Bone();upper.name='LeftArm';upper.position.set(-.25,1.4,0)
  const lower=new Bone();lower.name='LeftForeArm';lower.position.set(-.65,0,0)
  const hand=new Bone();hand.name='LeftHand';hand.position.set(-.65,0,0)
  root.add(upper);upper.add(lower);lower.add(hand);root.updateMatrixWorld(true)
  return {root,upper,hand}
}

test('typing restores the immediately preceding animation pose once, including paused frames', () => {
  const {root,upper}=rig();const slot={...createDefaultScene3DDocument().slots[0],rotationY:0,position:[0,0,0]}
  const pose=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.2)
  upper.quaternion.copy(pose);applyTypingPose(root,slot,.2);resetTypingPose(root)
  assert.ok(upper.quaternion.angleTo(pose)<1e-6)
  upper.rotation.z=.4;const next=upper.quaternion.clone();resetTypingPose(root)
  assert.ok(upper.quaternion.angleTo(next)<1e-6)
  applyTypingPose(root,slot,.2);resetTypingPose(root)
  assert.ok(upper.quaternion.angleTo(next)<1e-6)
})

test('clearing a GLB animation consumes typing restoration before the mixer restores bind pose', () => {
  const {root,upper}=rig()
  const rotated=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.5)
  const clip=new AnimationClip('arms',2,[new QuaternionKeyframeTrack('LeftArm.quaternion',[0,2],[...rotated.toArray(),...rotated.toArray()])])
  const slot={...createDefaultScene3DDocument().slots[0],position:[0,0,0],rotationY:0,clip:{index:0,name:'arms'}}
  const mixer=bindMixer(root,[clip],slot);mixer.setTime(.5)
  applyTypingPose(root,slot,.5)
  const gpu={root,mixer,animations:[clip],clipKey:'0\0arms'}
  syncSlotClip({slots:new Map([[slot.id,gpu]])},{...slot,clip:null})
  resetTypingPose(root)
  assert.ok(upper.quaternion.angleTo(new Quaternion())<1e-6)
})

test('grounding happens before keyboard targeting and backward seeks do not accumulate offsets', () => {
  const {root,hand}=rig();root.add(new Mesh(new BoxGeometry(.3,1,.3),new MeshBasicMaterial()))
  const doc=createDefaultScene3DDocument();doc.slots=[{...doc.slots[0],position:[0,0,0],rotationY:0,scale:1,grounded:true,performance:'typing'}]
  const slot=doc.slots[0]
  const world={slots:new Map([[slot.id,{root,baseScale:1,kind:'model',animations:[],clipKey:null,mixer:null}]]),scene:new Scene(),camera:new PerspectiveCamera(),dressing:null,driveWheels:[],driveRoad:null,driveMovers:[],driveSpeed:0,renderer:{render(){root.updateMatrixWorld(true)}}}
  paintWorld(world,doc,.5)
  const target=new Vector3(-.19,.91+Math.max(0,Math.sin(.5*13-1))*.025,.62)
  assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(target)<.01)
  const atHalf=hand.getWorldPosition(new Vector3());paintWorld(world,doc,2);paintWorld(world,doc,.5)
  assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(atHalf)<1e-6)
})
