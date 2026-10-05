// Compares the two copies of the ticket category lists: the server's
// (backend/utils/categories.js, which validates) and the browser's
// (frontend/src/constants/categories.js, which fills the dropdowns).
// scripts/ship.ps1 runs this and refuses to ship when they differ, because a
// name on only one side is either offered and then rejected, or accepted and
// never offered.
//
//   node scripts/check-category-lists.js

const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

(async () => {
  const server = require(path.join(root, 'backend', 'utils', 'categories.js'));
  const client = await import(pathToFileURL(path.join(root, 'frontend', 'src', 'constants', 'categories.js')).href);

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

  sameList('Marketing categories', server.MARKETING_CATEGORIES, client.MARKETING_CATEGORIES);
  sameList('Service categories', server.SERVICE_CATEGORIES, client.SERVICE_CATEGORIES);
  sameMap('Marketing legacy names', server.LEGACY.Marketing, client.LEGACY_CATEGORIES.Marketing);
  sameMap('Service legacy names', server.LEGACY.Service, client.LEGACY_CATEGORIES.Service);

  // A legacy name must lead to a category that exists on that team's list.
  for (const [team, list] of [['Marketing', server.MARKETING_CATEGORIES], ['Service', server.SERVICE_CATEGORIES]]) {
    for (const [from, to] of Object.entries(server.LEGACY[team] || {})) {
      if (!list.includes(to)) problems.push(`${team} legacy name "${from}" points at "${to}", which is not on the ${team} list`);
    }
  }

  if (problems.length) {
    console.error('Ticket category lists are out of step:\n  ' + problems.join('\n  '));
    console.error('Edit backend/utils/categories.js and frontend/src/constants/categories.js so they match.');
    process.exit(1);
  }
  console.log('Ticket category lists match.');
})().catch((err) => {
  console.error('Could not compare the category lists:', err.message || err);
  process.exit(1);
});
