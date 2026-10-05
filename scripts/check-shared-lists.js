// Compares the lists that are held twice: once on the server, which validates,
// and once in the browser, which fills the dropdowns.
//
//   ticket categories   backend/utils/categories.js   frontend/src/constants/categories.js
//   divisions           backend/utils/divisions.js    frontend/src/constants/divisions.js
//
// scripts/ship.ps1 runs this and refuses to ship when a pair differs, because a
// name on only one side is either offered and then rejected, or accepted and
// never offered.
//
//   node scripts/check-shared-lists.js

const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const server = (file) => require(path.join(root, 'backend', 'utils', file));
const browser = (file) => import(pathToFileURL(path.join(root, 'frontend', 'src', 'constants', file)).href);

(async () => {
  const problems = [];
  const sameList = (name, a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      const onlyA = a.filter((x) => !b.includes(x));
      const onlyB = b.filter((x) => !a.includes(x));
      problems.push(
        `${name}: ` +
          (onlyA.length || onlyB.length
            ? `server only [${onlyA.join(', ')}], browser only [${onlyB.join(', ')}]`
            : 'same names in a different order')
      );
    }
  };
  const sameMap = (name, a, b) => {
    const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
    const diff = keys.filter((k) => (a || {})[k] !== (b || {})[k]);
    if (diff.length) problems.push(`${name}: differ on ${diff.map((k) => `"${k}"`).join(', ')}`);
  };
  // An old name must lead to a name that is on the list.
  const pointsAtList = (name, legacy, list) => {
    for (const [from, to] of Object.entries(legacy || {})) {
      if (!list.includes(to)) problems.push(`${name}: old name "${from}" points at "${to}", which is not on the list`);
    }
  };

  const categories = server('categories.js');
  const categoriesClient = await browser('categories.js');
  sameList('Marketing categories', categories.MARKETING_CATEGORIES, categoriesClient.MARKETING_CATEGORIES);
  sameList('Service categories', categories.SERVICE_CATEGORIES, categoriesClient.SERVICE_CATEGORIES);
  sameMap('Marketing legacy categories', categories.LEGACY.Marketing, categoriesClient.LEGACY_CATEGORIES.Marketing);
  sameMap('Service legacy categories', categories.LEGACY.Service, categoriesClient.LEGACY_CATEGORIES.Service);
  pointsAtList('Marketing legacy categories', categories.LEGACY.Marketing, categories.MARKETING_CATEGORIES);
  pointsAtList('Service legacy categories', categories.LEGACY.Service, categories.SERVICE_CATEGORIES);

  const divisions = server('divisions.js');
  const divisionsClient = await browser('divisions.js');
  sameList('Divisions', divisions.DIVISIONS, divisionsClient.TICKET_DIVISIONS);
  sameMap('Legacy divisions', divisions.LEGACY, divisionsClient.LEGACY_DIVISIONS);
  pointsAtList('Legacy divisions', divisions.LEGACY, divisions.DIVISIONS);

  if (problems.length) {
    console.error('The server and browser lists are out of step:\n  ' + problems.join('\n  '));
    console.error('Edit the two files named at the top of scripts/check-shared-lists.js so they match.');
    process.exit(1);
  }
  console.log('Category and division lists match.');
})().catch((err) => {
  console.error('Could not compare the lists:', err.message || err);
  process.exit(1);
});
