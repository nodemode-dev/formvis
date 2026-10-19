"""The bundled plugins' MCP tools: EU AI label, Film pack and 3D object (GLB) layers. mcp.py adds them to its catalogue;
the window runs them (frontend/src/automation/pack-tools.ts), and glb_place and glb_info with a path are read here."""


def _tool(name: str, description: str, props: dict, required: list[str] | None = None, **hints: bool) -> dict:
    return {"name": name, "description": description, "inputSchema": {"type": "object", "properties": props, "required": required or [], "additionalProperties": False},
            "annotations": {"readOnlyHint": hints.get("read", False), "destructiveHint": hints.get("destructive", False), "idempotentHint": hints.get("idempotent", False), "openWorldHint": False}}


_ID = {"type": "string", "description": "A layer id from get_document."}
_POSE = {
    "turn": {"type": "number", "minimum": -180, "maximum": 180, "description": "Turn about the vertical axis, degrees (default 30)."},
    "tilt": {"type": "number", "minimum": -80, "maximum": 80, "description": "Tilt toward the camera, degrees (default 15)."},
    "roll": {"type": "number", "minimum": -180, "maximum": 180, "description": "Roll about the viewing axis, degrees (default 0)."},
    "size": {"type": "number", "minimum": 20, "maximum": 300, "description": "Size in percent of the frame (default 100)."},
    "x": {"type": "number", "minimum": -100, "maximum": 100, "description": "Position across the frame, percent of half its width (default 0, right is positive)."},
    "y": {"type": "number", "minimum": -100, "maximum": 100, "description": "Position up the frame, percent of half its height (default 0, up is positive)."},
    "z": {"type": "number", "minimum": -100, "maximum": 100, "description": "Depth: toward the camera is positive (default 0); with a wide fov it changes the perspective."},
    "fov": {"type": "number", "minimum": 10, "maximum": 90, "description": "Camera field of view in degrees, the focal length: small is telephoto (default 30)."},
    "light_direction": {"type": "number", "minimum": -180, "maximum": 180, "description": "Direction of the sun light, degrees (default 40)."},
    "light_height": {"type": "number", "minimum": 0, "maximum": 90, "description": "Height of the sun light above the horizon, degrees (default 45)."},
    "light_strength": {"type": "number", "minimum": 0, "maximum": 400, "description": "Sun light strength, percent (default 150)."},
    "light_color": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "description": "Sun light colour #rrggbb (default white)."},
    "ambient": {"type": "number", "minimum": 0, "maximum": 200, "description": "Ambient light, percent (default 40)."},
    "room_light": {"type": "number", "minimum": 0, "maximum": 200, "description": "Soft room light from above and below, percent (default 0)."},
    "shadow": {"type": "number", "minimum": 0, "maximum": 100, "description": "Strength of the ground contact shadow under the model, percent (default 0: none)."},
    "depth": {"type": "boolean", "default": False, "description": "Also draw a Depth Map layer (near bright, far dark) of the same pose, for depth-guided generation."},
}

PACK_TOOLS = [
    _tool("ailabel_add", "Marks the document as AI content, as the EU AI label does: every PNG, JPEG, WebP and TIFF export then carries the IPTC digital source type in its XMP (trainedAlgorithmicMedia for kind generated, compositeWithTrainedAlgorithmicMedia for kind edited), and by default a visible badge layer named EU AI label is added (anchor, style, size as percent of the shorter side, opacity; text replaces the words). Calling it again replaces the badge. One undoable step. Returns the badge layer id.",
          {"kind": {"type": "string", "enum": ["generated", "edited"], "default": "generated", "description": "generated: made with AI. edited: a real picture edited with AI."},
           "badge": {"type": "boolean", "default": True, "description": "Add the visible badge layer; false writes the metadata mark only."},
           "anchor": {"type": "string", "enum": ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"], "default": "bottom-right"},
           "style": {"type": "string", "enum": ["dark", "light", "outline"], "default": "dark"},
           "size": {"type": "number", "minimum": 2, "maximum": 30, "default": 6, "description": "Badge height, percent of the shorter side of the document."},
           "opacity": {"type": "number", "minimum": 0.05, "maximum": 1, "default": 1}, "text": {"type": "string", "maxLength": 40, "description": "The badge's words; the default follows kind."}}),
    _tool("ailabel_remove", "Removes the document's AI label: the metadata mark and every badge layer named EU AI label. One undoable step.", {}, destructive=True, idempotent=True),
    _tool("ailabel_info", "Whether the document is marked as AI content: the label (generated, edited or none), the IPTC digital source type it writes, the badge layers and the export formats that carry it.", {}, read=True, idempotent=True),
    _tool("film_looks", "Lists the film looks (id, name, kind negative|slide|bw|cine, ISO, curve points) and the film layers in the document with their look, strength and curve points. A look is a tone curve with editable points, a colour matrix and grain that grows with its speed.", {}, read=True, idempotent=True),
    _tool("film_apply_look", "Adds a film layer (an adjustment layer named Film: ...) with a film look from film_looks, or with id changes an existing one. strength 0 to 100 mixes the look with the picture (default 100), grain 0 to 100 (default 40; the look's speed scales it), grain_size in pixels (1 to 8). Changing the look of a layer resets its custom curve points. Returns the layer id.",
          {"look": {"type": "string", "description": "A film look id from film_looks."}, "id": {"type": "string", "description": "An existing film layer to change; leave out to add a new one."},
           "strength": {"type": "number", "minimum": 0, "maximum": 100}, "grain": {"type": "number", "minimum": 0, "maximum": 100}, "grain_size": {"type": "number", "minimum": 1, "maximum": 8}}),
    _tool("film_add_point", "Adds a point to a film layer's tone curve, or moves the point already at that x: x is the input tone and y the curve's output, both 0 to 255 (a layer starts from its look's points; at most 16 points).",
          {"id": _ID, "x": {"type": "integer", "minimum": 0, "maximum": 255}, "y": {"type": "integer", "minimum": 0, "maximum": 255}}, ["id", "x", "y"]),
    _tool("film_copy_points", "Copies a film layer's curve points into the clipboard (for film_paste_points). Changes nothing in the document.", {"id": _ID}, ["id"], read=True, idempotent=True),
    _tool("film_paste_points", "Puts the copied curve points on a film layer: mode replace (default) makes them its curve, merge adds them to the points it has (a point at the same x is overwritten).",
          {"id": _ID, "mode": {"type": "string", "enum": ["replace", "merge"], "default": "replace"}}, ["id"]),
    _tool("glb_place", "Places a 3D model (.glb, or a .gltf with no outside files) as a new layer the size of the document, posed and lit by turn, tilt, roll, size, x, y, z, fov, sun light, ambient, room light and a ground contact shadow; with depth true also a Depth Map layer. From path (absolute) or data (base64). The layer is pixels; while the window stays open glb_edit poses it again. Returns the layer id and the model's facts.",
          {"path": {"type": "string", "description": "Absolute path to a .glb or .gltf file."}, "data": {"type": "string", "description": "Base64 .glb data, when there is no file."}, "name": {"type": "string", "maxLength": 120}, **_POSE}),
    _tool("glb_edit", "Poses a 3D layer from glb_place again (give only what changes; the rest stays as it was) and redraws its pixels as one undoable step; depth true adds or refreshes its Depth Map layer. Works for layers placed since the window opened.",
          {"id": _ID, **_POSE}, ["id"], idempotent=True),
    _tool("glb_info", "Facts about a 3D model: meshes, triangles, vertices, materials, textures, animations, nodes, size in its own units, generator and glTF extensions. Give path (an absolute .glb or .gltf file) or id of a 3D layer, which also returns its current pose.",
          {"path": {"type": "string", "description": "Absolute path to a .glb or .gltf file."}, "id": {"type": "string", "description": "A 3D layer id from glb_place."}}, read=True, idempotent=True),
]

PACK_USE_WHEN = {
    "ailabel_add": "a picture was made or edited with AI and should be marked so, in its metadata and on the picture.",
    "ailabel_remove": "the AI label was added by mistake or the picture is no longer AI content.",
    "ailabel_info": "you need to know whether the document is marked as AI content before exporting.",
    "film_looks": "the person wants a film look and you need the ids, or want to see the film layers already there.",
    "film_apply_look": "the picture should look shot on a film stock, with its tone curve, colour and grain.",
    "film_add_point": "a film layer's tone curve needs one more point to shape the highlights, shadows or midtones.",
    "film_copy_points": "a film layer's curve should be reused on another layer.",
    "film_paste_points": "curve points copied from another film layer should be put on this one.",
    "glb_place": "a 3D model file should appear in the picture as a lit, posed layer.",
    "glb_edit": "a placed 3D model needs another pose, size, position, field of view or light.",
    "glb_info": "you need the size, triangles or materials of a 3D model before placing it.",
}
