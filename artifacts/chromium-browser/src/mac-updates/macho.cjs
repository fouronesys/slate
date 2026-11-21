"use strict";
const fs = require("node:fs/promises");
// Parse signed Mach-O headers directly: /usr/bin/lipo can be an Xcode/CLT shim.
async function architectures(file) {
  const handle = await fs.open(file, "r");
  try {
    const size = (await handle.stat()).size;
    async function read(offset, length) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > size) throw new Error("Cabecera Mach-O incompleta.");
      const data = Buffer.alloc(length);
      if ((await handle.read(data, 0, length, offset)).bytesRead !== length) throw new Error("Cabecera Mach-O incompleta.");
      return data;
    }
    const cpuName = cpu => ({ [0x01000007]: "x86_64", [0x0100000c]: "arm64" })[cpu];
    function thinCPU(data) {
      const magic = data.readUInt32BE(0);
      if (magic === 0xcffaedfe) return data.readUInt32LE(4);
      if (magic === 0xfeedfacf) return data.readUInt32BE(4);
      throw new Error("Se requiere un ejecutable Mach-O de 64 bits.");
    }
    const header = await read(0, 8), magic = header.readUInt32BE(0);
    if (![0xcafebabe, 0xcafebabf, 0xbebafeca, 0xbfbafeca].includes(magic)) {
      const name = cpuName(thinCPU(header));
      if (!name) throw new Error("Arquitectura Mach-O no admitida.");
      return [name];
    }
    const little = [0xbebafeca, 0xbfbafeca].includes(magic);
    const fat64 = [0xcafebabf, 0xbfbafeca].includes(magic);
    const u32 = (data, offset) => little ? data.readUInt32LE(offset) : data.readUInt32BE(offset);
    const count = u32(header, 4), stride = fat64 ? 32 : 20;
    if (count < 1 || count > 32) throw new Error("Tabla de arquitecturas no válida.");
    const table = await read(8, count * stride), names = [];
    for (let i = 0; i < count; i++) {
      const at = i * stride, cpu = u32(table, at);
      const offset = fat64 ? Number(little ? table.readBigUInt64LE(at + 8) : table.readBigUInt64BE(at + 8)) : u32(table, at + 8);
      const bytes = fat64 ? Number(little ? table.readBigUInt64LE(at + 16) : table.readBigUInt64BE(at + 16)) : u32(table, at + 12);
      if (!Number.isSafeInteger(bytes) || bytes < 8 || offset < 8 + count * stride || offset + bytes > size ||
          thinCPU(await read(offset, 8)) !== cpu || !cpuName(cpu)) throw new Error("Slice Mach-O no válido.");
      names.push(cpuName(cpu));
    }
    return [...new Set(names)];
  } finally { await handle.close(); }
}
module.exports = { architectures };
