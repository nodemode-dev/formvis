"""A stand-in for a local ComfyUI server that keeps to the HTTP and WebSocket API: POST /prompt validates the graph against
/object_info and queues it, a worker runs the graph on real pixels (Load Image, Invert, Blend, Save Image) and tells the
/ws clients what it does (execution_start, executing, progress, executed, execution_success), /history, /queue, /view,
/upload/image (renaming a same-named file with other bytes unless overwrite is set), /object_info and /system_stats answer
as ComfyUI does. restart() loses the input and output folders and the history, as a reinstalled ComfyUI does."""

import base64
import hashlib
import io
import json
import queue
import struct
import threading
import time
import urllib.parse
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageOps

IMAGE = ["IMAGE", {}]
OBJECT_INFO = {
    "LoadImage": {"input": {"required": {"image": [["placeholder.png"], {"image_upload": True}]}}, "output": ["IMAGE", "MASK"], "output_node": False},
    "LoadImageMask": {"input": {"required": {"image": [["placeholder.png"], {"image_upload": True}], "channel": [["alpha", "red", "green", "blue"]]}}, "output": ["MASK"], "output_node": False},
    "ImageInvert": {"input": {"required": {"image": IMAGE}}, "output": ["IMAGE"], "output_node": False},
    "ImageBlend": {"input": {"required": {"image1": IMAGE, "image2": IMAGE, "blend_factor": ["FLOAT", {"default": 0.5}]}}, "output": ["IMAGE"], "output_node": False},
    "CLIPTextEncode": {"input": {"required": {"text": ["STRING", {"multiline": True}]}}, "output": ["CONDITIONING"], "output_node": False},
    "KSampler": {"input": {"required": {"steps": ["INT", {"default": 4}], "sampler_name": [["euler", "dpmpp_2m"]]}, "optional": {"positive": ["CONDITIONING", {}]}}, "output": ["LATENT"], "output_node": False},
    "CheckpointLoaderSimple": {"input": {"required": {"ckpt_name": [["base.safetensors"]]}}, "output": ["MODEL"], "output_node": False},
    "SaveImage": {"input": {"required": {"images": IMAGE, "filename_prefix": ["STRING", {"default": "ComfyUI"}]}}, "output": [], "output_node": True},
}


def _frame(text: str) -> bytes:
    data = text.encode()
    n = len(data)
    head = bytes([0x81, n]) if n < 126 else bytes([0x81, 126]) + struct.pack(">H", n) if n < 65536 else bytes([0x81, 127]) + struct.pack(">Q", n)
    return head + data


class ComfyMock:
    def __init__(self, nodes: dict | None = None, step_delay: float = 0.08, steps: int = 5):
        self.info = {k: v for k, v in (nodes or OBJECT_INFO).items()}
        self.step_delay, self.steps = step_delay, steps
        self.port = 0
        self.server: ThreadingHTTPServer | None = None
        self.log: list[tuple[str, str]] = []
        self.uploads: list[str] = []
        self.prompts: list[dict] = []
        self.loaded: list[str] = []
        self._reset()

    def _reset(self) -> None:
        self.lock = threading.RLock()
        self.inputs: dict[tuple[str, str], bytes] = {}
        self.outputs: dict[tuple[str, str], bytes] = {}
        self.history: dict[str, dict] = {}
        self.pending: list[list] = []
        self.running: list[list] = []
        self.sockets: dict[str, queue.Queue] = {}
        self.counter = 0
        self.wake = threading.Event()
        self.alive = threading.Event()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> "ComfyMock":
        mock = self

        class H(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *a): pass

            def _send(self, code, body=b"", kind="application/json"):
                if not isinstance(body, bytes):
                    body = json.dumps(body).encode()
                self.send_response(code)
                self.send_header("Content-Type", kind)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                mock.log.append(("GET", self.path))
                u = urllib.parse.urlsplit(self.path)
                q = dict(urllib.parse.parse_qsl(u.query))
                if u.path == "/ws":
                    return mock._socket(self, q.get("clientId", ""))
                self._route("GET", u.path, q, b"", self)

            def do_POST(self):
                body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                mock.log.append(("POST", self.path))
                u = urllib.parse.urlsplit(self.path)
                self._route("POST", u.path, dict(urllib.parse.parse_qsl(u.query)), body, self)

            def _route(self, method, path, q, body, h):
                code, out, kind = mock.handle(method, path, q, body, self.headers.get("Content-Type", ""))
                self._send(code, out, kind)

        class S(ThreadingHTTPServer):
            allow_reuse_address = True
            daemon_threads = True

        self.server = S(("127.0.0.1", self.port), H)
        self.port = self.server.server_address[1]
        self.alive.set()
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        threading.Thread(target=self._worker, daemon=True).start()
        return self

    def stop(self) -> None:
        self.alive.clear()
        self.wake.set()
        for q in list(self.sockets.values()):
            q.put(None)
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None

    def restart(self, nodes: dict | None = None) -> None:
        """Same address, everything ComfyUI keeps on disk gone."""
        self.stop()
        time.sleep(0.15)
        if nodes is not None:
            self.info = dict(nodes)
        self._reset()
        self.start()

    def handle(self, method, path, q, body, ctype):
        if method == "GET":
            if path == "/system_stats":
                return 200, {"system": {"comfyui_version": "0.3.60-mock", "python_version": "3.12", "os": "posix"}, "devices": [{"name": "mock", "type": "cpu", "vram_total": 100, "vram_free": 50}]}, "application/json"
            if path == "/object_info":
                return 200, self.info, "application/json"
            if path.startswith("/object_info/"):
                kind = urllib.parse.unquote(path[len("/object_info/"):])
                return 200, ({kind: self.info[kind]} if kind in self.info else {}), "application/json"
            if path == "/queue":
                with self.lock:
                    return 200, {"queue_running": list(self.running), "queue_pending": list(self.pending)}, "application/json"
            if path == "/history":
                with self.lock:
                    items = list(self.history.items())[-int(q.get("max_items", 1000)):]
                return 200, dict(items), "application/json"
            if path.startswith("/history/"):
                pid = path[len("/history/"):]
                with self.lock:
                    return 200, ({pid: self.history[pid]} if pid in self.history else {}), "application/json"
            if path == "/view":
                folder = {"input": self.inputs, "output": self.outputs}.get(q.get("type", "output"), {})
                data = folder.get((q.get("subfolder", ""), q.get("filename", "")))
                return (200, data, "image/png") if data is not None else (404, b"", "text/plain")
            return 404, b"", "text/plain"
        if path == "/upload/image":
            return self._upload(body, ctype)
        if path == "/prompt":
            return self._prompt(body)
        if path == "/queue":
            doomed = set(json.loads(body or b"{}").get("delete", []))
            with self.lock:
                self.pending = [p for p in self.pending if p[1] not in doomed]
            return 200, b"", "text/plain"
        if path == "/interrupt":
            return 200, b"", "text/plain"
        return 404, b"", "text/plain"

    def _upload(self, body, ctype):
        msg = BytesParser(policy=default).parsebytes(b"Content-Type: " + ctype.encode() + b"\r\n\r\n" + body)
        fields, image = {}, None
        for part in msg.iter_parts():
            name = part.get_param("name", header="content-disposition")
            if part.get_filename():
                image = (part.get_filename(), part.get_payload(decode=True))
            else:
                fields[name] = part.get_content()
        if image is None:
            return 400, {"error": "no image"}, "application/json"
        name, data = image
        sub, kind, overwrite = fields.get("subfolder", ""), fields.get("type", "input"), str(fields.get("overwrite", "")).lower() == "true"
        folder = self.inputs if kind == "input" else self.outputs
        with self.lock:
            held = folder.get((sub, name))
            if held is not None and not overwrite and hashlib.sha256(held).digest() != hashlib.sha256(data).digest():
                stem, dot, ext = name.rpartition(".")
                n = 1
                while (sub, f"{stem} ({n}).{ext}") in folder:
                    n += 1
                name = f"{stem} ({n}).{ext}"
            folder[(sub, name)] = data
        self.uploads.append(f"{sub}/{name}")
        return 200, {"name": name, "subfolder": sub, "type": kind}, "application/json"

    def _problems(self, graph) -> dict:
        errors = {}
        if not isinstance(graph, dict) or not graph:
            return {"": "prompt has no nodes"}
        for nid, node in graph.items():
            kind = node.get("class_type") if isinstance(node, dict) else None
            if kind not in self.info:
                errors[nid] = f"Cannot execute because node {kind} does not exist."
                continue
            spec = self.info[kind]["input"]
            got = node.get("inputs", {})
            for key, s in spec.get("required", {}).items():
                if key not in got:
                    errors[nid] = f"Required input is missing: {key}"
                    break
                v = got[key]
                if isinstance(v, list):
                    if len(v) != 2 or str(v[0]) not in graph:
                        errors[nid] = f"Input {key} links to a node that is not in the prompt"
                        break
                elif kind in ("LoadImage", "LoadImageMask") and key == "image" and not self._has_input(str(v)):
                    errors[nid] = f"Value not in list: image: '{v}' not in the input folder"
                    break
        return errors

    def _has_input(self, value: str) -> bool:
        sub, _, name = value.rpartition("/")
        return (sub, name) in self.inputs

    def _prompt(self, body):
        try:
            req = json.loads(body)
            graph, client = req["prompt"], req.get("client_id", "")
        except (ValueError, KeyError, TypeError):
            return 400, {"error": {"type": "invalid_prompt", "message": "No prompt provided"}, "node_errors": {}}, "application/json"
        errors = self._problems(graph)
        if errors:
            first = next(iter(errors.values()))
            return 400, {"error": {"type": "invalid_prompt", "message": first, "details": "", "extra_info": {}}, "node_errors": {k: {"errors": [{"message": v}]} for k, v in errors.items()}}, "application/json"
        with self.lock:
            self.counter += 1
            pid = f"mock-{self.counter}"
            self.pending.append([self.counter, pid, graph, {"client_id": client}, [n for n, v in graph.items() if self.info[v["class_type"]].get("output_node")]])
        self.prompts.append(graph)
        self.wake.set()
        return 200, {"prompt_id": pid, "number": self.counter, "node_errors": {}}, "application/json"

    def _socket(self, h, client):
        key = h.headers.get("Sec-WebSocket-Key", "")
        accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
        h.wfile.write(f"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n".encode())
        h.wfile.flush()
        q: queue.Queue = queue.Queue()
        self.sockets[client] = q
        q.put(json.dumps({"type": "status", "data": {"status": {"exec_info": {"queue_remaining": 0}}}, "sid": client}))
        try:
            while self.alive.is_set():
                try:
                    m = q.get(timeout=0.5)
                except queue.Empty:
                    continue
                if m is None:
                    break
                h.wfile.write(_frame(m))
                h.wfile.flush()
            h.wfile.write(bytes([0x88, 0]))
        except OSError:
            pass
        finally:
            self.sockets.pop(client, None)
        h.close_connection = True

    def _say(self, client, kind, data):
        q = self.sockets.get(client)
        if q:
            q.put(json.dumps({"type": kind, "data": data}))

    def _worker(self):
        while self.alive.is_set():
            self.wake.wait(0.2)
            with self.lock:
                if not self.pending:
                    self.wake.clear()
                    continue
                job = self.pending.pop(0)
                self.running.append(job)
            num, pid, graph, extra, outs = job
            client = extra.get("client_id", "")
            self._say(client, "execution_start", {"prompt_id": pid})
            images, status = {}, "success"
            try:
                cache: dict[str, Image.Image] = {}
                for nid in outs:
                    self._eval_node(graph, nid, cache, client, pid)
                    pic = cache[nid]
                    name = f"mock_{num:05d}_.png"
                    buf = io.BytesIO()
                    pic.save(buf, "PNG")
                    with self.lock:
                        self.outputs[("", name)] = buf.getvalue()
                    images[nid] = {"images": [{"filename": name, "subfolder": "", "type": "output"}]}
                    self._say(client, "executed", {"node": nid, "display_node": nid, "output": images[nid], "prompt_id": pid})
            except Exception:
                status = "error"
            self._say(client, "executing", {"node": None, "prompt_id": pid})
            if status == "success":
                self._say(client, "execution_success", {"prompt_id": pid})
            with self.lock:
                self.running = [r for r in self.running if r[1] != pid]
                self.history[pid] = {"prompt": [num, pid, graph, extra, outs], "outputs": images, "status": {"status_str": status, "completed": status == "success", "messages": []}}

    def _eval_node(self, graph, nid, cache, client, pid):
        if nid in cache:
            return cache[nid]
        node = graph[nid]
        kind, ins = node["class_type"], node.get("inputs", {})
        self._say(client, "executing", {"node": nid, "prompt_id": pid})
        time.sleep(self.step_delay)

        def arg(key):
            v = ins[key]
            return self._eval_node(graph, str(v[0]), cache, client, pid)

        if kind in ("LoadImage", "LoadImageMask"):
            sub, _, name = str(ins["image"]).rpartition("/")
            self.loaded.append(f"{sub}/{name}")
            pic = Image.open(io.BytesIO(self.inputs[(sub, name)])).convert("RGB")
            result = pic.convert("L").convert("RGB") if kind == "LoadImageMask" else pic
        elif kind == "ImageInvert":
            result = ImageOps.invert(arg("image"))
        elif kind == "ImageBlend":
            b = arg("image2")
            a = arg("image1")
            result = Image.blend(a, b.resize(a.size), float(ins.get("blend_factor", 0.5)))
        elif kind == "SaveImage":
            for key, v in ins.items():
                if key != "images" and isinstance(v, list):
                    arg(key)
            result = arg("images")
        elif kind == "KSampler":
            for i in range(1, self.steps + 1):
                time.sleep(self.step_delay)
                self._say(client, "progress", {"value": i, "max": self.steps, "prompt_id": pid, "node": nid})
            result = Image.new("RGB", (1, 1))
        else:
            result = Image.new("RGB", (1, 1))
        cache[nid] = result
        return result


def transform_expected(image: tuple, ref: tuple | None = None, control: tuple | None = None) -> tuple:
    """What the mock's invert-then-blend graph makes of solid colours, to compare a result against."""
    out = tuple(255 - c for c in image)
    for other in (ref, control):
        if other:
            out = tuple(round((a + b) / 2) for a, b in zip(out, other))
    return out


__all__ = ["ComfyMock", "OBJECT_INFO", "transform_expected"]
