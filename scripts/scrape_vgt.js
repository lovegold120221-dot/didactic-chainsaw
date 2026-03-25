const {chromium} = require('playwright');
const fs = require('fs');

async function fetchAllVGTWords() {
  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext();
  const page = await context.newPage();

  const allWords = [];

  try {
    console.log('Fetching VGT dictionary API...');

    // Navigate to get cookies first
    await page.goto('https://woordenboek.vlaamsegebarentaal.be/search?e=true', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(2000);

    // Try fetching with larger size
    let totalSigns = 0;
    let fetchedSigns = 0;

    // Try with size 500 first to get all at once
    let url = `https://woordenboek.vlaamsegebarentaal.be/api/signs?c=[]&from=0&g=[]&h=[]&l=[]&lb=[]&mode=ANDExact&q=[]&r=[]&size=500&e=[%22true%22]`;

    const response = await page.goto(url, {waitUntil: 'networkidle', timeout: 60000});
    const body = await response.text();
    const data = JSON.parse(body);

    totalSigns = data.totalNumberSignOverviews || 0;
    const signs = data.signOverviews || [];

    console.log(`Total signs available: ${totalSigns}`);
    console.log(`Signs fetched: ${signs.length}`);

    for (const sign of signs) {
      allWords.push({
        id: sign.signId,
        gloss: sign.glossName,
        translations: sign.translations || [],
        regions: sign.regions || [],
        videoUrl: sign.video,
        vimeoUrl: sign.vimeo,
        hasEtymology: sign.hasEtymology || false,
      });
    }

    // If there are more signs, paginate
    let from = 500;
    while (fetchedSigns + allWords.length < totalSigns) {
      const pageUrl = `https://woordenboek.vlaamsegebarentaal.be/api/signs?c=[]&from=${from}&g=[]&h=[]&l=[]&lb=[]&mode=ANDExact&q=[]&r=[]&size=500&e=[%22true%22]`;

      const pageResponse = await page.goto(pageUrl, {waitUntil: 'networkidle', timeout: 60000});
      const pageBody = await pageResponse.text();
      const pageData = JSON.parse(pageBody);

      const pageSigns = pageData.signOverviews || [];
      console.log(`Fetched ${pageSigns.length} more signs (from ${from})`);

      if (pageSigns.length === 0) break;

      for (const sign of pageSigns) {
        allWords.push({
          id: sign.signId,
          gloss: sign.glossName,
          translations: sign.translations || [],
          regions: sign.regions || [],
          videoUrl: sign.video,
          vimeoUrl: sign.vimeo,
          hasEtymology: sign.hasEtymology || false,
        });
      }

      from += 500;

      if (from > 5000) break; // Safety limit
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  await browser.close();

  // Save results
  fs.writeFileSync('./vgt_words.json', JSON.stringify(allWords, null, 2));
  console.log(`\nTotal words collected: ${allWords.length}`);
  console.log('Saved to vgt_words.json');

  return allWords;
}

fetchAllVGTWords()
  .then(words => {
    console.log('\nFirst 10 words:');
    words.slice(0, 10).forEach(w => {
      console.log(`  ${w.gloss} (${w.regions.join(', ')}) - ${w.translations.join(', ')}`);
    });
    console.log('\nLast 10 words:');
    words.slice(-10).forEach(w => {
      console.log(`  ${w.gloss} (${w.regions.join(', ')}) - ${w.translations.join(', ')}`);
    });
  })
  .catch(console.error);
