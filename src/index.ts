import path from 'path';
import ZoneFileLoader from './lib/ZoneFileLoader';
import fs from './lib/fs';
import ObjWriter from './lib/ObjWriter';
import MtlWriter from './lib/MtlWriter';
import S3DFile from './lib/S3DFile';
import { WldInterface, SceneInterface } from './lib/GraphicsInterfaces';

const MAX_PROCESS_QUEUE_SIZE = process.env.MAX_PROCESS_QUEUE_SIZE || 1;

async function main() {
  await fs.createDirIfNotExist('./zones');
  await fs.createDirIfNotExist('./export');
  await fs.createDirIfNotExist('./export/zones')
  await fs.createDirIfNotExist('./export/textures')
  await fs.createDirIfNotExist('./export/materials')
  await fs.createDirIfNotExist('./export/objects')
  await fs.createDirIfNotExist('./export/characters')
  await fs.createDirIfNotExist('./export/skies');
  await fs.createDirIfNotExist('./export/object_positions');

  let files: string[];
  let processQueue: Promise<void>[] = [];
  try {
    files = await fs.ls('./zones');
  } catch(err) {
    throw new Error("Error listing ./zones directory");
  }
  for (const f of files) {
    if (processQueue.length >= MAX_PROCESS_QUEUE_SIZE) {
      await Promise.all(processQueue);
      processQueue = [];
    }

    processQueue.push(new Promise<void>(async (resolve, reject) => {
      try {
        console.log(`Loading ${f}`);
        let s3d = await ZoneFileLoader.load(`./zones/${f}`);
        if (path.basename(f, '.s3d') === 'sky') {
          await extractTextures(s3d);
          await extractMaterials(s3d.wlds[0]);
          await extractMeshes(s3d.wlds[0], s3d, `../materials/${path.basename(s3d.wlds[0].file_name, '.wld')}.mtl`, 'skies');
        } else if (f.indexOf('gequip') !== -1) {
          console.log('skipping equipment file');
        } else if (path.basename(f, '.s3d').endsWith('_obj')) {
          await extractTextures(s3d);
          await extractStaticMeshesAndMaterials(s3d.wlds[0], s3d, 'objects');
        } else if (path.basename(f, '.s3d').endsWith('_chr') || path.basename(f, '.s3d').endsWith('_chr1')) {
          console.log('skipping chr file');
        } else if (path.basename(f, '.s3d').endsWith('_amr')) {
          console.log('skipping amr file');
        } else if (path.basename(f, '.s3d').endsWith('_lit')) {
          console.log('skipping lit file');
        } else {
          await extractTextures(s3d);
          for (const wld of s3d.wlds) {
            if (path.basename(wld.file_name, '.wld') === path.basename(f, '.s3d')) {
              await extractMaterials(wld);
              await extractScene(wld, s3d, `../materials/${path.basename(wld.file_name, '.wld')}.mtl`);
            } else if (wld.file_name === 'objects.wld') {
              await fs.write(`./export/object_positions/${path.basename(f, '.s3d')}.json`, JSON.stringify(wld.objects));
            } else if (wld.file_name === 'lights.wld') {
              console.log('skipping zone lights');
            }
          }
          console.log(`Done with ${f}`)
          
        } 
      } catch(err) {
        reject(`Error reading S3D ${f}\n${err.stack}`);
      }
      resolve();
    }).catch(err => { throw new Error(err) }));
  }
}

async function extractTextures(s3d: SceneInterface) {
  for (const t of s3d.textures) {
    await fs.writeBinary(`./export/textures/${t.file_name}`, t.data);
  }
}

async function extractMaterials(wld: WldInterface) {
  let mtl = new MtlWriter();
  for (const material of wld.materials) {
    mtl.addMaterial(material.name, material.textures[0], material.masked, material.transparent);
  }
  await fs.write(`./export/materials/${path.basename(wld.file_name, '.wld')}.mtl`, mtl.toString());
}

async function extractScene(wld: WldInterface, s3d: SceneInterface, materials_path: string) {
  let obj = new ObjWriter();
  obj.mtlLibs = [materials_path];
  for (const mesh of wld.meshes) {
    obj.addMesh(mesh.id, mesh.name, mesh.scale, mesh.center, mesh.vertices, mesh.uvs, mesh.polygons, mesh.polygon_indices, mesh.materials_list, s3d.wlds[0].materials);
  }
  await fs.write(`./export/zones/${path.basename(wld.file_name, '.wld')}.obj`, obj.toString());
}

async function extractMeshes(wld: WldInterface, s3d: SceneInterface, materials_path: string, folder: string) {
  for (const mesh of wld.meshes) {
    let obj = new ObjWriter();
    obj.mtlLibs = [materials_path];
    obj.addMesh(mesh.id, mesh.name, mesh.scale, mesh.center, mesh.vertices, mesh.uvs, mesh.polygons, mesh.polygon_indices, mesh.materials_list, s3d.wlds[0].materials);
    await fs.write(`./export/${folder}/${mesh.name}.obj`, obj.toString());
  }
}

async function extractStaticMeshesAndMaterials(wld: WldInterface, s3d: SceneInterface, folder: string) {
  for (const static_mesh of wld.static_meshes) {
    let obj = new ObjWriter();
    let mtl = new MtlWriter();
    obj.mtlLibs = [`../materials/${static_mesh.name}.mtl`];
    for (const mesh_ref_id of static_mesh.mesh_references) {
      const mesh_ref = wld.mesh_references.find(r => r.id === mesh_ref_id);
      if (mesh_ref) {
        const mesh = wld.meshes.find(m => m.id === mesh_ref.reference);
        if (mesh) {
          obj.addMesh(mesh.id, mesh.name, mesh.scale, mesh.center, mesh.vertices, mesh.uvs, mesh.polygons, mesh.polygon_indices, mesh.materials_list, s3d.wlds[0].materials);
          for (let pi of mesh.polygon_indices) {
            let material = s3d.wlds[0].materials.find((v) => {
              return v.id === mesh.materials_list[pi.index];
            });
            if (material) mtl.addMaterial(material.name, material.textures[0], material.masked, material.transparent);
          }
        }
      }
    }
    await fs.write(`./export/${folder}/${static_mesh.name}.obj`, obj.toString());
    await fs.write(`./export/materials/${static_mesh.name}.mtl`, mtl.toString());
  }
}

main();