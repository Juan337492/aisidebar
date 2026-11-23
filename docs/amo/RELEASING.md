# Releasing to Firefox Add-ons

## First release (by hand, in the browser)

1. Create a developer account at https://addons.mozilla.org/developers/ and accept the Developer Agreement.
2. Publish the companion so users can install it:
   ```bash
   npm login              # once
   npm run publish:companion
   ```
3. Build the upload files:
   ```bash
   npm run zip:firefox
   ```
   This creates `extension/.output/ai-sidebar-<version>-firefox.zip` (the add-on) and `-sources.zip` (source for
   reviewers).
4. Go to **Submit a New Add-on**, choose **On this site**, and upload the `-firefox.zip`. Choose **Firefox** only (not
   Android).
5. When asked whether you used a build tool, choose **Yes** and upload the `-sources.zip`.
6. Fill in the listing from `LISTING.md`, upload the screenshots in `screenshots/`, paste `PRIVACY.md` as the privacy
   policy, and paste the "Notes to reviewer".
7. Submit. Review usually takes from a few days to a couple of weeks. Mozilla emails you the result.

## Later releases (one command)

1. Create API keys at https://addons.mozilla.org/developers/addon/api/key/
2. Create `extension/.env.submit` (it's git-ignored, so never commit it):
   ```
   FIREFOX_EXTENSION_ID={b3447934-d85a-43db-8f54-81bd4f331a8d}
   FIREFOX_JWT_ISSUER=user:12345:678
   FIREFOX_JWT_SECRET=your-secret
   ```
3. Bump `version` in `extension/package.json`, then:
   ```bash
   npm run submit:firefox
   ```

If the companion changed, bump `version` in `companion/package.json` and run `npm run publish:companion`.

The add-on ID `{b3447934-d85a-43db-8f54-81bd4f331a8d}` is permanent. Never change it, or Firefox will treat the
upload as a different add-on.
