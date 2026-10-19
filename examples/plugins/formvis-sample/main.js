// Sample plugin for formvis (API version 1). Copy this folder into the engine's data folder, under plugins/,
// then turn it on in Window > Manage Plugins. Each part needs its permission in plugin.json.

export function activate(formvis) {
  const { filters, panels, tools, sources, events, storage, ui, commands, documents } = formvis;

  // Filter with a CPU path: Tint adds a colour to every pixel's red channel.
  filters.register({
    id: 'tint',
    label: 'Sample Tint',
    params: [{ id: 'amount', label: 'Amount', type: 'number', min: 0, max: 255, step: 1, default: 40 }],
    cpu(image, values) {
      const d = image.data;
      for (let i = 0; i < d.length; i += 4) d[i] = Math.min(255, d[i] + values.amount);
      return image;
    },
  });

  // Filter with a WebGL2 path: Invert Mix blends a pixel with its inverse.
  filters.register({
    id: 'invert-mix',
    label: 'Sample Invert Mix',
    params: [{ id: 'mix', label: 'Mix', type: 'number', min: 0, max: 1, step: 0.05, default: 1 }],
    glsl: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform float u_mix;
out vec4 outColor;
void main() {
  vec4 c = texture(u_src, v_uv);
  outColor = vec4(mix(c.rgb, 1.0 - c.rgb, u_mix), c.a);
}`,
    cpu(image, values) {
      const d = image.data;
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = d[i + k] + (255 - 2 * d[i + k]) * values.mix;
      return image;
    },
  });

  // Side panel: shows the active document and counts how often it has been opened (kept in storage).
  panels.register({
    id: 'info',
    label: 'Sample',
    render(container) {
      const line = document.createElement('p');
      line.className = 'cv-note';
      container.appendChild(line);
      const show = () => {
        const doc = documents.active();
        line.textContent = doc ? `${doc.name}: ${doc.width} by ${doc.height}, ${doc.layers().length} layers. Edits seen: ${storage.get('edits', 0)}.` : 'No document is open.';
      };
      show();
      events.on('doc', show);
      events.on('active', show);
    },
  });

  // Canvas tool: a click reports the document point.
  tools.register({
    id: 'probe',
    label: 'Sample Probe',
    hint: 'Click the picture to read a point.',
    down(p) { ui.toast(`Point ${Math.round(p.x)}, ${Math.round(p.y)}`); },
  });

  // Generate box source: fills each New box with a flat colour that depends on its words.
  sources.register({
    id: 'flat',
    label: 'Flat colour',
    generate({ box }) {
      const data = new Uint8ClampedArray(box.w * box.h * 4);
      const r = (box.text.length * 37) % 256;
      for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = 160; data[i + 2] = 220; data[i + 3] = 255; }
      return { width: box.w, height: box.h, data };
    },
  });

  // Events and storage: count the edits seen.
  events.on('history', () => storage.set('edits', storage.get('edits', 0) + 1));

  // Command with a dialog: a form, then a new layer made through the pixel API.
  commands.register({
    id: 'swatch',
    label: 'Sample: New Swatch Layer',
    async run() {
      const doc = documents.active();
      if (!doc) return;
      const v = await ui.form('Swatch', [
        { id: 'size', label: 'Size', type: 'number', min: 8, max: 256, step: 1, default: 64 },
        { id: 'name', label: 'Name', type: 'text', default: 'Swatch' },
      ]);
      if (!v) return;
      const n = Math.min(v.size, doc.width, doc.height);
      const data = new Uint8ClampedArray(n * n * 4).fill(255);
      doc.newLayer({ width: n, height: n, data }, { name: v.name, x: 0, y: 0 });
    },
  });
}

export function deactivate() {}
