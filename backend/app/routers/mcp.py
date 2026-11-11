"""An MCP server (1.52.1, the capability plan): outside agents (Claude Code, Claude Desktop, any MCP client) drive the open
formvis window. Streamable HTTP in stateless JSON mode at /mcp, following the 2026-07-28 specification (no initialize
handshake, no session; server/discover; the version on every request) and still answering initialize for clients of
2025-11-25. The Origin header is checked (only this computer), as the specification requires. The work happens in the
window, which collects requests from /api/mcp/bridge only while Allow outside agents is on in Preferences > Plugins;
anything that costs money asks the user there first. The Claude Code the window's own terminal dock starts sends the
per-run x-formvis-inapp header (agents.INAPP_TOKEN): it is never asked the Allow question and is served with outside
agents off. The terminal and Claude Code commands (WINDOW_ONLY) are refused to every agent."""

import asyncio
import collections
import contextvars
import itertools
import base64
import json
from pathlib import Path
import os
import time
import urllib.parse

from app.core import config
from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse

from app import __version__
from app.services import agents, fal_run
from app.routers.mcp_pack import PACK_TOOLS, PACK_USE_WHEN
from app.routers.terminal import server_port

router = APIRouter()
VERSIONS = ["2026-07-28", "2025-11-25"]
INSTRUCTIONS = ("formvis is a layered image editor running on this computer; these tools edit what is open in its window. "
                "Start with get_document (the layers and their ids) and get_image (to see the picture); check your work with get_image "
                "after each change. Every change is one undoable step (undo). Select before generative_fill or fill. Filters need pixels: "
                "rasterize_layer a text or shape layer first. Generative tools run on this computer first (LaMa, Krea 2, Real-ESRGAN) "
                "and on fal last, which asks the person. open_file, save_project and export_image take absolute paths. "
                "When no typed tool fits, list_commands finds a formvis command and run_command runs it (run_commands for a batch that undoes as one). "
                "For the decision tree, get the edit_strategy prompt.")

# The strategy prompt (1.53.3): the decision tree for these tools, for a client to show or an agent to fetch.
STRATEGY = """How to edit a picture in formvis with these tools.

1. Look first. get_document gives the size, the layers bottom to top with their ids and kinds, and the open documents. get_image shows the picture; call it again after each change to check the result before going on.
2. Work on the right thing. Most tools act on the active layer: set_layer with active true chooses it. A new element goes on its own layer (add_layer, add_text, draw_shape, generate_image, place_image), so it can be moved or removed later.
3. Remove something from a photo: select it (select_subject for the main subject; select_by_text for a thing named in words; select with a rectangle or ellipse around it; select_color_range for a colour), then generative_fill with no prompt. On this computer LaMa fills from the surroundings.
4. Add something to a photo: select where it goes, then generative_fill with a prompt describing it. model auto uses Krea 2 here when installed, else fal (the person is asked first).
5. Text and titles: add_text with size, colour and font; transform_layer to place it; draw_shape for a plate behind it (move_layer to put the plate below the text).
6. Colour and looks: add_adjustment (curves, levels, hsv, exposure, splitToning, halation, glow and more) keeps the picture editable; set_adjustment changes it later. color_match fits a pasted element to its background. add_film_layer adds a light leak or a frame. apply_filter blurs, sharpens or adds noise, on pixels only (rasterize_layer first for text and shapes).
7. Cut-outs: remove_background keeps the subject of the active layer as a mask; select_subject then fill or generative_fill works on the selection instead.
8. Size for a destination: resize_image scales the whole picture (keep the proportions); resize_canvas adds or removes space; crop keeps a rectangle; generative_expand grows the canvas and paints the new border; upscale enlarges 2 or 4 times into a new document.
9. Keep and deliver: save_project writes a .fvd that keeps every layer editable; export_image writes a PNG, JPEG or WebP of how it looks. Both take absolute paths; the folder must exist, and a file already there is kept unless overwrite is true.
10. Mistakes: undo steps back one change at a time. If a tool fails, its message says what to do next: follow it and retry.
"""
PROMPTS = [{"name": "edit_strategy", "title": "How to edit in formvis", "description": "The decision tree for formvis's tools: looking, choosing layers, removing and adding, text, colour, cut-outs, sizes, saving and exporting.", "arguments": []}]


def _tool(name: str, description: str, props: dict, required: list[str] | None = None, **hints: bool) -> dict:
    return {"name": name, "description": description, "inputSchema": {"type": "object", "properties": props, "required": required or [], "additionalProperties": False},
            "annotations": {"readOnlyHint": hints.get("read", False), "destructiveHint": hints.get("destructive", False), "idempotentHint": hints.get("idempotent", False), "openWorldHint": hints.get("open", False)}}


CONTROL_METHODS = {"ui.inspect": "ui_inspect", "ui.state": "ui_state", "ui.screenshot": "ui_screenshot", "ui.menu.list": "ui_menu_list", "ui.menu.invoke": "ui_menu_invoke", "ui.set": "ui_set", "ui.dialog": "ui_dialog",
                   "ui.pointer": "ui_pointer", "ui.key": "ui_key", "window": "ui_window", "app.open": "open_file", "app.save": "save_project", "app.export": "export_image", "app.roots": "file_roots"}
_ID = {"type": "string", "description": "A layer id from get_document."}


def _fal_ids(role: str) -> list[str]:
    return [m["id"] for m in fal_run.models() if m.get("role") == role]


_FAL_ROLES = sorted({m["role"] for m in fal_run.models()})
_FAL_MORE = {"seed": {"type": "integer", "minimum": 0, "maximum": 4294967295, "description": "The model's seed, for a repeatable result; only for a model that takes one (fal_models)."},
             "negative_prompt": {"type": "string", "maxLength": 2000, "description": "What to keep out of the picture; only for a model that takes one (fal_models)."},
             "options": {"type": "object", "description": "Other inputs of the chosen model by their names (fal_models lists them), for example {guidance_scale: 4}. The engine checks each against the model's own schema."}}
_OVERWRITE = {"type": "boolean", "default": False, "description": "Replace a file already at the path. Without it an existing file is not touched."}
TOOLS = [
    _tool("get_document", "The open document: name, size, resolution, colour mode (rgb, cmyk, grayscale...), bit depth, colour profile, the layers bottom to top (id, name, kind, visible, opacity, blend, parent group), the active layer and the selection's bounds.", {}, read=True, idempotent=True),
    _tool("get_image", "A picture of the document as it looks, its longer side at most max_size pixels (a PNG, or a JPEG with format). view document is the flattened picture; editor is the window's canvas as the person sees it, with the selection outline, guides and tool overlays; layer is one layer alone (id from get_document). x, y, width and height crop a box in document pixels, shown at 1:1 unless it is larger than max_size.",
          {"max_size": {"type": "integer", "minimum": 64, "maximum": 2048, "default": 1024}, "view": {"type": "string", "enum": ["document", "editor", "layer"], "default": "document"},
           "id": {"type": "string", "description": "A layer id from get_document; for view layer."}, "x": {"type": "integer"}, "y": {"type": "integer"}, "width": {"type": "integer", "minimum": 1}, "height": {"type": "integer", "minimum": 1},
           "format": {"type": "string", "enum": ["png", "jpeg"], "default": "png"}, "quality": {"type": "number", "minimum": 0.1, "maximum": 1, "default": 0.9}}, read=True, idempotent=True),
    _tool("new_document", "Opens a new document of width x height pixels, or of an aspect and size class (a model-friendly size, sides in steps of 16: size_class 1k is about 1024 on the longer side, 2k about 2048, 4k about 4096). Width and height win when given; with no size at all the document is 1920 by 1080. mode (rgb, grayscale, lab, cmyk) and depth (8, 16 or 32 bits a channel) set the colour mode and bit depth; background is white, transparent, black or a colour #rrggbb. cmyk converts with no dialog through profile (default: the shipped CMYK profile; else a profile id or name from the Convert to Profile list) and the intent in the colour preferences.",
          {"mode": {"type": "string", "enum": ["rgb", "grayscale", "lab", "cmyk"], "default": "rgb"}, "profile": {"type": "string", "maxLength": 120, "default": "default", "description": "For cmyk: default, or a CMYK profile id or name."}, "depth": {"type": "integer", "enum": [8, 16, 32], "default": 8}, "width": {"type": "integer", "minimum": 1, "maximum": 30000}, "height": {"type": "integer", "minimum": 1, "maximum": 30000},
           "aspect": {"type": "string", "enum": ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9", "5:4", "4:5"]}, "size_class": {"type": "string", "enum": ["1k", "2k", "4k"], "default": "1k"},
           "name": {"type": "string", "maxLength": 120}, "background": {"type": "string", "pattern": "^(white|transparent|black|#[0-9a-fA-F]{6})$", "default": "white", "description": "white, transparent, black or #rrggbb"}}),
    _tool("select","Changes the selection: a rectangle or ellipse (x, y, width, height in pixels) combined by mode, or all, none, or invert.", {"shape": {"type": "string", "enum": ["rectangle", "ellipse", "all", "none", "invert"]},
          "x": {"type": "number"}, "y": {"type": "number"}, "width": {"type": "number", "minimum": 1}, "height": {"type": "number", "minimum": 1},
          "mode": {"type": "string", "enum": ["replace", "add", "subtract", "intersect"], "default": "replace"}}, ["shape"]),
    _tool("add_layer", "Adds an empty layer above the active one and makes it active; returns its id.", {"name": {"type": "string", "maxLength": 120}}),
    _tool("set_layer", "Changes a layer's name, visibility, opacity (0 to 1), blend mode, reference flag (the generation dialogs' References list starts with flagged layers chosen) or locks (locks: pixels, position, transparency, all; true locks, false unlocks, left out stays), or makes it the active layer.", {"id": _ID, "name": {"type": "string", "maxLength": 120}, "reference": {"type": "boolean"},
          "visible": {"type": "boolean"}, "opacity": {"type": "number", "minimum": 0, "maximum": 1}, "blend": {"type": "string"}, "active": {"type": "boolean"},
          "locks": {"type": "object", "properties": {"pixels": {"type": "boolean"}, "position": {"type": "boolean"}, "transparency": {"type": "boolean"}, "all": {"type": "boolean"}}, "additionalProperties": False}}, ["id"], idempotent=True),
    _tool("delete_layer", "Deletes a layer (undoable).", {"id": _ID}, ["id"], destructive=True),
    _tool("fill", "Fills the selection (or the whole active layer when nothing is selected) with a colour.", {"color": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "description": "#rrggbb"}}, ["color"]),
    _tool("add_adjustment", "Adds an adjustment layer (for example curves, levels, hsv, exposure, splitToning, halation, glow) with optional parameters.",
          {"kind": {"type": "string"}, "params": {"type": "object", "description": "The adjustment's parameters, as its Properties show them."}}, ["kind"]),
    _tool("place_image", "Places a PNG, JPEG, WebP or SVG image as a new layer at x, y, at its own size unless scale (percent) or fit is given: fit contain or cover sizes it to the document and centres it, center centres it at its size, smart_object makes it a smart object so it can be scaled without loss. An SVG is drawn to pixels at svg_width pixels across (its own width when left out). reference true flags the layer as a reference picture: the generation dialogs' References list starts with it chosen. From path, an absolute path to a file, or data, base64.",
          {"reference": {"type": "boolean", "default": False}, "svg_width": {"type": "integer", "minimum": 1, "maximum": 30000, "description": "For an SVG: the width in pixels it is drawn at."},
           "scale": {"type": "number", "minimum": 1, "maximum": 1000, "description": "Percent of the image's own size."}, "fit": {"type": "string", "enum": ["none", "contain", "cover"], "default": "none"},
           "center": {"type": "boolean", "default": False}, "smart_object": {"type": "boolean", "default": False}, "path": {"type": "string", "description": "Absolute path to a .png, .jpg, .jpeg, .webp or .svg file; use this for files on disk."},
           "data": {"type": "string", "description": "Base64 image data, when there is no file."}, "name": {"type": "string", "maxLength": 120},
           "x": {"type": "number", "default": 0}, "y": {"type": "number", "default": 0}}),
    _tool("undo", "Steps back through the document's history.", {"steps": {"type": "integer", "minimum": 1, "maximum": 100, "default": 1}}),
    _tool("redo", "Steps forward through the document's history.", {"steps": {"type": "integer", "minimum": 1, "maximum": 100, "default": 1}}),
    # Generative, local-first (1.53.3): what runs on this computer for free first, fal last (asked, it costs money).
    _tool("generative_fill", "Fills the selection (select first) and returns the new layer, masked to the selection. With no prompt it removes what the selection covers, filling from the surroundings; with a prompt it paints that. model auto uses LaMa (no prompt) or Krea 2 (a prompt) on this computer when downloaded, else FLUX on fal, which asks the person first. Fails with what to download or set up when nothing can run.",
          {"prompt": {"type": "string", "maxLength": 2000, "default": ""}, "model": {"type": "string", "enum": ["auto", "lama", "krea-2", "fal"], "default": "auto", "description": "auto: on this computer first (LaMa with no prompt, Krea 2 with one), fal last (asks the person, costs money)."},
           "influence": {"type": "number", "minimum": 0, "maximum": 1, "default": 0.4, "description": "Krea 2 only: how much what the selection covers shapes the result."}}, open=True),
    _tool("generative_expand", "Grows the canvas by the margins (pixels) and fills the new border, continuing the picture; a prompt describes what to add there. model as generative_fill.",
          {"left": {"type": "integer", "minimum": 0, "maximum": 8000, "default": 0}, "top": {"type": "integer", "minimum": 0, "maximum": 8000, "default": 0},
           "right": {"type": "integer", "minimum": 0, "maximum": 8000, "default": 0}, "bottom": {"type": "integer", "minimum": 0, "maximum": 8000, "default": 0},
           "prompt": {"type": "string", "maxLength": 2000, "default": ""}, "model": {"type": "string", "enum": ["auto", "lama", "krea-2", "fal"], "default": "auto", "description": "auto: on this computer first (LaMa with no prompt, Krea 2 with one), fal last (asks the person, costs money)."}}, open=True),
    _tool("generate_image", "Generates a picture from a prompt as a new layer, the size of the document unless size or aspect_ratio is given (then the picture keeps that shape and is centred, fitted inside the document). model auto uses Krea 2 or FLUX.2 [klein] on this computer when installed, else FLUX1.1 [pro] on fal, which asks the person first. model can also be the id of a generate model from fal_models (always fal, asks first): only those models take seed, negative_prompt and options, and size or aspect_ratio, by whichever of image_size or aspect_ratio the model has.",
          {"prompt": {"type": "string", "maxLength": 2000}, "model": {"type": "string", "enum": ["auto", "krea-2", "flux2-klein-4b", "fal", *_fal_ids("generate")], "default": "auto"},
           "size": {"type": "object", "properties": {"width": {"type": "integer", "minimum": 64, "maximum": 8192}, "height": {"type": "integer", "minimum": 64, "maximum": 8192}}, "required": ["width", "height"], "additionalProperties": False, "description": "The picture's size in pixels; for a fal_models generate model."},
           "aspect_ratio": {"type": "string", "pattern": "^[0-9]+:[0-9]+$", "description": "For example 16:9; for a fal_models generate model (one with an aspect_ratio input takes the values it lists)."}, **_FAL_MORE}, ["prompt"], open=True),
    _tool("upscale", "Enlarges what the document shows 2 or 4 times into a new document. model auto uses Real-ESRGAN on this computer when downloaded, else Real-ESRGAN on fal (asks first). model can also be the id of an upscale model from fal_models (fal, asks first); seed, negative_prompt and options then apply as that model's inputs allow.",
          {"scale": {"type": "integer", "enum": [2, 4], "default": 2}, "model": {"type": "string", "enum": ["auto", "local", "fal", *_fal_ids("upscale")], "default": "auto"}, **_FAL_MORE}, open=True),
    _tool("fal_models", "Lists the fal models formvis may use (the owner's catalogue, no others) with their roles: " + ", ".join(_FAL_ROLES) + ". With role, only that role's models; with model, one model's inputs (key, type, default, enum, range) for the options of generate_image and upscale. Changes nothing, costs nothing, needs no window.",
          {"role": {"type": "string", "enum": _FAL_ROLES}, "model": {"type": "string", "maxLength": 120}}, read=True, idempotent=True),
    _tool("select_by_text", "Selects what a short description names, for example 'the red car' or 'all the people', by sending the document's picture and the words to SAM 3 on fal (asks the person first, costs money); the returned mask becomes the selection, combined by mode. Fails with a message when nothing matches. Follow with generative_fill, fill or any selection edit.",
          {"prompt": {"type": "string", "minLength": 1, "maxLength": 300}, "mode": {"type": "string", "enum": ["replace", "add", "subtract", "intersect"], "default": "replace"},
           "options": {"type": "object", "description": "Other SAM 3 inputs by name (fal_models with model fal-ai/sam-3/image), for example {output_format: 'png'}."}}, ["prompt"], open=True),
    _tool("remove_background", "Removes the active layer's background on this computer, keeping the subject (a mask on the layer; undoable).", {}),
    # Files, read and written by the engine at absolute paths (~ is expanded).
    _tool("open_file", "Opens a picture (PNG, JPEG, WebP, AVIF, GIF, TIFF, HEIC, QOI, TGA, ICO (its largest size), PBM, PGM, PPM, PAM, camera raw, SVG drawn to pixels at svg_width) or a project (.fvd, .fmv, .psd, .psb, .ora) from an absolute path as a new document. into replace opens a picture in place of the active document (its unsaved changes are discarded), into layer adds it as a layer of the active document (as place_image does; reference true flags it as a reference picture). The file is remembered, so save_project or export_image with no path writes the document back to it.",
          {"path": {"type": "string", "description": "Absolute path, e.g. /Users/me/Pictures/beach.jpg"}, "into": {"type": "string", "enum": ["document", "replace", "layer"], "default": "document"},
           "svg_width": {"type": "integer", "minimum": 1, "maximum": 30000, "description": "For an SVG: the width in pixels it is drawn at."}, "reference": {"type": "boolean", "default": False}}, ["path"]),
    _tool("save_project", "Saves the document as a formvis project (.fvd: layers, masks, adjustments and text stay editable) at an absolute path. With no path it writes back to the .fvd the active document was opened from with open_file (replacing it). A file already there is kept unless overwrite is true.",
          {"path": {"type": "string", "description": "Absolute path ending .fvd; left out, the file the document was opened from."}, "overwrite": _OVERWRITE}, [], destructive=True),
    _tool("export_image", "Writes the document to an absolute path by the path's extension: PNG, JPEG or WebP as it looks (scale applies), or with every layer kept as .psd, .psb (a document past 30000 pixels a side) or .ora (RGB and grayscale documents; scale does not apply). Also .tif or .tiff (flat, or with every layer kept when layers is true), .tga, .dpx and .bmp (flat, scale applies), and .exr or .hdr (linear light float, at the document's size; a 32-bit document keeps its values). With no path it writes back to the file the active document was opened from with open_file, replacing it. A file already there is kept unless overwrite is true.",
          {"path": {"type": "string", "description": "Absolute path ending .png, .jpg, .webp, .psd, .psb, .ora, .tif, .tiff, .tga, .dpx, .bmp, .exr or .hdr; left out, the file the document was opened from."}, "quality": {"type": "number", "minimum": 0.1, "maximum": 1, "default": 0.92},
           "scale": {"type": "number", "minimum": 0.05, "maximum": 4, "default": 1, "description": "Writes the picture at this factor of its size; the document is not changed."}, "overwrite": _OVERWRITE,
           "layers": {"type": "boolean", "default": False, "description": "For a TIFF: keep every layer."}, "dpi": {"type": "integer", "minimum": 1, "maximum": 9600, "default": 72, "description": "The resolution written into a TIFF, TGA, DPX or BMP."},
           "metadata": {"type": "string", "enum": ["keep", "none"], "default": "keep", "description": "none leaves out the document's AI label metadata from a PNG, JPEG or WebP."},
           "exr_compression": {"type": "string", "enum": ["zip", "piz", "none"], "default": "zip", "description": "For an .exr."}, "half": {"type": "boolean", "default": False, "description": "For an .exr: 16-bit half floats."},
           "options": {"type": "object", "description": "Format settings as the export dialog names them, for a TIFF, TGA, DPX or BMP, for example {compression: deflate}."}}, [], destructive=True),
    _tool("switch_document", "Makes an open document the one tools act on, by its id from get_document's documents.", {"id": _ID}, ["id"], idempotent=True),
    _tool("close_document", "Closes an open document by its id from get_document's documents (the active one when id is left out) without asking about unsaved changes: they are discarded, so save_project first to keep them. The person can bring the tab back with Reopen Closed Tab.",
          {"id": {"type": "string", "description": "A document id from get_document's documents."}}, destructive=True),
    _tool("ping", "Reports in one call whether formvis is there: its version, whether the window is open and connected, whether outside agents are allowed, and the open documents (id, name, size). Never opens the window and never asks the person anything.", {}, read=True, idempotent=True),
    _tool("list_plugins", "Lists the plugins in the plugins folder: file name, size, whether it is on, whether it is running, its name and the commands it registered (run one with run_command id plugin:[file]:[command]).", {}, read=True, idempotent=True),
    _tool("extensions_list", "Lists the extensions FormPortal installed and form.ext runs for formvis (Form Extension Contract, API 1): id, name, version, source (catalogue, sideload, development), state (ready, needs-permission, refused with the reason), permissions and the commands each contributes.", {}, read=True, idempotent=True),
    _tool("extension_command", "Runs a command an extension contributes (ids from extensions_list), with the same consent as the Extensions menu: the first run of a version asks the person in the formvis window, and a refusal fails. Waits for the extension to finish: a headless command stops after 120 seconds without a pending request, and the call waits at most 10 minutes.",
          {"id": {"type": "string", "description": "The extension id."}, "command": {"type": "string", "description": "The command id within the extension."}, "args": {"type": "object", "description": "Arguments passed to the extension with the command."}}, ["id", "command"]),
    # The document's size and shape.
    _tool("resize_image", "Resamples the whole document. Give width and height in pixels, or one of them (the other follows the shape), or percent (100 keeps the size), or long_side (the longer side in pixels, the shape kept).",
          {"width": {"type": "integer", "minimum": 1, "maximum": 30000}, "height": {"type": "integer", "minimum": 1, "maximum": 30000},
           "percent": {"type": "number", "minimum": 1, "maximum": 1000}, "long_side": {"type": "integer", "minimum": 1, "maximum": 30000}}),
    _tool("resize_canvas", "Changes the canvas to width x height without scaling the picture; anchor says where the picture stays.",
          {"width": {"type": "integer", "minimum": 1, "maximum": 30000}, "height": {"type": "integer", "minimum": 1, "maximum": 30000},
           "anchor": {"type": "string", "enum": ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"], "default": "center"}}, ["width", "height"]),
    _tool("crop", "Crops the document to a rectangle in pixels.", {"x": {"type": "integer"}, "y": {"type": "integer"}, "width": {"type": "integer", "minimum": 1}, "height": {"type": "integer", "minimum": 1}}, ["x", "y", "width", "height"], destructive=True),
    _tool("flip_canvas", "Flips the whole document horizontally or vertically.", {"direction": {"type": "string", "enum": ["horizontal", "vertical"]}}, ["direction"]),
    # Layers.
    _tool("transform_layer", "Moves, scales, rotates or flips a layer (id from get_document): x and y are its new top-left in pixels, scale a percentage, rotation degrees. Then, one of distort (the four corners it is pulled to: perspective and free distortion) or warp (a bend such as arc, wave or fisheye); both resample the pixels, apply as one step and need a pixel layer or a smart object.",
          {"id": _ID, "x": {"type": "number"}, "y": {"type": "number"}, "scale": {"type": "number", "minimum": 1, "maximum": 1000}, "rotation": {"type": "number", "minimum": -360, "maximum": 360},
           "flip": {"type": "string", "enum": ["horizontal", "vertical"]},
           "distort": {"type": "object", "description": "corners: the layer's top left, top right, bottom right and bottom left corners moved to these points in document pixels (convex, in order, none crossing).", "properties": {"corners": {"type": "array", "minItems": 4, "maxItems": 4,
               "items": {"type": "object", "properties": {"x": {"type": "number", "minimum": -1000000, "maximum": 1000000}, "y": {"type": "number", "minimum": -1000000, "maximum": 1000000}}, "required": ["x", "y"], "additionalProperties": False}}}, "required": ["corners"], "additionalProperties": False},
           "warp": {"type": "object", "description": "A preset bend laid over the layer: style, bend and horizontal and vertical distortion in percent (-100 to 100).", "properties": {
               "style": {"type": "string", "enum": ["arc", "arcLower", "arcUpper", "arch", "bulge", "shellLower", "shellUpper", "flag", "wave", "fish", "rise", "fisheye", "inflate", "squeeze", "twist"]},
               "bend": {"type": "number", "minimum": -100, "maximum": 100, "default": 50}, "horizontal": {"type": "number", "minimum": -100, "maximum": 100, "default": 0}, "vertical": {"type": "number", "minimum": -100, "maximum": 100, "default": 0},
               "orientation": {"type": "string", "enum": ["horizontal", "vertical"], "default": "horizontal"}, "grid": {"type": "integer", "minimum": 3, "maximum": 6, "default": 4}}, "required": ["style"], "additionalProperties": False}}, ["id"]),
    _tool("rasterize_layer", "Turns a text, shape or smart-object layer into pixels, so filters and painting apply to it.", {"id": _ID}, ["id"]),
    _tool("duplicate_layer", "Duplicates a layer above itself; returns the copy's id.", {"id": _ID, "name": {"type": "string", "maxLength": 120}}, ["id"]),
    _tool("move_layer", "Moves a layer above or below another in the stack.", {"id": _ID, "target": _ID, "where": {"type": "string", "enum": ["above", "below"], "default": "above"}}, ["id", "target"]),
    _tool("merge_layers", "Merges layers into one (the ids given, or with only one id that layer into the one below it).", {"ids": {"type": "array", "items": _ID, "minItems": 1}}, ["ids"], destructive=True),
    _tool("flatten_image", "Flattens every layer into one.", {}, destructive=True),
    _tool("add_text", "Adds a text layer; returns its id. x and y are the top-left of the text in pixels; size in pixels; color as #rrggbb.",
          {"text": {"type": "string", "maxLength": 5000}, "x": {"type": "number", "default": 0}, "y": {"type": "number", "default": 0}, "size": {"type": "number", "minimum": 1, "maximum": 2000, "default": 48},
           "color": {"type": "string", "default": "#000000"}, "font": {"type": "string", "default": "Inter"}, "bold": {"type": "boolean", "default": False}, "italic": {"type": "boolean", "default": False},
           "align": {"type": "string", "enum": ["left", "center", "right"], "default": "left"}}, ["text"]),
    _tool("draw_shape", "Draws a shape layer: a rectangle, ellipse, triangle, star, line or arrow within x, y, width, height, filled and/or stroked (colors #rrggbb; omit fill or stroke for none).",
          {"kind": {"type": "string", "enum": ["rectangle", "ellipse", "triangle", "star", "polygon", "line", "arrow"]}, "x": {"type": "number"}, "y": {"type": "number"}, "width": {"type": "number", "minimum": 1}, "height": {"type": "number", "minimum": 1},
           "fill": {"type": "string"}, "stroke": {"type": "string"}, "stroke_width": {"type": "number", "minimum": 0.5, "maximum": 200, "default": 3}}, ["kind", "x", "y", "width", "height"]),
    # Selecting.
    _tool("select_subject", "Selects the main subject (a person, animal or object) on this computer.", {}),
    _tool("select_color_range", "Selects pixels near a colour (#rrggbb) in the active layer; fuzziness 0 to 200 widens the range.", {"color": {"type": "string"}, "fuzziness": {"type": "number", "minimum": 0, "maximum": 200, "default": 40}}, ["color"]),
    _tool("select_feather", "Softens the selection's edge by radius pixels (0.1 to 1000), as Select > Modify > Feather; the selection stays one selection with a gradual edge. Needs a selection.",
          {"radius": {"type": "number", "minimum": 0.1, "maximum": 1000}, "at_bounds": {"type": "boolean", "default": False, "description": "Feather along the canvas edge too, instead of carrying the edge pixels on."}}, ["radius"]),
    _tool("select_grow", "Makes the selection bigger or smaller by amount pixels (1 to 1024), as Select > Modify > Expand or Contract. Needs a selection.",
          {"amount": {"type": "integer", "minimum": 1, "maximum": 1024}, "direction": {"type": "string", "enum": ["expand", "contract"], "default": "expand"}, "at_bounds": {"type": "boolean", "default": False, "description": "Act along the canvas edge too, instead of carrying the edge pixels on."}}, ["amount"]),
    _tool("select_point", "Selects the object at points, as the Object Selection tool does: inside points (x, y in document pixels) lie on the object, outside points on what it must not include. Runs the Segment Anything model on this computer, which takes a few seconds the first time and fails with how to install it when it is missing.",
          {"inside": {"type": "array", "minItems": 1, "maxItems": 20, "items": {"type": "object", "properties": {"x": {"type": "number"}, "y": {"type": "number"}}, "required": ["x", "y"], "additionalProperties": False}},
           "outside": {"type": "array", "maxItems": 20, "items": {"type": "object", "properties": {"x": {"type": "number"}, "y": {"type": "number"}}, "required": ["x", "y"], "additionalProperties": False}},
           "mode": {"type": "string", "enum": ["replace", "add", "subtract", "intersect"], "default": "replace"}}, ["inside"]),
    # Filters and looks.
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, chromaticShift {style: plates|lateral|linear, amount (px, 0 to 200), angle (degrees, Linear only)}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Blur Gallery: spinBlur {blurAngle (degrees), x, y (percent of the selection's bounds, else the canvas), radiusX, radiusY (percent of their shorter side), angle}. Filter Gallery: filterGallery {effects: [{filter, values, visible}]}, its effect layers applied in order, the first at the bottom, hidden ones skipped; filter is one of: coloredPencil {pencilWidth 1 to 24, strokePressure 0 to 15, paperBrightness 0 to 50}, cutout {numberOfLevels 2 to 8, edgeSimplicity 0 to 10, edgeFidelity 1 to 3}, dryBrush and fresco {brushSize 0 to 10, brushDetail 0 to 10, texture 1 to 3}, filmGrain {grain 0 to 20, highlightArea 0 to 20, intensity 0 to 10}, neonGlow {glowSize -24 to 24, glowBrightness 0 to 50, glowColor (#rrggbb)}, paintDaubs {brushSize 1 to 50, sharpness 0 to 40, brushType: simple|lightRough|darkRough|wideSharp|wideBlurry|sparkle}, paletteKnife {strokeSize 1 to 50, strokeDetail 1 to 3, softness 0 to 10}, plasticWrap {highlightStrength 0 to 20, detail 1 to 15, smoothness 1 to 15}, posterEdges {edgeThickness 0 to 10, edgeIntensity 0 to 10, posterization 0 to 6}, roughPastels {strokeLength 0 to 40, strokeDetail 1 to 20, texture: canvas|brick|burlap|sandstone, scaling 50 to 200, relief 0 to 50, light: top|topRight|right|bottomRight|bottom|bottomLeft|left|topLeft, invert}, smudgeStick {strokeLength 0 to 10, highlightArea 0 to 20, intensity 0 to 10}, sponge {brushSize 0 to 10, definition 0 to 25, smoothness 1 to 15}, underpainting {brushSize 0 to 40, textureCoverage 0 to 40, and roughPastels' texture, scaling, relief, light, invert}, watercolor {brushDetail 1 to 14, shadowIntensity 0 to 10, texture 1 to 3}, accentedEdges {edgeWidth 1 to 14, edgeBrightness 0 to 50, smoothness 1 to 15}, angledStrokes {directionBalance 0 to 100, strokeLength 3 to 50, sharpness 0 to 10}, crosshatch {strokeLength 3 to 50, sharpness 0 to 20, strength 1 to 3}, darkStrokes {balance 0 to 10, blackIntensity 0 to 10, whiteIntensity 0 to 10}, inkOutlines {strokeLength 1 to 50, darkIntensity 0 to 50, lightIntensity 0 to 50}, spatter {sprayRadius 0 to 25, smoothness 1 to 15}, sprayedStrokes {strokeLength 0 to 20, sprayRadius 0 to 25, strokeDirection: rightDiagonal|horizontal|leftDiagonal|vertical}, sumiE {strokeWidth 3 to 15, strokePressure 0 to 15, contrast 0 to 40}, diffuseGlow {graininess 0 to 10, glowAmount 0 to 20, clearAmount 0 to 20}, glass {distortion 0 to 20, smoothness 1 to 15, texture: frosted|blocks|canvas|tinyLens|ribbed|reeded|wavy|pebbled, scaling 50 to 200, invert}, oceanRipple {rippleSize 1 to 15, rippleMagnitude 0 to 20}, glowingEdges {edgeWidth 1 to 14, edgeBrightness 0 to 20, smoothness 1 to 15}, basRelief {detail 1 to 15, smoothness 1 to 15, light}, chalkCharcoal {charcoalArea 0 to 20, chalkArea 0 to 20, strokePressure 0 to 5}, charcoal {charcoalThickness 1 to 7, detail 0 to 5, lightDarkBalance 0 to 100}, chrome {detail 0 to 10, smoothness 0 to 10}, conteCrayon {foregroundLevel 1 to 15, backgroundLevel 1 to 15, and roughPastels' texture, scaling, relief, light, invert}, graphicPen {strokeLength 1 to 15, lightDarkBalance 0 to 100, strokeDirection}, halftonePattern {size 1 to 12, contrast 0 to 50, patternType: dot|circle|line}, notePaper {imageBalance 0 to 50, graininess 0 to 20, relief 0 to 25}, photocopy {detail 1 to 24, darkness 1 to 50}, plaster {imageBalance 0 to 50, smoothness 1 to 15, light}, reticulation {density 0 to 50, foregroundLevel 0 to 50, backgroundLevel 0 to 50}, stamp {lightDarkBalance 0 to 50, smoothness 1 to 50}, tornEdges {imageBalance 0 to 50, smoothness 1 to 15, contrast 1 to 25}, waterPaper {fiberLength 3 to 50, brightness 0 to 100, contrast 0 to 100}, craquelure {crackSpacing 2 to 100, crackDepth 0 to 10, crackBrightness 0 to 10}, grain {intensity 0 to 100, contrast 0 to 100, grainType: regular|soft|sprinkles|clumped|contrasty|enlarged|stippled|horizontal|vertical|speckle}, mosaicTiles {tileSize 2 to 100, groutWidth 1 to 15, lightenGrout 0 to 10}, patchwork {squareSize 0 to 10, relief 0 to 25}, stainedGlass {cellSize 2 to 50, borderThickness 1 to 20, lightIntensity 0 to 10}, texturizer {roughPastels' texture, scaling, relief, light, invert}; colours come from the foreground and background colours (the Sketch effects' ink and paper). Unnamed settings keep their defaults.",
          {"kind": {"type": "string", "enum": ["gaussianBlur", "motionBlur", "addNoise", "unsharpMask", "lensBlur", "smartSharpen", "surfaceBlur", "radialBlur", "tiltShift", "irisBlur", "fieldBlur",
                                               "average", "blur", "blurMore", "boxBlur", "shapeBlur", "smartBlur", "sharpen", "sharpenMore", "sharpenEdges", "despeckle", "dustAndScratches", "median", "reduceNoise",
                                               "custom", "hsbHsl", "highPass", "maximum", "minimum", "offset", "deInterlace", "ntscColors",
                                               "displace", "pinch", "polarCoordinates", "ripple", "shear", "spherize", "twirl", "wave", "zigZag", "chromaticShift",
                                               "colorHalftone", "crystallize", "facet", "fragment", "mezzotint", "mosaic", "pointillize",
                                               "diffuse", "emboss", "extrude", "findEdges", "oilPaint", "solarize", "tiles", "traceContour", "wind",
                                               "clouds", "differenceClouds", "fibers", "lensFlare", "lightingEffects", "flame", "pictureFrame", "tree", "spinBlur", "filterGallery"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
    _tool("set_adjustment", "Changes an adjustment layer's parameters (id from get_document; the same parameters as add_adjustment). Takes the parametric adjustments (such as photoFilter, colorBalance, channelMixer, selectiveColor), grain and exposure; apply_preset sets gradientMap, curves and levels from a preset.", {"id": _ID, "params": {"type": "object"}}, ["id", "params"], idempotent=True),
    _tool("color_match", "Matches a layer's colours to what is beneath it or around it, as a Curves layer clipped to it; amount 0 to 1.",
          {"id": _ID, "to": {"type": "string", "enum": ["beneath", "around"], "default": "beneath"}, "amount": {"type": "number", "minimum": 0, "maximum": 1, "default": 1}}, ["id"]),
    _tool("add_film_layer", "Adds a film look as its own layer: a light leak (color amber|red|magenta|gold from left|right|top|bottom|corner) or a frame (style film|white|line).",
          {"kind": {"type": "string", "enum": ["leak", "frame"]}, "color": {"type": "string", "enum": ["amber", "red", "magenta", "gold"], "default": "amber"},
           "from": {"type": "string", "enum": ["left", "right", "top", "bottom", "corner"], "default": "left"}, "style": {"type": "string", "enum": ["film", "white", "line"], "default": "film"}}, ["kind"]),
    # The video timeline (1.59.7, DEV_PLAN 25.5), as Photon Studio's timeline operations: frames counted from 0; every
    # edit is one undoable step; moving the playhead is not an edit.
    _tool("timeline_get", "The document's video timeline: frame rate, length in frames and seconds, the playhead, the work area, loops, and per layer (top first) its clip (start and length in frames), fades and keyframes. Null when it has none.", {}, read=True, idempotent=True),
    _tool("timeline_create", "Creates a video timeline with a track per layer, fps frames a second and seconds long. A document has a video timeline or a frame animation, not both.",
          {"fps": {"type": "number", "minimum": 1, "maximum": 240, "default": 30}, "seconds": {"type": "number", "minimum": 0.1, "maximum": 3600, "default": 5}}),
    _tool("timeline_delete", "Deletes the video timeline: its clips, keyframes and transitions (the layers stay).", {}, destructive=True),
    _tool("timeline_set", "Changes the frame rate, the length in seconds, the work area (work_in to work_out, frames, work_out excluded) or the loop count (0 forever).",
          {"fps": {"type": "number", "minimum": 1, "maximum": 240}, "seconds": {"type": "number", "minimum": 0.01, "maximum": 3600}, "work_in": {"type": "integer", "minimum": 0},
           "work_out": {"type": "integer", "minimum": 1}, "loops": {"type": "integer", "minimum": 0, "maximum": 65535}}, idempotent=True),
    _tool("timeline_go_to", "Moves the playhead to a frame; the window shows that moment. Not an edit.", {"frame": {"type": "integer", "minimum": 0}}, ["frame"], idempotent=True),
    _tool("timeline_clip", "Moves or trims a layer's clip: start is the frame where it begins, length how many frames it lasts. Outside its clip the layer does not show.",
          {"id": _ID, "start": {"type": "integer"}, "length": {"type": "integer", "minimum": 1}}, ["id"], idempotent=True),
    _tool("timeline_split", "Splits a layer's clip at a frame (default the playhead): the clip ends there and a copy of the layer carries on with the rest and the same keyframes; returns the copy's id.",
          {"id": _ID, "frame": {"type": "integer", "minimum": 1}}, ["id"]),
    _tool("timeline_keyframe", "Keys a layer's property at a frame (default the playhead): x and y in pixels, opacity and fill 0 to 1, style 1 (its layer style on) or 0; interpolation linear or hold (until the next keyframe). delete removes the keyframe at that frame; clear removes all of the property's keyframes.",
          {"id": _ID, "property": {"type": "string", "enum": ["x", "y", "opacity", "fill", "style"]}, "frame": {"type": "integer", "minimum": 0}, "value": {"type": "number"},
           "interpolation": {"type": "string", "enum": ["linear", "hold"], "default": "linear"}, "delete": {"type": "boolean", "default": False}, "clear": {"type": "boolean", "default": False}}, ["id", "property"]),
    _tool("timeline_transition", "Adds a transition to a layer's clip: fade_in, fade_out or fade (both) over seconds, to transparent or with black or white (the layer turns to that colour at the clip's edge); cross_fade with the clip starting or ending within it (only the upper fades, so the picture never dips); or remove.",
          {"id": _ID, "kind": {"type": "string", "enum": ["fade_in", "fade_out", "fade", "cross_fade", "remove"]}, "seconds": {"type": "number", "minimum": 0.01, "maximum": 600, "default": 1},
           "color": {"type": "string", "enum": ["transparent", "black", "white"], "default": "transparent"}}, ["id", "kind"]),
    _tool("timeline_frame_image", "One frame of the video timeline as a PNG image, its longer side at most max_size pixels.",
          {"frame": {"type": "integer", "minimum": 0}, "max_size": {"type": "integer", "minimum": 64, "maximum": 2048, "default": 1024}}, ["frame"], read=True, idempotent=True),
    _tool("timeline_render", "Renders the video timeline to an absolute path: .mp4 (H.264), .gif, or .zip (numbered PNG frames); every frame, or from to to (frames, to excluded); scale 1, 0.5 or 0.25. A file already there is kept unless overwrite is true.",
          {"path": {"type": "string", "description": "Absolute path ending .mp4, .gif or .zip"}, "from": {"type": "integer", "minimum": 0}, "to": {"type": "integer", "minimum": 1},
           "scale": {"type": "number", "enum": [1, 0.5, 0.25], "default": 1}, "overwrite": _OVERWRITE}, ["path"], destructive=True),
    _tool("list_commands", "Lists formvis's commands: every menu and palette action, each as id, label, menu (its path in the menu bar, such as Filter > Blur > Gaussian Blur, which ui_menu_invoke takes), when (what it is for) and params (what it takes). Narrow it with group (a menu or family such as Filter or Layer) or text (words from the label, id or description); an unfiltered list is capped, so filter first.",
          {"group": {"type": "string", "maxLength": 80}, "text": {"type": "string", "maxLength": 120}, "enabled": {"type": "boolean", "description": "true lists only the commands that can run right now, false only those that cannot; each row says enabled, mutates, its keys and, when disabled, disabledReason (and needsDocument when no document is open)."}}, read=True, idempotent=True),
    _tool("describe_command", "One command in full: its label, group, description, when to use it, params with types and defaults, and whether it changes the document or is risky (cannot be undone).",
          {"id": {"type": "string", "maxLength": 120, "description": "A command id from list_commands."}}, ["id"], read=True, idempotent=True),
    _tool("run_command", "Runs one command by id with params, as one undoable step. A command marked risky waits for the person's approval in the formvis window (Window > Agent Connect) unless they allowed all. With wait false it starts the command and answers at once with a job id; command_job gives its result.",
          {"id": {"type": "string", "maxLength": 120, "description": "A command id from list_commands."}, "params": {"type": "object", "description": "The command's params, as describe_command lists them."},
           "wait": {"type": "boolean", "default": True, "description": "false: start it in the background and return a job id (a long command such as a model run); do not edit the document until command_job says it is done."}}, ["id"], destructive=True),
    _tool("command_job", "The state of commands started with run_command wait false: job (an id such as cmd:1) gives that one, none lists the last 50. Each shows running, done or failed, the seconds it has taken, its message and its result.",
          {"job": {"type": "string", "maxLength": 40, "description": "A job id from run_command, such as cmd:1."}}, read=True, idempotent=True),
    _tool("run_commands", "Runs several commands in order as one batch and one undo step; it stops at the first failure and says which command failed. A risky command in the batch asks the person first.",
          {"commands": {"type": "array", "minItems": 1, "maxItems": 50, "items": {"type": "object", "properties": {"id": {"type": "string", "maxLength": 120}, "params": {"type": "object"}}, "required": ["id"], "additionalProperties": False}}}, ["commands"], destructive=True),
    _tool("get_selection", "The selection: its bounds in pixels (x, y, width, height), or none when nothing is selected.", {}, read=True, idempotent=True),
    _tool("get_layer_tree", "The layers as a tree, bottom to top, each with id, name, kind, visible and its children (a focused view of get_document's layers, without the document details).", {}, read=True, idempotent=True),
    _tool("select_mask", "Makes the selection from a layer: its pixels (transparency), its layer mask, or its vector mask. Defaults to the active layer and replaces the selection.",
          {"id": _ID, "source": {"type": "string", "enum": ["transparency", "mask", "vector"], "default": "transparency"}, "invert": {"type": "boolean", "default": False},
           "mode": {"type": "string", "enum": ["replace", "add", "subtract", "intersect"], "default": "replace"}}),
    _tool("list_settings", "The window's simple settings (numbers, on-off choices and short texts in Preferences) with their current values.", {}, read=True, idempotent=True),
    _tool("list_fonts", "The font families the window offers for type, bundled and installed ones, most recently used first. Give family to get that family's faces (regular, bold, italic, bold italic) with whether the font file could be read and how many characters it maps; use a listed family name in add_text.",
          {"family": {"type": "string", "maxLength": 120, "description": "A family from the list; omit to list all families."}}, read=True, idempotent=True),
    # Headless: the engine alone, no window.
    _tool("file_info", "Reads a picture or project file at an absolute path without opening it: size in pixels, colour mode, bit depth, resolution, whether it carries a colour profile, pages or frames, and for projects (.fvd, .fmv, .ora, .psd, .psb) the layer count. Works with no window open.",
          {"path": {"type": "string", "description": "Absolute path to a picture or project file."}}, ["path"], read=True, idempotent=True),
    _tool("improve_prompt", "Rewrites an image prompt through the language model set in Preferences > Plugins, under an improve template (default Richer detail; or a starter or a Markdown template in the data folder's prompt-templates folder). Returns the rewritten prompt and kept, the @img reference tokens of the prompt that the rewrite still carries (any the model dropped are put back at the end and named in restored). Changes nothing in the document; works with no window open. Fails with what to do when no language model is set.",
          {"prompt": {"type": "string", "minLength": 1, "maxLength": 4000, "description": "The prompt to improve; @img1, @img2 and so on name reference pictures and are kept."}, "template": {"type": "string", "maxLength": 80, "description": "A template name: Richer detail, Fill a selection, Short and plain, Generate a new picture, Edit instruction, Photographic, Tag list or Transparent asset (the starter for each use case)."}}, ["prompt"], read=True),
    _tool("convert_file", "Converts a picture file to another format without opening it in the window: path in, output_path out, the output's extension picks the format (png, jpg, webp, avif, tif, bmp, qoi, tga, ico, pdf, ppm, pgm, pbm, pnm, dpx, fits, wbmp). The result is one flat picture; layers are not kept (open_file then save_project does that). A file already at output_path is kept unless overwrite is true. Works with no window open.",
          {"path": {"type": "string", "description": "Absolute path to the picture to read."}, "output_path": {"type": "string", "description": "Absolute path to write, with the new extension."},
           "quality": {"type": "number", "minimum": 0.1, "maximum": 1, "default": 0.92, "description": "For jpg, webp and avif."}, "dpi": {"type": "integer", "minimum": 1, "maximum": 9600, "default": 72},
           "page": {"type": "integer", "minimum": 0, "default": 0, "description": "Which page of a multi-page TIFF; the first by default."},
           "options": {"type": "object", "description": "Format settings as the export dialog names them, for example {compression: deflate} for tiff or {level: 9} for png."}, "overwrite": _OVERWRITE}, ["path", "output_path"], destructive=True),
    _tool("jobs_list", "Lists the engine's background work: local generation, upscaling and similar jobs (id, kind, status, progress, what it is doing) and the agent calls now running or waiting for the person's approval. Newest first.",
          {"status": {"type": "string", "enum": ["all", "active", "finished"], "default": "all"}, "limit": {"type": "integer", "minimum": 1, "maximum": 200, "default": 50}}, read=True, idempotent=True),
    _tool("jobs_cancel", "Cancels a background job by its id from jobs_list, or every active one with all true. A job stops at its next step; jobs_list shows it as cancelled.",
          {"id": {"type": "string", "maxLength": 80, "description": "A job id from jobs_list."}, "all": {"type": "boolean", "default": False}}, destructive=True, idempotent=True),
    _tool("set_settings", "Changes simple settings by name, as list_settings names them. A value must be the same kind as the current one. The person is asked first.",
          {"values": {"type": "object", "description": "Setting names and their new values."}}, ["values"], idempotent=True),
    _tool("ui_inspect", "Describes parts of the formvis window: for each element matching a CSS selector, its tag, id, text, whether it is visible, disabled or pressed, and its box in window pixels.",
          {"selector": {"type": "string", "maxLength": 200}, "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 10}}, ["selector"], read=True, idempotent=True),
    # The window's own controls (P22): state, pictures of it, menus by path, named settings, dialogs, synthetic input, the window, raw control calls and file roots.
    _tool("ui_state", "The window's state: the active tool, the open document and its view (zoom, rotation, centre in document pixels), the foreground and background colours, window and stage size, whether it has focus or is full screen, the theme, whether panels are shown, the dialogs open, whether a menu is open, what the engine is busy with, and the frames per second measured over a third of a second.",
          {}, read=True, idempotent=True),
    _tool("ui_screenshot", "A picture of the formvis window: with no selector the canvas as the person sees it (the picture, selection outline, guides and tool overlays); with a CSS selector (from ui_inspect) that part of the window, such as a panel or a dialog, drawn from a copy of its elements (fonts that are not installed on this computer may differ). Its longer side is at most max_size pixels.",
          {"selector": {"type": "string", "maxLength": 200}, "max_size": {"type": "integer", "minimum": 64, "maximum": 2048, "default": 1024}, "format": {"type": "string", "enum": ["png", "jpeg"], "default": "png"},
           "quality": {"type": "number", "minimum": 0.1, "maximum": 1, "default": 0.9}}, read=True, idempotent=True),
    _tool("ui_menu_list", "The menu bar's tree. With no path the menus; with a path such as Filter > Blur the items under it, each with its command id, label, whether it can run now, whether it is checked and its shortcut. depth (1 to 4) says how many submenu levels to open; deeper ones show only their item count.",
          {"path": {"type": "string", "maxLength": 200, "default": ""}, "depth": {"type": "integer", "minimum": 1, "maximum": 4, "default": 1}}, read=True, idempotent=True),
    _tool("ui_menu_invoke", "Runs a menu item by its path from the menu bar, such as Edit > Undo or Filter > Blur > Gaussian Blur, as a person clicking it would (a dialog may open: ui_dialog answers it). params are the command's params as describe_command lists them. A command marked risky waits for the person's approval.",
          {"path": {"type": "string", "maxLength": 200, "description": "Menu labels joined with > ending at the item."}, "params": {"type": "object"}}, ["path"], destructive=True),
    _tool("ui_set", "Sets named parts of the window in one call: tool (a tool id), zoom (1 is 100 percent), centre ({x, y} document pixels to bring to the middle), rotation (degrees of view rotation), theme (a theme name), panels (shown or hidden), foreground and background (#rrggbb), mask_target (edit the active layer's mask instead of its pixels), eyedropper ({size: 1 for a point sample or the side of an average (3, 5, 11, 31, 51, 101), sample: current, below, all, below-flat or all-flat, ring: show the sample ring}), crop_overlay ({kind: the Crop tool's composition guide, show: auto, always or never}) and dock_layout (a workspace by name or id, such as Essentials or Photography; ui_state lists them). A field it does not have is refused by name.",
          {"tool": {"type": "string", "maxLength": 60}, "zoom": {"type": "number", "minimum": 0.01, "maximum": 64}, "centre": {"type": "object", "properties": {"x": {"type": "number"}, "y": {"type": "number"}}, "required": ["x", "y"], "additionalProperties": False},
           "rotation": {"type": "number", "minimum": -360, "maximum": 360}, "theme": {"type": "string", "maxLength": 60}, "panels": {"type": "boolean"}, "foreground": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "description": "#rrggbb"},
           "background": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "description": "#rrggbb"}, "mask_target": {"type": "boolean"},
           "eyedropper": {"type": "object", "properties": {"size": {"type": "integer", "enum": [1, 3, 5, 11, 31, 51, 101]}, "sample": {"type": "string", "enum": ["current", "below", "all", "below-flat", "all-flat"]}, "ring": {"type": "boolean"}}, "additionalProperties": False},
           "crop_overlay": {"type": "object", "properties": {"kind": {"type": "string", "enum": ["thirds", "grid", "diagonal", "triangle", "golden", "spiral"]}, "show": {"type": "string", "enum": ["auto", "always", "never"]}}, "additionalProperties": False},
           "dock_layout": {"type": "string", "maxLength": 60}}, idempotent=True),
    _tool("ui_dialog", "Lists, fills in and answers the dialog that is open in the window. action list shows each open dialog's title, message, fields (name, kind, value, range or options) and buttons; set puts values into fields (a field's name from list, or its number as in Name #2); confirm presses the primary button; cancel closes it; button presses the button of that name. An open dialog blocks edits until it is answered.",
          {"action": {"type": "string", "enum": ["list", "set", "confirm", "cancel"], "default": "list"}, "fields": {"type": "object", "description": "Field names and their new values (text, number, true or false for a checkbox, or an option's name)."},
           "button": {"type": "string", "maxLength": 60}}),
    _tool("ui_pointer", "Sends synthetic pointer events to the canvas as a pen, mouse or finger would: down, move, up, cancel, hover and wheel, each at x, y in document pixels (or window pixels with space window) with pressure (0 to 1), tilt_x and tilt_y (degrees), twist, button, and the modifier keys shift, alt, ctrl and meta. The active tool receives them exactly as a person's. A press left down is released at the end unless keep_down is true. Pressure counts only while Preferences > Tools reads pen pressure.",
          {"events": {"type": "array", "minItems": 1, "maxItems": 2000, "items": {"type": "object", "properties": {
              "type": {"type": "string", "enum": ["down", "move", "up", "cancel", "hover", "wheel"]}, "x": {"type": "number", "minimum": -1000000, "maximum": 1000000}, "y": {"type": "number", "minimum": -1000000, "maximum": 1000000},
              "space": {"type": "string", "enum": ["document", "window"], "default": "document"}, "pressure": {"type": "number", "minimum": 0, "maximum": 1}, "tilt_x": {"type": "number", "minimum": -90, "maximum": 90}, "tilt_y": {"type": "number", "minimum": -90, "maximum": 90},
              "twist": {"type": "number", "minimum": 0, "maximum": 359}, "button": {"type": "integer", "minimum": 0, "maximum": 4}, "pointer_type": {"type": "string", "enum": ["pen", "mouse", "touch"], "default": "pen"},
              "shift": {"type": "boolean"}, "alt": {"type": "boolean"}, "ctrl": {"type": "boolean"}, "meta": {"type": "boolean"}, "delta_x": {"type": "number"}, "delta_y": {"type": "number"}}, "required": ["type"], "additionalProperties": False}},
           "delay_ms": {"type": "integer", "minimum": 0, "maximum": 100, "default": 4, "description": "Pause after each event."}, "keep_down": {"type": "boolean", "default": False}}, ["events"], destructive=True),
    _tool("ui_key", "Presses keys in the window as a person would, to whatever has focus: keys are combos such as Mod+Z, Shift+Tab, Escape, Enter or B (Mod is Ctrl, or Cmd on a Mac); text types characters into the focused text field or dialog field.",
          {"keys": {"type": "array", "minItems": 1, "maxItems": 50, "items": {"type": "string", "maxLength": 40}}, "text": {"type": "string", "maxLength": 2000}}, destructive=True),
    _tool("ui_window", "The formvis window itself: size reports its size and focus, resize sets it (the desktop app's window only; a browser tab refuses), focus asks for focus, fullscreen toggles full screen, quit closes formvis (confirm must be true; the person approves it, and is asked about each document with unsaved changes; a browser tab only ends by saying it can be closed).",
          {"action": {"type": "string", "enum": ["size", "resize", "focus", "fullscreen", "quit"]}, "confirm": {"type": "boolean", "default": False}, "width": {"type": "integer", "minimum": 400, "maximum": 10000}, "height": {"type": "integer", "minimum": 300, "maximum": 10000}}, ["action"]),
    _tool("control_call", "Calls a window control by its protocol name with raw params, the same as the typed tool: ui.inspect, ui.state, ui.screenshot, ui.menu.list, ui.menu.invoke, ui.set, ui.dialog, ui.pointer, ui.key, window, app.open (open_file), app.save (save_project), app.export (export_image) and app.roots (file_roots). params are checked against that tool's schema.",
          {"method": {"type": "string", "enum": list(CONTROL_METHODS)}, "params": {"type": "object", "default": {}}}, ["method"], destructive=True),
    _tool("file_roots", "The folders agents may read and write files in (the person sets them), and the caps on one reply: the most characters of text and bytes of one picture a tool returns. With no folders set, any folder outside the system's own is allowed.",
          {}, read=True, idempotent=True),
    # Layout boxes, depth, crop, sampling and mask files (1.88.8).
    _tool("boxes_list", "The layout boxes on the document (rectangles that say where new, kept, moved or removed things go, which Generate writes into its prompt): id, kind, name, description and rectangle in document pixels, with warnings about empty descriptions, tiny or overlapping boxes.", {}, read=True, idempotent=True),
    _tool("boxes_add", "Adds a layout box: a rectangle in document pixels with a kind (new, keep, move, remove, reference, text) and a description of what belongs there. At most 24 boxes; the rectangle is kept on the canvas.",
          {"x": {"type": "number"}, "y": {"type": "number"}, "width": {"type": "number", "minimum": 1}, "height": {"type": "number", "minimum": 1},
           "kind": {"type": "string", "enum": ["new", "keep", "move", "remove", "reference", "text"], "default": "new"}, "text": {"type": "string", "maxLength": 500, "default": ""}}, ["x", "y", "width", "height"]),
    _tool("boxes_set", "Changes a layout box: its kind, description, name or rectangle (only what you give). The id is from boxes_list.",
          {"id": {"type": "string", "description": "A box id from boxes_list."}, "kind": {"type": "string", "enum": ["new", "keep", "move", "remove", "reference", "text"]}, "text": {"type": "string", "maxLength": 500},
           "name": {"type": "string", "maxLength": 60}, "x": {"type": "number"}, "y": {"type": "number"}, "width": {"type": "number", "minimum": 1}, "height": {"type": "number", "minimum": 1}}, ["id"], idempotent=True),
    _tool("boxes_remove", "Deletes one layout box by its id from boxes_list (undoable).", {"id": {"type": "string", "description": "A box id from boxes_list."}}, ["id"], destructive=True),
    _tool("boxes_from_selection", "Makes a layout box over the bounds of the current selection, as one step.",
          {"kind": {"type": "string", "enum": ["new", "keep", "move", "remove", "reference", "text"], "default": "new"}, "text": {"type": "string", "maxLength": 500, "default": ""}}),
    _tool("boxes_clear", "Deletes every layout box in one undoable step.", {}, destructive=True, idempotent=True),
    _tool("sample_box", "The average colour (opacity weighted, of the flattened picture) inside a layout box, or inside a rectangle in document pixels. Returns #rrggbb, its red, green and blue, and how opaque the area is.",
          {"id": {"type": "string", "description": "A box id from boxes_list; leave out to give a rectangle."}, "x": {"type": "number"}, "y": {"type": "number"}, "width": {"type": "number", "minimum": 1}, "height": {"type": "number", "minimum": 1}}, read=True, idempotent=True),
    _tool("frequency_separation", "Splits what the picture shows at a radius into two layers above the active one: Low Frequency (the blurred colour and tone) and High Frequency (the detail, in Linear Light), which together look as the picture did. Retouch skin tone on the first and texture on the second.",
          {"radius": {"type": "number", "minimum": 0.5, "maximum": 100, "default": 8, "description": "Blur radius in pixels: larger keeps more in the detail layer."}}),
    _tool("sample_depth", "Reads the Depth Map layer at a point: 0 to 255 (and 0 to 1), near is bright, far is dark. size averages a square of that many pixels. The document needs a Depth Map layer (a grey layer named Depth Map).",
          {"x": {"type": "integer", "minimum": 0}, "y": {"type": "integer", "minimum": 0}, "size": {"type": "integer", "minimum": 1, "maximum": 101, "default": 1}}, ["x", "y"], read=True, idempotent=True),
    _tool("depth_edit", "Corrects the Depth Map layer, inside the selection when there is one: flatten (pull amount percent toward mid grey), nearer or farther (shift amount percent of the range), or smooth (blur by radius pixels; edges true keeps depth sharp at the picture's own edges, radius up to 9).",
          {"kind": {"type": "string", "enum": ["flatten", "nearer", "farther", "smooth"]}, "amount": {"type": "number", "minimum": 1, "maximum": 100, "description": "Percent for flatten (50 when left out), nearer and farther (10)."},
           "radius": {"type": "number", "minimum": 1, "maximum": 32, "default": 4, "description": "For smooth."}, "edges": {"type": "boolean", "default": False, "description": "For smooth: keep the picture's edges sharp."}}, ["kind"]),
    _tool("set_crop", "Crops to a frame given in document pixels, with a turn: angle straightens the picture (degrees, -45 to 45) about the frame's centre, and output_width with output_height resample the result to exactly that size at resolution ppi. A frame past the picture's edge adds canvas; content_aware fills it from the picture. crop is the plain rectangle.",
          {"x": {"type": "number"}, "y": {"type": "number"}, "width": {"type": "number", "minimum": 1}, "height": {"type": "number", "minimum": 1}, "angle": {"type": "number", "minimum": -45, "maximum": 45, "default": 0},
           "output_width": {"type": "integer", "minimum": 1, "maximum": 30000}, "output_height": {"type": "integer", "minimum": 1, "maximum": 30000}, "resolution": {"type": "number", "minimum": 1, "maximum": 9600, "description": "Pixels per inch; the document's own when left out."},
           "content_aware": {"type": "boolean", "default": False}}, ["x", "y", "width", "height"], destructive=True),
    _tool("export_mask", "Writes a mask as a grey PNG the size of the document (white shows, black hides, greys are partial) to an absolute path: the selection, a layer's mask, or what a layer's pixels cover. A file already there is kept unless overwrite is true.",
          {"path": {"type": "string", "description": "Absolute path ending .png"}, "source": {"type": "string", "enum": ["selection", "layer_mask", "layer_pixels"], "default": "selection"},
           "id": {"type": "string", "description": "A layer id from get_document; for layer_mask and layer_pixels."}, "overwrite": _OVERWRITE}, ["path"], destructive=True),
    # Recipes, selecting, layers, masks, history, brush and files (P22).
    _tool("list_recipes", "Which ways of filling, generating, upscaling and reading depth this computer can run now: each with its id, the task, where it runs (this computer, or fal which costs money and asks the person), whether it is ready, why not when it is not, and the tool that uses it.", {}, read=True, idempotent=True),
    _tool("set_active_layer", "Selects the layers in ids (from get_document) so commands that act on the selected layers, such as align_layers or group_layers, reach them; the last id becomes the active layer. With add true the layers join the current selection, else they replace it.",
          {"ids": {"type": "array", "minItems": 1, "maxItems": 200, "items": _ID}, "add": {"type": "boolean", "default": False}}, ["ids"], idempotent=True),
    _tool("select_color", "Selects by colour from a seed point, as the Magic Wand does: the pixels within tolerance of the colour at x, y, either contiguous with the point or everywhere. source layer reads the active layer, merged reads the whole picture. mode combines the result with the selection.",
          {"x": {"type": "integer", "minimum": 0}, "y": {"type": "integer", "minimum": 0}, "tolerance": {"type": "integer", "minimum": 0, "maximum": 255, "default": 32}, "contiguous": {"type": "boolean", "default": True},
           "source": {"type": "string", "enum": ["layer", "merged"], "default": "layer"}, "mode": {"type": "string", "enum": ["replace", "add", "subtract", "intersect"], "default": "replace"}}, ["x", "y"]),
    _tool("select_shape", "Selects a rectangle, an ellipse (x, y, width, height in pixels) or a polygon (points, at least 3, in pixels), with an optional feather radius, combined with the selection by mode.",
          {"shape": {"type": "string", "enum": ["rectangle", "ellipse", "polygon"]}, "x": {"type": "number"}, "y": {"type": "number"}, "width": {"type": "number", "minimum": 1}, "height": {"type": "number", "minimum": 1},
           "points": {"type": "array", "minItems": 3, "maxItems": 500, "items": {"type": "object", "properties": {"x": {"type": "number"}, "y": {"type": "number"}}, "required": ["x", "y"], "additionalProperties": False}},
           "feather": {"type": "number", "minimum": 0, "maximum": 1000, "default": 0, "description": "Edge softness in pixels."}, "mode": {"type": "string", "enum": ["replace", "add", "subtract", "intersect"], "default": "replace"}}, ["shape"]),
    _tool("select_range", "Selects by range, as Select > Color Range: kind color (pixels near a colour, with fuzziness), a hue family (reds, yellows, greens, cyans, blues, magentas), highlights, midtones, shadows, skin, depth (lo to hi of the Depth Map, 0 to 255, near is bright), or luminosity (lo to hi, 0 to 255, of the layer or the merged picture; fuzziness softens the ends). invert flips the result; mode combines it with the selection.",
          {"kind": {"type": "string", "enum": ["color", "reds", "yellows", "greens", "cyans", "blues", "magentas", "highlights", "midtones", "shadows", "skin", "depth", "luminosity"]}, "color": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "description": "#rrggbb, for kind color."},
           "fuzziness": {"type": "number", "minimum": 0, "maximum": 200, "default": 40}, "lo": {"type": "integer", "minimum": 0, "maximum": 255, "default": 0}, "hi": {"type": "integer", "minimum": 0, "maximum": 255, "default": 255},
           "source": {"type": "string", "enum": ["layer", "merged"], "default": "layer", "description": "For luminosity."}, "invert": {"type": "boolean", "default": False}, "mode": {"type": "string", "enum": ["replace", "add", "subtract", "intersect"], "default": "replace"}}, ["kind"]),
    _tool("sample_mean_color", "The mean colour of the selection (weighted by how much each pixel is selected and opaque), or of the whole picture when nothing is selected; with id, of that layer alone. Changes nothing. Returns #rrggbb, red, green, blue, how opaque the area is and the pixels counted.",
          {"id": {"type": "string", "description": "A layer id from get_document; omit for the flattened picture."}}, read=True, idempotent=True),
    _tool("align_layers", "Aligns or distributes the layers in ids (from get_document; the current selection when left out). align: left, hcenter, right, top, vcenter or bottom; distribute: the same edges or hspace and vspace for equal gaps (three or more layers, or two with to selection or canvas). to auto uses the bounds of the layers themselves, or the selection or canvas.",
          {"ids": {"type": "array", "minItems": 1, "maxItems": 200, "items": _ID}, "align": {"type": "string", "enum": ["left", "hcenter", "right", "top", "vcenter", "bottom"]},
           "distribute": {"type": "string", "enum": ["left", "hcenter", "right", "top", "vcenter", "bottom", "hspace", "vspace"]}, "to": {"type": "string", "enum": ["auto", "selection", "canvas"], "default": "auto"}}),
    _tool("group_layers", "Puts the layers in ids (from get_document) into one new group, named name; returns the group's id.",
          {"ids": {"type": "array", "minItems": 1, "maxItems": 200, "items": _ID}, "name": {"type": "string", "maxLength": 120}}, ["ids"]),
    _tool("set_group", "Changes a group's name, visibility, lock (every lock) or collapsed state in the Layers panel. id is a group from get_document.",
          {"id": _ID, "name": {"type": "string", "maxLength": 120}, "visible": {"type": "boolean"}, "locked": {"type": "boolean"}, "collapsed": {"type": "boolean"}}, ["id"], idempotent=True),
    _tool("set_mask", "Changes a layer's raster mask. action reveal_all or hide_all (adds one, or resets the layer's), reveal_selection or hide_selection (from the selection; the layer has no mask yet), enable, disable, invert, delete, apply (burns it into the pixels, then removes it), or copy_from (a copy of the mask of from_id).",
          {"id": _ID, "action": {"type": "string", "enum": ["reveal_all", "hide_all", "reveal_selection", "hide_selection", "enable", "disable", "invert", "delete", "apply", "copy_from"]}, "from_id": {"type": "string", "description": "A layer id with a mask; for copy_from."}}, ["id", "action"], destructive=True),
    _tool("set_text", "Changes a text layer (id from get_document): its words, font, size, colour, bold, italic, alignment, line height, tracking, and its angle in degrees. Give only what changes.",
          {"id": _ID, "text": {"type": "string", "maxLength": 5000}, "font": {"type": "string"}, "size": {"type": "number", "minimum": 1, "maximum": 2000}, "color": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"}, "bold": {"type": "boolean"}, "italic": {"type": "boolean"},
           "align": {"type": "string", "enum": ["left", "center", "right", "justify"]}, "line_height": {"type": "number", "minimum": 0.5, "maximum": 5}, "tracking": {"type": "number", "minimum": -500, "maximum": 1000}, "angle": {"type": "number", "minimum": -360, "maximum": 360}}, ["id"], idempotent=True),
    _tool("list_history", "The document's undo history (each step's name, which are done and which are undone) and its snapshots (id, name, kind, memory), newest last. Snapshots live with the open document and are not saved.", {}, read=True, idempotent=True),
    _tool("take_snapshot", "Keeps the document as it is now as a named snapshot to return to however far the steps move on; returns its id. kind document keeps every layer, merged the flattened picture, layer the active layer.",
          {"name": {"type": "string", "maxLength": 120}, "kind": {"type": "string", "enum": ["document", "merged", "layer"], "default": "document"}}),
    _tool("restore_snapshot", "Returns the document to a snapshot, by id or by name (list_history shows both), as one undo step; the snapshot stays.",
          {"id": {"type": "string", "description": "A snapshot id from list_history."}, "name": {"type": "string", "maxLength": 120}}),
    _tool("delete_snapshot", "Deletes a snapshot by id or by name (list_history shows both). The history steps are not touched.",
          {"id": {"type": "string", "description": "A snapshot id from list_history."}, "name": {"type": "string", "maxLength": 120}}, destructive=True),
    _tool("extend_canvas", "Adds pixels to each side of the canvas independently (left, top, right, bottom), filled with fill: transparent, a colour #rrggbb, foreground or background. The picture keeps its place.",
          {"left": {"type": "integer", "minimum": 0, "maximum": 30000, "default": 0}, "top": {"type": "integer", "minimum": 0, "maximum": 30000, "default": 0}, "right": {"type": "integer", "minimum": 0, "maximum": 30000, "default": 0},
           "bottom": {"type": "integer", "minimum": 0, "maximum": 30000, "default": 0}, "fill": {"type": "string", "default": "transparent", "description": "transparent, #rrggbb, foreground or background."}}),
    _tool("export_layer", "Writes one layer alone, with its mask and transparency, as a PNG to an absolute path: the size of the document, or trimmed to the layer's visible pixels with trim true. A file already there is kept unless overwrite is true.",
          {"path": {"type": "string", "description": "Absolute path ending .png"}, "id": _ID, "trim": {"type": "boolean", "default": False}, "overwrite": _OVERWRITE}, ["path", "id"], destructive=True),
    _tool("read_log", "The window's error log: uncaught errors and failed tasks (at most 100, newest last), each with when, what and the message. It is not a full application log.",
          {"limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 30}}, read=True, idempotent=True),
    _tool("list_brush_tips", "The brush presets and sampled tips: id, name, description, size, hardness, opacity, angle, roundness and spacing, with the brush as it is set now. Use an id as preset in set_brush.", {}, read=True, idempotent=True),
    _tool("set_brush", "Sets the brush: size (pixels), hardness, opacity, flow (0 to 1), a preset id from list_brush_tips (applied first), and the tip's angle (degrees), roundness (percent), spacing (percent of the size) and follow_direction (the tip turns with the stroke).",
          {"size": {"type": "integer", "minimum": 1, "maximum": 5000}, "hardness": {"type": "number", "minimum": 0, "maximum": 1}, "opacity": {"type": "number", "minimum": 0.01, "maximum": 1}, "flow": {"type": "number", "minimum": 0.01, "maximum": 1},
           "preset": {"type": "string", "maxLength": 120}, "angle": {"type": "number", "minimum": -180, "maximum": 180}, "roundness": {"type": "number", "minimum": 1, "maximum": 100}, "spacing": {"type": "number", "minimum": 1, "maximum": 1000}, "follow_direction": {"type": "boolean"}}, idempotent=True),
    _tool("add_filter", "Adds a filter to a layer as a smart filter that stays editable (the layer becomes a smart object when it is not one): kind and settings as apply_filter takes them. Returns the filter's id; set_filter changes, disables or removes it later.",
          {"id": {"type": "string", "description": "A layer id from get_document; the active layer when left out."}, "kind": {"type": "string", "maxLength": 60}, "settings": {"type": "object", "default": {}}}, ["kind"]),
    _tool("set_filter", "Changes a smart filter on a smart object layer: its settings, kind, enabled, opacity (percent), blend mode, or remove it. With only id it lists the layer's filters.",
          {"id": _ID, "filter_id": {"type": "string", "description": "A filter id from add_filter or set_filter's list; the last filter when left out."}, "kind": {"type": "string", "maxLength": 60}, "settings": {"type": "object"},
           "enabled": {"type": "boolean"}, "opacity": {"type": "number", "minimum": 0, "maximum": 100}, "blend": {"type": "string"}, "remove": {"type": "boolean", "default": False}}, ["id"], destructive=True),
    # Presets, edges, comparing, depth and the status bar (P21, P22).
    _tool("apply_preset", "Applies a named adjustment preset: the built-in grain presets by film speed (iso100 to iso3200, slide, negative, bw400, bwpush, cine, expired), gradientMap looks (cyberpunk, sunset, tealorange, sepia, infrared, bwcontrast), photoFilter colours (warm85, cool80, sepia, underwater and more), or a preset the person saved in the Adjustments panel for any adjustment kind. With id it changes that adjustment layer, else it adds a new adjustment layer of that kind. With no name it lists the presets (for kind, or all).",
          {"kind": {"type": "string", "maxLength": 40, "description": "The adjustment: grain, gradientMap, photoFilter, or the kind a saved preset belongs to."}, "name": {"type": "string", "maxLength": 80, "description": "A preset id or name from the list; leave out to list."},
           "id": {"type": "string", "description": "An adjustment layer id of that kind, to change it instead of adding one."}}),
    _tool("depth_from_layer", "Reads the depth of one layer alone with the local Depth Anything V2 Small model and adds it as a grey layer named Depth Map (near bright, far dark). Waits until the model has finished and the layer exists, then reports its id; fails with how to download the model when it is missing.",
          {"id": {"type": "string", "description": "A pixel layer id from get_document; the active layer when left out."}}),
    _tool("select_by_depth", "Selects the pixels between a far and a near depth of the document's shared depth map (read once with the local Depth Anything V2 Small model and kept with the document), softened by feather, and combines the result with the selection. Waits until the depth is read; fails with how to download the model when it is missing.",
          {"near": {"type": "number", "minimum": 0, "maximum": 100, "default": 100, "description": "The nearest depth to select, percent of the depth range (100 is nearest)."},
           "far": {"type": "number", "minimum": 0, "maximum": 100, "default": 60, "description": "The farthest depth to select, percent of the depth range (0 is farthest)."},
           "feather": {"type": "number", "minimum": 0, "maximum": 50, "default": 10, "description": "Percent of the range over which the edge fades out past each end."},
           "combine": {"type": "string", "enum": ["new", "add", "subtract", "intersect"], "default": "new", "description": "How the result meets the current selection."},
           "quality": {"type": "string", "enum": ["standard", "detail"], "default": "standard", "description": "detail reads the depth again at a larger size for finer edges; slower."}}),
    _tool("match_edges", "Cleans the edge of a cut-out layer so it sits on a new background: defringes (replaces the edge colours with those just inside) by width pixels, then decontaminates (removes the old background colour bled into the edge) by the given percent. One undo step; the layer needs pixels.",
          {"id": _ID, "width": {"type": "integer", "minimum": 1, "maximum": 20, "default": 2, "description": "Defringe width in pixels."}, "decontaminate": {"type": "number", "minimum": 0, "maximum": 100, "default": 100, "description": "Percent; 0 skips it."},
           "radius": {"type": "number", "minimum": 1, "maximum": 100, "default": 6, "description": "Decontaminate radius in pixels."}}, ["id"]),
    _tool("realism_pass", "Makes a pasted or generated layer sit in its picture in one undo step: matches its colours to what is beneath it (a clipped Curves layer), cleans its edge as match_edges does, and adds a grain layer on top so the whole picture shares one grain. Each part can be turned off.",
          {"id": _ID, "colour": {"type": "boolean", "default": True}, "amount": {"type": "number", "minimum": 0, "maximum": 1, "default": 0.8, "description": "How far the colours move toward the background."}, "edges": {"type": "boolean", "default": True},
           "grain": {"type": "string", "maxLength": 20, "default": "iso400", "description": "A grain preset id from apply_preset, or none."}}, ["id"]),
    _tool("compare", "Shows the document before and after its last steps in one picture: steps back through the history (1 to 50), split (before on the left of a white line at position percent, after on the right) or side_by_side. The history ends where it began; nothing changes.",
          {"steps": {"type": "integer", "minimum": 1, "maximum": 50, "default": 1}, "layout": {"type": "string", "enum": ["split", "side_by_side"], "default": "split"},
           "position": {"type": "number", "minimum": 5, "maximum": 95, "default": 50, "description": "Where the split line sits, percent from the left."}, "max_size": {"type": "integer", "minimum": 64, "maximum": 2048, "default": 1024}}, read=True, idempotent=True),
    _tool("set_status", "Puts a short note in the formvis status bar for the person to read (at most 160 characters), for seconds (1 to 600, default 60), or clears it with empty text. An error still shows first. Changes nothing in the document.",
          {"text": {"type": "string", "maxLength": 160}, "seconds": {"type": "number", "minimum": 1, "maximum": 600, "default": 60}}, ["text"], idempotent=True),
]
USE_WHEN = {
    "get_document": "you need the document's size, mode, layer ids or documents before any edit.",
    "get_image": "you need to see the picture, and again after each change to check it.",
    "new_document": "there is nothing open, or the person wants a blank canvas of a size.",
    "select": "an edit, fill or generative_fill should act on a region only.",
    "add_layer": "a change needs its own empty layer to paint or fill on.",
    "set_layer": "a layer should be renamed, hidden, faded, blended, or made the active one.",
    "delete_layer": "a layer is no longer wanted.",
    "fill": "a selection or layer should be one flat colour.",
    "add_adjustment": "colour or tone should change while staying editable.",
    "place_image": "another picture file should join the document as a layer.",
    "undo": "the last change was wrong; call it once per step to remove.",
    "redo": "an undo went too far.",
    "generative_fill": "something should be removed from or added to a selected region.",
    "generative_expand": "the canvas should grow and the new border be painted in.",
    "generate_image": "a whole new picture is wanted from a description.",
    "upscale": "the picture needs more pixels with detail kept.",
    "fal_models": "you need the fal models formvis may use, their roles and their inputs before choosing a model for generate_image, upscale or select_by_text.",
    "select_by_text": "a thing is named in words (a car, the sky, all the people) rather than drawn or picked by colour.",
    "remove_background": "the subject of the active layer should be kept and its background dropped.",
    "open_file": "the person gives a path to a picture or project to work on.",
    "save_project": "the work should be kept with layers still editable.",
    "export_image": "a flat PNG, JPEG or WebP is the deliverable.",
    "switch_document": "more than one document is open and another should be edited.",
    "resize_image": "the whole picture should be scaled to a size.",
    "resize_canvas": "space should be added or removed around the picture without scaling it.",
    "crop": "only a rectangle of the picture should remain.",
    "flip_canvas": "the whole document should be mirrored.",
    "transform_layer": "a layer should be moved, scaled, rotated or flipped.",
    "rasterize_layer": "a text, shape or smart object needs pixels before a filter or painting.",
    "duplicate_layer": "a layer should be copied, for example before a destructive change.",
    "move_layer": "the stacking order of layers should change.",
    "merge_layers": "several layers should become one.",
    "flatten_image": "the person wants everything on a single layer.",
    "add_text": "words should appear on the picture.",
    "draw_shape": "a plate, line, arrow or other shape is needed.",
    "select_subject": "the main subject should be selected without drawing a region.",
    "select_color_range": "a colour (a sky, a skin tone) should be selected.",
    "select_feather": "a selection's edge should fade, so a fill or edit blends in.",
    "select_grow": "a selection should be made a few pixels bigger or smaller.",
    "select_point": "an object should be selected by pointing at it rather than drawing around it.",
    "close_document": "an open document is finished with and its tab should go.",
    "ping": "you want to know whether formvis is running, connected and allowed before the first edit.",
    "list_plugins": "you need to know which plugins are installed and what commands they add.",
    "extensions_list": "you need to know which Form extensions are installed or in development and what commands they add.",
    "extension_command": "an installed Form extension has a command that does what the person asked.",
    "apply_filter": "a blur, sharpen, noise or other filter should change the active layer.",
    "set_adjustment": "an adjustment layer made earlier needs different settings.",
    "color_match": "a pasted layer should match the colours around or beneath it.",
    "add_film_layer": "a light leak, grain or other film look is wanted as its own layer.",
    "timeline_get": "you need to know the video timeline's state before changing it.",
    "timeline_create": "the document should become a video with a track per layer.",
    "timeline_delete": "the video timeline should go and the layers stay.",
    "timeline_set": "the frame rate, length, work area or loops of the video should change.",
    "timeline_go_to": "the window should show a moment of the video.",
    "timeline_clip": "a layer should appear later, last longer or be trimmed in the video.",
    "timeline_split": "a layer's clip should be cut in two at a frame.",
    "timeline_keyframe": "a layer's position, opacity or fill should animate.",
    "timeline_transition": "a clip should fade in or out.",
    "timeline_frame_image": "you need to see one frame of the video.",
    "timeline_render": "the video should be written to an mp4, gif or frame zip.",
    "list_commands": "the typed tools do not cover what the person asked and you need to find the formvis command that does.",
    "describe_command": "you found a command with list_commands and need its params before running it.",
    "run_command": "a command from list_commands should run once.",
    "run_commands": "several commands belong together and should undo as one step.",
    "get_selection": "you need the selection's bounds before filling, cropping or generating.",
    "get_layer_tree": "you need the layer ids and nesting without the other document details.",
    "select_mask": "a layer's pixels or mask should become the selection.",
    "list_settings": "you need to know how the window is set up before changing it.",
    "list_fonts": "you need a font family name that exists here before adding or changing text.",
    "file_info": "you need a file's size, mode, depth or layer count and no window needs to open it.",
    "improve_prompt": "a prompt for generate_image or generative_fill should be made more detailed or tidied before it is used.",
    "convert_file": "a picture file should become another format and nothing else about it changes.",
    "jobs_list": "you started local generation or upscaling and want to know what is running, or why a call is waiting.",
    "jobs_cancel": "a background job is no longer wanted.",
    "set_settings": "a simple setting in Preferences should change.",
    "ui_inspect": "you need to know what a button, panel or dialog in the window shows or whether it is enabled.",
    "ui_state": "you need the active tool, the view, the open dialogs or the window's size before acting on the window.",
    "ui_screenshot": "you need to see the canvas as the person does, or a panel or dialog of the window.",
    "ui_menu_list": "you need to find a menu item by its place in the menu bar.",
    "ui_menu_invoke": "a menu item should run by its path and no typed tool or command id is at hand.",
    "ui_set": "the tool, zoom, view centre, rotation, theme, panels, colours or mask target should change.",
    "ui_dialog": "a dialog is open and blocks edits: read its fields and answer it.",
    "ui_pointer": "a tool should be driven by pointer events a pen would send, with pressure and tilt, or by clicks and drags on the canvas.",
    "ui_key": "a shortcut should be pressed, or text typed into a focused field.",
    "ui_window": "the window's size should be read or changed, or it should take focus or full screen.",
    "control_call": "a client speaks the control protocol's dotted method names instead of tool names.",
    "file_roots": "you need to know which folders you may read and write, or how large a reply may be, before a file call.",
    "boxes_list": "you need to see the layout boxes before changing them or generating.",
    "boxes_add": "you want to say where a new, kept, moved or removed thing goes before generating.",
    "boxes_set": "a layout box needs another kind, description, name or place.",
    "boxes_remove": "one layout box is wrong and should go.",
    "boxes_from_selection": "a selection already marks the place a described thing should go.",
    "boxes_clear": "the layout boxes are finished with or should start over.",
    "sample_box": "you need the colour of an area or a layout box, for example to match a fill or a text colour.",
    "frequency_separation": "colour and tone should be retouched apart from texture, as in skin retouching.",
    "sample_depth": "you need how near or far the Depth Map says a point is.",
    "depth_edit": "the Depth Map layer needs flattening, shifting or smoothing before it is used.",
    "set_crop": "the crop needs a turn to straighten the horizon, or a fixed output size, or a frame that reaches past the edge.",
    "export_mask": "a selection or a layer's mask should be written as a PNG for another program.",
    "list_recipes": "you need to know which fill, generate, upscale or depth models are ready here before choosing one.",
    "set_active_layer": "several specific layers should be selected together before aligning or grouping them.",
    "select_color": "a region of one colour should be selected from a point, contiguous or everywhere.",
    "select_shape": "an ellipse or polygon, or a soft-edged shape, should be selected.",
    "select_range": "a range of hue, tone, luminosity or depth should be selected.",
    "sample_mean_color": "you need the mean colour of the selection, a layer or the picture.",
    "align_layers": "layers should line up or be spread evenly.",
    "group_layers": "several layers should become one group.",
    "set_group": "a group should be renamed, hidden, locked or collapsed.",
    "set_mask": "a layer mask should be added, inverted, copied, turned off or removed.",
    "set_text": "the words or style of a text layer should change.",
    "list_history": "you need the undo steps or snapshots before going back.",
    "take_snapshot": "a state of the document should be kept to return to later.",
    "restore_snapshot": "the document should return to a snapshot.",
    "delete_snapshot": "a snapshot is no longer wanted.",
    "extend_canvas": "different amounts of space should be added on each side.",
    "export_layer": "one layer alone should be written as a transparent PNG.",
    "read_log": "something failed in the window and you need the error log.",
    "list_brush_tips": "you need the brush presets and tips before choosing one.",
    "set_brush": "the brush size, hardness, opacity, flow, preset or tip should change before painting.",
    "add_filter": "a filter should stay editable on a layer.",
    "set_filter": "a smart filter needs other settings, or should be turned off or removed.",
    "apply_preset": "a grain, gradient map or photo filter look should be applied by name, or a saved adjustment preset reused.",
    "depth_from_layer": "the depth should come from one layer alone rather than the whole picture, and you need to know it finished.",
    "select_by_depth": "the foreground, the background or a slice of distance should be selected, or an edit limited to it.",
    "match_edges": "a cut-out layer shows a fringe of its old background at its edge.",
    "realism_pass": "a pasted or generated layer looks stuck on and should sit in the picture.",
    "compare": "you want to see what the last step or steps changed, before beside after.",
    "set_status": "the person should be told in the formvis window what you are doing.",
    "command_job": "you started a command with wait false and need its result.",
}
TOOLS.extend(PACK_TOOLS)
USE_WHEN.update(PACK_USE_WHEN)
for _t in TOOLS:
    _t["description"] += f" Use when {USE_WHEN[_t['name']]}"
CORE = {"get_document", "get_image", "get_selection", "get_layer_tree", "new_document", "open_file", "save_project", "export_image", "select", "add_layer", "set_layer",
        "delete_layer", "fill", "place_image", "undo", "redo", "generative_fill", "remove_background", "resize_image", "crop", "transform_layer", "add_text", "draw_shape",
        "select_subject", "apply_filter", "add_adjustment", "set_adjustment", "list_commands", "describe_command", "run_command", "run_commands"}
NAMES = {t["name"] for t in TOOLS}
SCHEMAS = {t["name"]: t["inputSchema"] for t in TOOLS}


def _shown(value) -> str:
    text = json.dumps(value) if not isinstance(value, str) else repr(value)
    return text if len(text) <= 60 else text[:57] + "..."


def _typed(value, kind: str | None) -> bool:
    if kind == "string":
        return isinstance(value, str)
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "integer":
        return (isinstance(value, int) and not isinstance(value, bool)) or (isinstance(value, float) and value.is_integer())
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if kind == "object":
        return isinstance(value, dict)
    if kind == "array":
        return isinstance(value, list)
    return True


def _invalid(value, schema: dict, where: str) -> str | None:
    """Why `value` does not fit `schema` (the part of a tool's inputSchema this server uses), naming the argument; None when it fits."""
    import re
    kind = schema.get("type")
    if not _typed(value, kind):
        return f"Argument {where} must be {'an' if kind in ('integer', 'object', 'array') else 'a'} {kind}, not {_shown(value)}."
    if "enum" in schema and value not in schema["enum"]:
        return f"Argument {where} is {_shown(value)}, which is not allowed; use one of: {', '.join(str(v) for v in schema['enum'])}."
    if isinstance(value, str):
        if len(value) > schema.get("maxLength", len(value)):
            return f"Argument {where} is {len(value)} characters; the most allowed is {schema['maxLength']}."
        if "pattern" in schema and not re.search(schema["pattern"], value):
            return f"Argument {where} is {_shown(value)}, which does not match the form {schema.get('description') or schema['pattern']}."
    if kind in ("integer", "number"):
        if "minimum" in schema and value < schema["minimum"]:
            return f"Argument {where} is {_shown(value)}; the least allowed is {schema['minimum']}."
        if "maximum" in schema and value > schema["maximum"]:
            return f"Argument {where} is {_shown(value)}; the most allowed is {schema['maximum']}."
    if kind == "array":
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", len(value)):
            return f"Argument {where} has {len(value)} items; it takes {schema.get('minItems', 0)} to {schema.get('maxItems', 'any number')}."
        for i, item in enumerate(value):
            if "items" in schema and (why := _invalid(item, schema["items"], f"{where}[{i}]")):
                return why
    if kind == "object" and "properties" in schema:
        props = schema["properties"]
        for key in value:
            if key not in props and schema.get("additionalProperties") is False:
                return f"Unknown argument {where + '.' if where else ''}{key}; allowed: {', '.join(props) or 'none'}."
        for key in schema.get("required", []):
            if key not in value:
                return f"Missing required argument {where + '.' if where else ''}{key}."
        for key, item in value.items():
            if key in props and (why := _invalid(item, props[key], f"{where + '.' if where else ''}{key}")):
                return why
    return None

# The bridge to the window: requests queued here, collected by the window, answered back.
_pending: collections.deque = collections.deque()
_ready: asyncio.Event | None = None
_waiting: dict[str, asyncio.Future] = {}
_ids = itertools.count(1)
_seen = 0.0
LIVE = 30.0
_taken: dict[str, float] = {}   # requests the window took and has not answered yet: id, when taken
# Seamless start (1.53.3): the window polls whether or not agents are allowed, saying which; with agents not allowed
# the first request asks the person in the window; with no window, formvis is opened in the browser and waited for.
_allowed = False
_declined_until = 0.0
_opened_at = 0.0
# Calls waiting on the window, by (client, JSON-RPC request id), so notifications/cancelled can stop one.
_inflight: dict[tuple[str, str], asyncio.Task] = {}
_cancelled: set[tuple[str, str]] = set()


def _event() -> asyncio.Event:
    global _ready
    if _ready is None:
        _ready = asyncio.Event()
    return _ready


def _put(item: dict, front: bool = False) -> None:
    (_pending.appendleft if front else _pending.append)(item)
    _event().set()


def _local_origin(origin: str | None) -> bool:
    if not origin:
        return True   # not a browser page
    host = urllib.parse.urlparse(origin).hostname or ""
    return host in ("localhost", "127.0.0.1", "::1", "tauri.localhost") or origin.startswith("tauri://")


CACHE_HINTS = {"ttlMs": 300_000, "cacheScope": "public"}


def _ok(req_id, result: dict, modern: bool, cacheable: bool = False) -> dict:
    extra = {"resultType": "complete", **(CACHE_HINTS if cacheable else {})} if modern else {}
    return {"jsonrpc": "2.0", "id": req_id, "result": {**result, **extra}}


def _err(req_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def _live() -> bool:
    """A window polled lately, or is working through a call it took (for as long as _ask waits, 600 s)."""
    now = time.monotonic()
    return (_seen > 0 and now - _seen <= LIVE) or any(now - t < 600 for t in _taken.values())


def _fail(text: str) -> dict:
    return {"content": [{"type": "text", "text": text}], "isError": True}


def _open_window() -> bool:
    """formvis opened in the browser, at most once a minute; not in the desktop app (it is the window) or when
    FORMVIS_OPEN_WINDOW=0 (tests, headless machines)."""
    global _opened_at
    if os.environ.get("FORMVIS_OPEN_WINDOW", "1") == "0" or config.is_desktop() or (_opened_at > 0 and time.monotonic() - _opened_at < 60):
        return False
    _opened_at = time.monotonic()
    import webbrowser
    url = f"http://127.0.0.1:{int(os.environ.get('FORMVIS_PORT') or 0) or config.BACKEND_PORT}/" if config.dist_dir() else f"http://localhost:{config.FRONTEND_PORT}/"
    try:
        return bool(webbrowser.open(url))
    except Exception:
        return False


_sink: contextvars.ContextVar = contextvars.ContextVar("progress_sink", default=None)   # the queue of a call whose client asked for progress
_sinks: dict[str, asyncio.Queue] = {}   # window request id: where that call's progress goes
_inapp_call: contextvars.ContextVar = contextvars.ContextVar("inapp_call", default=False)   # the call is the Claude Code the window's own terminal dock started


async def _ask(name: str, args: dict, timeout: float) -> dict | None:
    rid = str(next(_ids))
    fut = asyncio.get_running_loop().create_future()
    _waiting[rid] = fut
    if _sink.get() is not None:
        _sinks[rid] = _sink.get()
    item = {"id": rid, "name": name, "arguments": args, **({"inapp": True} if _inapp_call.get() else {})}
    _put(item)
    try:
        return await asyncio.wait_for(fut, timeout=timeout)
    except asyncio.TimeoutError:
        return None
    finally:
        _waiting.pop(rid, None)
        _sinks.pop(rid, None)
        _taken.pop(rid, None)
        if item in _pending:   # timed out or cancelled before the window took it: it must not run later
            _pending.remove(item)


async def _until_gone(request: Request, task: asyncio.Future) -> bool:
    """Waits for a call's task. When the HTTP caller hangs up first (a CLI killed or timed out) the task is cancelled, which
    drops its queued window request, and True is returned; False when the task finished."""
    while not task.done():
        await asyncio.wait({task}, timeout=0.5)
        if not task.done() and await request.is_disconnected():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            return True
    return False


# Files at absolute paths (1.53.3): read and written here, the window doing the picture's part.
_PICTURES = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".tif", ".tiff", ".heic", ".heif", ".bmp", ".qoi", ".tga", ".ico", ".pbm", ".pgm", ".ppm", ".pnm", ".pam", ".dng", ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2"}
_PROJECTS = {".fvd", ".fmv", ".psd", ".psb", ".ora"}
_EXPORTS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".psd": "psd", ".psb": "psb", ".ora": "ora",
            ".tif": "tiff", ".tiff": "tiff", ".tga": "tga", ".dpx": "dpx", ".bmp": "bmp", ".exr": "exr", ".hdr": "hdr"}
_ENCODED = {"tiff", "tga", "dpx", "bmp"}   # the window sends a PNG and the engine writes these
_MAX_OPEN = 512 * 1024 * 1024
_opened: dict[str, str] = {}   # document id: the file open_file read it from, for writing back to it
_FILES = {"open_file": (_PICTURES | _PROJECTS | {".svg"}, True), "place_image": ({".png", ".jpg", ".jpeg", ".webp", ".svg"}, True), "glb_place": ({".glb", ".gltf"}, True), "glb_info": ({".glb", ".gltf"}, True), "timeline_render": ({".mp4", ".gif", ".zip"}, False),
          "save_project": ({".fvd"}, False), "export_image": (set(_EXPORTS), False), "export_mask": ({".png"}, False), "export_layer": ({".png"}, False)}   # tool: the suffixes it takes, whether it reads


def _system_roots() -> list[str]:
    """The folders agents may not read or write: the operating system's own, outside the user's home and the temp folder."""
    if os.name == "nt":
        return [os.environ.get("SystemRoot", "C:\\Windows"), os.environ.get("ProgramFiles", "C:\\Program Files"), os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")]
    return ["/etc", "/bin", "/sbin", "/usr", "/System", "/Library", "/private/etc", "/private/var", "/var", "/boot", "/dev", "/proc", "/sys"]


def _inside(path: Path, root) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _confined(path: Path) -> None:
    """Refuses a system location. `path` is already resolved, so a link into one is caught."""
    import tempfile
    key = (lambda p: Path(os.path.normcase(str(p)))) if os.name == "nt" else Path
    here = key(path)
    roots = [r for r in os.environ.get("FORMVIS_AGENT_ROOTS", "").split(os.pathsep) if r.strip()] or agents.limits()["roots"]   # when set (by the environment, else by the person), the only folders agents may read or write
    if roots and not any(_inside(here, key(Path(os.path.expanduser(r)).resolve())) for r in roots):
        raise ValueError(f"{path} is outside the folders agents may use here ({', '.join(roots)}). Choose a file inside one of them; file_roots lists them; the person sets them with FORMVIS_AGENT_ROOTS or POST /api/agents/limits.")
    exempt =[key(Path.home().resolve()), key(Path(tempfile.gettempdir()).resolve())] + ([key(Path("/var/tmp").resolve()), key(Path("/private/var/tmp").resolve())] if os.name != "nt" else [])
    for root in _system_roots():
        base = key(Path(root).resolve())
        if _inside(here, base) and not any(_inside(here, ok) and not _inside(base, ok) for ok in exempt):
            raise ValueError(f"{path} is in a system location ({root}); formvis does not read or write there. Choose a folder of your own, such as your Pictures or Documents folder.")


def _path(raw, kinds: set, reading: bool, overwrite: bool = False) -> Path:
    path = Path(os.path.expanduser(str(raw or "").strip()))
    if not str(raw or "").strip() or not path.is_absolute():
        raise ValueError("Give an absolute path, for example /Users/you/Pictures/photo.png (~ works too).")
    if path.suffix.lower() not in kinds:
        raise ValueError(f"{path.name}: formvis takes {', '.join(sorted(kinds))} here.")
    path = path.resolve()
    _confined(path)
    if path.suffix.lower() not in kinds:
        raise ValueError(f"{path.name}: the link leads to a file formvis does not take here ({', '.join(sorted(kinds))}).")
    if reading and not path.is_file():
        raise ValueError(f"There is no file at {path}.")
    if not reading and not path.parent.is_dir():
        raise ValueError(f"The folder {path.parent} does not exist: create it first, or choose another.")
    if not reading and os.path.lexists(path) and overwrite is not True:
        raise ValueError(f"{path} already exists, and formvis does not replace a file unless overwrite is true. Choose another name, or call again with overwrite true if the person wants it replaced.")
    return path


# Headless tools: the engine reads and writes pictures itself, with no window.
_CONVERT = {".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp", ".avif": "avif", ".tif": "tiff", ".tiff": "tiff", ".bmp": "bmp", ".qoi": "qoi", ".tga": "tga",
            ".ico": "ico", ".pdf": "pdf", ".ppm": "pnm", ".pgm": "pnm", ".pbm": "pnm", ".pnm": "pnm", ".dpx": "dpx", ".fits": "fits", ".wbmp": "wbmp"}
_READABLE = _PICTURES | {".dpx", ".cin", ".fits", ".fit"}
_PSD_MODES = {0: "bitmap", 1: "grayscale", 2: "indexed", 3: "rgb", 4: "cmyk", 7: "multichannel", 8: "duotone", 9: "lab"}


def _convert_paths(args: dict) -> tuple[Path, Path]:
    src = _path(args.get("path"), _READABLE, True)
    dst = _path(args.get("output_path"), set(_CONVERT), False, args.get("overwrite"))
    if dst == src:
        raise ValueError("output_path is the same file as path: choose another name.")
    return src, dst


def _convert(args: dict) -> dict:
    from app.services import imaging
    src, dst = _convert_paths(args)
    if src.stat().st_size > _MAX_OPEN:
        raise ValueError(f"{src.name} is larger than 512 MB.")
    fmt = _CONVERT[dst.suffix.lower()]
    options = dict(args.get("options") or {})
    if fmt == "pnm":
        options.setdefault("kind", dst.suffix.lower().lstrip(".") if dst.suffix.lower() in (".ppm", ".pgm", ".pbm") else "ppm")
    try:
        raw = src.read_bytes()
        png, width, height = imaging.decode_to_png(raw, src.name, int(args.get("page", 0)))
        if fmt == "avif":
            options = {**imaging.source_meta(raw), **options}
        blob = imaging.encode(png, fmt, int(round(float(args.get("quality", 0.92)) * 100)), int(args.get("dpi", 72)), None, options)
    except imaging.DecodeError as exc:
        raise ValueError(str(exc)) from exc
    dst.write_bytes(blob)
    return {"path": str(dst), "source": str(src), "format": fmt, "width": width, "height": height, "bytes": len(blob)}


def _depth_of(mode: str) -> int:
    return 16 if mode.startswith("I;16") or mode == "I" else 32 if mode == "F" else 1 if mode == "1" else 8


def _info(args: dict) -> dict:
    import struct
    import zipfile
    src = _path(args.get("path"), _READABLE | _PROJECTS, True)
    suffix = src.suffix.lower()
    info: dict = {"path": str(src), "name": src.name, "bytes": src.stat().st_size, "kind": "project" if suffix in _PROJECTS else "picture"}
    if suffix in (".psd", ".psb"):
        try:
            with open(src, "rb") as f:
                sig, ver, _, channels, height, width, depth, mode = struct.unpack(">4sH6sHIIHH", f.read(26))
                if sig != b"8BPS":
                    raise ValueError(f"{src.name} is not a PSD file.")
                big = ver == 2
                for _skip in range(2):   # the colour mode data, then the image resources
                    f.seek(struct.unpack(">I", f.read(4))[0], 1)
                wide = 8 if big else 4
                section = struct.unpack(">Q" if big else ">I", f.read(wide))[0]
                layers = 0
                if section:
                    inner = struct.unpack(">Q" if big else ">I", f.read(wide))[0]
                    layers = abs(struct.unpack(">h", f.read(2))[0]) if inner else 0
        except struct.error as exc:
            raise ValueError(f"{src.name} is not a readable PSD: {exc}") from exc
        info.update(width=width, height=height, mode=_PSD_MODES.get(mode, str(mode)), depth=depth, channels=channels, layers=layers)
    elif suffix in (".fvd", ".fmv", ".ora"):
        try:
            with zipfile.ZipFile(src) as z:
                names = z.namelist()
                if suffix == ".ora":
                    import re
                    stack = z.read("stack.xml").decode("utf-8", "replace")
                    size = re.search(r'<image[^>]*\bw="(\d+)"[^>]*\bh="(\d+)"', stack) or re.search(r'<image[^>]*\bh="(\d+)"[^>]*\bw="(\d+)"', stack)
                    info.update(layers=len(re.findall(r"<layer\b", stack)), **({"width": int(size.group(1)), "height": int(size.group(2))} if size else {}))
                else:
                    manifest = json.loads(z.read(next(n for n in names if n.endswith("manifest.json"))))
                    layers = manifest.get("layers") or []
                    info.update(width=manifest.get("width"), height=manifest.get("height"), layers=len(layers), groups=sum(1 for l in layers if l.get("isGroup")),
                                **{k: manifest[k] for k in ("mode", "depth", "profile", "resolution") if k in manifest})
        except (zipfile.BadZipFile, KeyError, StopIteration, ValueError, AttributeError, TypeError) as exc:
            raise ValueError(f"{src.name} is not a readable project: {exc}") from exc
    else:
        from PIL import Image
        from app.services import imaging
        try:
            with Image.open(src) as im:
                mode = im.mode
                info.update(width=im.width, height=im.height, format=im.format, mode={"RGB": "rgb", "RGBA": "rgb", "L": "grayscale", "LA": "grayscale", "CMYK": "cmyk", "LAB": "lab", "P": "indexed", "1": "bitmap"}.get(mode, mode),
                            alpha="A" in mode or "transparency" in im.info, depth=_depth_of(mode), pages=getattr(im, "n_frames", 1), profile=bool(im.info.get("icc_profile")))
                if im.info.get("dpi"):
                    info["dpi"] = [round(float(v), 2) for v in im.info["dpi"]]
        except Exception as exc:
            data = src.read_bytes() if src.stat().st_size <= _MAX_OPEN else b""
            if data and imaging.is_raw(data, src.name):
                info.update(format="raw", **imaging.raw_info(data, src.name))
            else:
                raise ValueError(f"{src.name} could not be read as a picture: {exc}") from exc
    return info


def _jobs_listing(status: str = "all", limit: int = 50) -> list[dict]:
    from app.localgen import jobs
    with jobs._lock:
        rows = [{"id": j["id"], "source": "local", "kind": j.get("kind"), "status": j["status"], "progress": round(float(j.get("progress", 0)), 3), "message": j.get("message", ""),
                 "created": j.get("created", 0)} for j in jobs._jobs.values()]
    rows += [{"id": f"call:{e['id']}", "source": "agent", "kind": e["tool"], "status": e["status"], "progress": None, "message": e.get("message") or e.get("summary", ""), "created": e["t"], "client": e["client"]}
             for e in agents.activity(200) if e["status"] in ("running", "waiting") and e["tool"] != "jobs_list"]
    live = ("queued", "running", "waiting")
    rows = [r for r in rows if status == "all" or (r["status"] in live) == (status == "active")]
    return sorted(rows, key=lambda r: r["created"], reverse=True)[:limit]


def _jobs_cancel(args: dict) -> dict:
    from app.localgen import jobs
    with jobs._lock:
        wanted = [k for k, j in jobs._jobs.items() if j["status"] in ("queued", "running")] if args.get("all") else [args["id"]] if args.get("id") in jobs._jobs else []
        for k in wanted:
            jobs._jobs[k]["cancel"].set()
    waiting = agents.stop(None) if args.get("all") else 0
    return {"cancelled": wanted, "approvals_stopped": waiting}


def _refused(name: str, args: dict) -> str | None:
    """Why a call's file path is refused (system location, existing file without overwrite, wrong kind), checked before the
    person is asked to approve anything; None when the path is fine or the tool has none."""
    if name == "convert_file":
        try:
            _convert_paths(args)
        except (ValueError, OSError) as exc:
            return str(exc)
        return None
    if name not in _FILES or (name in ("place_image", "glb_place", "glb_info") and not args.get("path")):
        return None
    kinds, reading = _FILES[name]
    try:
        _path(args.get("path"), kinds, reading, args.get("overwrite"))
    except (ValueError, OSError) as exc:
        return str(exc)
    return None


async def _run(name: str, args: dict) -> dict:
    """A tool call: files at paths handled here, around the window's part; everything else in the window."""
    try:
        if name == "ping":   # attach-only: answers with no window and asks nobody
            info: dict = {"version": __version__, "window": _live(), "allowed": _allowed or _inapp_call.get(), "documents": []}
            if info["window"] and info["allowed"]:
                seen = (await _ask("ping", {}, 10) or {}).get("structuredContent") or {}
                info["documents"] = seen.get("documents", [])
                info["active"] = seen.get("active")
            state = ("the window is open and agents are allowed" if info["window"] and info["allowed"] else "the window is open but outside agents are not allowed (the first edit asks the person)" if info["window"]
                     else "no window is open (the first edit opens one)")
            return {"content": [{"type": "text", "text": f"formvis {__version__}: {state}; {len(info['documents'])} open document{'' if len(info['documents']) == 1 else 's'}."}], "structuredContent": info}
        if name == "fal_models":
            shown = fal_run.listing()
            wanted, found = args.get("role"), args.get("model")
            if found:
                hit = next((m for m in shown["models"] if m["id"] == found), None)
                if hit is None:
                    return _fail(f"{found} is not in the formvis catalogue: call fal_models without model for the list.")
                keep = ("key", "type", "required", "default", "enum", "min", "max", "maxItems")
                data = {"ready": shown["ready"], "model": {"id": hit["id"], "label": hit["label"], "role": hit["role"], "inputs": [{k: i[k] for k in keep if k in i} for i in hit["inputs"]]}}
                return {"content": [{"type": "text", "text": f"{hit['label']} ({hit['role']}): {len(hit['inputs'])} inputs. {json.dumps(data['model']['inputs'])}"}], "structuredContent": data}
            rows = [{"id": m["id"], "label": m["label"], "role": m["role"], "inputs": [i["key"] for i in m["inputs"]]} for m in shown["models"] if not wanted or m["role"] == wanted]
            said = f"{len(rows)} fal model{'' if len(rows) == 1 else 's'}" + (f" of role {wanted}" if wanted else "") + ("" if shown["ready"] else "; fal has no key yet, the person adds one in Edit > Generative Fill") + "."
            return {"content": [{"type": "text", "text": said + " " + json.dumps(rows)}], "structuredContent": {"ready": shown["ready"], "roles": _FAL_ROLES, "models": rows}}
        if name == "file_roots":
            lim = agents.limits()
            env = [r for r in os.environ.get("FORMVIS_AGENT_ROOTS", "").split(os.pathsep) if r.strip()]
            data = {"roots": env or lim["roots"], "restricted": bool(env or lim["roots"]), "system_folders_refused": _system_roots(), "text_chars": lim["text_chars"], "image_bytes": lim["image_bytes"], "request_bytes": MAX_BODY, "reply_bytes": MAX_REPLY, "calls_per_client": MAX_PER_CLIENT, "idle_session_seconds": int(agents.SESSION_IDLE), "consent_seconds": 180}
            said = f"Agents may use files inside {', '.join(data['roots'])} only." if data["restricted"] else "No folders are set, so agents may use any folder except the system's own."
            return {"content": [{"type": "text", "text": f"{said} A reply carries at most {data['text_chars']:,} characters of text and {data['image_bytes']:,} bytes of one picture."}], "structuredContent": data}
        if name == "file_info":
            info = await asyncio.to_thread(_info, args)
            return {"content": [{"type": "text", "text": json.dumps(info)}], "structuredContent": info}
        if name == "improve_prompt":
            from app.services import llm
            try:
                made = await asyncio.to_thread(llm.improve_with_template, str(args.get("prompt") or ""), str(args.get("template") or ""))
            except llm.LlmError as exc:
                return _fail(str(exc))
            return {"content": [{"type": "text", "text": made["prompt"]}], "structuredContent": made}
        if name == "convert_file":
            made = await asyncio.to_thread(_convert, args)
            return {"content": [{"type": "text", "text": f"Wrote {made['path']} ({made['bytes']:,} bytes, {made['width']} by {made['height']}, {made['format']})."}], "structuredContent": made}
        if name == "jobs_list":
            rows = _jobs_listing(args.get("status", "all"), int(args.get("limit", 50)))
            if _live() and (_allowed or _inapp_call.get()) and args.get("status", "all") != "finished":
                seen = (await _ask("__jobs", {}, 5) or {}).get("structuredContent") or {}
                rows = [*(r for r in seen.get("jobs", []) if isinstance(r, dict)), *rows][:int(args.get("limit", 50))]
            return {"content": [{"type": "text", "text": f"{len(rows)} job{'' if len(rows) == 1 else 's'}. {json.dumps(rows)}"}], "structuredContent": {"jobs": rows}}
        if name == "jobs_cancel":
            if not args.get("all") and not args.get("id"):
                return _fail("Give the job id from jobs_list, or all true to cancel every active job.")
            done = _jobs_cancel(args)
            if (args.get("all") or str(args.get("id", "")).startswith("window:")) and _live() and (_allowed or _inapp_call.get()):
                stopped = (await _ask("__job_stop", {"id": args.get("id") if not args.get("all") else None}, 5) or {}).get("structuredContent") or {}
                done["cancelled"] += [f"window:{i}" for i in stopped.get("stopped", [])]
            if not done["cancelled"] and not done["approvals_stopped"]:
                return _fail("No active job matches. Call jobs_list for the ids.")
            return {"content": [{"type": "text", "text": f"Asked {len(done['cancelled'])} job{'' if len(done['cancelled']) == 1 else 's'} to stop."}], "structuredContent": done}
        if name == "open_file":
            path = _path(args.get("path"), _FILES[name][0], True)
            if path.stat().st_size > _MAX_OPEN:
                return _fail(f"{path.name} is larger than 512 MB.")
            data = await asyncio.to_thread(lambda: base64.b64encode(path.read_bytes()).decode())
            out = await _call("__open", {"name": path.name, "data": data, **{k: args[k] for k in ("into", "svg_width", "reference") if k in args}})
            opened = (out.get("structuredContent") or {}).get("id") if not out.get("isError") and args.get("into") != "layer" else None
            if isinstance(opened, str):
                _opened[opened] = str(path)
            return out
        if name == "place_image" and args.get("path"):
            path = _path(args.get("path"), _FILES[name][0], True)
            if path.stat().st_size > _MAX_OPEN:
                return _fail(f"{path.name} is larger than 512 MB.")
            data = await asyncio.to_thread(lambda: base64.b64encode(path.read_bytes()).decode())
            args = {**{k: v for k, v in args.items() if k != "path"}, "data": data, "name": args.get("name") or path.stem[:120]}
        elif name == "place_image" and not args.get("data"):
            return _fail("Give place_image a path (an absolute path to the image file) or data (base64).")
        if name in ("glb_place", "glb_info") and args.get("path"):
            path = _path(args.get("path"), _FILES[name][0], True)
            if path.stat().st_size > _MAX_OPEN:
                return _fail(f"{path.name} is larger than 512 MB.")
            data = await asyncio.to_thread(lambda: base64.b64encode(path.read_bytes()).decode())
            args = {**{k: v for k, v in args.items() if k != "path"}, "data": data, **({"name": args.get("name") or path.stem[:120]} if name == "glb_place" else {})}
        if name == "timeline_render":   # 1.59.7, DEV_PLAN 25.5: the window renders, this writes
            path = _path(args.get("path"), _FILES[name][0], False, args.get("overwrite"))
            out = await _call("__render", {"format": {".mp4": "mp4", ".gif": "gif", ".zip": "png"}[path.suffix.lower()],
                                           **{k: args[k] for k in ("from", "to", "scale") if k in args}})
            data = (out.get("structuredContent") or {}).get("data") if not out.get("isError") else None
            if not data:
                return out if out.get("isError") else _fail("formvis rendered nothing.")
            blob = await asyncio.to_thread(base64.b64decode, data)
            await asyncio.to_thread(path.write_bytes, blob)
            return {"content": [{"type": "text", "text": f"Wrote {path} ({len(blob):,} bytes)."}], "structuredContent": {"path": str(path), "bytes": len(blob)}}
        if name in ("export_mask", "export_layer"):
            path = _path(args.get("path"), _FILES[name][0], False, args.get("overwrite"))
            out = await _call("__mask" if name == "export_mask" else "__layer", {k: args[k] for k in ("source", "id", "trim") if k in args})
            data = (out.get("structuredContent") or {}).get("data") if not out.get("isError") else None
            if not data:
                return out if out.get("isError") else _fail("formvis gave nothing to write.")
            blob = await asyncio.to_thread(base64.b64decode, data)
            await asyncio.to_thread(path.write_bytes, blob)
            return {"content": [{"type": "text", "text": f"Wrote {path} ({len(blob):,} bytes)."}], "structuredContent": {"path": str(path), "bytes": len(blob)}}
        if name in ("save_project", "export_image"):
            path = _path(args.get("path"), _FILES[name][0], False, args.get("overwrite"))
            kind = _EXPORTS.get(path.suffix.lower(), "")
            ask: dict = {}
            if name == "export_image":
                wire = "image/png" if kind in _ENCODED and not (kind == "tiff" and args.get("layers")) else "tiff-layers" if kind == "tiff" else kind
                ask = {"type": wire, "quality": args.get("quality", 0.92), "scale": args.get("scale", 1), **{k: args[k] for k in ("metadata", "exr_compression", "half") if k in args}}
                if args.get("layers") and kind != "tiff":
                    return _fail("layers is for a TIFF: .psd, .psb and .ora keep layers by themselves, and the other formats are flat.")
            out = await _call("__project" if name == "save_project" else "__export", ask)
            data = (out.get("structuredContent") or {}).get("data") if not out.get("isError") else None
            if not data:
                return out if out.get("isError") else _fail("formvis gave nothing to write.")
            blob = await asyncio.to_thread(base64.b64decode, data)
            if name == "export_image" and kind in _ENCODED and not args.get("layers"):
                from app.services import imaging
                try:
                    blob = await asyncio.to_thread(imaging.encode, blob, kind, int(round(float(args.get("quality", 0.92)) * 100)), int(args.get("dpi", 72)), None, dict(args.get("options") or {}))
                except imaging.DecodeError as exc:
                    return _fail(str(exc))
            await asyncio.to_thread(path.write_bytes, blob)
            return {"content": [{"type": "text", "text": f"Wrote {path} ({len(blob):,} bytes)."}], "structuredContent": {"path": str(path), "bytes": len(blob)}}
    except ValueError as exc:
        return _fail(str(exc))
    except OSError as exc:
        return _fail(f"Could not {'read' if name in ('open_file', 'place_image', 'glb_place', 'glb_info') else 'write'} the file: {exc.strerror or exc}.")
    return await _call(name, args)


async def _call(name: str, args: dict) -> dict:
    """Runs a tool in the window; its MCP result. formvis is opened if no window is, and the person asked once if
    outside agents are not allowed; each failure says what to do next."""
    global _allowed, _declined_until
    if not _live() and _seen and time.monotonic() - _seen < 300:
        # A window that was here minutes ago is reloading or busy (1.53.3): waited for, not replaced or refused.
        for _ in range(80):
            await asyncio.sleep(0.25)
            if _live():
                break
    if not _live():
        if _open_window():
            for _ in range(90):
                await asyncio.sleep(0.5)
                if _live():
                    break
        if not _live():
            return _fail("formvis is not open. Start it with ./formvis boot (or open the formvis app), then retry.")
    if not _allowed and not _inapp_call.get():
        if time.monotonic() < _declined_until:
            return _fail("The person chose not to allow outside agents in formvis just now. Ask them to turn on Allow outside agents (Preferences > Plugins), then retry.")
        answer = await _ask("__consent__", {}, 180)
        if not (answer or {}).get("allowed"):
            _declined_until = time.monotonic() + 600
            return _fail("The person did not allow outside agents in formvis. Ask them to allow it (the question in the formvis window, or Preferences > Plugins), then retry.")
        _allowed = True
    out = await _ask(name, args, 600)   # a generative call waits for the person and the model
    return out if out is not None else _fail("formvis did not answer in time: it may be busy with a long task. Check the formvis window, then retry.")


WINDOW_ONLY = ("terminal.", "claudecode.", "chat.", "agent.claude", "agent.chat")   # the terminal dock, its Chat tab and Claude Code are the person's own: no agent reaches them through a command


async def _command_ids(name: str, args: dict) -> list:
    """The catalogue commands a call would run: run_command's, run_commands' and the one a menu path of ui_menu_invoke names."""
    if name == "ui_menu_invoke":
        found = await _call("__menu_id", {"path": args.get("path", "")})
        return [(found.get("structuredContent") or {}).get("id")] if not found.get("isError") else []
    return [args.get("id")] if name == "run_command" else [c.get("id") for c in args.get("commands") or [] if isinstance(c, dict)] if name == "run_commands" else []


async def _window_only(name: str, args: dict) -> str | None:
    """Why a command is refused to every agent, the in-app Claude Code included; None when none of the call's commands is the window's own."""
    hit = next((i for i in await _command_ids(name, args) if isinstance(i, str) and i.strip().lower().startswith(WINDOW_ONLY)), None)
    return f"{hit} is only available in the formvis window, so a person runs it. Do not retry." if hit else None


async def _risk(name: str, args: dict) -> str | None:
    """Why a call cannot be undone (a file written, or a catalogue command marked risky); None when Undo covers it."""
    if name in agents.RISKY_TOOLS and (name != "convert_file" or args.get("overwrite") is True):   # a new file replaces nothing
        return f"{name} {agents.RISKY_TOOLS[name]} at {args.get('output_path') or args.get('path', 'a path')}, which Undo cannot restore"
    if name == "ui_window" and args.get("action") == "quit":
        return "ui_window quit closes formvis, which Undo cannot reverse"
    for cid in dict.fromkeys(i for i in await _command_ids(name, args) if isinstance(i, str)):   # a menu path is judged as the command it names
        out = await _call("describe_command", {"id": cid})
        meta = out.get("structuredContent") or {}
        if not out.get("isError") and meta.get("risky"):
            return f"the command {meta.get('label') or cid} is marked risky: Undo cannot reverse it"
    return None


async def _write_back(name: str) -> str:
    """The file the active document was opened from, for a save or export with no path; a ValueError says what to do when there is none."""
    seen = (await _call("ping", {})).get("structuredContent") or {}
    path = _opened.get(seen.get("active") or "")
    if not path:
        raise ValueError("Give a path: the active document was not opened from a file with open_file, so there is no file to write back to.")
    suffix = Path(path).suffix.lower()
    if name == "save_project" and suffix != ".fvd":
        raise ValueError(f"The active document came from {Path(path).name}, which save_project cannot write (it writes .fvd). Call export_image with no path to write it back as a picture, or give a .fvd path.")
    if name == "export_image" and suffix not in _EXPORTS:
        raise ValueError(f"The active document came from {Path(path).name}, which export_image cannot write. Give a path ending in one of {', '.join(sorted(_EXPORTS))}.")
    return path


async def _agent_call(client: str, name: str, args: dict, cli: bool = False) -> dict:
    """A tool call as an outside agent's: refused when agents are off or this client is denied, held for the person's
    approval when it is risky under the Ask policy, and noted in the activity feed either way. The Claude Code the window's own
    terminal dock started (agents.INAPP_CLIENT, known by its per-run token) is not asked whether outside agents may edit."""
    _inapp_call.set(client == agents.INAPP_CLIENT)
    if name == "control_call":   # a dotted method name is the typed tool under another name, checked against that tool's schema
        target = CONTROL_METHODS.get(args.get("method", ""))
        why = _invalid(args.get("params") or {}, SCHEMAS[target], "params") if target else None
        if why:
            return _fail(f"control_call {args.get('method')} was not run: {why}")
        name, args = target, {k: v for k, v in (args.get("params") or {}).items() if v is not None}
    entry = agents.begin(client, name, args)
    refusal = agents.admit(client)
    if refusal:
        agents.end(entry, "denied", refusal)
        return _fail(refusal)
    try:
        if name in ("save_project", "export_image") and not args.get("path"):
            try:
                args = {**args, "path": await _write_back(name), "overwrite": True}
            except ValueError as exc:
                agents.end(entry, "error", str(exc))
                return _fail(str(exc))
        refusal = _refused(name, args)
        if refusal:
            agents.end(entry, "error", refusal)
            return _fail(refusal)
        refusal = await _window_only(name, args)
        if refusal:
            agents.end(entry, "denied", refusal)
            return _fail(refusal)
        if agents.policy_of(client) == "ask" and not (cli and name in ("convert_file", "run_command")):   # the command line names both files and --overwrite, and risky commands need --yes
            why = await _risk(name, args)
            if why:
                refusal = await agents.approval(entry, why)
                if refusal:
                    return _fail(refusal)
        out = await _run(name, args)
    except asyncio.CancelledError:
        agents.end(entry, "error", "cancelled by the agent")
        raise
    except Exception as exc:
        agents.end(entry, "error", str(exc))
        return _fail(f"{name} failed: {exc}")
    _announce(name, bool(out.get("isError")))
    first = next((c.get("text", "") for c in out.get("content", []) if c.get("type") == "text"), "")
    agents.end(entry, "error" if out.get("isError") else "ok", first)
    return out


def _cancel(client: str, request_id) -> bool:
    """Cancels the pending call a client asked to cancel: its own by id, else the one call with that id; False when none is known."""
    key = json.dumps(request_id)
    hits = [k for k in _inflight if k[1] == key]
    pick = (client, key) if (client, key) in _inflight else hits[0] if len(hits) == 1 else None
    if pick is None or _inflight[pick].done():
        return False
    _cancelled.add(pick)
    _inflight[pick].cancel()
    return True


def _client_of(request: Request, params: dict, sid: str | None) -> tuple[str, str]:
    info = (params.get("_meta") or {}).get("io.modelcontextprotocol/clientInfo") or params.get("clientInfo")
    name, version = agents.identity(sid, info, request.headers.get("x-formvis-client") or request.headers.get("user-agent") or "")
    if agents.is_inapp(request.headers.get("x-formvis-inapp")):
        return agents.INAPP_CLIENT, version
    return (f"{name} (outside)" if name == agents.INAPP_CLIENT else name), version


def _from_cli(request: Request, params: dict, sid: str | None) -> bool:
    """The command line's own HTTP call: named formvis-cli by its header, with no MCP session or clientInfo, through which any agent can claim that name."""
    info = (params.get("_meta") or {}).get("io.modelcontextprotocol/clientInfo") or params.get("clientInfo")
    return request.headers.get("x-formvis-client") == "formvis-cli" and not info and not sid


# Live resources: the same state the read tools give, as documents a client can attach.
RESOURCES = [{"uri": "formvis://document", "name": "document", "title": "The open document", "description": "Name, size, colour mode, bit depth, layers and the open documents, as get_document gives them.", "mimeType": "application/json"},
             {"uri": "formvis://layers", "name": "layers", "title": "The layer tree", "description": "The layers bottom to top with ids, kinds and nesting.", "mimeType": "application/json"},
             {"uri": "formvis://selection", "name": "selection", "title": "The selection", "description": "The selection's bounds in pixels, or none.", "mimeType": "application/json"},
             {"uri": "formvis://commands", "name": "commands", "title": "The command catalogue", "description": "Every menu and palette command: id, label, group, what it is for.", "mimeType": "application/json"},
             {"uri": "formvis://jobs", "name": "jobs", "title": "Background jobs", "description": "Running and finished local jobs and the agent calls now running.", "mimeType": "application/json"},
             {"uri": "formvis://plugins", "name": "plugins", "title": "Plug-ins", "description": "The plug-ins in the plugins folder, whether each is on and running, and the commands each added.", "mimeType": "application/json"},
             {"uri": "formvis://history", "name": "history", "title": "Document history", "description": "The undo steps of the open document, as list_history gives them.", "mimeType": "application/json"}]
RESOURCE_TEMPLATES = [{"uriTemplate": "formvis://command/{id}", "name": "command", "title": "One command", "description": "A menu or palette command by its id, as formvis://commands lists them: label, group, when it applies, and its parameters.", "mimeType": "application/json"}]
_RESOURCE_TOOLS = {"formvis://document": "get_document", "formvis://layers": "get_layer_tree", "formvis://selection": "get_selection", "formvis://plugins": "list_plugins", "formvis://history": "list_history"}


_subs: dict[str, dict] = {}   # session id -> {"uris": subscribed addresses, "due": addresses changed and not yet sent, "wake": event}
_STATE_URIS = ("formvis://document", "formvis://layers", "formvis://selection", "formvis://history")


def _announce(name: str, failed: bool) -> None:
    """A finished tool call: the resources it can have changed are marked due for every session subscribed to them."""
    if not _subs:
        return
    reading = next((t["annotations"]["readOnlyHint"] for t in TOOLS if t["name"] == name), True)
    changed = {"formvis://jobs"}
    if not failed and not reading:
        changed.update(_STATE_URIS)
        if "plugin" in name:
            changed.add("formvis://plugins")
    for sub in _subs.values():
        due = changed & sub["uris"]
        if due:
            sub["due"] |= due
            sub["wake"].set()


_WINDOW_CHANGES = {"selection": ("formvis://selection",), "history": _STATE_URIS, "layers": ("formvis://document", "formvis://layers"), "document": ("formvis://document", "formvis://layers", "formvis://history")}


def _window_changed(kinds: list) -> int:
    """An edit made by hand in the window: the resources it can have changed are marked due. Returns how many sessions are told."""
    changed = {u for k in kinds if isinstance(k, str) for u in _WINDOW_CHANGES.get(k, ())}
    told = 0
    for sub in _subs.values():
        due = changed & sub["uris"]
        if due:
            sub["due"] |= due
            sub["wake"].set()
            told += 1
    return told


def _subscribe(sid: str | None, uri, on: bool) -> str | None:
    """None when done, otherwise why not."""
    if not sid or not agents.known_session(sid):
        return "Subscriptions belong to a session: send initialize first and keep its Mcp-Session-Id header."
    if not isinstance(uri, str) or uri not in {r["uri"] for r in RESOURCES}:
        return "Give the uri of a resource from resources/list."
    sub = _subs.setdefault(sid, {"uris": set(), "due": set(), "wake": asyncio.Event()})
    if on:
        sub["uris"].add(uri)
    else:
        sub["uris"].discard(uri)
        sub["due"].discard(uri)
    return None


async def _updates(sid: str, request: Request):
    """The session's server-sent stream: notifications/resources/updated for each subscribed resource that changed."""
    sub = _subs.get(sid)
    if sub is None:
        sub = _subs.setdefault(sid, {"uris": set(), "due": set(), "wake": asyncio.Event()})
    while not await request.is_disconnected() and agents.known_session(sid):
        try:
            await asyncio.wait_for(sub["wake"].wait(), 10)
        except asyncio.TimeoutError:
            yield ": keep-alive\n\n"
            continue
        sub["wake"].clear()
        due, sub["due"] = sorted(sub["due"] & sub["uris"]), set()
        for uri in due:
            yield f"event: message\ndata: {json.dumps({'jsonrpc': '2.0', 'method': 'notifications/resources/updated', 'params': {'uri': uri}})}\n\n"


async def _read_resource(client: str, uri: str) -> tuple[str | None, str]:
    """(mime text, error): the resource's JSON, or why it cannot be read."""
    if uri in _RESOURCE_TOOLS:
        out = await _agent_call(client, _RESOURCE_TOOLS[uri], {})
        if out.get("isError"):
            return None, next((c.get("text", "") for c in out.get("content", []) if c.get("type") == "text"), "formvis gave no reason.")
        return json.dumps(out.get("structuredContent") or {"text": next((c.get("text", "") for c in out.get("content", []) if c.get("type") == "text"), "")}), ""
    if uri == "formvis://commands":
        from app.routers import commands
        commands._load()
        rows = [{k: c[k] for k in ("id", "label", "group", "when", "risky") if k in c} for c in commands._state["commands"]]
        return json.dumps({"total": len(rows), "commands": rows}), ""
    if uri == "formvis://jobs":
        return json.dumps({"jobs": _jobs_listing("all", 100)}), ""
    if uri.startswith("formvis://command/"):
        from app.routers import commands
        commands._load()
        wanted = uri[len("formvis://command/"):]
        row = next((c for c in commands._state["commands"] if c.get("id") == wanted), None)
        if row is None:
            return None, f"No command {wanted}: formvis://commands lists the ids."
        return json.dumps({k: row[k] for k in ("id", "label", "group", "when", "risky", "params") if k in row}), ""
    return None, f"No resource {uri}: resources/list gives the addresses."


MAX_BODY = 64 * 1024 * 1024   # the most a request may carry (a base64 picture included)
MAX_INFLIGHT = 32   # calls waiting at once
MAX_REPLY = 24 * 1024 * 1024   # the most a tool's reply may carry in text and picture data


MAX_PER_CLIENT = 8   # calls one agent may have waiting at once


def _reply_bytes(result: dict) -> int:
    return sum(len(c.get("data") or "") + len(c.get("text") or "") for c in result.get("content", []) if isinstance(c, dict))


def _budgeted(name: str, result: dict) -> dict:
    """A reply within the agent budgets (agents.limits): text cut at text_chars with a note of how much was left out, structured data
    over the same size dropped with a note, and a picture over image_bytes refused with how to ask for less."""
    lim = agents.limits()
    cap = lim["text_chars"]
    content = []
    for c in result.get("content", []):
        if not isinstance(c, dict):
            content.append(c)
        elif c.get("type") == "image" and len(c.get("data") or "") > lim["image_bytes"]:
            return _fail(f"{name} ran, but its picture is {len(c['data']) // 1024:,} KB, over the {lim['image_bytes'] // 1024:,} KB limit for one picture. Ask for less: a smaller max_size, a crop box, or a JPEG.")
        elif c.get("type") == "text" and len(c.get("text") or "") > cap:
            left = len(c["text"]) - cap
            content.append({**c, "text": c["text"][:cap] + f"\n[Truncated: {left:,} more characters were left out because a reply is capped at {cap:,} characters for agents. Ask for less: filter, a smaller limit or a region.]"})
        else:
            content.append(c)
    out = {**result, "content": content}
    structured = result.get("structuredContent")
    if structured is not None and len(json.dumps(structured)) > cap:
        out.pop("structuredContent", None)
        out["content"] = content + [{"type": "text", "text": f"[Truncated: the structured data of {len(json.dumps(structured)):,} characters is over the {cap:,} character cap and was left out; the text above is what remains.]"}]
    return out


async def _stream_call(req_id, modern: bool, client: str, name: str, args: dict, token, cli: bool = False):
    """One tool call answered as server-sent events: the window's progress as notifications/progress with the client's token,
    then the result. A client's notifications/cancelled or a dropped connection stops the call, and the window with it."""
    queue: asyncio.Queue = asyncio.Queue()
    mark = _sink.set(queue)
    key = (client, json.dumps(req_id))
    task = asyncio.ensure_future(_agent_call(client, name, args, cli))   # the task keeps the context it was made in, so its window requests report to the queue
    _sink.reset(mark)
    _inflight[key] = task
    event = lambda msg: f"event: message\ndata: {json.dumps(msg)}\n\n"
    note = lambda item: event({"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progressToken": token, **item}})
    try:
        while not task.done():
            try:
                yield note(await asyncio.wait_for(queue.get(), 0.25))
            except asyncio.TimeoutError:
                continue
        while not queue.empty():
            yield note(queue.get_nowait())
        if task.cancelled():
            yield event(_err(req_id, -32800, "Request cancelled by the client."))
            return
        result = _budgeted(name, task.result())
        if _reply_bytes(result) > MAX_REPLY:
            result = _fail(f"{name} ran, but its reply is {_reply_bytes(result) // 1048576} MB, over the {MAX_REPLY // 1048576} MB limit for agents. Ask for less.")
        yield event(_ok(req_id, result, modern))
    finally:
        if not task.done():
            task.cancel()
        _inflight.pop(key, None)
        _cancelled.discard(key)


@router.post("/api/mcp/bridge/changed")
async def bridge_changed(request: Request) -> dict:
    """The window saying what its user changed by hand (selection, history, layers, document), so subscribed sessions are told."""
    body = await request.json()
    kinds = body.get("kinds") if isinstance(body, dict) else None
    return {"told": _window_changed(kinds) if isinstance(kinds, list) else 0}


@router.post("/api/mcp/bridge/progress")
async def bridge_progress(request: Request) -> dict:
    """A long call in the window reporting how far it is. The answer says whether to stop: the agent cancelled, or nobody waits for the result any more."""
    body = await request.json()
    rid = str(body.get("id"))
    queue = _sinks.get(rid)
    if queue is not None:
        item = {"progress": float(body.get("progress") or 0), **({"total": float(body["total"])} if body.get("total") else {}), **({"message": str(body["message"])[:200]} if body.get("message") else {})}
        queue.put_nowait(item)
    return {"cancel": rid not in _waiting}


@router.get("/mcp")
async def mcp_stream(request: Request) -> Response:
    sid = request.headers.get("mcp-session-id") or ""
    if "text/event-stream" in request.headers.get("accept", "") and agents.known_session(sid) and _local_origin(request.headers.get("origin")):
        return StreamingResponse(_updates(sid, request), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
    return Response(status_code=405, headers={"Allow": "POST, DELETE"})   # a stream only for a session that asks for one: replies come with the POST


@router.delete("/mcp")
async def mcp_end(request: Request) -> Response:
    if not _local_origin(request.headers.get("origin")):
        return Response(status_code=403)
    agents.close_session(request.headers.get("mcp-session-id") or "")
    _subs.pop(request.headers.get("mcp-session-id") or "", None)
    return Response(status_code=204)


@router.post("/mcp")
async def mcp(request: Request) -> Response:
    if not _local_origin(request.headers.get("origin")):
        return Response(status_code=403, content=json.dumps(_err(None, -32600, "Origin not allowed")), media_type="application/json")
    if int(request.headers.get("content-length") or 0) > MAX_BODY:
        return Response(status_code=413, content=json.dumps(_err(None, -32600, f"The request is over {MAX_BODY // 1048576} MB; send a smaller picture, or give a path instead of data.")), media_type="application/json")
    try:
        body = await request.body()
        if len(body) > MAX_BODY:
            return Response(status_code=413, content=json.dumps(_err(None, -32600, f"The request is over {MAX_BODY // 1048576} MB; send a smaller picture, or give a path instead of data.")), media_type="application/json")
        msg = json.loads(body)
    except ValueError:
        return Response(content=json.dumps(_err(None, -32700, "Parse error")), media_type="application/json", status_code=400)
    if isinstance(msg, list):
        return Response(content=json.dumps(_err(None, -32600, "Batches are not supported")), media_type="application/json", status_code=400)
    if not isinstance(msg, dict):
        return Response(content=json.dumps(_err(None, -32600, "Invalid Request: send one JSON-RPC object")), media_type="application/json", status_code=400)
    req_id, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if req_id is None:   # a notification
        if method == "notifications/cancelled" and isinstance(params, dict) and params.get("requestId") is not None:
            _cancel(_client_of(request, params, request.headers.get("mcp-session-id"))[0], params["requestId"])
        return Response(status_code=202)
    if not isinstance(params, dict) or not isinstance(params.get("_meta") or {}, dict):
        return Response(content=json.dumps(_err(req_id, -32602, "Invalid params: params and params._meta must be objects")), media_type="application/json", status_code=400)
    headers: dict[str, str] = {}
    sid = request.headers.get("mcp-session-id")
    meta = params.get("_meta") or {}
    version = meta.get("io.modelcontextprotocol/protocolVersion") or request.headers.get("mcp-protocol-version") or "2025-11-25"
    modern = version == "2026-07-28"
    server = {"name": "formvis", "version": __version__}
    if version not in VERSIONS and method != "initialize":
        out = _err(req_id, -32602, f"Unsupported protocol version {version}; supported: {', '.join(VERSIONS)}")
    elif method == "server/discover":
        out = _ok(req_id, {"supportedVersions": VERSIONS, "capabilities": {"tools": {}, "prompts": {}, "resources": {}}, "_meta": {"io.modelcontextprotocol/serverInfo": server}, "instructions": INSTRUCTIONS}, True, cacheable=True)
    elif method == "initialize":
        asked = params.get("protocolVersion")
        who = _client_of(request, params, None)
        headers["Mcp-Session-Id"] = agents.open_session(*who)
        out = _ok(req_id, {"protocolVersion": asked if asked in VERSIONS else "2025-11-25", "capabilities": {"tools": {}, "prompts": {}, "resources": {"subscribe": True}}, "serverInfo": server, "instructions": INSTRUCTIONS}, False)
    elif method == "ping":
        out = _ok(req_id, {}, modern)
    elif method == "prompts/list":
        out = _ok(req_id, {"prompts": PROMPTS}, modern, cacheable=True)
    elif method == "prompts/get":
        out = _ok(req_id, {"description": PROMPTS[0]["description"], "messages": [{"role": "user", "content": {"type": "text", "text": STRATEGY}}]}, modern) if params.get("name") == "edit_strategy" else _err(req_id, -32602, f"No prompt named {params.get('name')}")
    elif method == "resources/list":
        out = _ok(req_id, {"resources": RESOURCES}, modern, cacheable=True)
    elif method in ("resources/subscribe", "resources/unsubscribe"):
        why = _subscribe(sid, params.get("uri"), method == "resources/subscribe")
        out = _ok(req_id, {}, modern) if why is None else _err(req_id, -32602, why)
    elif method == "resources/templates/list":
        out = _ok(req_id, {"resourceTemplates": RESOURCE_TEMPLATES}, modern, cacheable=True)
    elif method == "resources/read":
        uri = params.get("uri")
        found, why = await _read_resource(_client_of(request, params, sid)[0], uri) if isinstance(uri, str) else (None, "Give the resource's uri from resources/list.")
        out = _ok(req_id, {"contents": [{"uri": uri, "mimeType": "application/json", "text": found}]}, modern) if found is not None else _err(req_id, -32002, why)
    elif method == "tools/list":
        core = request.query_params.get("tools") == "core"   # for clients that cap their tools: /mcp?tools=core lists the 31 most used; the rest still answer by name
        out = _ok(req_id, {"tools": [t for t in TOOLS if t["name"] in CORE] if core else TOOLS}, modern, cacheable=True)
    elif method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        if isinstance(name, str) and name in NAMES and isinstance(args, dict):
            args = {k: v for k, v in args.items() if v is not None}   # null reads as left out
            why = _invalid(args, SCHEMAS[name], "")
            if why:
                out = _ok(req_id, _fail(f"{name} was not run: {why}"), modern)
            elif len(_inflight) >= MAX_INFLIGHT:
                out = _ok(req_id, _fail(f"{name} was not run: {len(_inflight)} calls are already waiting. Wait for one to finish, or cancel one, then retry."), modern)
            elif sum(1 for k in _inflight if k[0] == _client_of(request, params, sid)[0]) >= MAX_PER_CLIENT:
                out = _ok(req_id, _fail(f"{name} was not run: this agent already has {MAX_PER_CLIENT} calls waiting. Wait for one to finish, or cancel one, then retry."), modern)
            else:
                client = _client_of(request, params, sid)[0]
                cli = _from_cli(request, params, sid)
                key = (client, json.dumps(req_id))
                token = meta.get("progressToken")
                if token is not None and "text/event-stream" in request.headers.get("accept", ""):   # progress asked for: notifications/progress, then the result, as an event stream
                    return StreamingResponse(_stream_call(req_id, modern, client, name, args, token, cli), media_type="text/event-stream", headers=headers)
                task = asyncio.ensure_future(_agent_call(client, name, args, cli))
                _inflight[key] = task
                try:
                    if await _until_gone(request, task):
                        return Response(status_code=499)   # the caller hung up: its queued request was dropped
                    result = _budgeted(name, await task)
                    if _reply_bytes(result) > MAX_REPLY:
                        result = _fail(f"{name} ran, but its reply is {_reply_bytes(result) // 1048576} MB, over the {MAX_REPLY // 1048576} MB limit for agents. Ask for less: a smaller max_size, a crop box, or a JPEG.")
                    out = _ok(req_id, result, modern)
                except asyncio.CancelledError:
                    if key not in _cancelled:
                        task.cancel()
                        raise
                    out = _err(req_id, -32800, "Request cancelled by the client.")
                finally:
                    _inflight.pop(key, None)
                    _cancelled.discard(key)
        else:
            out = _err(req_id, -32602, f"No tool named {name}: call tools/list for the names.")
    else:
        out = _err(req_id, -32601, f"Method not found: {method}")
    return Response(content=json.dumps(out), media_type="application/json", headers=headers)


@router.get("/api/mcp/bridge/next")
async def bridge_next(request: Request) -> Response:
    """The window's long poll: the next request, or 204 after 20 seconds. Polling is what marks agents as allowed. A
    window that closed or reloaded mid-poll must not take a request with it: the connection is checked before and after
    taking one, and a request taken for a gone window goes back to the front for the next poll (1.52.1)."""
    global _seen, _allowed
    allowed = request.query_params.get("allowed", "1") != "0"   # 1.53.3: the window polls either way, saying which
    if allowed and not _allowed:
        globals()["_declined_until"] = 0.0
    _allowed = allowed
    deadline = time.monotonic() + 20
    eligible = lambda it: allowed or it.get("name") == "__consent__" or it.get("inapp") is True   # not allowed: only the question and the window's own Claude Code go out
    while time.monotonic() < deadline:
        _seen = time.monotonic()
        if await request.is_disconnected():
            return Response(status_code=204)
        if not any(eligible(it) for it in _pending):
            _event().clear()
            try:
                await asyncio.wait_for(_event().wait(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
        found = next((it for it in _pending if eligible(it)), None)
        if found is None:
            continue
        _pending.remove(found)
        item = found
        if await request.is_disconnected():
            _put(item, front=True)
            return Response(status_code=204)
        _taken[str(item.get("id"))] = time.monotonic()
        return Response(content=json.dumps(item), media_type="application/json")
    return Response(status_code=204)


@router.post("/api/mcp/bridge/result")
async def bridge_result(request: Request) -> dict:
    global _seen
    body = await request.json()
    _seen = time.monotonic()
    _taken.pop(str(body.get("id")), None)
    fut = _waiting.get(str(body.get("id")))
    if fut and not fut.done():
        fut.set_result(body.get("result") or {"content": [{"type": "text", "text": "formvis gave no result."}], "isError": True})
    return {"ok": True}


@router.post("/api/mcp/bridge/stop")
async def bridge_stop() -> dict:
    """Agents turned off in Preferences (the window stays open, 1.53.3): an explicit no, so calls are refused at once
    with how to turn it back on, not asked again for ten minutes; anything queued is answered."""
    global _allowed, _declined_until
    _allowed = False
    _declined_until = time.monotonic() + 600
    while _pending:
        item = _pending.popleft()
        fut = _waiting.get(item["id"])
        if fut and not fut.done():
            fut.set_result(_fail("Outside agents were turned off in formvis. Ask the person to turn on Allow outside agents (Preferences > Plugins), then retry."))
    return {"ok": True}


@router.get("/api/mcp/status")
def status(request: Request) -> dict:
    return {"live": _live(), "allowed": _allowed, "endpoint": f"http://127.0.0.1:{server_port(request)}/mcp", "tools": len(TOOLS), "agents": agents.enabled()}


@router.get("/api/mcp/registration")
def registration(request: Request) -> dict:
    """What to paste into a client to register this server: Claude Code's line, and Claude Desktop's config with the path
    of the ./formvis launcher in this copy (formvis.bat on Windows). The packaged app names itself (the AppImage or the
    app bundle's binary, which takes `mcp` as its first argument), and the address carries the port this engine runs on."""
    launcher = os.environ.get("FORMVIS_LAUNCHER") or str(config.REPO_DIR / ("formvis.bat" if os.name == "nt" else "formvis"))
    url = f"http://127.0.0.1:{server_port(request)}/mcp"
    desktop = {"mcpServers": {"formvis": {"command": launcher, "args": ["mcp"]}}}
    return {"claude_code": f"claude mcp add --transport http formvis {url}", "claude_code_launcher": f'claude mcp add formvis -- "{launcher}" mcp',
            "claude_desktop": json.dumps(desktop, indent=2), "url": url, "launcher": launcher}
