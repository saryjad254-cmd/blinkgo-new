const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'legal', 'versions.ts'),
  'utf8',
);

function exportedVersion(name) {
  const match = source.match(new RegExp(`export const ${name} = ['\"]([^'\"]+)['\"]`));
  if (!match) throw new Error(`Could not read ${name} from lib/legal/versions.ts`);
  return match[1];
}

module.exports = {
  CUSTOMER_TERMS_VERSION: exportedVersion('CUSTOMER_TERMS_VERSION'),
  PRIVACY_NOTICE_VERSION: exportedVersion('PRIVACY_NOTICE_VERSION'),
};
