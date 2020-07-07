import * as fs from 'fs';
import zlib from 'pako';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';
import {
  Vector2Interface, Vector3Interface, PolygonInterface, PolygonIndexInterface,
  WldInterface, MeshInterface, SceneInterface, MaterialInterface, PlaceableInterface,
  StaticMeshInterface, MeshReferenceInterface
} from './GraphicsInterfaces';
import BufferReader from './BufferReader';
import BufferWriter from './BufferWriter';
import S3DFile from './S3DFile';

export default class ZoneFileLoader {
  public static load(file_path: string): Promise<SceneInterface> {
    return new Promise<SceneInterface>((resolve, reject) => fs.readFile(file_path, (err, data) => {
      if (err) reject(new Error('Error reading zone file'));

      try {
        const [files, buffer] = this.loadPFS(data);
        const wlds: WldInterface[] = [];
        const textures: S3DFile[] = [];

        for (const f of files) {
          if (f.file_name.endsWith('.wld')) {
            const wld = this.loadWld(f, files);
            wlds.push(wld);
          } else {
            textures.push(f);
          }
        }
        resolve({
          name: path.basename(file_path),
          wlds,
          textures,
        });
      } catch(err) {
        reject(err);
      }
    }));
  }

  private static hash_key = [0x95, 0x3A, 0xC5, 0x2A, 0x95, 0x7A, 0x95, 0x6A];

  private static loadPFS(buffer: Buffer): [S3DFile[], Buffer] {
    const reader = new BufferReader(buffer);
    const data_start_offset = reader.readUInt32(); // Start of actual data
    if (new StringDecoder().write(reader.read(4)) !== 'PFS ') { // Verify file is a PFS
      throw new Error('File is not a valid S3D');
    }
    const file_list = [];
    reader.seek(data_start_offset);
    const count = reader.readUInt32();
    let directory: Buffer = null;
    for (let i = 0; i < count; i++) {
      const crc = reader.readUInt32();
      const file_offset = reader.readUInt32();
      const size = reader.readUInt32();
      const data = Buffer.alloc(size);
      const writer = new BufferWriter(data);
      const file_reader = new BufferReader(buffer);
      file_reader.seek(file_offset);
      while (writer.getCursorPosition() < size) {
        const deflated_length = file_reader.readUInt32();
        const inflated_length = file_reader.readUInt32();
        const inflated = Buffer.from(zlib.inflate(file_reader.read(deflated_length)));
        if (inflated.length !== inflated_length) throw new Error('ZLib Decompression failed');
        writer.write(inflated);
      }
      if (crc === 0x61580AC9) {
        directory = data;
      } else {
        file_list.push({ file_offset, data });
      }
    }
    file_list.sort((a, b) => a.file_offset - b.file_offset);

    const directory_reader = new BufferReader(directory);
    const directory_length = directory_reader.readUInt32();
    // if ( (gequipHack && dirlen !== fileList.length + 1) || (!gequipHack && dirlen !== fileList.length )) {
    if (directory_length !== file_list.length && (directory_length !== file_list.length + 1)) {
      throw new Error(`S3D Corrupt, directory does not match file length, expected ${directory_length} got ${file_list.length}`);
    }
    const files: S3DFile[] = [];
    for (const f of file_list) {
      const file_name_length = directory_reader.readUInt32();
      let file_name = new StringDecoder().write(directory_reader.read(file_name_length)).trim();
      file_name = file_name.slice(0, file_name.length - 1);
      if (/* !gequipHack || */ file_name !== 'trace.dbg') {
        files.push({ file_name, data: f.data });
      }
    }
    const filtered_files = files.filter(value => value.file_name.endsWith('.bmp') || value.file_name.endsWith('.dds') || value.file_name.endsWith('.wld'));
    return [filtered_files, directory];
  }

  private static loadWld({ file_name, data }: S3DFile, files: S3DFile[]): WldInterface {
    const reader = new BufferReader(data);
    const meshes: MeshInterface[] = [];
    const materials: MaterialInterface[] = [];
    const texture_info_refs: { id: number, name: string, ref: number }[] = [];
    const texture_infos: { id: number, name: string, refs: number[] }[] = [];
    const texture_paths: { id: number, name: string, file_path: string, width: number, height: number }[] = [];
    const texture_lists: { id: number, name: string, materials: number[] }[] = [];
    const placeable_objects: PlaceableInterface[] = [];
    const static_meshes: StaticMeshInterface[] = [];
    const mesh_references: MeshReferenceInterface[] = [];

    reader.readUInt32(); // magic
    reader.readUInt32(); // version
    const fragment_count = reader.readUInt32();
    reader.readUInt32(); // bsp_region_count
    reader.readUInt32(); // unknown
    const string_hash_size = reader.readUInt32();
    reader.readUInt32(); // unknown
    const string_hash = reader.read(string_hash_size);
    const decoded_string_hash = Buffer.alloc(string_hash_size);
    for (let i = 0; i < string_hash_size; i++) {
      const char = string_hash[i];
      const decoded_char = char ^ ZoneFileLoader.hash_key[i % 8];
      decoded_string_hash[i] = decoded_char;
    }
    const string_table = new StringDecoder().write(decoded_string_hash);
    for (let i = 0; i < fragment_count; i++) {
      const fragment_size = reader.readUInt32();
      const fragment_type = reader.readUInt32();
      const name_reference = reader.readInt32();
      const fragment_name = string_table.substr(-name_reference, string_table.indexOf('\0', -name_reference) + name_reference);
      switch (fragment_type) {
        case 0x03: // Texture Path
          const texture_path = this.loadTexturePath(i, fragment_name, reader.read(fragment_size - 4), files);
          if (texture_path) texture_paths.push(texture_path);
          break;
        case 0x04: // Texture Info
          const texture_info = this.loadTextureInfo(i, fragment_name, reader.read(fragment_size - 4));
          if (texture_info) texture_infos.push(texture_info);
          break;
        case 0x05: // Texture Info Ref
          const texture_info_ref = this.loadTextureInfoRef(i, fragment_name, reader.read(fragment_size - 4));
          if (texture_info_ref) texture_info_refs.push(texture_info_ref);
          break;
        case 0x14: // Static Mesh
          const static_mesh = this.loadStaticMesh(i, fragment_name, reader.read(fragment_size - 4));
          if (static_mesh) static_meshes.push(static_mesh);
          break;
        case 0x15: // Placeable Object Location
          const place = this.loadPlaceableLocation(fragment_name, reader.read(fragment_size - 4), string_table);
          if (place) placeable_objects.push(place);
          break;
        case 0x2D: // Mesh Reference
          let mesh_reference = this.loadMeshReference(i, fragment_name, reader.read(fragment_size - 4), meshes);
          if (mesh_reference) mesh_references.push(mesh_reference);
          break
        case 0x30: // Texture
          let material = this.loadTextureFragment(i, fragment_name, reader.read(fragment_size - 4), texture_info_refs, texture_infos, texture_paths);
          if (material) materials.push(material);
          break;
        case 0x31: // Texture List
          let texture_list = this.loadTextureList(i, fragment_name, reader.read(fragment_size - 4));
          if (texture_list) texture_lists.push(texture_list);
          break;
        case 0x36: // Mesh
          let mesh = this.loadMeshFragment(i, fragment_name, reader.read(fragment_size - 4), texture_lists, materials);
          if (mesh) meshes.push(mesh);
          break;
        default:
          reader.skip(fragment_size - 4);
      }
    }
    return {
      file_name,
      meshes,
      materials,
      objects: placeable_objects,
      static_meshes,
      mesh_references
    };
  }

  private static loadMeshFragment(id: number, fragment_name: string, buffer: Buffer, texture_lists: { id: number, name: string, materials: number[] }[], materials: MaterialInterface[]): MeshInterface {
    const reader = new BufferReader(buffer);
    const flags = reader.readUInt32();
    // let type = flags === 0x00018003 ? 'zone' : 'object'
    const texture_list = reader.readUInt32() - 1;
    const materials_list = texture_lists.find((value) => value.id === texture_list).materials;
    let material_0
    let i = 0;
    while(!material_0 || i > materials_list.length) {
      material_0 = materials.find((value) => value.id === materials_list[i]);
      i++;
    }
    const animated_vertices = reader.readUInt32();
    reader.skip(8);
    const center: Vector3Interface = {
      x: reader.readFloat(),
      y: reader.readFloat(),
      z: reader.readFloat(),
    };
    reader.skip(40);
    const vertex_count = reader.readUInt16();
    const texture_cooordinate_count = reader.readUInt16();
    const normal_count = reader.readUInt16();
    const color_count = reader.readUInt16();
    const polygon_count = reader.readUInt16();
    const vertex_piece_count = reader.readUInt16();
    const polygon_texture_count = reader.readUInt16();
    const vertex_texture_count = reader.readUInt16();
    reader.readUInt16(); // size9
    const scale = 1.0 / (1 << reader.readUInt16());
    const vertices: Vector3Interface[] = [];
    for (let i = 0; i < vertex_count; i++) {
      vertices.push({
        x: reader.readInt16(),
        y: reader.readInt16(),
        z: reader.readInt16(),
      });
    }
    const texture_coordinates: Vector2Interface[] = [];
    for (let i = 0; i < texture_cooordinate_count; i++) {
      texture_coordinates.push({
        x: reader.readInt16() / (256.0),
        y: reader.readInt16() / (256.0),
      });
    }
    const vertex_normals: Vector3Interface[] = [];
    for (let i = 0; i < normal_count; i++) {
      vertex_normals.push({
        x: reader.readInt8() / 127.0,
        y: reader.readInt8() / 127.0,
        z: reader.readInt8() / 127.0,
      });
    }
    const vertex_colors: number[] = [];
    for (let i = 0; i < color_count; i++) {
      vertex_colors.push(reader.readUInt32());
    }
    const polygons: PolygonInterface[] = [];
    for (let i = 0; i < polygon_count; i++) {
      const flags = reader.readUInt16();
      const vertex1 = reader.readUInt16();
      const vertex2 = reader.readUInt16();
      const vertex3 = reader.readUInt16();
      polygons.push({
        flags, vertex1, vertex2, vertex3,
      });
    }
    const vertex_pieces: PolygonIndexInterface[] = [];
    for (let i = 0; i < vertex_piece_count; i++) {
      const count = reader.readUInt16();
      const index = reader.readUInt16();
      vertex_pieces.push({ count, index });
    }
    const polygon_textures: PolygonIndexInterface[] = [];
    for (let i = 0; i < polygon_texture_count; i++) {
      const count = reader.readUInt16();
      const index = reader.readUInt16();
      polygon_textures.push({ count, index });
    }
    const vertex_textures: PolygonIndexInterface[] = [];
    for (let i = 0; i < vertex_texture_count; i++) {
      const count = reader.readUInt16();
      const index = reader.readUInt16();
      vertex_textures.push({ count, index });
    }

    return {
      id,
      name: fragment_name,
      scale,
      center,
      materials_list,
      animated_vertices,
      vertices,
      uvs: texture_coordinates,
      normals: vertex_normals,
      vertex_colors,
      polygons,
      polygon_indices: polygon_textures,
    };
  }

  private static loadTextureList(id: number, fragment_name: string, buffer: Buffer): { id: number, name: string, materials: number[] } {
    const materials: number[] = [];

    const reader = new BufferReader(buffer);
    reader.skip(4); // skip first 4 bytes
    const material_count = reader.readUInt32();
    for (let i = 0; i < material_count; i++) {
      materials.push(reader.readUInt32() - 1);
    }

    return {
      id,
      name: fragment_name,
      materials,
    };
  }

  private static loadTextureFragment(
    id: number,
    fragment_name: string,
    buffer: Buffer,
    texture_info_refs: { id: number, name: string, ref: number }[],
    texture_infos: { id: number, name: string, refs: number[], frame_delay?: number }[],
    texture_paths: { id: number, name: string, file_path: string, width: number, height: number }[],
  ): MaterialInterface {
    const reader = new BufferReader(buffer);
    const flags = reader.readUInt32();
    const pair_field_exists = (flags & 1) > 0;
    const texture_flags = reader.readUInt32();
    reader.skip(12);
    const not_transparent = (texture_flags & (1 << 0)) > 0;
    const masked = (texture_flags & (1 << 1)) > 0;
    const semitransparent_notmask = (texture_flags & (1 << 2)) > 0;
    const semitransparent_masked = (texture_flags & (1 << 3)) > 0;
    const notsemitransparent_masked = (texture_flags & (1 << 4)) > 0;
    const not_transparent2 = (texture_flags & (1 << 31)) > 0;
    if (pair_field_exists) {
      reader.skip(8);
    }
    const texture_info_ref_id = reader.readUInt32() - 1;
    const texture_info_ref = texture_info_refs.find((value) => value.id === texture_info_ref_id);
    const texture_info = texture_info_ref ? texture_infos.find((value) => value.id === texture_info_ref.ref) : null;
    const textures: string[] = [];
    if (texture_info) {
      for (const ref of texture_info.refs) {
        const texture = texture_paths.find((value) => value.id === ref);
        if (texture) {
          textures.push(texture.file_path);
        }
      }
    } else {
      return null;
    }

    return {
      id,
      name: fragment_name,
      transparent: (!not_transparent && !not_transparent2) || semitransparent_masked || semitransparent_notmask,
      masked: (masked || semitransparent_masked || notsemitransparent_masked),
      clear: (texture_flags === 0),
      textures,
      width: texture_paths[0].width,
      height: texture_paths[0].height,
      frame_delay: texture_infos[0].frame_delay ? texture_infos[0].frame_delay : 1.0
    };
  }

  private static loadTextureInfoRef(id: number, fragment_name: string, buffer: Buffer): { id: number, name: string, ref: number } {
    const reader = new BufferReader(buffer);
    return {
      id,
      name: fragment_name,
      ref: reader.readUInt32() - 1,
    };
  }

  private static loadTextureInfo(id: number, fragment_name: string, buffer: Buffer): { id: number, name: string, frame_delay?: number, refs: number[] } {
    const reader = new BufferReader(buffer);
    const texture_refs: number[] = [];
    let frame_delay = 0;

    const flags = reader.readUInt32();
    const is_animated = (flags & (1 << 3)) > 0;
    const param2_exists = (flags & (1 << 4)) > 0;
    const size = reader.readUInt32();
    if (is_animated) frame_delay = reader.readUInt32() / 1000.0;
    if (!param2_exists) reader.skip(4); // unknown what??? error in wlddoc.pdf
    for (let i = 0; i < size; i++) {
      texture_refs.push(reader.readUInt32() - 1);
    }
    return {
      id,
      name: fragment_name,
      refs: texture_refs,
      ...(is_animated ? { frame_delay } : {}),
    };
  }

  private static loadTexturePath(id: number, fragment_name: string, buffer: Buffer, files: S3DFile[]): { id: number, name: string, file_path: string, width: number, height: number } {
    const reader = new BufferReader(buffer);
    reader.skip(4); // file_count
    const path_length = reader.readUInt16();
    const encoded_name = reader.read(path_length);
    const file_name = Buffer.alloc(path_length);
    for (let i = 0; i < path_length; i++) {
      const char = encoded_name[i];
      const decoded_char = char ^ ZoneFileLoader.hash_key[i % 8];
      file_name[i] = decoded_char;
    }
    const file_path = new StringDecoder().write(file_name).slice(0, file_name.length - 1).toLowerCase();
    const file = files.find((value) => value.file_name === file_path);
    if (!file) {
      return null;
    }
    const width = file.data.readUInt32LE(0x12);
    const height = file.data.readUInt32LE(0x16);
    return {
      id,
      name: fragment_name,
      file_path,
      width,
      height,
    };
  }

  private static loadPlaceableLocation(fragment_name: string, buffer: Buffer, string_table: string): PlaceableInterface {
    const reader = new BufferReader(buffer);
    const object_name_id = reader.readInt32();
    const flags = reader.readUInt32();
    if (flags == 0x2E) return null;
    const object_name = string_table.substr(-object_name_id, string_table.indexOf('\0', -object_name_id) + object_name_id);
    reader.skip(4); // skip fragment 1
    const position: Vector3Interface = {
      x: reader.readFloat(),
      y: reader.readFloat(),
      z: reader.readFloat(),
    };
    const rotation: Vector3Interface = {
      z: reader.readFloat() / (512.0 / 360.0),
      y: reader.readFloat() / (512.0 / 360.0),
      x: reader.readFloat() / (512.0 / 360.0),
    };
    reader.skip(4); // skip params1
    const scale: Vector2Interface = {
      y: reader.readFloat(),
      x: reader.readFloat(),
    };
    const vertex_color_ref = reader.readUInt32();
    return {
      name: fragment_name,
      object_name,
      position,
      rotation,
      scale,
      vertex_color_ref,
    };
  }

  private static loadStaticMesh(id: number, fragment_name: string, buffer: Buffer): StaticMeshInterface {
    let reader = new BufferReader(buffer);
    let flags = reader.readUInt32();
    let params1_exists = (flags & (1 << 0)) > 0;
    let params2_exists = (flags & (1 << 1)) > 0;
    reader.skip(4); // skip fragment 1
    let size1 = reader.readUInt32();
    let size2 = reader.readUInt32();
    reader.skip(4); // skip fragment 2
    if (params1_exists) reader.skip(4);
    if (params2_exists) reader.skip(4 * 7);
    for (let i = 0; i < size1; i++) { // Skip Entry 1s
      let entry1_size = reader.readUInt32();
      reader.skip(8 * entry1_size);
    }
    let mesh_references: number[] = []
    for (let i = 0; i < size2; i++) {
      mesh_references.push(reader.readUInt32() - 1);
    }

    return {
      id,
      name: fragment_name,
      mesh_references
    }
  }

  private static loadMeshReference(id: number, fragment_name: string, buffer: Buffer, meshes: MeshInterface[]): MeshReferenceInterface {
    let reader = new BufferReader(buffer);
    let reference = reader.readUInt32() - 1;
    let mesh_reference = meshes.find(value => value.id === reference);
    if (!mesh_reference) return null;
    let name = mesh_reference.name;
    return {
      id,
      name,
      reference
    };
  }
}

/* case 0x03: // Texture Path
          let files = []
          let fileCount = buf.readUInt32LE(cursor) + 1
          cursor += 4
          for (let i = 0; i < fileCount; i++) {
            let nameLength = buf.readUInt16LE(cursor)
            cursor += 2
            let encodedName = buf.slice(cursor, cursor + nameLength)
            let fileName = Buffer.alloc(nameLength)
            for (let i = 0; i < nameLength; i++) {
              let char = encodedName[i]
              let decodedChar = char ^ hashKey[i % 8]
              fileName[i] = decodedChar
            }
            let name = new StringDecoder().write(fileName)
            files.push(name.slice(0, name.length - 1))
            fragment[fragIndex] = {type: "TexturePath", typeCode: fragType, name: fragName, files}
            cursor += nameLength
          }
          break
        case 0x04: // Texture Info
          let textureInfoFlags = buf.readUInt32LE(cursor)
          let unknownFlag = (textureInfoFlags & 4) == 4 ? true : false
          let animatedFlag = (textureInfoFlags & 8) == 8 ? true : false
          cursor += 4
          let referenceCount = buf.readUInt32LE(cursor)
          cursor += 4
          let unknownField = buf.readUInt32LE(cursor)
          if (unknownFlag) {
            cursor += 4
          }
          let frameTime = buf.readUInt32LE(cursor)
          if (animatedFlag) {
            cursor += 4
          }
          let texturePaths = []
          for (let i = 0; i < referenceCount; i++) {
            texturePaths.push(buf.readInt32LE(cursor) - 1)
            cursor += 4
          }
          fragment[fragIndex] = {type: "TextureInfo", typeCode: fragType, name: fragName, animatedFlag, ...(animatedFlag ? {frameTime} : {}), texturePaths}
          break
        case 0x05: // Texture Info Reference
          fragment[fragIndex] = {type: "TextureInfoRef", typeCode: fragType, name: fragName, textureInfo: buf.readUInt32LE(cursor) - 1}
          break
        case 0x06: // 2D object
          let object2DFlags = buf.readUInt32LE(cursor)
          let object2DParam3Exists = (object2DFlags & (1 << 0)) === (1 << 0)
          let object2DParam4Exists = (object2DFlags & (1 << 1)) === (1 << 1)
          let object2DParam5Exists = (object2DFlags & (1 << 2)) === (1 << 2)
          let object2DParam6Exists = (object2DFlags & (1 << 3)) === (1 << 3)
          let object2DParam2Exists = (object2DFlags & (1 << 7)) === (1 << 7)
          cursor += 4
          let object2DSubSize1 = buf.readUInt32LE(cursor)
          cursor += 4
          let object2DSize1 = buf.readUInt32LE(cursor)
          cursor += 4
          let object2DParams1_1 = buf.readUInt32LE(cursor)
          cursor += 4
          let object2DParams1_2 = buf.readUInt32LE(cursor)
          cursor += 4
          cursor += 4 // Skip Fragment
          if (object2DParam2Exists) cursor += 4 // Skip Params2
          if (object2DParam3Exists) cursor += 12 // Skip Params3
          if (object2DParam4Exists) cursor += 4 // Skip Params4
          if (object2DParam5Exists) cursor += 4 // Skip Params5
          if (object2DParam6Exists) cursor += 4 // Skip Params6
          let object2DTextureRefs = []
          for (let i = 0; i < object2DSize1; i++) {
            let material = []
            cursor += 4 // Skip unneeded data
            let object2DData6Size = buf.readUInt32LE(cursor) & 0x7FFFFFFF
            cursor += 4
            for (let s = 0; s < object2DData6Size; s++) {
              let texture = []
              cursor += 4 // Skip unneeded data
              for (let j = 0; j < object2DSubSize1; j++) {
                texture.push(buf.readUInt32LE(cursor))
                cursor += 4
              }
              material.push(texture)
            }
            object2DTextureRefs.push(material)
          }
          fragment[fragIndex] = {type: "Object2D", typeCode: fragType, name: fragName, textures: object2DTextureRefs}
          break
        case 0x07: // 2D object Ref
          fragment[fragIndex] = {type: "Object2DRef", typeCode: fragType, name: fragName, Object2D: buf.readUInt32LE(cursor) - 1}
          break
        case 0x09: // Camera Ref
          fragment[fragIndex] = {type: "CameraRef", typeCode: fragType, name: fragName, camera: buf.readUInt32LE(cursor) - 1}
          break
        case 0x10: // Skeleton Track
          let skeletonTrackFlags = buf.readUInt32LE(cursor)
          let skeletonTrackParams1Exists = (skeletonTrackFlags & 1) === 1
          let skeletonTrackParams2Exists = (skeletonTrackFlags & 2) === 2
          let skeletonTrackSize2Fragment3Data3Exists = (skeletonTrackFlags & (2 << 9)) === (2 << 9)
          cursor += 4
          let skeletonTrackSize1 = buf.readUInt32LE(cursor)
          cursor += 4
          let skeletonTrackFragment = buf.readUInt32LE(cursor)
          cursor += 4
          if (skeletonTrackParams1Exists) cursor += 12 // Skip Params1
          if (skeletonTrackParams2Exists) cursor += 4 // Skip Params2
          let skeletonTrackEntries = []
          for (let i = 0; i < skeletonTrackSize1; i++) {
            let Entry1 = {}
            Entry1.NameRef = buf.readInt32LE(cursor)
            Entry1.Name = stringTable.substr(-Entry1.NameRef, stringTable.indexOf('\0', -Entry1.NameRef)+Entry1.NameRef)
            cursor += 4
            Entry1.Flags = buf.readUInt32LE(cursor)
            cursor += 4
            Entry1.Fragment1 = buf.readUInt32LE(cursor) - 1
            cursor += 4
            Entry1.Fragment2 = buf.readUInt32LE(cursor)
            cursor += 4
            Entry1.Size = buf.readUInt32LE(cursor)
            cursor += 4
            Entry1.Data = []
            for (let j = 0; j < Entry1.Size; j++) {
              Entry1.Data.push(buf.readUInt32LE(cursor))
              cursor += 4
            }
            skeletonTrackEntries.push(Entry1)
          }
          let skeletonTrackSize2 = 0
          let skeletonTrackFragment3 = []
          let skeletonTrackData3 = []
          if (skeletonTrackSize2Fragment3Data3Exists) {
            skeletonTrackSize2 = buf.readUInt32LE(cursor)
            cursor += 4
          }
          for (let i = 0; i < skeletonTrackSize2; i++) { // if skeletonTrackSize2Fragment3Data3Exists
            skeletonTrackFragment3.push(buf.readUInt32LE(cursor))
            cursor += 4
          }
          for (let i = 0; i < skeletonTrackSize2; i++) { // if skeletonTrackSize2Fragment3Data3Exists
            skeletonTrackData3.push(buf.readUInt32LE(cursor))
            cursor += 4
          }
          fragment[fragIndex] = {type: "SkeletonTrack", typeCode: fragType, name: fragName,
            entriesCount: skeletonTrackSize1,
            polygonAnimationRef: skeletonTrackFragment,
            entries: skeletonTrackEntries,
            meshRefsCount: skeletonTrackSize2,
            meshRefs: skeletonTrackFragment3,
            data3: skeletonTrackData3
          }
          break
        case 0x11: // Skeleton Track Set Reference
          fragment[fragIndex] = {type: "SkeletonTrackRef", typeCode: fragType, name: fragName, skeletonTrack: buf.readUInt32LE(cursor) - 1}
          break
        case 0x12: // Skeleton Piece Track
          let skeletonPieceTrackFlags = buf.readUInt32LE(cursor)
          cursor += 4
          let skeletonPieceTrackSize = buf.readUInt32LE(cursor)
          cursor += 4
          let skeletonPieceRotateDenominator = []
          let skeletonPieceRotateXNumerator = []
          let skeletonPieceRotateYNumerator = []
          let skeletonPieceRotateZNumerator = []
          let skeletonPieceShiftXNumerator = []
          let skeletonPieceShiftYNumerator = []
          let skeletonPieceShiftZNumerator = []
          let skeletonPieceShiftDenominator = []
          for (let i = 0; i < skeletonPieceTrackSize; i++) {
            skeletonPieceRotateDenominator.push(buf.readInt16LE(cursor))
            cursor += 2
            skeletonPieceRotateXNumerator.push(buf.readInt16LE(cursor))
            cursor += 2
            skeletonPieceRotateYNumerator.push(buf.readInt16LE(cursor))
            cursor += 2
            skeletonPieceRotateZNumerator.push(buf.readInt16LE(cursor))
            cursor += 2
            skeletonPieceShiftXNumerator.push(buf.readInt16LE(cursor))
            cursor += 2
            skeletonPieceShiftYNumerator.push(buf.readInt16LE(cursor))
            cursor += 2
            skeletonPieceShiftZNumerator.push(buf.readInt16LE(cursor))
            cursor += 2
            skeletonPieceShiftDenominator.push(buf.readInt16LE(cursor))
            cursor += 2
          }
          fragment[fragIndex] = {type: "SkeletonPieceTrack", typeCode: fragType, name: fragName,
            size: skeletonPieceTrackSize,
            rotateDenominator: skeletonPieceRotateDenominator,
            rotateX: skeletonPieceRotateXNumerator,
            rotateY: skeletonPieceRotateYNumerator,
            rotateZ: skeletonPieceRotateZNumerator,
            shiftDenominator: skeletonPieceShiftDenominator,
            shiftX: skeletonPieceShiftXNumerator,
            shiftY: skeletonPieceShiftYNumerator,
            shiftZ: skeletonPieceShiftZNumerator
          }
          break
        case 0x13: // Skeleton Piece Track Ref
          fragment[fragIndex] = {type: "SkeletonPieceTrackRef", typeCode: fragType, name: fragName, skeletonPieceTrack: buf.readUInt32LE(cursor) - 1}
          break
        case 0x14: // Static or Animated Model Ref/Player Info
          let staticModelFlags = buf.readUInt32LE(cursor)
          let staticModelParam1Exists = (staticModelFlags & 1) == 1 ? true : false
          let staticModelParam2Exists = (staticModelFlags & 2) == 2 ? true : false
          cursor += 4
          let staticModelFragment1 = buf.readInt32LE(cursor)
          cursor += 4
          let staticModelSize1 = buf.readUInt32LE(cursor)
          cursor += 4
          let staticModelSize2 = buf.readUInt32LE(cursor)
          cursor += 4
          cursor += 4 // Skip Fragment2
          if (staticModelParam1Exists) cursor += 4 // Skip Params1
          if (staticModelParam2Exists) cursor += 4 * 7 // Skip Params2
          for (let i = 0; i < staticModelSize1; i++) { // Skip Entry1
            let size = buf.readUInt32LE(cursor)
            cursor += 4
            cursor += 8 * size
          }
          let staticModelFragment3s = []
          for (let i = 0; i < staticModelSize2; i++) {
            staticModelFragment3s.push(buf.readUInt32LE(cursor) - 1)
            cursor += 4
          }
          fragment[fragIndex] = {type: "StaticModelRef", typeCode: fragType, name: fragName, meshReferences: staticModelFragment3s}
          break
        case 0x15: // PlaceableObject Location
          let olName = buf.readInt32LE(cursor)
          cursor += 4
          let olFlag = buf.readUInt32LE(cursor)
          if ( olFlag == 0x2E ) break
          let olRef = stringTable.substr(-olName, stringTable.indexOf('\0', -olName)+olName)
          cursor += 4
          cursor += 4 // Skip Fragment1
          let olX = buf.readFloatLE(cursor)
          cursor += 4
          let olY = buf.readFloatLE(cursor)
          cursor += 4
          let olZ = buf.readFloatLE(cursor)
          cursor += 4
          let olRotZ = buf.readFloatLE(cursor)
          cursor += 4
          let olRotY = buf.readFloatLE(cursor)
          cursor += 4
          let olRotX = buf.readFloatLE(cursor)
          cursor += 4
          cursor += 4 // Skip Params1
          let olScaleY = buf.readFloatLE(cursor)
          cursor += 4
          let olScaleX = buf.readFloatLE(cursor)
          cursor += 4
          let vertexColorRef = buf.readUInt32LE(cursor) - 1
          fragment[fragIndex] = {type: "ObjectLocation", typeCode: fragType, name: fragName, ref: olRef, x: olX, y: olY, z: olZ, rotX: olRotX, rotY: olRotY, rotZ: olRotZ, scaleX: olScaleX, scaleY: olScaleY, vertexColorRef}
          console.log(fragment[fragIndex])
          console.log(olRotY / (512/360))
          console.log((olRotY / (512/360)) * 3.14159 / 180.0)
          return
          break
        case 0x26: // ItemParticle
          fragment[fragIndex] = {type: "ItemParticle", typeCode: fragType, name: fragName}
          break
        case 0x27: // ItemParticleRef
          fragment[fragIndex] = {type: "ItemParticleRef", typeCode: fragType, name: fragName, ref: buf.readUInt32LE(cursor) - 1}
          break
        case 0x2C: { // Mesh Alternate
          fragment[fragIndex] = {type: "MeshAlt", typeCode: fragType, name: fragName}
          break
        }
        case 0x2D: // Mesh Reference
          fragment[fragIndex] = {type: "MeshRef", typeCode: fragType, name: fragName, mesh: buf.readUInt32LE(cursor) - 1}
          break
        case 0x30: // Texture
          let existenceFlags = buf.readUInt32LE(cursor)
          cursor += 4
          let pairFieldExists = (existenceFlags & 1) === 1
          let textureFlags = buf.readUInt32LE(cursor)
          cursor += 4 + 12
          let notTransparent = (textureFlags & 1) === 1
          let masked = (textureFlags & 2) === 2
          let semitransparentNoMask = (textureFlags & 4) === 4
          let semitransparentMask = (textureFlags & 8) === 8
          let notSemitransparentMask = (textureFlags & 16) === 16
          let apparentlyNotTransparent = (textureFlags & (1 << 31)) === (1 << 31)
          if (pairFieldExists) {
            cursor += 0
          }
          let textureInfoRef = buf.readUInt32LE(cursor) - 1
          fragment[fragIndex] = {type: "Texture", typeCode: fragType, name: fragName,
            notTransparent,
            masked,
            semitransparentNoMask,
            semitransparentMask,
            notSemitransparentMask,
            apparentlyNotTransparent,
            textureInfoRef
          }
          break
        case 0x31: // TextureList
          cursor += 4
          let refCount = buf.readUInt32LE(cursor)
          cursor += 4
          let texture = []
          for (let i = 0; i < refCount; i++) {
            texture.push(buf.readInt32LE(cursor) - 1)
            cursor += 4
          }
          fragment[fragIndex] = {type: "TextureList", typeCode: fragType, name: fragName, textureInfoRefsList: texture}
          break

        case 0x08: // Camera
        case 0x16: // Zone Unknown
        case 0x1B: // Light Source
        case 0x1C: // Light Source Ref
        case 0x21: // BSP Tree
        case 0x22: // BSP Region
        case 0x29: // Region Flag
        case 0x2A: // Ambient Light
        case 0x32: // Vertex Color
        case 0x33: // Vertex Color Ref
        case 0x35: // First Fragment -- Purpose Unknown
        */
