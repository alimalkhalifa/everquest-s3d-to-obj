import S3DFile from './S3DFile';

export interface Vector2Interface {
  x: number,
  y: number
}

export interface Vector3Interface {
  x: number,
  y: number,
  z: number
}

export interface PolygonInterface {
  flags: number,
  vertex1: number,
  vertex2: number,
  vertex3: number
}

export interface PolygonIndexInterface {
  count: number,
  index: number
}

export interface WldInterface {
  file_name: string,
  meshes?: MeshInterface[],
  materials?: MaterialInterface[],
  objects?: PlaceableInterface[],
  static_meshes?: StaticMeshInterface[],
  mesh_references?: MeshReferenceInterface[]
}

export interface MeshInterface {
  id: number,
  name: string,
  materials_list: number[],
  animated_vertices: number,
  center: Vector3Interface,
  scale: number,
  vertices: Vector3Interface[],
  uvs: Vector2Interface[],
  normals: Vector3Interface[],
  vertex_colors: number[],
  polygons: PolygonInterface[],
  polygon_indices: PolygonIndexInterface[]
}

export interface MaterialInterface {
  id: number,
  name: string,
  transparent: boolean,
  masked: boolean,
  clear: boolean,
  textures: string[],
  width: number,
  height: number,
  frame_delay: number
}

export interface SceneInterface {
  name: string,
  wlds: WldInterface[],
  textures: S3DFile[]
}

export interface PlaceableInterface {
  name: string,
  object_name: string,
  position: Vector3Interface,
  rotation: Vector3Interface,
  scale: Vector2Interface,
  vertex_color_ref: number
}

export interface StaticMeshInterface {
  id: number,
  name: string,
  mesh_references: number[]
}

export interface MeshReferenceInterface {
  id: number,
  name: string,
  reference: number
}