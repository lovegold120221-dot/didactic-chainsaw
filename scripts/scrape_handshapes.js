#!/usr/bin/env node
/**
 * Scrape handshape images from Signbank for reference
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const BASE_URL = 'https://signbank.cls.ru.nl';
const HANDHSHAPES_URL = `${BASE_URL}/handshapes/show_all/`;
const OUTPUT_DIR = path.join(__dirname, '../src/assets/gestures/vgt/handshapes');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const protocol = url.startsWith('https') ? https : http;

    protocol
      .get(url, response => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirect
          const redirectUrl = response.headers.location;
          downloadImage(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', err => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, response => {
        let data = '';

        response.on('data', chunk => {
          data += chunk;
        });

        response.on('end', () => {
          resolve(data);
        });
      })
      .on('error', reject);
  });
}

function parseHandshapes(html) {
  const handshapes = [];

  // Match img tags with thumbnail_handshape class
  const imgRegex = /<img[^>]*class="thumbnail_handshape"[^>]*src="([^"]+)"[^>]*>/g;

  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const imgSrc = match[1];
    handshapes.push({
      imageUrl: imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`,
    });
  }

  // Match handshape IDs and names from the table
  const nameRegex = /<td><a[^>]*href="\/dictionary\/handshape\/(\d+)\/">([^<]*)<\/a>/g;

  const names = [];
  while ((match = nameRegex.exec(html)) !== null) {
    names.push({id: match[1], name: match[2].trim()});
  }

  // Combine
  for (let i = 0; i < Math.min(handshapes.length, names.length); i++) {
    if (names[i]) {
      handshapes[i].id = names[i].id;
      handshapes[i].name = names[i].name;
    }
  }

  // Filter out entries without names (headers etc)
  return handshapes.filter(hs => hs.name && hs.id);
}

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(path.join(OUTPUT_DIR, 'images'));

  console.log('Fetching handshapes page...');
  const html = await fetchPage(HANDHSHAPES_URL);

  console.log('Parsing handshapes...');
  const handshapes = parseHandshapes(html);

  console.log(`Found ${handshapes.length} handshapes`);

  const manifest = {
    language: 'vgt',
    languageName: 'Vlaamse Gebarentaal',
    languageNameEnglish: 'Flemish Sign Language',
    region: 'Belgium',
    version: '1.0',
    description: 'VGT Handshapes Reference from Signbank',
    handshapes: handshapes.map(hs => ({
      id: hs.id,
      name: hs.name,
      imageUrl: hs.imageUrl,
    })),
  };

  // Save manifest
  fs.writeFileSync(path.join(OUTPUT_DIR, 'handshapes_manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`Saved manifest to ${OUTPUT_DIR}/handshapes_manifest.json`);

  // Download images (limited to avoid rate limiting)
  console.log('Downloading handshape images (first 50)...');

  const downloadPromises = handshapes.slice(0, 50).map(async (hs, index) => {
    const ext = path.extname(new URL(hs.imageUrl).pathname) || '.jpg';
    const dest = path.join(OUTPUT_DIR, 'images', `handshape_${hs.id}${ext}`);

    try {
      await downloadImage(hs.imageUrl, dest);
      console.log(`  [${index + 1}/${Math.min(50, handshapes.length)}] Downloaded: ${hs.name}`);
    } catch (err) {
      console.log(`  [${index + 1}] Failed: ${hs.name} - ${err.message}`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 200));
  });

  await Promise.all(downloadPromises);

  console.log('\nDone!');
  console.log(`Total handshapes: ${handshapes.length}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

main().catch(console.error);
