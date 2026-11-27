import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPUS_FOOTPRINTS,
  JL_BANGO_ROAD_POLY_XZ,
  MARKER_COLOR_HEX,
  cartesianToSpherical,
  clampFreecamPitch,
  clampXRayOpacityPercent,
  computeAdaptivePixelRatio,
  computeFrameDeltaSeconds,
  computeMarkerPlacement,
  computeRealisticSunState,
  computeXRayMaterialState,
  formatSolarTime,
  isXRayBuildingEditableId,
  makeBoxGeometryKey,
  orthoToPerspectiveDistance,
  perspectiveToOrthoFrustum,
  rectsOverlapStrictly,
  resolveExistingMarkerClick,
  resolveSelectableTarget,
  shouldRunThrottledAction,
  snapYToGround,
  sphericalToCartesian,
  stepFreecamPosition,
  summarizeMarkerCounts,
  type SelectableNodeLike,
} from './maquetteMath';

test('Perspective <-> Orthographic projection preserves visible scale seamlessly', () => {
  const fov = 42;
  const distance = 96;
  const aspect = 1440 / 900;

  const ortho = perspectiveToOrthoFrustum(fov, distance, aspect);
  assert.ok(Math.abs((ortho.right - ortho.left) / (ortho.top - ortho.bottom) - aspect) < 1e-6);

  const restoredDist = orthoToPerspectiveDistance(ortho.top, ortho.bottom, 1.0, fov);
  assert.ok(Math.abs(restoredDist - distance) < 1e-6);

  // Zoomed orthographic (2x zoom = half visible height -> half perspective distance)
  const zoomedDist = orthoToPerspectiveDistance(ortho.top, ortho.bottom, 2.0, fov);
  assert.ok(Math.abs(zoomedDist - distance / 2) < 1e-6);
});

test('Spherical azimuth/elevation round-trips accurately across all quadrants', () => {
  const cases = [
    {az: 0, el: 35, r: 90},
    {az: 42, el: 36, r: 98},
    {az: 135, el: 22, r: 60},
    {az: 250, el: 55, r: 75},
    {az: 359, el: 85, r: 110},
  ];
  for (const c of cases) {
    const vec = sphericalToCartesian(c.az, c.el, c.r);
    const back = cartesianToSpherical(vec);
    assert.ok(Math.abs(back.radius - c.r) < 1e-6);
    assert.ok(Math.abs(back.elevationDeg - c.el) < 1e-5);
    const azDiff = Math.abs(back.azimuthDeg - c.az);
    assert.ok(Math.min(azDiff, 360 - azDiff) < 1e-5);
  }
});

test('Campus major building wings, courts, and mosque have zero unintended overlaps', () => {
  for (let i = 0; i < CAMPUS_FOOTPRINTS.length; i++) {
    for (let j = i + 1; j < CAMPUS_FOOTPRINTS.length; j++) {
      const a = CAMPUS_FOOTPRINTS[i];
      const b = CAMPUS_FOOTPRINTS[j];
      assert.equal(
        rectsOverlapStrictly(a, b),
        false,
        `Unexpected strict overlap between ${a.name} and ${b.name}`
      );
    }
  }
});

test('Shortened rear wall leaves tight ~3.5m clearance behind Gedung A tail and encloses rear structures', () => {
  const rearWallZ = -35.2;
  const eastWing = CAMPUS_FOOTPRINTS.find((r) => r.name === 'Gedung A East Wing');
  const gazebo = CAMPUS_FOOTPRINTS.find((r) => r.name === 'Rear Courtyard Gazebo');
  const garden = CAMPUS_FOOTPRINTS.find((r) => r.name === 'Rear Greenhouse Garden');
  const shed = CAMPUS_FOOTPRINTS.find((r) => r.name === 'Rear Storage Shed (Gudang)');
  assert.ok(eastWing && gazebo && garden && shed);

  const clearanceBehindEastWing = eastWing.minZ - rearWallZ;
  assert.ok(
    clearanceBehindEastWing >= 3.2 && clearanceBehindEastWing <= 4.2,
    `Expected ~3.5m tight clearance behind Gedung A tail, got ${clearanceBehindEastWing}m`
  );
  assert.ok(garden.minZ > rearWallZ && shed.minZ > rearWallZ && gazebo.minZ > rearWallZ);
  assert.ok(gazebo.maxX < eastWing.minX, 'Relocated gazebo must sit clear alongside Gedung A East Wing');
});

test('Jl. Bango III L-corner road polygon meets second gate directly at 90 degrees with zero continuation past corner', () => {
  const maxX = Math.max(...JL_BANGO_ROAD_POLY_XZ.map(([x]) => x));
  const minZ = Math.min(...JL_BANGO_ROAD_POLY_XZ.map(([, z]) => z));
  assert.equal(maxX, -0.8, 'No asphalt road may continue past the X=-0.8 second gate corner');
  assert.equal(minZ, 25.8, 'Road inner edge aligns directly with Sign Wall at Z=25.8');
  assert.ok(Math.abs((32.8 - 25.8) - 7.0) < 1e-6);
  assert.ok(Math.abs((-0.8 - -7.8) - 7.0) < 1e-6);
});

test('Gedung A East Wing and North Wing have an open paved driveway corner gap and conjoined 2F mosque', () => {
  const eastWing = CAMPUS_FOOTPRINTS.find((r) => r.name === 'Gedung A East Wing');
  const northWing = CAMPUS_FOOTPRINTS.find((r) => r.name === 'Gedung A North Wing');
  const southWing = CAMPUS_FOOTPRINTS.find((r) => r.name === 'Gedung A South Wing');
  const mosque = CAMPUS_FOOTPRINTS.find((r) => r.name === 'Masjid Khunuzul Ibad (2F Conjoined)');
  assert.ok(eastWing && northWing && southWing && mosque);
  const gapWidth = northWing.minX - eastWing.maxX;
  assert.equal(gapWidth, 7.5, 'Expected 7.5m open driveway gap between East Wing and North Wing');
  assert.equal(mosque.maxZ, southWing.minZ, 'Conjoined 2F mosque must sit flush against Gedung A South Wing');
});

test('Red dot marker placement offsets cleanly along surface normal without z-fighting', () => {
  const floorHit = computeMarkerPlacement({x: 12, y: 3.5, z: -4}, {x: 0, y: 2, z: 0}, 0.32, 0.85);
  assert.ok(Math.abs(floorHit.x - 12) < 1e-6);
  assert.ok(Math.abs(floorHit.y - (3.5 + 0.32 * 0.85)) < 1e-6);
  assert.ok(Math.abs(floorHit.z - -4) < 1e-6);

  const wallHit = computeMarkerPlacement({x: 10.7, y: 5.0, z: -8}, {x: 1, y: 0, z: 0}, 0.32, 0.85);
  assert.ok(wallHit.x > 10.7 + 0.25);
  assert.equal(wallHit.y, 5.0);

  // Zero normal safely falls back to +Y
  const fallback = computeMarkerPlacement({x: 0, y: 0, z: 0}, {x: 0, y: 0, z: 0}, 0.4, 0.5);
  assert.ok(Math.abs(fallback.y - 0.2) < 1e-6);
});

test('Freecam movement steps accurately along heading, clamps pitch, and respects ground floor', () => {
  // Looking straight along -Z (yaw = 0)
  const p1 = stepFreecamPosition({x: 0, y: 4, z: 10}, 0, 0, {forward: 1, right: 0, up: 0}, 10, 0.5);
  assert.ok(Math.abs(p1.x - 0) < 1e-6);
  assert.ok(Math.abs(p1.z - 5) < 1e-6);
  assert.equal(p1.y, 4);

  // Diagonal input is normalized so diagonal flight isn't faster than cardinal flight
  const pDiag = stepFreecamPosition({x: 0, y: 4, z: 0}, 0, 0, {forward: 1, right: 1, up: 0}, 10, 1.0);
  const distDiag = Math.hypot(pDiag.x, pDiag.z);
  assert.ok(Math.abs(distDiag - 10) < 1e-6);

  // Descend clamps cleanly above plinth floor
  const pLow = stepFreecamPosition({x: 0, y: 1, z: 0}, 0, 0, {forward: 0, right: 0, up: -1}, 20, 1.0, 0.35);
  assert.equal(pLow.y, 0.35);

  // Pitch clamps inside +/- 85 deg
  assert.ok(Math.abs(clampFreecamPitch(Math.PI) - (85 * Math.PI) / 180) < 1e-6);
  assert.ok(Math.abs(clampFreecamPitch(-Math.PI) + (85 * Math.PI) / 180) < 1e-6);

  // Ground snap sets Y to 0 while keeping X/Z intact
  const snapped = snapYToGround({x: 15.5, y: 6.2, z: -8.3}, 0);
  assert.deepEqual(snapped, {x: 15.5, y: 0, z: -8.3});
});

test('Selection scope resolves closest individual object vs parent category container accurately', () => {
  const campusRoot: SelectableNodeLike = { parent: null, userData: {} };
  const treesCategory: SelectableNodeLike = {
    parent: campusRoot,
    userData: { isCategoryGroup: true, editableId: 'cat-campus-trees', name: 'Campus Trees & Greenery' },
  };
  const tree4: SelectableNodeLike = {
    parent: treesCategory,
    userData: { isSelectableObject: true, editableId: 'tree-4', name: 'Tree #4' },
  };
  const leafMesh: SelectableNodeLike = { parent: tree4, userData: {} };

  // Default Single Object mode stops strictly at Tree #4, never escalating to category parent
  const singleHit = resolveSelectableTarget(leafMesh, 'single');
  assert.equal(singleHit?.userData.name, 'Tree #4');
  assert.equal(singleHit?.userData.editableId, 'tree-4');

  // Whole Group mode escalates cleanly to Campus Trees & Greenery
  const groupHit = resolveSelectableTarget(leafMesh, 'group');
  assert.equal(groupHit?.userData.name, 'Campus Trees & Greenery');
  assert.equal(groupHit?.userData.editableId, 'cat-campus-trees');

  // Standalone structure marked both selectable + category resolves identically in both modes
  const securityPost: SelectableNodeLike = {
    parent: campusRoot,
    userData: { isSelectableObject: true, isCategoryGroup: true, editableId: 'security-post', name: 'Security Post (Pos Satpam)' },
  };
  const roofMesh: SelectableNodeLike = { parent: securityPost, userData: {} };
  assert.equal(resolveSelectableTarget(roofMesh, 'single')?.userData.editableId, 'security-post');
  assert.equal(resolveSelectableTarget(roofMesh, 'group')?.userData.editableId, 'security-post');
});

test('Multi-color dot marker tool supports 4 colors, recolor-on-different, remove-on-same/erase, and per-color counts', () => {
  assert.deepEqual(MARKER_COLOR_HEX, {
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#eab308',
    grey: '#6b7280',
  });

  // Different active color recolors an existing dot
  assert.deepEqual(resolveExistingMarkerClick('red', 'green', false), { action: 'recolor', nextColor: 'green' });
  assert.deepEqual(resolveExistingMarkerClick('yellow', 'grey', false), { action: 'recolor', nextColor: 'grey' });

  // Same active color removes the existing dot
  assert.deepEqual(resolveExistingMarkerClick('red', 'red', false), { action: 'remove' });
  assert.deepEqual(resolveExistingMarkerClick('grey', 'grey', false), { action: 'remove' });

  // Dedicated Erase mode always removes regardless of active color
  assert.deepEqual(resolveExistingMarkerClick('green', 'red', true), { action: 'remove' });
  assert.deepEqual(resolveExistingMarkerClick('yellow', 'yellow', true), { action: 'remove' });

  // Live summary counts and formatted breakdown
  const summary = summarizeMarkerCounts([
    'red', 'red', 'green', 'yellow', 'yellow', 'yellow', 'grey',
  ]);
  assert.equal(summary.total, 7);
  assert.equal(summary.red, 2);
  assert.equal(summary.green, 1);
  assert.equal(summary.yellow, 3);
  assert.equal(summary.grey, 1);
  assert.equal(summary.label, 'Markers: 7 (R:2 G:1 Y:3 Gr:1)');

  const empty = summarizeMarkerCounts([]);
  assert.equal(empty.label, 'Markers: 0 (R:0 G:0 Y:0 Gr:0)');
});

test('Realistic lighting solar arc transitions smoothly from East sunrise to Noon to West golden hour', () => {
  assert.equal(formatSolarTime(8.0), '08:00');
  assert.equal(formatSolarTime(16.75), '16:45');
  assert.equal(formatSolarTime(18.0833), '18:05');

  const morning = computeRealisticSunState(8.0);
  const noon = computeRealisticSunState(12.25);
  const golden = computeRealisticSunState(16.75);
  const dusk = computeRealisticSunState(18.1);

  // Morning sun rises in the East (-X); Afternoon/Golden sun sets in the West (+X)
  assert.ok(morning.position.x < -40, `Expected East sunrise (-X), got ${morning.position.x}`);
  assert.ok(golden.position.x > 40, `Expected West afternoon (+X), got ${golden.position.x}`);

  // Noon sun peaks higher and brighter than golden hour and dusk
  assert.ok(noon.elevationDeg > morning.elevationDeg);
  assert.ok(noon.elevationDeg > golden.elevationDeg);
  assert.ok(golden.elevationDeg > dusk.elevationDeg);
  assert.ok(noon.sunIntensity > golden.sunIntensity);
  assert.ok(golden.sunIntensity > dusk.sunIntensity);

  // Sky & fog remain synchronized and valid 6-digit hex strings
  for (const state of [morning, noon, golden, dusk]) {
    assert.equal(state.fogColor, state.skyHorizonColor);
    assert.match(state.sunColor, /^#[0-9a-f]{6}$/);
    assert.match(state.skyTopColor, /^#[0-9a-f]{6}$/);
    assert.match(state.skyHorizonColor, /^#[0-9a-f]{6}$/);
  }
});

test('Translucent / X-Ray Building Mode clamps opacity, targets only buildings, and restores opaque state cleanly', () => {
  assert.equal(clampXRayOpacityPercent(5), 15);
  assert.equal(clampXRayOpacityPercent(25), 25);
  assert.equal(clampXRayOpacityPercent(140), 100);
  assert.equal(clampXRayOpacityPercent(Number.NaN), 25);

  // Building wings, roofs, stairwells, mosque, podium, canopies, sheds become translucent
  for (const id of [
    'gedung-a-east',
    'gedung-a-west',
    'gedung-a-stair-2',
    'gedung-a-skybridge',
    'masjid-khunuzul-ibad',
    'gedung-b-ns-wing',
    'gedung-b-south-wing',
    'podium',
    'security-post',
    'entrance-canopy-roof',
    'front-left-shed',
    'back-breezeway-roof',
    'rear-storage-shed',
    'rear-gazebo',
  ]) {
    assert.equal(isXRayBuildingEditableId(id), true, `Expected ${id} to be an X-Ray building target`);
  }

  // Ground courts, trees, benches, fences, and hoops stay opaque
  for (const id of [
    'main-basketball-court',
    'inner-courtyard-floor',
    'rear-garden-patio',
    'tree-1',
    'shrub-2',
    'fence-segment-3',
    'plaza-bench-1',
    'corridor-bench-2',
    null,
    undefined,
  ]) {
    assert.equal(isXRayBuildingEditableId(id), false, `Expected ${String(id)} to remain opaque`);
  }

  // Active default (25%): transparent with depth pre-pass, crisp 80% front edges, subtle interior ghost, see-through markers
  const onDefault = computeXRayMaterialState(true, 25);
  assert.equal(onDefault.transparent, true);
  assert.equal(onDefault.opacity, 0.25);
  assert.equal(onDefault.depthWrite, false);
  assert.equal(onDefault.depthPrepassVisible, true);
  assert.equal(onDefault.edgeOpacity, 0.80);
  assert.ok(onDefault.interiorEdgeOpacity > 0.08 && onDefault.interiorEdgeOpacity < 0.14);
  assert.equal(onDefault.markerDepthTest, false);
  assert.equal(onDefault.markerTransparent, true);
  assert.equal(onDefault.markerRenderOrder, 999);

  // Near-opaque (99%): depth pre-pass prevents inside-out walls, interior lines fade nearly to zero, markers stay visible
  const onHigh = computeXRayMaterialState(true, 99);
  assert.equal(onHigh.depthPrepassVisible, true);
  assert.ok(onHigh.interiorEdgeOpacity <= 0.002);
  assert.equal(onHigh.markerTransparent, true);

  // Toggled OFF restores full opaque state cleanly
  const offState = computeXRayMaterialState(false, 25);
  assert.equal(offState.transparent, false);
  assert.equal(offState.opacity, 1.0);
  assert.equal(offState.depthWrite, true);
  assert.equal(offState.depthPrepassVisible, false);
  assert.equal(offState.edgeOpacity, 1.0);
  assert.equal(offState.interiorEdgeOpacity, 0);
  assert.equal(offState.markerDepthTest, true);
  assert.equal(offState.markerTransparent, false);
  assert.equal(offState.markerRenderOrder, 999);
});

test('Adaptive pixel ratio, hover throttling, and shared geometry keys optimize mobile & GPU efficiency', () => {
  // Software WebGL always locks to 1x
  assert.equal(
    computeAdaptivePixelRatio({ devicePixelRatio: 3, isSoftwareGl: true, isInteracting: false, isCoarsePointer: false }),
    1
  );
  // High-DPI mobile (3x-4x) caps at 2x at rest and drops to 1.5x during active touch dragging
  assert.equal(
    computeAdaptivePixelRatio({ devicePixelRatio: 3.5, isSoftwareGl: false, isInteracting: false, isCoarsePointer: true }),
    2
  );
  assert.equal(
    computeAdaptivePixelRatio({ devicePixelRatio: 3.5, isSoftwareGl: false, isInteracting: true, isCoarsePointer: true }),
    1.5
  );
  // Standard 1x desktop stays at 1x
  assert.equal(
    computeAdaptivePixelRatio({ devicePixelRatio: 1, isSoftwareGl: false, isInteracting: true, isCoarsePointer: false }),
    1
  );

  // Throttling skips touch hover raycasts and enforces ~30fps (33ms) interval on desktop
  assert.equal(shouldRunThrottledAction(100, 0, 33, true), false);
  assert.equal(shouldRunThrottledAction(120, 100, 33, false), false);
  assert.equal(shouldRunThrottledAction(134, 100, 33, false), true);

  // Identical box dimensions normalize to the exact same shared geometry cache key
  assert.equal(makeBoxGeometryKey(0.4, 3.2, 0.4), makeBoxGeometryKey(0.40001, 3.2, 0.4));
  assert.notEqual(makeBoxGeometryKey(0.4, 3.2, 0.4), makeBoxGeometryKey(0.4, 3.5, 0.4));
});

test('Freecam delta timing delivers constant speed across 60Hz, 120Hz, 30Hz, jittery frames, and idle wakeups', () => {
  // Waking up from idle (lastFrameMs === null) gives steady 1/60s without spike
  assert.ok(Math.abs(computeFrameDeltaSeconds(50000, null) - 1 / 60) < 1e-6);
  // Duplicate or out-of-order rAF timestamp yields 0 (never injects phantom motion)
  assert.equal(computeFrameDeltaSeconds(1000, 1000), 0);
  assert.equal(computeFrameDeltaSeconds(995, 1000), 0);
  // Tab switch / long stall clamps cleanly to 0.05s
  assert.equal(computeFrameDeltaSeconds(5000, 1000), 0.05);

  // Simulating 1.0 second of holding W at 18 m/s must travel exactly 18.0 m
  // regardless of 60fps, 120fps, 30fps, or uneven frame durations
  const simulate = (frameTimesMs: number[]) => {
    let pos = { x: 0, y: 10, z: 0 };
    let last: number | null = frameTimesMs[0];
    for (let i = 1; i < frameTimesMs.length; i++) {
      const dt = computeFrameDeltaSeconds(frameTimesMs[i], last);
      last = frameTimesMs[i];
      pos = stepFreecamPosition(pos, 0, 0, { forward: 1, right: 0, up: 0 }, 18.0, dt);
    }
    return Math.abs(pos.z);
  };

  const makeUniform = (fps: number) =>
    Array.from({ length: fps + 1 }, (_, i) => (i * 1000) / fps);

  const dist60 = simulate(makeUniform(60));
  const dist120 = simulate(makeUniform(120));
  const dist30 = simulate(makeUniform(30));
  const distJitter = simulate([0, 11, 34, 48, 81, 97, 130, 146, 180, 212, 229, 260, 300, 333, 350, 385, 420, 455, 490, 520, 560, 600, 635, 670, 710, 745, 780, 820, 860, 900, 935, 970, 1000]);

  assert.ok(Math.abs(dist60 - 18.0) < 1e-4, `60fps expected 18m, got ${dist60}`);
  assert.ok(Math.abs(dist120 - 18.0) < 1e-4, `120fps expected 18m, got ${dist120}`);
  assert.ok(Math.abs(dist30 - 18.0) < 1e-4, `30fps expected 18m, got ${dist30}`);
  assert.ok(Math.abs(distJitter - 18.0) < 1e-4, `Jittery fps expected 18m, got ${distJitter}`);
});




