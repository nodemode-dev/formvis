# Editing with Claude Code, Codex and Cursor: evaluations and a checklist

formvis's MCP server and the `formvis-editing` skill are tested against the real formvis window by
`e2e/test_agent_editing.py`, which plays the part of an agent. What those tests cannot run is a real client with its
own model deciding what to do. This page is for that: a checklist to confirm each client on your machine, ten
evaluations with results you can check, and the skill's trigger test.

## Checklist, once per client

1. In the formvis folder, run `./formvis agents install` (or open the formvis repository itself in the client, which
   carries `.mcp.json`, `.cursor/mcp.json` and `.codex/config.toml`). Restart the client.
2. The client lists a `formvis` MCP server with 134 tools (Claude Code: `/mcp`; Codex: `codex mcp list`; Cursor:
   Settings > MCP). In Claude Code a project server first shows as waiting for your approval: approve it.
3. With formvis closed, ask: "What is open in formvis?" formvis's engine starts and a formvis window opens in your
   browser (the desktop app, if that is what you run, is the window itself).
4. formvis asks "Allow an outside agent to edit?" Click Allow. The agent's answer names the open document, or says
   none is open.
5. Ask for Evaluation 1 below and watch the window: each change appears as an undoable step.
6. Check that the skill was used: the agent looks with `get_image` between changes, and uses the exact tool names.

If a client lists no formvis tools, the skill's "When something fails" table says what to do.

## Ten evaluations

Each starts from the stated document; each result is checked by eye in formvis or by the numbers `get_document`
gives. A pass is the observable result, not the route taken, though the route should be sensible (look first, check
after).

| # | Ask | Start | Pass when |
| --- | --- | --- | --- |
| 1 | "Make a 1280 by 720 thumbnail: dark blue background, the title 'Launch day' in large white bold text in the middle." | nothing open | a 1280 x 720 document; a text layer reading Launch day, white, centred within about 40 px; the background dark blue |
| 2 | "Remove the person on the left." | a photo with two people (open it first with its absolute path) | the person on the left is gone, the area filled from its surroundings, the other person untouched; the agent selected before filling |
| 3 | "Make this photo warmer and a bit brighter, but keep it editable." | any photo | an adjustment layer (for example hsv, exposure or splitToning) above the photo, not changed pixels; set_adjustment used if it tuned it |
| 4 | "Cut out the dog and put it on a plain white background." | a photo of a dog | the dog's layer masked by remove_background, a white fill layer below it |
| 5 | "Export this as a JPEG, 2000 pixels wide, to my Desktop as final.jpg." | a larger photo | ~/Desktop/final.jpg exists, 2000 pixels wide, proportions kept; the agent used an absolute path |
| 6 | "Blur the red rectangle a little." | a document with a shape layer | the rectangle is blurred: the agent followed the filter's message and called rasterize_layer first |
| 7 | "Extend the picture 300 pixels to the right so it fits a wider banner." | any landscape photo | the canvas is 300 px wider and the new strip continues the picture (generative_expand) |
| 8 | "Add a gold light leak from the top and a white frame." | any photo | two new layers, a gold leak from the top and a white frame, the photo unchanged beneath |
| 9 | "Undo the last two things you did." | after any two edits | the document is as it was before those two edits (undo steps 2) |
| 10 | "Save this so I can keep working on it tomorrow, next to the photo." | a photo opened from a folder | a .fmv beside the photo that reopens with every layer (open_file on it) |

Generative evaluations (2, 7) run on this computer when LaMa is downloaded (Preferences > Plugins > Local models); with
nothing downloaded and no fal key the agent should relay the error's instruction instead of guessing.

## Trigger test for the skill

Should bring in `formvis-driving`:

- "Remove the watermark from this picture in formvis."
- "Make me a YouTube thumbnail with the title Launch Day."
- "Can you brighten this photo and export it as a JPEG?"
- "Crop the image to a square and upscale it."
- "formvis's generative fill didn't work, what now?"

Should not (near misses):

- "Add a new filter to formvis's code." (changing formvis itself: formvis-harness)
- "Why does the formvis engine fail to start in tests?" (development)
- "Write a Python script that resizes every JPEG in a folder." (a script, not formvis)
- "Explain how Gaussian blur works." (a question, no editing)
