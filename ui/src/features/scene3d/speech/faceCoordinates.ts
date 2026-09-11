import { Mesh, Triangle, Vector3, type Intersection } from 'three'

/** Ray hits describe posed skin, but the face shader reads original vertices. */
export function restFaceHit(hit: Intersection): { point: Vector3; scale: number } | undefined {
  const mesh = hit.object
  if (!(mesh instanceof Mesh) || !hit.face) return undefined
  const indices = [hit.face.a, hit.face.b, hit.face.c]
  const posed = indices.map(index => mesh.getVertexPosition(index, new Vector3()))
  const triangle = new Triangle(posed[0], posed[1], posed[2])
  const weights = triangle.getBarycoord(mesh.worldToLocal(hit.point.clone()), new Vector3())
  if (!weights) return undefined
  const original = indices.map(index => new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index))
  const point = new Vector3()
  original.forEach((vertex, i) => point.addScaledVector(vertex, weights.getComponent(i)))
  const world = posed.map(vertex => mesh.localToWorld(vertex.clone()))
  const worldArea = new Triangle(world[0], world[1], world[2]).getArea()
  const scale = Math.sqrt(new Triangle(original[0], original[1], original[2]).getArea() / worldArea)
  return Number.isFinite(scale) && scale > 0 ? { point, scale } : undefined
}
