export default class BufferReader {
  constructor(buffer: Buffer = null) {
    this.buffer = buffer;
    this.cursor = 0;
  }

  public readInt8(): number {
    const data = this.buffer.readInt8(this.cursor);
    this.cursor += 1;
    return data;
  }

  public readUInt8(): number {
    const data = this.buffer.readUInt8(this.cursor);
    this.cursor += 1;
    return data;
  }

  public readInt16(): number {
    const data = this.buffer.readInt16LE(this.cursor);
    this.cursor += 2;
    return data;
  }

  public readUInt16(): number {
    const data = this.buffer.readUInt16LE(this.cursor);
    this.cursor += 2;
    return data;
  }

  public readInt32(): number {
    const data = this.buffer.readInt32LE(this.cursor);
    this.cursor += 4;
    return data;
  }

  public readUInt32(): number {
    const data = this.buffer.readUInt32LE(this.cursor);
    this.cursor += 4;
    return data;
  }

  public readFloat(): number {
    const data = this.buffer.readFloatLE(this.cursor);
    this.cursor += 4;
    return data;
  }

  public read(length: number): Buffer {
    const data = this.buffer.slice(this.cursor, this.cursor + length);
    this.cursor += length;
    return data;
  }

  public seek(position: number): void {
    this.cursor = position;
  }

  public skip(bytes: number): void {
    this.cursor += bytes;
  }

  public getCursorPosition(): number {
    return this.cursor;
  }

  public getBuffer(): Buffer {
    return this.buffer;
  }

  public setBuffer(buffer: Buffer): void {
    this.buffer = buffer;
    this.reset();
  }

  public reset(): void {
    this.cursor = 0;
  }

  private buffer: Buffer;

  private cursor: number;
}
