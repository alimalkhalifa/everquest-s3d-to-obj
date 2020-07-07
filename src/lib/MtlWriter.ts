class MtlWriter {
  private materials: Material[] = [];

  public addMaterial(name: string, texture: string, masked: boolean, transparent: boolean): void {
    let material = new Material();
    material.name = name;
    material.diffuseTexture = texture
    material.dissolve = transparent && !masked ? 0.0 : 1.0;
    material.illuminationMode = transparent ? 9 : 1;
    this.materials.push(material);
  }

  public toString(): string {
    let output: string[] = [];

    for (let m of this.materials) {
      output.push(`newmtl ${m.name}`);
      output.push(`Ka ${m.ambientColor[0]} ${m.ambientColor[1]} ${m.ambientColor[2]}`);
      output.push(`Kd ${m.diffuseColor[0]} ${m.diffuseColor[1]} ${m.diffuseColor[2]}`);
      //output.push(`Ks ${m.specularColor[0]} ${m.specularColor[1]} ${m.specularColor[2]}`);
      //output.push(`Ns ${m.specularExponent}`);
      output.push(`d ${m.dissolve}`);
      output.push(`illum ${m.illuminationMode}`);
      if (m.diffuseTexture) output.push(`map_Kd ../textures/${m.diffuseTexture}`);
    }

    return output.join('\n');
  }

}

class Material {
  public name: string;
  public ambientColor: number[] = [1.0, 1.0, 1.0];
  public diffuseColor: number[] = [1.0, 1.0, 1.0];
  public specularColor: number[] = [1.0, 1.0, 1.0];
  public specularExponent: number = 0.0;
  public ambientTexture: string;
  public diffuseTexture: string;
  public dissolve: number = 1.0;
  public illuminationMode: number = 0;
}

export default MtlWriter;