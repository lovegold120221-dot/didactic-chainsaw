#!/usr/bin/env node
/**
 * Convert JSON pose files to binary .pose format
 * Format: pose-format v0.2
 */

const fs = require('fs');
const path = require('path');

const POSES_DIR = path.join(__dirname, '../src/assets/gestures/vgt/poses');

const COMPONENTS = [
  {name: 'pose', points: 33},
  {name: 'face', points: 478},
  {name: 'left_hand', points: 21},
  {name: 'right_hand', points: 21},
];

function cstringLength(str) {
  const bytes = Buffer.byteLength(str, 'utf8');
  return 2 + bytes; // length prefix + content
}

function buildHeader() {
  // Fixed header: version(4) + width(2) + height(2) + depth(2) + _components(2) = 12 bytes
  // Then component data

  const parts = [];
  let offset = 0;

  // Version (4 bytes)
  const versionBuf = Buffer.alloc(4);
  versionBuf.writeFloatLE(0.2, 0);
  parts.push(versionBuf);
  offset += 4;

  // Width, height, depth (6 bytes)
  const dimsBuf = Buffer.alloc(6);
  dimsBuf.writeUInt16LE(1000, 0);
  dimsBuf.writeUInt16LE(1000, 2);
  dimsBuf.writeUInt16LE(3, 4);
  parts.push(dimsBuf);
  offset += 6;

  // _components (2 bytes)
  const compCountBuf = Buffer.alloc(2);
  compCountBuf.writeUInt16LE(COMPONENTS.length, 0);
  parts.push(compCountBuf);
  offset += 2;

  // Component data
  for (const comp of COMPONENTS) {
    // Name (length prefix + string)
    const nameBytes = Buffer.from(comp.name, 'utf8');
    const nameLenBuf = Buffer.alloc(2);
    nameLenBuf.writeUInt16LE(nameBytes.length, 0);
    parts.push(nameLenBuf);
    parts.push(nameBytes);
    offset += 2 + nameBytes.length;

    // Format "XYZ" (length prefix + string)
    const formatStr = 'XYZ';
    const formatBytes = Buffer.from(formatStr, 'utf8');
    const formatLenBuf = Buffer.alloc(2);
    formatLenBuf.writeUInt16LE(formatBytes.length, 0);
    parts.push(formatLenBuf);
    parts.push(formatBytes);
    offset += 2 + formatBytes.length;

    // _points, _limbs, _colors (6 bytes)
    const countsBuf = Buffer.alloc(6);
    countsBuf.writeUInt16LE(comp.points, 0);
    countsBuf.writeUInt16LE(0, 2); // no limbs
    countsBuf.writeUInt16LE(0, 4); // no colors
    parts.push(countsBuf);
    offset += 6;

    // Point names (each: 2 bytes length prefix + 0 for empty string)
    for (let i = 0; i < comp.points; i++) {
      const emptyBuf = Buffer.alloc(2);
      emptyBuf.writeUInt16LE(0, 0);
      parts.push(emptyBuf);
      offset += 2;
    }
  }

  return {buffer: Buffer.concat(parts), bodyOffset: offset};
}

function convertJsonToBinary(jsonPath) {
  try {
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    const jsonPose = JSON.parse(jsonContent);

    const frames = jsonPose.body?.frames || jsonPose.frames || [];
    const fps = jsonPose.body?.fps || jsonPose.fps || 30;

    if (frames.length === 0) {
      console.log(`  Skipping ${path.basename(jsonPath)}: no frames`);
      return false;
    }

    const numFrames = frames.length;
    const numPeople = 1;
    const totalPoints = COMPONENTS.reduce((sum, c) => sum + c.points, 0); // 553
    const N = numFrames * numPeople * totalPoints;

    // Build header
    const {buffer: headerBuffer, bodyOffset} = buildHeader();

    // Build body
    // Body: fps(4) + _frames(4) + _people(2) + X(N*4) + Y(N*4) + Z(N*4) + C(N*4)
    const bodyBuf = Buffer.allocUnsafe(4 + 4 + 2 + N * 4 * 4);
    let offset = 0;

    // FPS
    bodyBuf.writeFloatLE(fps, offset);
    offset += 4;

    // _frames
    bodyBuf.writeUInt32LE(numFrames, offset);
    offset += 4;

    // _people
    bodyBuf.writeUInt16LE(numPeople, offset);
    offset += 2;

    // Collect data
    const allX = new Float32Array(N);
    const allY = new Float32Array(N);
    const allZ = new Float32Array(N);
    const allC = new Float32Array(N);

    let idx = 0;
    for (let fi = 0; fi < numFrames; fi++) {
      const frame = frames[fi];
      const people = frame.people || [];

      for (let pi = 0; pi < numPeople; pi++) {
        const person = people[pi] || {};

        for (const comp of COMPONENTS) {
          const pts = person[comp.name] || [];
          for (let ptIdx = 0; ptIdx < comp.points; ptIdx++) {
            const pt = pts[ptIdx] || {};
            allX[idx] = pt.X || 0;
            allY[idx] = pt.Y || 0;
            allZ[idx] = pt.Z || 0;
            allC[idx] = pt.C || 0.9;
            idx++;
          }
        }
      }
    }

    // Write X, Y, Z, C
    for (let i = 0; i < N; i++) {
      bodyBuf.writeFloatLE(allX[i], offset);
      offset += 4;
    }
    for (let i = 0; i < N; i++) {
      bodyBuf.writeFloatLE(allY[i], offset);
      offset += 4;
    }
    for (let i = 0; i < N; i++) {
      bodyBuf.writeFloatLE(allZ[i], offset);
      offset += 4;
    }
    for (let i = 0; i < N; i++) {
      bodyBuf.writeFloatLE(allC[i], offset);
      offset += 4;
    }

    // Combine header and body
    const binaryBuffer = Buffer.concat([headerBuffer, bodyBuf]);

    const outputPath = jsonPath.replace('.pose.json', '.pose');
    fs.writeFileSync(outputPath, binaryBuffer);

    return true;
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    return false;
  }
}

function main() {
  const jsonFiles = fs
    .readdirSync(POSES_DIR)
    .filter(f => f.endsWith('.pose.json'))
    .map(f => path.join(POSES_DIR, f));

  console.log(`Found ${jsonFiles.length} JSON pose files\n`);

  let success = 0;
  let failed = 0;

  for (const jsonFile of jsonFiles) {
    process.stdout.write(`Converting ${path.basename(jsonFile)}...`);
    if (convertJsonToBinary(jsonFile)) {
      console.log(' OK');
      success++;
    } else {
      failed++;
    }
  }

  console.log(`\nDone: ${success} success, ${failed} failed`);
}

main();
