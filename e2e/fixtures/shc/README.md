# Contour preset fixtures (.shc)

No legally shareable .shc file made by other software was found (the search is recorded in the planning notes for 1.95.1). These two files are therefore written by hand to the public file format description, not by round trip through formvis's own writer, and are not third-party works.

| File | Source | Author | License |
| --- | --- | --- | --- |
| spec_v2_corners_and_smooth.shc | Written to the "Contours" section of the format's published file format specification (record version 2), with the curve-format field and zero input bounds as documented in https://github.com/focale-editor/shckit/blob/main/docs/SHC.md (MIT) | formvis project | Same as formvis (the files hold only curve numbers) |
| spec_v1_unicode_names.shc | Same description (record version 1, UTF-16 names with non-Latin letters) | formvis project | Same as formvis |

Layout (all integers big-endian): `8BFS`, u16 version 1, u32 count; per contour u32 record version (1 or 2), u32 name length in UTF-16 units counting a final null, the name, u16 curve format (2), u16 point count, per point u16 vertical (output) and u16 horizontal (input), for version 2 one u8 smooth flag per point after all the pairs, u32 minimum input, u32 maximum input.

Expected points as (horizontal, vertical), 0 to 255:

- spec_v2_corners_and_smooth.shc: Cone (0,0) (128,255) (255,0), all corners; Half Round (0,0) (64,100) (160,200) (255,255), all smooth; Steps (0,0) (85,0) (85,128) (170,128) (170,255) (255,255), all corners.
- spec_v1_unicode_names.shc: Linear (0,0) (255,255); a four-point contour named "Rampe douce" followed by e-acute, e-grave, a space and a CJK character: (0,10) (40,60) (200,180) (255,250).

formvis keeps curves smooth, so a corner flag is read past and written back as smooth.
