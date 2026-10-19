"""A ComfyUI workflow saved in the editor's (UI) format, turned into the API format that /prompt takes.

The editor format keeps node positions, wires as a list of links and widget values as a bare list; the API format names
every input. The names and their order come from the node definitions of the person's own ComfyUI (`/object_info`), passed
in as `info` (node type to its definition), so no widget order is guessed here."""

_WIDGET_SCALARS = {"INT", "FLOAT", "STRING", "BOOLEAN"}
_SKIPPED = {"Note", "MarkdownNote", "PrimitiveNode", "Reroute"}
_SEED_CONTROLLED = {"seed", "noise_seed"}


def is_ui_format(flow: object) -> bool:
    return isinstance(flow, dict) and isinstance(flow.get("nodes"), list) and ("links" in flow or not flow["nodes"] or "type" in flow["nodes"][0])


def node_types(flow: dict) -> list[str]:
    """The node types that need a definition: every node that is run."""
    return sorted({str(n.get("type")) for n in flow["nodes"] if isinstance(n, dict) and n.get("mode", 0) not in (2, 4) and n.get("type") not in _SKIPPED and n.get("type")})


def _widgets_of(definition: dict) -> list[tuple[str, dict]]:
    """Inputs that hold a typed-in value (a number, text, a switch or a choice), in the order the editor lists them."""
    out: list[tuple[str, dict]] = []
    spec = definition.get("input") or {}
    for section in ("required", "optional"):
        for name, entry in (spec.get(section) or {}).items():
            kind = entry[0] if isinstance(entry, list) and entry else entry
            opts = entry[1] if isinstance(entry, list) and len(entry) > 1 and isinstance(entry[1], dict) else {}
            if isinstance(kind, list) or kind in _WIDGET_SCALARS or (isinstance(kind, str) and opts.get("control_after_generate")):
                out.append((name, opts))
    return out


def convert(flow: dict, info: dict[str, dict]) -> dict:
    nodes = {n["id"]: n for n in flow["nodes"] if isinstance(n, dict) and "id" in n}
    links: dict[int, tuple[int, int]] = {}
    for link in flow.get("links") or []:
        if isinstance(link, list) and len(link) >= 3:
            links[link[0]] = (link[1], link[2])
        elif isinstance(link, dict) and "id" in link:
            links[link["id"]] = (link["origin_id"], link["origin_slot"])

    def source(node_id: int, slot: int, depth: int = 0):
        """The node and output a wire really comes from, looking through Reroute, a bypassed node and a Primitive."""
        node = nodes.get(node_id)
        if node is None or depth > 64:
            return None
        kind, mode = node.get("type"), node.get("mode", 0)
        if kind == "PrimitiveNode":
            values = node.get("widgets_values") or []
            return ("value", values[0] if values else None)
        if kind == "Reroute" or mode == 4:
            wanted = (node.get("outputs") or [{}])[slot].get("type") if slot < len(node.get("outputs") or []) else None
            for inp in node.get("inputs") or []:
                if inp.get("link") in links and (kind == "Reroute" or inp.get("type") == wanted):
                    return source(*links[inp["link"]], depth + 1)
            return None
        if mode == 2:
            return None
        return ("link", [str(node_id), slot])

    out: dict[str, dict] = {}
    for node_id, node in nodes.items():
        kind = node.get("type")
        if kind in _SKIPPED or node.get("mode", 0) in (2, 4) or not kind:
            continue
        definition = info.get(kind)
        if definition is None:
            raise ValueError(f"ComfyUI does not have the node {kind}; install its custom node package, then try again.")
        wired = {inp["name"]: inp["link"] for inp in node.get("inputs") or [] if inp.get("link") is not None and inp.get("name")}
        values = list(node.get("widgets_values") or []) if isinstance(node.get("widgets_values"), list) else []
        inputs: dict = {}
        for name, opts in _widgets_of(definition):
            value = values.pop(0) if values else None
            if (name in _SEED_CONTROLLED or opts.get("control_after_generate")) and values:
                values.pop(0)
            if name not in wired and value is not None:
                inputs[name] = value
        for name, link in wired.items():
            if link not in links:
                continue
            found = source(*links[link])
            if found is None:
                continue
            inputs[name] = found[1]
        entry: dict = {"class_type": kind, "inputs": inputs}
        if node.get("title"):
            entry["_meta"] = {"title": node["title"]}
        out[str(node_id)] = entry
    if not out:
        raise ValueError("That workflow has no nodes to run.")
    return out
