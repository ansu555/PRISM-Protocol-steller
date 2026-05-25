import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  (window as any).Buffer = (window as any).Buffer || Buffer;

  const patch = (proto: any, name: string, fn: Function) => {
    if (!proto[name]) {
      Object.defineProperty(proto, name, {
        value: fn,
        writable: true,
        configurable: true
      });
    }
  };

  patch(Buffer.prototype, 'writeBigUInt64LE', function(this: Buffer, value: bigint, offset: number = 0) {
    const view = new DataView(this.buffer, this.byteOffset + offset, 8);
    view.setBigUint64(0, value, true);
    return offset + 8;
  });

  patch(Buffer.prototype, 'readBigUInt64LE', function(this: Buffer, offset: number = 0) {
    const view = new DataView(this.buffer, this.byteOffset + offset, 8);
    return view.getBigUint64(0, true);
  });
}
