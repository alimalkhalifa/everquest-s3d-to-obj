export default class BufferWriter {
  constructor(buffer: Buffer = null) {
    this.buffer = buffer;
    this.cursor = 0;
  }

  public writeInt8(value: number): void {
    this.buffer.writeInt8(value, this.cursor);
    this.cursor += 1;
  }

  public writeUInt8(value: number): void {
    this.buffer.writeUInt8(value, this.cursor);
    this.cursor += 1;
  }

  public writeInt16(value: number): void {
    this.buffer.writeInt16LE(value, this.cursor);
    this.cursor += 2;
  }

  public writeUInt16(value: number): void {
    this.buffer.writeUInt16LE(value, this.cursor);
    this.cursor += 2;
  }

  public writeInt32(value: number): void {
    this.buffer.writeInt32LE(value, this.cursor);
    this.cursor += 4;
  }

  public writeUInt32(value: number): void {
    this.buffer.writeUInt32LE(value, this.cursor);
    this.cursor += 4;
  }

  public writeFloat(value: number): void {
    this.buffer.writeFloatLE(value, this.cursor);
    this.cursor += 4;
  }

  public write(buffer: Buffer): void {
    buffer.copy(this.buffer, this.cursor);
    this.cursor += buffer.length;
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
