import bpy, os, mathutils
from pathlib import Path

import_dir = "C:\\Users\\amalk\\Documents\\Projects\\EQS3DtoOBJ\\export"
export_dir = "C:\\Users\\amalk\\Documents\\Projects\\EQRemastered"

def convert_zones():
    zone_files = os.listdir(import_dir + "\\zones")
    for zone in zone_files:
        zone_path = import_dir + "\\zones\\" + zone
        zone_export_path = export_dir + "\\zones\\" + Path(zone_path).stem + ".glb"
        convert(zone_path, zone_export_path, True)

def convert_objects():
    object_files = os.listdir(import_dir + "\\objects")
    for object in object_files:
        object_path = import_dir + "\\objects\\" + object
        object_export_path = export_dir + "\\objects\\" + Path(object_path).stem + ".glb"
        convert(object_path, object_export_path)

def convert(obj_path, glb_path, zone=False):
    clear_scene()
    bpy.ops.import_scene.obj(filepath=obj_path)
    if get_vert_stat() == 0:
        return
    fix_transparency_for_godot()
    add_noclip_material()
    for object in bpy.context.scene.objects:
        set_noclip_uv_none(object.data)
    if zone:
        bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
        bpy.ops.object.join()
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.remove_doubles()
        bpy.ops.object.mode_set(mode="OBJECT")
        obj = bpy.context.view_layer.objects.active
        obj.name = "Geo-col"
    bpy.ops.export_scene.gltf(filepath=glb_path)

def clear_scene():
    for obj in bpy.data.objects:
        bpy.data.objects.remove(obj)
    for mesh in bpy.data.meshes:
        bpy.data.meshes.remove(mesh)
    for material in bpy.data.materials:
        bpy.data.materials.remove(material)
    for image in bpy.data.images:
        bpy.data.images.remove(image)

def fix_transparency_for_godot():
    for material in bpy.data.materials:
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        assert(bsdf)
        if bsdf.inputs["Alpha"].default_value == 0.0:
            for link in material.node_tree.links:
                if link.to_node == bsdf:
                    material.node_tree.links.remove(link)
            bsdf.inputs["Base Color"].default_value[3] = 0.0

def add_noclip_material():
    material = bpy.data.materials.new(name="NOCLIP")
    material.blend_method = "BLEND"
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF") 
    assert(bsdf)
    bsdf.inputs["Base Color"].default_value[3] = 0.0
    bsdf.inputs["Alpha"].default_value = 0.0

def get_vert_stat():
    return int(bpy.context.scene.statistics(bpy.context.view_layer).split(' | ')[2].split(":")[1].replace(",", ""))

def set_noclip_uv_none(me):
    uv_layer = me.uv_layers.active.data
    for face in me.polygons:
        area = mathutils.geometry.area_tri(uv_layer[face.loop_indices[0]].uv, uv_layer[face.loop_indices[1]].uv, uv_layer[face.loop_indices[2]].uv)
        if area == 0.0:
            if not "NOCLIP" in me.materials:
                me.materials.append(bpy.data.materials["NOCLIP"])
            face.material_index = me.materials.keys().index("NOCLIP")

#convert_zones()
convert_objects()