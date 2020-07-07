import * as fs from 'fs';

export default class {
  public static ls(path: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => fs.readdir(path, (err, files) => {
      if (err) reject(err);
      resolve(files);
    }));
  }

  public static write(path: string, data: string): Promise<void> {
    return new Promise<void>((resolve, reject) => fs.writeFile(path, data, 'utf8', (err) => {
      if (err) reject(err);
      resolve();
    }));
  }

  public static writeBinary(path: string, data: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => fs.writeFile(path, data, (err) => {
      if (err) reject(err);
      resolve();
    }));
  }

  public static createDirIfNotExist(path: string): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      fs.stat(path, (err, stats) => {
        if (stats?.isFile()) reject(`Expected directory, got file at ${path}`);
        if (stats?.isDirectory()) {
          resolve();
        }
        fs.mkdir(path, (err) => {
          if (err) reject(err);
          resolve();
        });
      });
    });
  }
}