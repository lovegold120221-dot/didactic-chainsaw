const {chromium} = require('playwright');
const fs = require('fs');

async function searchVGT() {
  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate first
    await page.goto('https://woordenboek.vlaamsegebarentaal.be/search?e=true', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(2000);

    // Search terms
    const searchTerms = ['ik', 'ben', 'jij', 'je', 'johan', 'zijn', 'mijn', 'jou', 'hem', 'haar', 'wij', 'wij', 'zij'];

    const results = [];

    for (const term of searchTerms) {
      const url = `https://woordenboek.vlaamsegebarentaal.be/api/signs?c=[]&from=0&g=[]&h=[]&l=[]&lb=[]&mode=ANDExact&q=["${term}"]&r=[]&size=50&e=[%22true%22]`;

      try {
        const response = await page.goto(url, {waitUntil: 'networkidle', timeout: 30000});
        const body = await response.text();
        const data = JSON.parse(body);
        const signs = data.signOverviews || [];

        console.log(`"${term}": ${signs.length} results`);

        if (signs.length > 0) {
          signs.forEach(s => {
            console.log(`  -> ${s.glossName}: ${s.translations.join(', ')}`);
            results.push({term, ...s});
          });
        }
      } catch (e) {
        console.log(`"${term}": error - ${e.message}`);
      }
    }

    fs.writeFileSync('./vgt_pronoun_search.json', JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }

  await browser.close();
}

searchVGT().catch(console.error);
