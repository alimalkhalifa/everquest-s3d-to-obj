import { Vector3Interface, PolygonInterface, PolygonIndexInterface, MaterialInterface, Vector2Interface } from "./GraphicsInterfaces";

class ObjWriter {
  private objects: Obj[] = [];
  private v_accumulator: number = 0;
  
  public mtlLibs: string[] = [];

  public addMesh(id: number, name: string, scale: number, center: Vector3Interface, verticies: Vector3Interface[], uvs: Vector2Interface[], polygons: PolygonInterface[], polygon_indices: PolygonIndexInterface[], materials_list: number[], materials: MaterialInterface[]): void {
    let obj = new Obj();

    obj.name = name;
    for (let i = 0; i <  verticies.length; i++) {
      let v = verticies[i];
      let uv = uvs[i];
      obj.verticies.push(`v ${v.x * scale + center.x} ${v.z * scale + center.z} ${-v.y * scale - center.y}`);
      obj.uvs.push(`vt ${uv?.x || 0} ${uv?.y || 0}`)
    }
    let p_accumulator = 0;
    for (let pi = 0; pi < polygon_indices.length; pi++) {
      let group = new Group();
      group.name = `PI_${pi}`;
      group.mtl = materials.find((v) => {
        return v.id === materials_list[polygon_indices[pi].index];
      })?.name;
      for (let p = p_accumulator; p < p_accumulator + polygon_indices[pi].count; p++) {
        group.faces.push(`f ${polygons[p].vertex1+this.v_accumulator+1}/${polygons[p].vertex1+this.v_accumulator+1} ${polygons[p].vertex3+this.v_accumulator+1}/${polygons[p].vertex3+this.v_accumulator+1} ${polygons[p].vertex2+this.v_accumulator+1}/${polygons[p].vertex2+this.v_accumulator+1}`);
      }
      p_accumulator += polygon_indices[pi].count;
      obj.groups.push(group);
    }

    this.objects.push(obj);
    this.v_accumulator += obj.verticies.length;
  }

  public toString(): string {
    let output: string[] = [];

    for (const m of this.mtlLibs) {
      output.push(`mtllib ${m}`);
    }

    for (const o of this.objects) {
      output.push(`o ${o.name}`);
      output.push(...o.verticies);
      output.push(...o.uvs);
      for (const g of o.groups) {
        output.push(`g ${g.name}`);
        if (g.mtl) output.push(`usemtl ${g.mtl}`);
        output.push(...g.faces);
      }
    }
    
    return output.join('\n');
  }
}

class Group  {
  public name: string;
  public faces: string[] = [];
  public mtl: string;
}

class Obj {
  public name: string;
  public groups: Group[] = [];
  public verticies: string[] = [];
  public uvs: string[] = [];
}

function uint32torgb(uint: number): number[] {
  let buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(uint);
  let r = buffer.readUInt8(0) / 256.0;
  let g = buffer.readUInt8(1) / 256.0;
  let b = buffer.readUInt8(2) / 256.0;
  return [r, g, b];
}

export default ObjWriter;