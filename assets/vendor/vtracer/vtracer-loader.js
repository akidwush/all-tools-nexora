/* Nexora VTracer HF11.1 — explicit wasm-bindgen loader */
let readyPromise = null;

export function initVTracer() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const bg = await import('./vtracer_webapp_bg.js?v=hf11.1');
    if (!bg || typeof bg.__wbg_set_wasm !== 'function') {
      throw new Error('vtracer_webapp_bg.js tidak kompatibel.');
    }

    const wasmUrl = new URL('./vtracer_webapp_bg.wasm?v=hf11.1', import.meta.url);
    const imports = { './vtracer_webapp_bg.js': bg };

    let instantiated;
    const response = await fetch(wasmUrl, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`WASM HTTP ${response.status}`);
    }

    if (WebAssembly.instantiateStreaming) {
      try {
        instantiated = await WebAssembly.instantiateStreaming(response.clone(), imports);
      } catch (_) {
        const bytes = await response.arrayBuffer();
        instantiated = await WebAssembly.instantiate(bytes, imports);
      }
    } else {
      const bytes = await response.arrayBuffer();
      instantiated = await WebAssembly.instantiate(bytes, imports);
    }

    const instance = instantiated.instance || instantiated;
    bg.__wbg_set_wasm(instance.exports);

    if (typeof instance.exports.__wbindgen_start === 'function') {
      instance.exports.__wbindgen_start();
    }

    if (
      typeof bg.ColorImageConverter !== 'function' ||
      typeof bg.BinaryImageConverter !== 'function'
    ) {
      throw new Error('Converter VTracer tidak tersedia setelah init WASM.');
    }

    return bg;
  })().catch((error) => {
    readyPromise = null;
    throw error;
  });

  return readyPromise;
}
