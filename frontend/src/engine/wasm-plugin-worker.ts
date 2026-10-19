/// <reference lib="webworker" />
import { wasmCheckBytes, wasmCheckModule, WASM_ABI, WASM_ABI_V2, WASM_ENTRY, type WasmJob, type WasmReply } from './wasm-plugin';
import { FORMAT_BYTES, WASM_FORMATS, WASM_DESC_WORDS } from './wasm-abi2';

/** One plug-in run in its own Worker: the page terminates the Worker when the time limit passes or the person cancels.
 *  The module gets env.progress and nothing else, so it has no network, no files and no page. */
const send = (r: WasmReply, transfer: Transferable[] = []): void => { (self as unknown as Worker).postMessage(r, transfer); };

onmessage = (e: MessageEvent<WasmJob>) => {
  const job = e.data;
  try {
    const bytes = new Uint8Array(job.bytes);
    wasmCheckBytes(bytes, job.memoryMb);
    const mod = new WebAssembly.Module(bytes);
    wasmCheckModule(mod);
    const inst = new WebAssembly.Instance(mod, { env: { progress: (p: number) => send({ kind: 'progress', percent: Math.max(0, Math.min(100, Math.round(p))) }) } });
    const x = inst.exports as Record<string, unknown>, memory = x.memory as WebAssembly.Memory;
    const call = (name: string, ...a: number[]): number => Number((x[name] as (...v: number[]) => number)(...a));
    const abi = call('abi_version'), want = job.kind === 'run2' ? WASM_ABI_V2 : WASM_ABI;
    if (abi !== WASM_ABI && abi !== WASM_ABI_V2) throw new Error(`The module speaks ABI ${abi}; this formvis speaks ABI ${WASM_ABI} and ${WASM_ABI_V2}.`);
    if (job.kind !== 'inspect' && abi !== want) throw new Error(`The module speaks ABI ${abi} but its schema asks for ABI ${want}.`);
    if (job.kind !== 'inspect' && typeof x[WASM_ENTRY[want]] !== 'function') throw new Error(`The module does not export ${WASM_ENTRY[want]}.`);
    const cap = job.memoryMb * 1024 * 1024;
    if (job.kind === 'inspect') {
      if (typeof x.schema_ptr !== 'function' || typeof x.schema_len !== 'function') { send({ kind: 'schema', text: null }); return; }
      const at = call('schema_ptr'), len = call('schema_len');
      if (len < 2 || len > 65536 || at + len > memory.buffer.byteLength) throw new Error('The module\'s schema is missing or too long (limit 64 KB).');
      send({ kind: 'schema', text: new TextDecoder().decode(new Uint8Array(memory.buffer, at, len)) });
      return;
    }
    if (job.kind === 'run2') {
      const size = job.samples.byteLength, bpc = FORMAT_BYTES[WASM_FORMATS[job.desc[1]]], need = size + job.params.length * 4 + WASM_DESC_WORDS * 4 + memory.buffer.byteLength;
      if (!bpc) throw new Error('The host sent a sample format this worker does not know.');
      if (need > cap) throw new Error(`This layer needs about ${Math.ceil(need / 1048576)} MB for the plug-in; its memory limit is ${job.memoryMb} MB.`);
      const sp = call('alloc', size), pp2 = call('alloc', Math.max(4, job.params.length * 4)), dp = call('alloc', WASM_DESC_WORDS * 4);
      const fits = (at: number, n: number, align: number): boolean => at > 0 && at % align === 0 && at + n <= memory.buffer.byteLength;
      if (!fits(sp, size, bpc) || !fits(pp2, job.params.length * 4, 4) || !fits(dp, WASM_DESC_WORDS * 4, 4)) throw new Error('The plug-in could not get aligned memory for the layer.');
      new Uint8Array(memory.buffer, sp, size).set(new Uint8Array(job.samples));
      const dv = new DataView(memory.buffer);
      job.params.forEach((v, i) => dv.setFloat32(pp2 + i * 4, v, true));
      job.desc.forEach((v, i) => dv.setUint32(dp + i * 4, v, true));
      const rc = call('filter2', sp, job.width, job.height, pp2, dp);
      if (rc !== 0) throw new Error(`The plug-in stopped with error code ${rc}.`);
      if (memory.buffer.byteLength > cap) throw new Error('The plug-in used more memory than its limit.');
      const res = memory.buffer.slice(sp, sp + size);
      send({ kind: 'done', pixels: res }, [res]);
      return;
    }
    const size = job.width * job.height * 4, need = size + job.params.length * 4 + memory.buffer.byteLength;
    if (need > cap) throw new Error(`This layer needs about ${Math.ceil(need / 1048576)} MB for the plug-in; its memory limit is ${job.memoryMb} MB.`);
    const ptr = call('alloc', size), pp = call('alloc', Math.max(4, job.params.length * 4));
    if (!ptr || !pp || ptr + size > memory.buffer.byteLength || pp + job.params.length * 4 > memory.buffer.byteLength) throw new Error('The plug-in could not get memory for the layer.');
    new Uint8Array(memory.buffer, ptr, size).set(new Uint8Array(job.pixels));
    const view = new DataView(memory.buffer);
    job.params.forEach((v, i) => view.setFloat32(pp + i * 4, v, true));
    const code = call('filter', ptr, job.width, job.height, pp);
    if (code !== 0) throw new Error(`The plug-in stopped with error code ${code}.`);
    if (memory.buffer.byteLength > cap) throw new Error('The plug-in used more memory than its limit.');
    const out = memory.buffer.slice(ptr, ptr + size);
    send({ kind: 'done', pixels: out }, [out]);
  } catch (err) {
    send({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
