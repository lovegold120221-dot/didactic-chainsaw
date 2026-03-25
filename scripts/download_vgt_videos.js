const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;

    protocol
      .get(url, response => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Follow redirect
          downloadFile(response.headers.location, dest).then(resolve).catch(reject);
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

async function downloadVGTVideos() {
  const words = JSON.parse(fs.readFileSync('./vgt_words.json', 'utf8'));

  const videosDir = './src/assets/gestures/vgt/videos';
  fs.mkdirSync(videosDir, {recursive: true});

  console.log(`Downloading ${words.length} videos...`);

  let success = 0;
  let failed = 0;

  for (const word of words) {
    const videoUrl = word.videoUrl;
    if (!videoUrl) continue;

    const filename = `vgt_${word.id}.mp4`;
    const destPath = path.join(videosDir, filename);

    if (fs.existsSync(destPath)) {
      console.log(`Skipping ${filename} (already exists)`);
      success++;
      continue;
    }

    try {
      console.log(`Downloading ${filename}...`);
      await downloadFile(videoUrl, destPath);
      success++;

      // Rate limiting
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.error(`Failed to download ${filename}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\nDownload complete: ${success} success, ${failed} failed`);
  console.log(`Videos saved to: ${videosDir}`);
}

downloadVGTVideos().catch(console.error);
