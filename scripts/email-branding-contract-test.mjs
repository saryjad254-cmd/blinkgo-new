import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const templateDir = path.join(root, 'supabase', 'templates');
const previewDir = path.join(root, 'artifacts', 'email-previews');
const logoUrl = 'https://www.blinkgo.de/brand/blinkgo-email-logo.png';
const templateFiles = [
  'confirmation.html',
  'recovery.html',
  'invite.html',
  'magic_link.html',
  'email_change.html',
  'reauthentication.html',
  'password_changed_notification.html',
  'email_changed_notification.html',
];

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const canonicalLogo = path.join(root, 'public', 'brand', 'blinkgo-official-compact-transparent.png');
const emailLogo = path.join(root, 'public', 'brand', 'blinkgo-email-logo.png');
check('email logo is an exact copy of the canonical official logo', () => {
  assert.equal(sha256(emailLogo), sha256(canonicalLogo));
});

const contents = Object.fromEntries(templateFiles.map((file) => [file, fs.readFileSync(path.join(templateDir, file), 'utf8')]));
for (const [file, html] of Object.entries(contents)) {
  check(`${file} has production-safe email structure`, () => {
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /role="presentation"/);
    assert.match(html, /max-width:600px/);
    assert.match(html, new RegExp(logoUrl.replaceAll('.', '\\.')));
    assert.match(html, /alt="BlinkGo"/);
    assert.match(html, /background:#E10600/);
    assert.match(html, /https:\/\/www\.blinkgo\.de\/help/);
    assert.match(html, /https:\/\/www\.blinkgo\.de\/legal\/datenschutz/);
    assert.match(html, /https:\/\/www\.blinkgo\.de\/legal\/agb/);
    assert.match(html, /Wenn du/);
    assert.doesNotMatch(html, /localhost|\.supabase\.co|project[_ -]?ref|debug|tracking pixel/i);
    assert.ok(Buffer.byteLength(html, 'utf8') < 12_000, 'template must stay small');
  });
}

check('link templates preserve Supabase confirmation flow', () => {
  for (const file of ['confirmation.html', 'recovery.html', 'invite.html', 'magic_link.html', 'email_change.html']) {
    assert.match(contents[file], /href="{{ \.ConfirmationURL }}"/);
  }
});

check('reauthentication uses only the supported Token and SiteURL variables', () => {
  assert.match(contents['reauthentication.html'], /{{ \.Token }}/);
  assert.match(contents['reauthentication.html'], /{{ \.SiteURL }}/);
});

check('invite template contains driver and restaurant variants', () => {
  assert.match(contents['invite.html'], /invitation_kind "driver"/);
  assert.match(contents['invite.html'], /invitation_kind "restaurant"/);
  assert.match(contents['invite.html'], /BlinkGo Fahrer-Team/);
  assert.match(contents['invite.html'], /BlinkGo Partner/);
});

check('invitation branding metadata remains separate from authorization metadata', () => {
  const source = fs.readFileSync(path.join(root, 'lib', 'auth', 'admin-invitations.ts'), 'utf8');
  assert.match(source, /invitation_kind: invitationKind/);
  assert.match(source, /app_metadata: \{ app_role: role \}/);
  assert.doesNotMatch(source, /app_metadata:.*invitation_kind/);
});

check('hosted Supabase patch exactly embeds every complete HTML body', () => {
  const patch = JSON.parse(fs.readFileSync(path.join(templateDir, 'hosted-auth-template-patch.json'), 'utf8'));
  const keys = {
    'confirmation.html': 'mailer_templates_confirmation_content',
    'recovery.html': 'mailer_templates_recovery_content',
    'invite.html': 'mailer_templates_invite_content',
    'magic_link.html': 'mailer_templates_magic_link_content',
    'email_change.html': 'mailer_templates_email_change_content',
    'reauthentication.html': 'mailer_templates_reauthentication_content',
    'password_changed_notification.html': 'mailer_templates_password_changed_notification_content',
    'email_changed_notification.html': 'mailer_templates_email_changed_notification_content',
  };
  for (const [file, key] of Object.entries(keys)) assert.equal(patch[key], contents[file]);
  assert.doesNotMatch(JSON.stringify(patch), /access[_ -]?token|service_role|smtp.*pass|project[_ -]?ref/i);
});

function renderInvite(html, kind) {
  return html.replace(
    /{{ if eq \.Data\.invitation_kind "driver" }}([\s\S]*?){{ else if eq \.Data\.invitation_kind "restaurant" }}([\s\S]*?){{ else }}([\s\S]*?){{ end }}/g,
    (_whole, driver, restaurant, team) => kind === 'driver' ? driver : kind === 'restaurant' ? restaurant : team,
  );
}

function substitute(html) {
  return html
    .replaceAll('{{ .ConfirmationURL }}', 'https://www.blinkgo.de/auth/preview-confirmation')
    .replaceAll('{{ .SiteURL }}', 'https://www.blinkgo.de')
    .replaceAll('{{ .Token }}', '482731')
    .replaceAll('{{ .NewEmail }}', 'neu@example.de')
    .replaceAll('{{ .OldEmail }}', 'alt@example.de')
    .replaceAll('{{ .Email }}', 'neu@example.de');
}

fs.mkdirSync(previewDir, { recursive: true });
for (const [file, html] of Object.entries(contents)) {
  if (file === 'invite.html') continue;
  fs.writeFileSync(path.join(previewDir, file), substitute(html), 'utf8');
}
fs.writeFileSync(path.join(previewDir, 'invite-driver.html'), substitute(renderInvite(contents['invite.html'], 'driver')), 'utf8');
fs.writeFileSync(path.join(previewDir, 'invite-restaurant.html'), substitute(renderInvite(contents['invite.html'], 'restaurant')), 'utf8');

check('rendered previews contain no unresolved Supabase variables', () => {
  for (const file of fs.readdirSync(previewDir).filter((name) => name.endsWith('.html'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(previewDir, file), 'utf8'), /{{|}}/);
  }
});

console.log(`\nEmail branding contract: ${passed}/${passed} passed`);
console.log(`Rendered previews: ${path.relative(root, previewDir)}`);

