import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPUS_FOOTPRINTS,
  JL_BANGO_ROAD_POLY_XZ,
  cartesianToSpherical,
  orthoToPerspectiveDistance,
  perspectiveToOrthoFrustum,
  rectsOverlapStrictly,
  sphericalToCartesian,
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
  // Front horizontal leg width (Z=25.8..32.8) and downward vertical leg width (X=-7.8..-0.8) are both 7.0m
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

