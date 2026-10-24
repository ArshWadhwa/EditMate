# How EditMate works

A walkthrough of the whole system, with links to the code that does each part. Read it top to
bottom once; after that, use the section headings as an index.

> Line numbers point at the start of each function or block as of this writing. If they drift,
> search for the symbol name, which is always given.

**Contents**

1. [The big picture](#1-the-big-picture)
2. [Repository layout](#2-repository-layout)
3. [The shared adjustment schema](#3-the-shared-adjustment-schema)
4. [The edit document and undo history](#4-the-edit-document-and-undo-history)
5. [EditorProvider: the hub](#5-editorprovider-the-hub)
6. [Geometry: crop, rotate, straighten, flip](#6-geometry-crop-rotate-straighten-flip)
7. [The pixel pipeline](#7-the-pixel-pipeline)
8. [The render worker and preview loop](#8-the-render-worker-and-preview-loop)
9. [The viewport](#9-the-viewport)
10. [Measuring images](#10-measuring-images)
11. [Inspiration → recipe (the fitter)](#11-inspiration--recipe-the-fitter)
12. [Auto tone and auto white balance](#12-auto-tone-and-auto-white-balance)
13. [The crop tool](#13-the-crop-tool)
14. [Controls: sliders, D-pad, straighten dial](#14-controls-sliders-d-pad-straighten-dial)
15. [Presets: client side](#15-presets-client-side)
16. [The API server](#16-the-api-server) · [16.1 Where presets are saved](#161-where-presets-are-saved-and-how-the-server-knows-theyre-yours)
17. [Background, layers and export](#17-background-layers-and-export)
18. [Keyboard, drag-and-drop, toasts](#18-keyboard-drag-and-drop-toasts)
19. [Tests](#19-tests)
20. [Recipes: how to extend it](#20-recipes-how-to-extend-it)

**Part II: why it's built this way**

21. [System design principles](#21-system-design-principles)
22. [How EditMate compares to other editors](#22-how-editmate-compares-to-other-editors)
23. [Why this tech stack](#23-why-this-tech-stack)

---

## 1. The big picture

```
┌──────────────────────────── Browser ────────────────────────────┐
│                                                                 │
│  File ─► ImageBitmap ─► renderGeometry() ─► base canvas (≤1800) │
│                         (crop/rotate/flip)        │             │
│                                                   ▼             │
│  sliders ─► history ─► adjustments ─► render.worker.js          │
│                                        applyAdjustments()       │
│                                        histogram + stats        │
│                                                   │             │
│                                     offscreen output canvas     │
│                                                   ▼             │
│  AI subject mask ─┐        compose(): backdrop → subject → layers│
│  layers, assets ──┴──────────────────────────────►│             │
│                                                   ▼             │
│                               viewport, HUD, readouts           │
│                                                                 │
│  Export: full-res geometry → worker → compose → JPEG/PNG/WebP/  │
│          AVIF/PDF                                               │
└──────────────────────────────┬──────────────────────────────────┘
                               │  presets only (names + numbers)
                               ▼
                  Express API ─► MongoDB (Preset collection)
```

Three rules shape everything:

1. **Pixels never leave the browser.** All editing, analysis and export happen client-side.
   The server stores presets: a name, 11 integers and an optional colour swatch.
2. **Edits are non-destructive.** The original `ImageBitmap` is never modified. What you see is
   always *original → geometry → adjustments*, recomputed from scratch.
3. **One engine, every resolution.** The same pure functions render the 1800 px preview, the
   200 px thumbnails used for fitting and preset cards, and the full-size export.

## 2. Repository layout

```
editmate/
├─ package.json            npm workspaces: shared, server, client
├─ shared/src/             adjustment schema shared by client and server
├─ server/
│  ├─ src/                 Express app (routes → controllers → services → models)
│  ├─ scripts/dev-memory.js  run the API on an in-memory MongoDB
│  └─ test/                API tests (supertest + mongodb-memory-server)
├─ client/
│  ├─ src/engine/          pure image code: pipeline, geometry, analysis, crop math, worker
│  ├─ src/state/           edit document, undo history, EditorProvider
│  ├─ src/features/        UI by feature: viewport, adjust, crop, background, layers,
│  │                       export, inspire, presets, controls, rail
│  ├─ src/components/      small shared UI: ui.jsx, Toaster, ShortcutsDialog
│  ├─ src/lib/             api client, image loading, hotkeys, formatting
│  └─ test/                engine tests (node --test)
└─ design/editor.html      the static design mockup the UI was built from
```

The **engine** folder has no React in it (except the one hook that drives the worker), so it can
be unit-tested in plain Node.

## 3. The shared adjustment schema

Every adjustment is defined once, in [shared/src/adjustments.js](shared/src/adjustments.js#L5)
(`ADJUSTMENTS`): its key, label, group (Light / Color / Effects) and range. Bipolar sliders run
−100…100; `fade`, `vignette` and `grain` run 0…100.

Both sides import it:

- The client renders sliders from it ([AdjustPanel.jsx:19](client/src/features/adjust/AdjustPanel.jsx#L19))
  and clamps values with `clampAdjustment` ([adjustments.js:37](shared/src/adjustments.js#L37)).
- The server builds its Mongoose model ([Preset.js](server/src/models/Preset.js)) and zod schema
  ([preset.schema.js:12](server/src/schemas/preset.schema.js#L12)) from the same list.

So adding a slider means editing one array, plus teaching the pipeline what the slider does
(see [§20](#20-recipes-how-to-extend-it)).

## 4. The edit document and undo history

An edit is a plain object called the **document**:

```js
{
  adjustments: { brightness: 0, contrast: 18, … },
  geometry:    { quarterTurns, straighten, flipH, crop },
  background:  { mode: 'original' | 'transparent' | 'color' | 'image' | 'blur', color, assetId, blur },
  layers:      [ { id, type: 'text' | 'shape' | 'image', x, y, w, h, rotation, opacity, blend, … } ],
}
```

Objects merge shallowly on update and `layers` is replaced as a whole array, so moving a layer,
changing a background colour and dragging a slider are all ordinary, undoable document changes.
Bitmaps (uploaded photos, the AI mask) are **not** in the document: it holds asset ids only.

History lives in [client/src/state/history.js](client/src/state/history.js) as
`{ past, present, committed, future }`. The trick is the split between `present` and `committed`:

| Action | What happens | Code |
| --- | --- | --- |
| `preview` | Updates `present` only, on every slider tick. No undo step. | [history.js:72](client/src/state/history.js#L72) |
| `commit` | If `present` differs from `committed`, pushes `committed` onto `past`. | [history.js:42](client/src/state/history.js#L42) |
| `apply` | `preview` and `commit` in one, for buttons, presets and recipes. | [history.js:76](client/src/state/history.js#L76) |
| `undo` | Commits any in-flight gesture first, then steps back. | [history.js:78](client/src/state/history.js#L78) |
| `redo` / `load` | Step forward, or start fresh for a new image. | [history.js:89](client/src/state/history.js#L89) |

A slider sends `preview` on input and `commit` on pointer-up, key-up or blur
([AdjustmentSlider.jsx:10](client/src/features/adjust/AdjustmentSlider.jsx#L10)), so **one drag is one
undo step**, however many frames it rendered. History is capped at 100 steps (`LIMIT`).

## 5. EditorProvider: the hub

[client/src/state/EditorProvider.jsx:23](client/src/state/EditorProvider.jsx#L23) owns the editor state
and wires the engine together:

- **`image`**: the decoded file from `loadImageFile` ([lib/image.js](client/src/lib/image.js)). It uses
  `createImageBitmap(file, { imageOrientation: 'from-image' })`, so EXIF rotation is respected, and
  rejects images over 50 MP.
- **`history`**: the reducer from §4.
- **`base`** ([EditorProvider.jsx:47](client/src/state/EditorProvider.jsx#L47)): the image with
  *geometry only* applied, at most `PREVIEW_MAX = 1800` px. It's recomputed only when geometry
  changes, so dragging a colour slider never redraws it.
- **`thumbnail`** ([EditorProvider.jsx:51](client/src/state/EditorProvider.jsx#L51)): `base` scaled
  to 200 px, used by the recipe fitter, auto tone/WB and preset previews.
- **`frame` / `output`** ([EditorProvider.jsx:53](client/src/state/EditorProvider.jsx#L53)): the live
  render from §8.
- **`ui`**: the current tool, slider group, focused adjustment, compare/grid flags, dock tab.
- **`subject`** ([useSubjectMask.js](client/src/state/useSubjectMask.js)): the AI subject mask for
  the current photo, computed on demand and kept *outside* history because it's derived data. Its
  geometry-transformed preview copy is **`maskBase`**.
- **`assets`** ([useAssets.js](client/src/state/useAssets.js)): bitmaps for image layers and
  replacement backgrounds, keyed by id. They're never dropped during a session, so undoing a
  deleted layer can always bring its image back.
- **`exportImage`** ([EditorProvider.jsx:99](client/src/state/EditorProvider.jsx#L99)).

There are two contexts on purpose: `useEditor()` for the document and actions, and `useFrame()` for
the render results (histogram, stats), which change on every frame
([EditorProvider.jsx:160](client/src/state/EditorProvider.jsx#L160)).

Provider order in [App.jsx](client/src/App.jsx) is
`Toast → Editor → Presets → Inspiration → Crop → Editor UI`. Each later provider reads the earlier ones.

## 6. Geometry: crop, rotate, straighten, flip

All in [client/src/engine/geometry.js](client/src/engine/geometry.js).

```js
geometry = { quarterTurns: 0..3, straighten: -45..45, flipH: boolean, crop: {x,y,width,height} | null }
```

- **Crop is stored as fractions (0–1) of the rotated bounding box**, not pixels. That's why one
  edit renders identically at 1800 px and at full resolution.
- `totalRotation` = `quarterTurns × 90 + straighten` ([geometry.js:14](client/src/engine/geometry.js#L14)).
- `rotatedSize` ([geometry.js:16](client/src/engine/geometry.js#L16)) is the size of that bounding box.
- `autoStraightenCrop` ([geometry.js:27](client/src/engine/geometry.js#L27)): when you straighten
  without a manual crop, this finds the largest centred rectangle with the photo's aspect ratio that
  fits inside the tilted image, so there are no empty corners. Scale factor
  `min(w / (w·cosθ + h·sinθ), h / (w·sinθ + h·cosθ))`.
- `effectiveCrop` ([geometry.js:40](client/src/engine/geometry.js#L40)) picks manual crop → auto
  crop → whole image.
- `renderGeometry` ([geometry.js:62](client/src/engine/geometry.js#L62)) does the drawing with
  canvas transforms in one `drawImage`: optional mirror → scale → translate to the crop origin →
  rotate about the box centre. **Flip is applied last**, after the crop, which is why the crop box
  shows the unflipped photo.

## 7. The pixel pipeline

[client/src/engine/pipeline.js](client/src/engine/pipeline.js) is a pure function
`applyAdjustments(src, dst, width, height, adj)` ([pipeline.js:60](client/src/engine/pipeline.js#L60))
over RGBA `Uint8ClampedArray`s. Order of operations:

1. **White balance + tone curve → 3 lookup tables.** Both are per-channel functions, so they're
   folded into three 256-entry LUTs by `buildChannelLuts` ([pipeline.js:30](client/src/engine/pipeline.js#L30)).
   Warmth multiplies red up and blue down (±30%); tint scales green only
   ([pipeline.js:32](client/src/engine/pipeline.js#L32)). The per-pixel cost of seven sliders
   becomes three array reads.
2. **Tone curve** `toneCurve` ([pipeline.js:12](client/src/engine/pipeline.js#L12)), on a 0–1 value:
   - brightness: gamma, `v^(2^(−b·0.009))`
   - contrast: an S-curve around 0.5 that keeps 0 and 1 fixed, so it never clips
   - shadows / highlights: bell-shaped bumps `v(1−v)²` and `v²(1−v)`, zero at both ends
   - fade: lifts the black point (`v·(1−f) + f`)
3. **Saturation / vibrance** ([pipeline.js:87](client/src/engine/pipeline.js#L87)): scales each channel's
   distance from luminance; vibrance boosts low-chroma pixels more, weighted by `(1 − chroma)²`.
   Skipped entirely when both are zero.
4. **Vignette** ([pipeline.js:101](client/src/engine/pipeline.js#L101)): a smoothstep falloff by
   normalised distance from the centre.
5. **Grain** ([pipeline.js:110](client/src/engine/pipeline.js#L110)): deterministic hash noise
   (`noise()`, [pipeline.js:42](client/src/engine/pipeline.js#L42)), so grain never shimmers between
   renders. It's weighted to midtones, and the grain cell grows with resolution (`grainCellSize`) so
   an export looks like the preview.

Speed on 1800×1200: about 12 ms for tone only and about 40 ms with every effect, off the main thread.

`computeHistogram` ([pipeline.js:130](client/src/engine/pipeline.js#L130)) builds R, G, B and luminance
bins, sampling every third pixel.

## 8. The render worker and preview loop

**Worker:** [client/src/engine/render.worker.js](client/src/engine/render.worker.js). Messages:

| In | Does | Out |
| --- | --- | --- |
| `source` ([:18](client/src/engine/render.worker.js#L18)) | Keeps the preview pixels; measures `sourceStats` once. | n/a |
| `render` ([:30](client/src/engine/render.worker.js#L30)) | Runs the pipeline, histogram, stats. | `frame` (or `skipped` if it has no matching source) |
| `process` ([:56](client/src/engine/render.worker.js#L56)) | One-shot full-res render for export. | `processed` |

**Hook:** `usePreviewRenderer` ([usePreviewRenderer.js:12](client/src/engine/usePreviewRenderer.js#L12))
keeps the worker busy without ever queueing:

- **Latest wins.** `requestRender` ([:35](client/src/engine/usePreviewRenderer.js#L35)) sends
  immediately if the worker is idle; otherwise it just marks `dirty`. When a frame comes back,
  the hook renders again only if something changed. Dragging a slider renders as fast as the
  worker can go and never falls behind.
- **Ping-pong buffers.** Each frame's buffer is transferred to the main thread, drawn, then sent
  back as the next frame's output (`spare`), so the hook allocates nothing per frame.
- **Versioned sources.** `sendSource` ([:22](client/src/engine/usePreviewRenderer.js#L22)) bumps a
  version number. Frames from an old source are dropped, and a `skipped` reply makes the hook resend
  the source. This is what keeps it alive across React Strict Mode and hot reloads
  ([:57](client/src/engine/usePreviewRenderer.js#L57)).
- **Offscreen output.** Frames go to an offscreen canvas (`output`). The viewport composites it
  into its own canvas whenever a frame arrives (§17), so the viewport can unmount (e.g. while
  cropping) and come back showing the latest frame.

## 9. The viewport

[client/src/features/viewport/Viewport.jsx](client/src/features/viewport/Viewport.jsx). It shows
the empty state, the crop stage or the edit stage (`EditStage`, [:46](client/src/features/viewport/Viewport.jsx#L46)).

- **Two stacked canvases:** "before" (the `base`) and "after" (`output` run through `compose()`,
  which adds the background and layers). The "before" canvas is hidden unless comparing, so
  transparent areas show a checkerboard instead of the original underneath. Compare mode
  clips the after canvas with `clip-path: inset(0 0 0 split%)` ([:138](client/src/features/viewport/Viewport.jsx#L138)).
  Holding `\` hides it to show the original.
- **Zoom and pan** are CSS transforms on the frame. `setZoom` ([:72](client/src/features/viewport/Viewport.jsx#L72))
  keeps the point under the cursor fixed; `clampPan` ([:66](client/src/features/viewport/Viewport.jsx#L66))
  keeps the image from being dragged away. The wheel listener is attached manually as non-passive so
  it can stop the page scrolling ([:111](client/src/features/viewport/Viewport.jsx#L111)).
- **CompareDivider** ([CompareDivider.jsx:9](client/src/features/viewport/CompareDivider.jsx#L9))
  lives *inside* the zoomed frame, so `split` stays in image coordinates. Its handle is
  counter-scaled by `1/zoom` to keep a constant size, and it works with the keyboard too.
- **HudStrip** ([HudStrip.jsx:19](client/src/features/viewport/HudStrip.jsx#L19)): output size, zoom
  (in real pixel %), channel toggles, histogram, clipping percentages and
  **EV = log₂(output brightness / source brightness)** ([:26](client/src/features/viewport/HudStrip.jsx#L26)),
  both measured identically in the worker.
- **Histogram** ([Histogram.jsx:28](client/src/features/viewport/Histogram.jsx#L28)): SVG paths with
  square-root scaling. The peak ignores bins 0 and 255 so clipped spikes don't flatten the rest.

## 10. Measuring images

`measure(data, width, height)` ([analysis.js:28](client/src/engine/analysis.js#L28)) returns
*measured properties*, a description of an image:

| Property | Meaning |
| --- | --- |
| `brightness` | mean luminance (0–1) |
| `contrast` | standard deviation of luminance |
| `saturation` | mean chroma `(max − min) / 255` |
| `warmth`, `tint` | mean `(r − b)` and `(g − (r+b)/2)`, gray-world colour cast |
| `shadows`, `highlights`, `blackPoint` | 5th, 95th and 1st luminance percentiles |
| `falloff` | edge brightness ÷ centre brightness (vignetting) |

`measureNoise` ([analysis.js:97](client/src/engine/analysis.js#L97)) is the median absolute
Laplacian, a texture estimate used only for grain. `classifyStyle` ([:271](client/src/engine/analysis.js#L271))
gives the human label ("Golden hour", "Faded film", …), and `extractPalette` ([:283](client/src/engine/analysis.js#L283))
picks dominant colours from 4-bit buckets, skipping near-duplicates.

## 11. Inspiration → recipe (the fitter)

This is the core idea from the plan. **Copying a reference's numbers doesn't work**, because two
photos taken in different light need different edits to look alike. EditMate keeps three things
apart:

1. **Measured**: `measure(reference)` gives the target.
2. **Suggested**: slider values that make `measure(applyAdjustments(yourPhoto, values))` match
   the target. That's a search problem, solved by `fitAdjustments`
   ([analysis.js:169](client/src/engine/analysis.js#L169)).
3. **Refined**: the strength slider plus every individual slider.

### How `fitAdjustments` searches

It's damped Gauss-Newton (Levenberg-Marquardt) over the 200 px thumbnail of *your* photo:

- Each fitted dimension pairs a measured stat with the slider that drives it, plus a "noticeable
  difference" `scale` that normalises the error terms (`FIT_DIMENSIONS`, [:120](client/src/engine/analysis.js#L120)).
- `evaluate(x)` ([:180](client/src/engine/analysis.js#L180)) renders the thumbnail with slider vector
  `x` through the **real pipeline** and returns normalised residuals.
- Each iteration ([:193](client/src/engine/analysis.js#L193)) estimates the Jacobian numerically
  (one extra render per slider, ±6 units), then solves `(JᵀJ + λ·diag(JᵀJ) + μI) Δ = −Jᵀr − μx`
  (`solveStep`, [:209](client/src/engine/analysis.js#L209)). λ damps the step; μ gently prefers
  smaller edits when the answer is ambiguous.
- **Bounds are handled properly:** a slider already at its limit and being pushed further is frozen
  and the step re-solved ([:231](client/src/engine/analysis.js#L231)). Without this, an unreachable
  target (say, turning a blue daytime sea orange) dragged every other slider to an extreme. Fixing it
  took a test pair from a 35% match to 83%.
- It stops when the error stops improving or the step gets tiny. It returns the adjustments plus
  `matchBefore` and `matchAfter` scores, `100·e^(−rms/3)` ([:264](client/src/engine/analysis.js#L264)).

Grain isn't fitted, because it barely moves global statistics. It's estimated from the texture
difference between the two images at the same 512 px analysis size (`suggestGrain`, [:267](client/src/engine/analysis.js#L267)).

### Where it runs

[useInspiration.js](client/src/features/inspire/useInspiration.js) analyses the reference once
(`analyzeReference`, [:21](client/src/features/inspire/useInspiration.js#L21)) and **re-fits whenever
your photo's crop or rotation changes** ([:67](client/src/features/inspire/useInspiration.js#L67)),
because a different framing has different statistics. `scaleRecipe` ([:32](client/src/features/inspire/useInspiration.js#L32))
applies the strength slider. [InspirationProvider.jsx](client/src/features/inspire/InspirationProvider.jsx)
sits above the dock so the reference survives switching tabs. The UI is
[InspireDock.jsx:117](client/src/features/inspire/InspireDock.jsx#L117), and the "intent" copy per
step comes from [recipeCopy.js](client/src/features/inspire/recipeCopy.js).

## 12. Auto tone and auto white balance

Both reuse the fitter with a narrower target ([client/src/engine/auto.js](client/src/engine/auto.js)):

- **Auto tone** ([auto.js:12](client/src/engine/auto.js#L12)) fits only brightness, contrast,
  highlights and shadows, towards a *comfortable range around the photo's own values*. A night shot
  stays darker than a beach shot.
- **Auto WB** ([auto.js:26](client/src/engine/auto.js#L26)) fits warmth and tint to remove the average
  colour cast (gray-world).

Other sliders you've set are held fixed during the fit.

## 13. The crop tool

Math in [client/src/engine/cropMath.js](client/src/engine/cropMath.js) works in the rotated bounding
box's pixel space, described by a `frame` (`createFrame`, [:11](client/src/engine/cropMath.js#L11)).

- `isRectOnImage` ([:34](client/src/engine/cropMath.js#L34)) un-rotates each corner of the box and
  checks it lies on the photo. That's what forbids empty corners on straightened images.
- `constrainRect` ([:56](client/src/engine/cropMath.js#L56)) binary-searches between the last valid
  rect and the requested one. Dragging into an edge **slides to a stop** instead of refusing the move.
  It's the same code for moving and resizing.
- `resizeRect` ([:74](client/src/engine/cropMath.js#L74)) handles 8 handles; with a locked ratio,
  corners follow the dominant axis and edges grow the other side symmetrically.
- `largestRect` ([:124](client/src/engine/cropMath.js#L124)) powers the Maximise button and ratio
  changes on small boxes.

State lives in [CropProvider.jsx](client/src/features/crop/CropProvider.jsx#L22): aspect choice (Free,
Original, presets, Custom W:H), the portrait/landscape swap (`ratio`, [:33](client/src/features/crop/CropProvider.jsx#L33)),
and the draft rect. The draft starts from the committed crop when the tool opens or the rotation
changes ([:48](client/src/features/crop/CropProvider.jsx#L48)), and is re-shaped when the ratio changes
([:60](client/src/features/crop/CropProvider.jsx#L60)). **Nothing is committed until Apply**
(`applyCrop`, [:79](client/src/features/crop/CropProvider.jsx#L79)), which converts the box back to
fractions.

The stage ([CropStage.jsx:54](client/src/features/crop/CropStage.jsx#L54)) draws the whole rotated
photo *with your adjustments* (`useCropBackdrop`, [:28](client/src/features/crop/CropStage.jsx#L28)),
darkens outside the box with a large `box-shadow`, and turns pointer deltas into box pixels
(`onPointerMove`, [:76](client/src/features/crop/CropStage.jsx#L76)).

## 14. Controls: sliders, D-pad, straighten dial

- **Sliders** ([AdjustmentSlider.jsx](client/src/features/adjust/AdjustmentSlider.jsx#L10)) are native
  `<input type="range">` for accessibility and keyboard support, styled in [index.css](client/src/index.css).
  The fill runs from zero for bipolar sliders and from the left for 0–100 ones. Double-click resets.
- **D-pad** ([ControlPad.jsx:58](client/src/features/controls/ControlPad.jsx#L58)): ↑/↓ cycle through
  adjustments and ←/→ nudge the focused one. `useHoldRepeat` ([:10](client/src/features/controls/ControlPad.jsx#L10))
  repeats with acceleration while held and commits one undo step on release.
  `useFocusNavigation` ([:39](client/src/features/controls/ControlPad.jsx#L39)) is shared with the
  keyboard arrows.
- **Straighten dial** ([StraightenDial.jsx:38](client/src/features/controls/StraightenDial.jsx#L38)):
  a drag turns the needle; the image rotates by half the needle's angle (`DIAL_RATIO = 2`), so ±45°
  spans the left and right quarters. It snaps to level near 0, double-click resets, and it's
  keyboard-accessible as `role="slider"`.
- The rotation, flip and straighten actions shared by the dial and crop panel live in
  `useGeometryActions` ([CropProvider.jsx:120](client/src/features/crop/CropProvider.jsx#L120)).
  Rotating clears a manual crop, because its fractions belong to the old bounding box.

## 15. Presets: client side

- **Built-ins:** [builtInPresets.js](client/src/features/presets/builtInPresets.js#L5), 8 looks, always
  available.
- **Saved presets:** [PresetsProvider.jsx](client/src/features/presets/PresetsProvider.jsx#L9) loads
  from the API once it reports `online`, and deletes optimistically, rolling back on error.
- **Live thumbnails:** each card renders the preset onto *your* thumbnail with the same pipeline
  ([PresetsDock.jsx:13](client/src/features/presets/PresetsDock.jsx#L13)). Delete needs a second click
  to confirm.
- **Saving:** [SavePresetDialog.jsx](client/src/features/presets/SavePresetDialog.jsx#L21) uses a native
  `<dialog>` and builds the swatch from the *edited* thumbnail (`paletteOf`). It shows validation and
  `409` duplicate-name errors inline.
- **API status:** [useApiStatus.js](client/src/lib/useApiStatus.js#L9) polls `/api/health` every 30 s
  and on window focus, and drives the dot at the bottom of the rail: green (online), yellow (no
  database), red (offline).
- **HTTP client:** [lib/api.js](client/src/lib/api.js). It generates the anonymous `X-Client-Id` once
  per browser (localStorage) and turns failures into `ApiError` with status and details.

## 16. The API server

Classic layering: **routes → middleware → controllers → services → models**.

| Layer | File | Responsibility |
| --- | --- | --- |
| App | [app.js:8](server/src/app.js#L8) | helmet, CORS, a 32 kB JSON limit, `/api/health`, routers, error handling |
| Entry | [server.js](server/src/server.js) | listen, connect to Mongo *if* `MONGODB_URI` is set, graceful shutdown |
| Config | [config.js](server/src/config.js#L10) | env vars (`PORT`, `MONGODB_URI`, `CORS_ORIGIN`) |
| Routes | [presets.routes.js](server/src/routes/presets.routes.js#L10) | `GET / POST / PATCH /:id / DELETE /:id` |
| Middleware | [clientId.js](server/src/middleware/clientId.js#L9) | requires a valid `X-Client-Id`, sets `req.clientId` |
| | [requireDatabase.js](server/src/middleware/requireDatabase.js#L4) | `503` with a helpful message when Mongo isn't connected |
| | [validate.js](server/src/middleware/validate.js#L2) | zod parse; replaces `req.body` with the clean value |
| | [errorHandler.js](server/src/middleware/errorHandler.js#L9) | ZodError → 400 with field paths, dup key → 409, bad JSON → 400, `HttpError` → its status, else 500 |
| Controllers | [presets.controller.js](server/src/controllers/presets.controller.js) | HTTP in/out only |
| Services | [presets.service.js](server/src/services/presets.service.js) | queries; every one is scoped by `clientId` |
| Model | [Preset.js](server/src/models/Preset.js) | schema from the shared list; JSON hides `_id`/`clientId` and exposes `id` |

Details worth knowing:

- **Ownership:** every query includes `clientId`, so another browser's preset id returns `404`, not
  `403`, and doesn't reveal that it exists ([presets.service.js:19](server/src/services/presets.service.js#L19)).
- **Unique names, ignoring case:** a compound index with a strength-2 collation
  ([Preset.js:31](server/src/models/Preset.js#L31)).
- **Strict validation:** unknown adjustment keys and out-of-range values are rejected
  ([preset.schema.js](server/src/schemas/preset.schema.js)).
- **Works without a database:** the server still starts, `/api/health` reports `not-configured`,
  and preset routes answer `503`.
- **`dev:memory`:** [scripts/dev-memory.js](server/scripts/dev-memory.js) starts
  `mongodb-memory-server`, sets `MONGODB_URI`, then imports the normal server.
- Express 5 forwards rejected promises from async handlers to the error handler, so controllers
  have no try/catch.

### 16.1 Where presets are saved, and how the server knows they're yours

**Short answer:** presets are stored in MongoDB, tagged with an anonymous ID that belongs to *your
browser*. You only ever see presets saved from that browser. Nobody else sees them, and you don't
see anyone else's. There's no login yet, by design.

#### How it works

```
Your browser                                   API                          MongoDB
────────────                                   ───                          ───────
localStorage["editmate.clientId"] = "9f3c…e1"
        │
        │  POST /api/presets
        │  X-Client-Id: 9f3c…e1      ─────►  requireClientId
        │  { name, adjustments }               req.clientId = "9f3c…e1"
        │                                      Preset.create({ …, clientId }) ──► { name, adjustments,
        │                                                                          clientId: "9f3c…e1" }
        │  GET /api/presets          ─────►  Preset.find({ clientId })     ◄── only this browser's rows
```

1. **The ID is created once per browser.** On first use, `clientId()`
   ([client/src/lib/api.js:5](client/src/lib/api.js#L5)) generates a random 32-character ID with
   `crypto.randomUUID()` ([:8](client/src/lib/api.js#L8)) and saves it in localStorage as
   `editmate.clientId`. You can see it in DevTools → Application → Local Storage.
2. **Every preset request sends it** in the `X-Client-Id` header (`request()` in the same file).
3. **The server requires it.** `requireClientId`
   ([server/src/middleware/clientId.js:9](server/src/middleware/clientId.js#L9)) rejects missing or
   malformed IDs with `400` and puts the value on `req.clientId`.
4. **Every stored preset carries it.** `clientId` is a required, indexed field on the model
   ([server/src/models/Preset.js:10](server/src/models/Preset.js#L10)). Uniqueness of names is also
   per ID ([:32](server/src/models/Preset.js#L32)), which is why two browsers can both have a
   preset called "Moody".
5. **Every query filters by it.** `listPresets`, `updatePreset` and `deletePreset`
   ([server/src/services/presets.service.js:11](server/src/services/presets.service.js#L11),
   [:19](server/src/services/presets.service.js#L19), [:29](server/src/services/presets.service.js#L29))
   always include `clientId` in the filter. A query physically cannot return another browser's
   rows.
6. **Other people's presets look like they don't exist.** If another browser tries to edit or delete
   one of your preset IDs, the filter matches nothing and it gets `404`, not `403`, so it can't
   even confirm the preset exists. The `clientId` field is also stripped from every API response
   (the model's `toJSON` transform).

This is covered by the test *"scopes list, update and delete to the owning client"*
([server/test/presets.test.js:70](server/test/presets.test.js#L70)).

#### What this does and doesn't give you

| | Anonymous browser ID (today) |
| --- | --- |
| Others see your presets? | **No.** Every query is scoped to your ID. |
| Same presets in another browser or device? | **No.** Each browser has its own ID. |
| Survives clearing site data, private windows, switching browsers? | **No.** A new ID is created, and the old presets remain in MongoDB but are no longer reachable. |
| Is it real security? | **Partly.** The ID is 128 random bits, so it can't be guessed, but it works like a password stored in the browser. Anyone who copies it from your browser can read your presets. Fine for slider values, not for private data. |
| Needs sign-up? | **No.** That's the point: you can try the app instantly. |

> **In development right now** the API runs on the temporary in-memory database
> (`npm run dev:memory -w server`), so presets vanish when it restarts. Set `MONGODB_URI` in
> `server/.env` to keep them permanently.

#### Why it's built this way

The implementation plan says to *"add authentication only when user accounts are needed."*
Anonymous IDs let people use presets with zero friction, while the server is already shaped for
accounts: identity is resolved in **one middleware**, and everything below it only sees
`req.clientId`.

#### Upgrading to real accounts (when you need presets that follow *you*)

The full proposal (data model, API, security checklist, setup and tests) is in
[GOOGLE_SIGN_IN.md](GOOGLE_SIGN_IN.md). In short:

1. **Add sign-in.** Google OAuth or an email magic link, issuing an HTTP-only session cookie or a
   JWT.
2. **Add a `users` collection**, and key presets by `ownerId` (the user's id) instead of `clientId`.
3. **Swap the middleware.** Replace `requireClientId` with `requireUser`, which verifies the
   session and sets `req.ownerId`. The services, controllers and queries stay the same apart from
   the field name.
4. **Keep existing presets.** On a browser's first sign-in, move its anonymous presets into the
   account: `updateMany({ clientId }, { $set: { ownerId }, $unset: { clientId: 1 } })`, resolving
   name clashes. Nothing anyone saved before signing up is lost.
5. **Optionally keep anonymous use**, so signing in becomes "sync my presets across devices" rather
   than a wall in front of the app.

## 17. Background, layers and export

### 17.1 Remove and replace the background

- **Segmentation** lives in one adapter, [engine/segment.js](client/src/engine/segment.js). It runs
  `@imgly/background-removal` (the ISNet model on ONNX Runtime Web) **in the browser, in a worker**.
  The photo never leaves the device. The library, the 24 MB runtime and the model (fetched once from
  img.ly's CDN, then cached) load lazily on the first click, so the main bundle stays small. The
  adapter returns a full-size canvas whose **alpha channel is the subject**.
- [useSubjectMask.js](client/src/state/useSubjectMask.js) runs it once per photo, with download and
  inference progress, and abandons stale runs when you open another photo.
- The mask goes through the same `renderGeometry` as the photo, so crops, rotations and flips
  keep it aligned ([EditorProvider.jsx](client/src/state/EditorProvider.jsx#L23), `maskBase`).
- [BackgroundPanel.jsx](client/src/features/background/BackgroundPanel.jsx) offers Remove
  (transparent), Colour, Photo (cover-fitted) and Blur. Picking a mode detects the subject first if
  needed.

### 17.2 Layers: text, shapes, photos

- **Model** ([engine/layers.js](client/src/engine/layers.js)): every layer stores its centre, width and
  height as **fractions of the output**, and font size and stroke width as fractions of its height.
  It renders identically at preview size and at full resolution, and survives crops.
  - Text: 5 fonts, bold/italic, alignment, letter spacing, colour, outline, drop shadow, word-wrapping
    to the box width (`layoutText`).
  - Shapes: rectangle (rounded corners), ellipse, line, arrow, with fill and outline.
  - Images: photos or logos (PNG transparency kept), aspect-locked by default.
  - All layers: opacity, rotation, blend mode (normal, multiply, screen, overlay, soft light),
    hide, reorder, duplicate.
- **Interaction math** ([engine/layerMath.js](client/src/engine/layerMath.js)) is pure and tested:
  rotation-aware hit testing (top-most wins), resizing that keeps the opposite corner anchored even
  on a rotated layer (`resizeBox`), and rotation that snaps near 0/90/180/270° (Shift snaps to 15°).
- **On-canvas editing** ([LayerOverlay.jsx](client/src/features/layers/LayerOverlay.jsx)): click to
  select, drag to move with centre-snap guides, corner/side handles, a rotate knob, and double-click
  text to edit it. Clicks that miss every layer fall through to the stage for panning.
- **One undo step per gesture**, as with sliders: drags and typing `preview`, release/blur
  `commit` ([useLayerActions.js](client/src/features/layers/useLayerActions.js)).

### 17.3 Compositing

[engine/composite.js](client/src/engine/composite.js) `compose()` is the final stage for both the
preview and the export:

```
backdrop (photo | transparent | colour | photo, cover-fit | blurred photo)
  → subject = adjusted photo masked with 'destination-in'
  → layers, bottom to top
```

It's canvas 2D compositing, so it's GPU-accelerated and cheap enough to redo on every drag. Blur
uses the canvas's Gaussian `filter` where supported (detected once) and a stepped halve/double
fallback elsewhere (Safari). Its radius is a fraction of the image size, so it's resolution
independent. Edits with no layers and the original background skip compositing entirely
(`hasComposition`).

### 17.4 Export

[engine/exportImage.js](client/src/engine/exportImage.js), driven by
[ExportMenu.jsx](client/src/features/export/ExportMenu.jsx):

1. `renderFull` re-renders at **full resolution**: geometry, the pipeline in a throwaway worker
   (`processInWorker`, [usePreviewRenderer.js:106](client/src/engine/usePreviewRenderer.js#L106)),
   then `compose()` with the full-size mask once fonts are loaded.
2. `encodeExport` optionally downsizes (Original, 4K, 2048 px, 1080 px; never upscales) and encodes:

   | Format | Transparency | Notes |
   | --- | --- | --- |
   | JPEG | flattened onto white | smallest for photos; quality slider |
   | PNG | ✅ | lossless |
   | WebP | ✅ | small; quality slider |
   | AVIF | ✅ | only where the browser can encode it (feature-detected; disabled otherwise) |
   | PDF | flattened onto white | single page sized at 300 dpi |

   Browsers silently fall back to PNG for MIME types they can't encode, so `canEncode` checks the
   actual blob type once per format.
3. **PDF** is written by a tiny dependency-free writer, [engine/pdf.js](client/src/engine/pdf.js). It
   embeds the JPEG bytes unchanged (DCTDecode), so there's no re-compression, and builds a correct
   xref table. The tests check every offset, and pypdf parses the output in strict mode.
4. The format, quality and size are remembered per browser
   ([useExportSettings.js](client/src/state/useExportSettings.js)), so ⌘E repeats the last export.
   With no saved choice, the format matches the original, or PNG for transparent edits.

The edit-count pill shows "exported" while the current document still equals the exported one
([EditorProvider.jsx:110](client/src/state/EditorProvider.jsx#L110)).

### 17.5 Responsive layout

[App.jsx](client/src/App.jsx) picks one of two layouts with `useMediaQuery`
([lib/useMediaQuery.js](client/src/lib/useMediaQuery.js)). Both render the **same panels**; only
the arrangement changes.

| Width | Layout |
| --- | --- |
| **≥ 1024 px** (laptops, desktops, landscape tablets) | Side rail, viewport + tool panel, dock + dial. The D-pad appears from 1280 px, where there's room for it. |
| **< 1024 px** (phones, portrait tablets) | App-style and fits the screen with no page scroll: top bar (name, undo/redo, open) → the photo filling the free space → a scrollable sheet for the active tool → a 6-tab bar ([MobileChrome.jsx](client/src/features/rail/MobileChrome.jsx)). |

Touch details:
- Pinch to zoom and one-finger pan when zoomed (tracked in the capture phase so it also works over
  layers).
- Larger layer handles and hit areas on `(pointer: coarse)` devices.
- Apply/Cancel on the photo while cropping.
- 16 px inputs so iOS doesn't zoom on focus.
- Safe-area padding for notches and home bars (`viewport-fit=cover`), and no pull-to-refresh bounce.

Verified with no horizontal overflow at 320×568, 375×812, 768×1024, 1024×768 and 1500×920.

## 18. Keyboard, drag-and-drop, toasts

- **Hotkeys:** [useHotkeys.js](client/src/lib/useHotkeys.js#L22) ignores keystrokes in text fields
  and open dialogs, and reports whether the focused control already uses the arrow keys (sliders,
  dial, divider). The bindings are in [App.jsx:70](client/src/App.jsx#L70) and are listed in the `?`
  dialog ([ShortcutsDialog.jsx](client/src/components/ShortcutsDialog.jsx#L6)).
- **Drag-and-drop:** the app root counts `dragenter`/`dragleave` to show the overlay. The Inspire
  drop zone stops propagation so it doesn't trigger that overlay, and a capture-phase `drop`/`dragend`
  listener on `window` always clears it ([App.jsx:119](client/src/App.jsx#L119)).
- **Toasts:** [Toaster.jsx](client/src/components/Toaster.jsx#L12). At most three show at a time,
  errors stay up longer, and they're announced to screen readers through `aria-live`.

## 19. Tests

```bash
npm test            # all workspaces
```

| Suite | File | Covers |
| --- | --- | --- |
| Shared | [shared/test/adjustments.test.js](shared/test/adjustments.test.js) | normalising, clamping, neutral detection |
| API | [server/test/presets.test.js](server/test/presets.test.js) | create with defaults, validation, case-insensitive 409, ownership scoping, malformed ids |
| Engine | [client/test/engine.test.js](client/test/engine.test.js) | pipeline identity, curve endpoints, each slider moves its stat, stable grain, **fitter recovers a known look**, bounds, geometry, history semantics |
| Crop | [client/test/cropMath.test.js](client/test/cropMath.test.js) | free/locked resizing, minimum size, edge clamping, straightened-image constraints |
| Layers | [client/test/layerMath.test.js](client/test/layerMath.test.js) | rotated hit testing, anchored resize at any rotation, aspect lock, rotation snapping |
| PDF | [client/test/pdf.test.js](client/test/pdf.test.js) | valid structure, exact xref offsets, page size from dpi, escaping, JPEG embedded unchanged |

The engine tests run in plain Node with no browser, which only works because `engine/` is pure.

## 20. Recipes: how to extend it

**Add a slider (e.g. "clarity")**

1. Add it to `ADJUSTMENTS` in [shared/src/adjustments.js](shared/src/adjustments.js#L5). The UI, API
   validation and Mongo schema pick it up automatically.
2. Implement it in `applyAdjustments` ([pipeline.js:60](client/src/engine/pipeline.js#L60)), or in
   `toneCurve` if it's a per-channel tone change.
3. Optionally add a `FIT_DIMENSIONS` entry so Inspire can suggest it, and an intent line in
   [recipeCopy.js](client/src/features/inspire/recipeCopy.js).
4. Add a "moves its stat" assertion in [engine.test.js](client/test/engine.test.js).

**Add a built-in preset:** append to [builtInPresets.js](client/src/features/presets/builtInPresets.js).

**Add a crop ratio:** append to `ASPECTS` in [CropProvider.jsx:7](client/src/features/crop/CropProvider.jsx#L7)
as `{ key: '5:7', ratio: [7, 5] }` (landscape-first).

**Add an API resource:** follow the preset path. Write a zod schema, model, service (scope by
`clientId`), controller and router, and mount it in [app.js](server/src/app.js#L23).

**Swap the analyser for a vision model:** have it return the same shape as `measure()`. Everything
downstream (fitter, strength, match score) works unchanged.

---

# Part II: why it's built this way

## 21. System design principles

Each principle below is stated with **what we did**, **why**, and **where it lives** in the code.

### 21.1 Local-first, privacy by design
- **What:** decoding, editing, analysis and export all run in the browser. The server never
  receives a pixel, only preset names and numbers.
- **Why:** photos are personal. It also means no upload wait, no storage bill, no image-processing
  servers to scale, and the editor keeps working when the API is down.
- **Where:** [EditorProvider.jsx](client/src/state/EditorProvider.jsx#L23) (everything client-side) and
  the 32 kB request-body limit in [app.js:14](server/src/app.js#L14), which makes it physically
  impossible to post an image.

### 21.2 Single source of truth
- **What:** the adjustment list (keys, ranges, defaults) is defined once, in `shared/`, and both the
  client and the server import it.
- **Why:** with separate copies, the client could allow a value the server rejects, or the reverse.
  Here that class of bug can't happen.
- **Where:** [shared/src/adjustments.js](shared/src/adjustments.js#L5), used by
  [Preset.js](server/src/models/Preset.js), [preset.schema.js](server/src/schemas/preset.schema.js#L12)
  and [AdjustPanel.jsx](client/src/features/adjust/AdjustPanel.jsx#L19).

### 21.3 Functional core, imperative shell
- **What:** the image engine is pure functions (`pixels in → pixels out`, `pixels → numbers`). React,
  workers and the DOM form a thin shell around it.
- **Why:** pure code is predictable, reusable at any resolution, and testable in plain Node. The same
  `applyAdjustments` runs the preview, thumbnails, preset cards, the recipe fitter and the export.
- **Where:** [pipeline.js](client/src/engine/pipeline.js#L60), [analysis.js](client/src/engine/analysis.js),
  [cropMath.js](client/src/engine/cropMath.js), [history.js](client/src/state/history.js#L70). The shell is
  [usePreviewRenderer.js](client/src/engine/usePreviewRenderer.js#L12).

### 21.4 Non-destructive, immutable edits
- **What:** the original bitmap is never changed. An edit is a small immutable document
  (`adjustments + geometry`) that's re-applied from scratch every time.
- **Why:** you can always undo, compare against the original, and re-export at full quality.
  Rounding errors never pile up from editing pixels in place.
- **Where:** [history.js:13](client/src/state/history.js#L13) (the document) and
  [EditorProvider.jsx:47](client/src/state/EditorProvider.jsx#L47) (re-derived `base`).

### 21.5 Separate the gesture from the decision (preview vs commit)
- **What:** live values (`present`) update on every input event; history (`committed`) only records
  finished gestures.
- **Why:** undo maps to what the user *did* ("dragged contrast"), not to 60 tiny events a second.
  It also keeps history small.
- **Where:** [history.js:42](client/src/state/history.js#L42) and
  [AdjustmentSlider.jsx](client/src/features/adjust/AdjustmentSlider.jsx#L10).

### 21.6 Resolution independence
- **What:** geometry is stored as fractions of the rotated box, the vignette uses normalised
  distance, and grain cells scale with image width.
- **Why:** one edit document produces the same picture at 200 px, 1800 px and 50 MP. There's no
  preview-only state to drift from the export.
- **Where:** [geometry.js](client/src/engine/geometry.js#L62) and
  [pipeline.js:55](client/src/engine/pipeline.js#L55) (`grainCellSize`).

### 21.7 Keep the main thread free (offload heavy compute)
- **What:** per-pixel work happens in a Web Worker. Buffers are *transferred*, not copied.
- **Why:** the UI thread has 16 ms per frame. Running a 40 ms render there would freeze sliders and
  animations.
- **Where:** [render.worker.js](client/src/engine/render.worker.js) and
  [usePreviewRenderer.js:35](client/src/engine/usePreviewRenderer.js#L35).

### 21.8 Backpressure: latest-wins scheduling
- **What:** at most one render is ever in flight. Newer requests overwrite the pending one instead of
  queueing.
- **Why:** a queue would grow while you drag and then replay stale frames for seconds afterwards.
  Latest-wins always converges on what you're looking at now.
- **Where:** `requestRender` and the `dirty` flag in [usePreviewRenderer.js:35](client/src/engine/usePreviewRenderer.js#L35).

### 21.9 Cheap work first: precompute, then loop
- **What:** seven tone and colour sliders are folded into three 256-entry lookup tables before the
  pixel loop. Effects at zero are skipped entirely.
- **Why:** the per-pixel loop runs millions of times. Moving work outside it is the single biggest
  performance win (about 12 ms vs about 40 ms on 2 MP).
- **Where:** [pipeline.js:30](client/src/engine/pipeline.js#L30) (`buildChannelLuts`) and
  [pipeline.js:65](client/src/engine/pipeline.js#L65) (`doColor` fast path).

### 21.10 Self-healing state
- **What:** the worker always replies. A missing source triggers a resend, and stale frames are
  dropped by version number.
- **Why:** an earlier version could deadlock when the worker restarted (React Strict Mode, hot
  reload): a lost reply left the loop "busy" forever. Systems that recover themselves beat systems
  that are merely correct on the happy path.
- **Where:** [usePreviewRenderer.js:57](client/src/engine/usePreviewRenderer.js#L57) and
  [render.worker.js:30](client/src/engine/render.worker.js#L30).

### 21.11 Graceful degradation
- **What:** no database means the API still runs and presets answer `503` with a clear message. No
  API means the editor still works fully and the rail dot turns red.
- **Why:** a missing optional dependency shouldn't take down core features. You can develop and
  demo without MongoDB.
- **Where:** [server.js](server/src/server.js), [requireDatabase.js](server/src/middleware/requireDatabase.js#L4)
  and [useApiStatus.js](client/src/lib/useApiStatus.js#L9).

### 21.12 Defence in depth for data
- **What:** values are checked three times: clamped in the UI, validated strictly by zod (unknown
  keys rejected), and range-checked by Mongoose.
- **Why:** the API is reachable by any client, not just ours. Never trust input, even your own.
- **Where:** [adjustments.js:37](shared/src/adjustments.js#L37), [preset.schema.js](server/src/schemas/preset.schema.js)
  and [Preset.js](server/src/models/Preset.js).

### 21.13 Ownership scoping (least privilege)
- **What:** every query filters by `clientId`. Someone else's preset id returns `404`, not `403`.
- **Why:** a `403` would confirm the record exists. A query that can't see other users' rows can't
  leak them by accident.
- **Where:** [presets.service.js](server/src/services/presets.service.js) and
  [clientId.js](server/src/middleware/clientId.js#L9).

### 21.14 Layered backend (separation of concerns)
- **What:** routes → middleware → controllers → services → models.
- **Why:** HTTP details stay out of business logic, and database details stay out of controllers.
  Swapping auth, adding caching or changing the database only touches one layer.
- **Where:** [server/src](server/src) (see §16).

### 21.15 Explicit constraints over silent failure
- **What:** in the crop tool, a move into an edge *slides to the limit* instead of being rejected. The
  fitter freezes sliders at their bounds instead of fighting them.
- **Why:** users should always see the closest valid result to what they asked for.
- **Where:** [cropMath.js:56](client/src/engine/cropMath.js#L56) and [analysis.js:231](client/src/engine/analysis.js#L231).

### 21.16 Measure, don't guess
- **What:** the recipe isn't a lookup table of "golden hour = +20 warmth". It's a numerical fit
  against the real pipeline output, scored with a match percentage.
- **Why:** this is the product's core claim, and it's verifiable: the test suite checks that the
  fitter recovers a known look ([engine.test.js](client/test/engine.test.js)).
- **Where:** [analysis.js:169](client/src/engine/analysis.js#L169).

### 21.17 Accessible by default
- **What:** native range inputs, `role="slider"` with values on the custom dial and divider, keyboard
  paths for every gesture, `aria-live` toasts and visible focus rings.
- **Why:** a mouse-only editor excludes people and slows down power users.
- **Where:** [StraightenDial.jsx](client/src/features/controls/StraightenDial.jsx#L38),
  [CompareDivider.jsx](client/src/features/viewport/CompareDivider.jsx#L9) and
  [useHotkeys.js](client/src/lib/useHotkeys.js#L22).

## 22. How EditMate compares to other editors

The honest version: what's genuinely different, and where others are ahead.

| | **EditMate** | Lightroom | Snapseed | VSCO / Instagram filters | Canva / Photopea |
| --- | --- | --- | --- | --- | --- |
| Copy a look from *any* photo | ✅ fits a recipe to **your** photo | ⚠️ only from presets someone made | ❌ | ❌ fixed filters | ❌ |
| Explains what the look does | ✅ each step has an intent ("cooler colour cast") | ❌ | ❌ | ❌ | ❌ |
| Photos stay on your device | ✅ always | ⚠️ cloud sync by default | ✅ (mobile app) | ❌ uploaded | ❌ uploaded/cloud |
| Account required | ❌ none | ✅ Adobe ID | ❌ | ✅ | ✅ |
| Runs in any browser, nothing to install | ✅ | ⚠️ web version is limited | ❌ mobile only | ❌ app | ✅ |
| Price | free / self-hostable | subscription | free | freemium | freemium |
| Non-destructive + unlimited re-export | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| Masks, curves, HSL, RAW files | ❌ not yet | ✅ | ✅ partly | ❌ | ⚠️ |
| Layers: text, shapes, photos | ✅ | ❌ | ⚠️ text | ❌ | ✅ |
| AI background removal | ✅ on-device | ✅ | ❌ | ❌ | ✅ uploaded / paid |
| Export JPEG, PNG, WebP, AVIF, PDF | ✅ | ⚠️ | ⚠️ | ❌ | ✅ |
| Mobile apps | ❌ web only | ✅ | ✅ | ✅ | ✅ |

**What actually sets it apart**

1. **"Make mine look like that"**: filters apply the same numbers to every photo, so they look
   great on one photo and wrong on another. EditMate measures both images and *solves* for the edit
   that closes the gap on your specific photo, then shows how close it got (match 34% → 83%). As far
   as we know, mainstream consumer editors don't do this.
2. **It teaches.** Every suggested step comes with plain-language intent, and every value stays
   editable. You learn why a look works, not just that it does.
3. **Private and instant.** No upload, no account, no wait. That's a real advantage for personal
   photos and for anyone on a slow connection.
4. **Cheap to run.** No servers process images, so hosting cost barely grows with users: static files
   plus a tiny presets API.

**Where we're behind** (and the roadmap): local masks, tone curves and HSL, RAW decoding, batch
editing, mobile apps. See the README roadmap.

## 23. Why this tech stack

Every choice was made against an alternative, and the trade-off is written down.

| Layer | Choice | Why | Considered instead |
| --- | --- | --- | --- |
| UI | **React 19** | Component model fits a panel-heavy editor; huge ecosystem; hooks map cleanly onto the "derive, don't store" style (`base`, `thumbnail` are `useMemo`). | Svelte/Solid: smaller and faster, but less familiar to most teams and a smaller hiring pool. |
| Build | **Vite 7** | Instant dev server, first-class Web Worker bundling (`new URL('./render.worker.js', import.meta.url)`), tiny config. Pinned to 7 because Vite 8 trips an npm 10 install bug on Node 20. | Create React App (deprecated), Next.js (we have no server rendering needs; the editor is fully client-side). |
| Styling | **Tailwind CSS 4** | Design tokens live in one `@theme` block ([index.css](client/src/index.css)), so the dark HUD palette stays consistent. There's no CSS file per component and no dead CSS in production. | CSS Modules / styled-components: more files and runtime cost, with less consistency. |
| Rendering | **Canvas 2D + typed arrays in a Web Worker** | The plan asked for Canvas. Exact, deterministic pixel math that's easy to test in Node, works everywhere, fast enough (about 40 ms/2 MP with all effects). | **WebGL/WebGPU** would be 10–50× faster and is the natural next step for masks and 4K live preview, but shader code is harder to test and debug. The pure pipeline can be ported 1:1 later. CSS `filter`: can't do highlights/shadows/grain and doesn't match export. |
| Cropping | **Custom handle-based crop** (`cropMath.js`) | Free-form plus locked ratios with one consistent interaction, and constraints that understand straightened images. | **react-easy-crop** (the plan's original choice) only supports a fixed-ratio box over a moving image, with no free-form crop. It was replaced when custom crop was added. |
| Background removal | **@imgly/background-removal** (ISNet + ONNX Runtime Web) | Runs fully on-device in a worker, works on any subject (not just people), good edge quality. Loaded lazily. ⚠️ **AGPL-3.0**: fine for personal/open projects; shipping commercially needs img.ly's licence or a swap (one file: `engine/segment.js`). | remove.bg / cloud APIs (upload photos, per-image cost, API key), MediaPipe (people only), BiRefNet via transformers.js (MIT, but a ~100 MB+ model). |
| PDF export | **Own 60-line writer** (`engine/pdf.js`) | One page, one embedded JPEG: no re-encoding and no dependency. | jsPDF (~350 kB for a feature we use 1% of). |
| Icons | **lucide-react** | Clean consistent line icons, tree-shaken (only icons used are shipped). | Heroicons (smaller set), icon fonts (accessibility issues). |
| Server | **Node.js + Express 5** | Same language as the client, and it shares the `shared/` schema with no codegen. Express 5 forwards async errors natively, so controllers have no try/catch boilerplate. Minimal, well understood, easy to deploy anywhere. | Fastify (faster, but the speed doesn't matter for a presets API), NestJS (heavy structure for 4 routes). |
| Database | **MongoDB + Mongoose** | A preset *is* a document (`name` + a nested `adjustments` object), so it maps 1:1 with no joins. Adding a slider needs no migration (old documents get the default). Collation indexes give case-insensitive unique names for free. | PostgreSQL: excellent, but a schema migration per slider and an `adjustments` JSONB column would give up most of SQL's advantages here. |
| Validation | **zod 4** | Schemas are built *from* the shared adjustment list; strict objects reject unknown keys; errors map to field paths for inline UI messages. | Joi / express-validator: no type inference, more verbose. |
| Security | **helmet, CORS allow-list, body limit** | Sensible HTTP headers, only our origin can call the API, and payloads can't carry images. | n/a |
| Monorepo | **npm workspaces** | Lets `shared/` be a real package for both apps with zero extra tooling. | Turborepo/Nx: valuable at larger scale, overkill for three packages. |
| Tests | **`node:test`** + supertest + mongodb-memory-server | Built into Node with no framework to install. API tests run against a real MongoDB engine in memory, not mocks. Vitest 5 needs Node 22 and this project targets Node 20. | Jest/Vitest: nicer watch mode, but extra dependencies for the same assertions. |

**The deciding idea behind the stack:** keep *everything heavy* in the browser, where it's free
and private, and keep the server *boringly small*. That's why a lightweight Express + Mongo API is
enough, and why the interesting engineering lives in `client/src/engine/`.
