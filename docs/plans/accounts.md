# Plan: accounts

**Status:** Proposed, not built. Three changes to how accounts are made and kept safe: signing in with Google or Apple, confirming email addresses, and ending other sessions, but not the watches' links, when a password is reset. Their requirements are drafted under [Proposed requirements](#proposed-requirements), to move into [docs/requirements/](../requirements/) when it's built.

## In short

**Google and Apple.** The website and both phones offer **Continue with Google** and **Continue with Apple** beside email and password, wherever the server has them on. On the hosted service both are on. A self-hosted server turns each on with its own keys from Google and Apple, and the iPhone's Apple sign-in works on any server without them. A sign-in whose address already has an account joins it only when that account's address is confirmed. Sign-up's rules (open, approval, closed, invitations) apply as they do to a password. Watches are untouched: they link by code, however the account signs in.

**Confirming email.** With email set up, a new account gets a link to confirm its address. Nothing a referee does day to day waits for it, but until it's followed the address isn't trusted: `ADMIN_EMAILS` doesn't make it an admin, and a Google or Apple sign-in doesn't join it. Following a password reset link or an emailed invitation confirms it too. Without email, nothing changes.

**A reset signs others out.** A password reset, emailed or an admin's link, ends every session but the account's linked watches: browsers, phones, everything that signed in with the old password. Watches stay, as their links can only sync matches (SEC-13) and they need the website to link again.

Not in this plan: other sign-in providers or single sign-on (OIDC) for self-hosters; two-factor sign-in; passkeys.

## What's already there

- **Better Auth** (`server/src/auth.ts`, version 1.7): email and password with emailed reset links (`sendResetPassword`, an hour); the `bearer` plugin, which gives the phones a token in place of the cookie; and `deviceAuthorization` (RFC 8628), the watches' link code. Its tables are in `server/src/db/tables.ts`: `user` (with `emailVerified`, false for everyone but people who've changed their address by its link), `session`, `account` (one row per sign-in method: `providerId` "credential" holds the password hash, and is where a Google or Apple sign-in would go), `verification`.
- **Who may make an account:** `accountHooks` in `server/src/access.ts` runs before any user is created, whichever way: an invitation's token in the sign-up body makes it active; an empty server needs the setup code (ADM-5); an `ADMIN_EMAILS` address waits for approval even when sign-up is open, and isn't made when it's closed (SEC-8); otherwise `SIGN_UP` decides (USR-2). A pending account reaches only `/v1/account` (`server/src/app.ts`). `isAdmin` (`access.ts`) is `role === "admin"` or the address being in `ADMIN_EMAILS`.
- **Sessions:** every sign-in is a `session` row. A watch's link is one too: the device code becomes a session, which `app.ts` marks `scope: "watch"` as it's issued (`POST /v1/auth/device/token`), and that scope keeps it to `/v1/watch/` (SEC-13). The phones' Link a watch (SYNC-13, APP-16) gets the same kind. A phone's own session is an ordinary one; what makes it show as a phone is a `device` row written from its `X-LawFive-Device` header (`trackDevices` in `server/src/devices.ts`), which any request can send.
- **Signing out others** (SEC-7, `POST /v1/devices/sign-out-others`): `all`, or `browsers`, which ends the sessions with no `device` row and so keeps watches and phones.
- **A reset today** (`POST /v1/auth/reset-password` in `app.ts`) clears the address's lockout (SEC-12) and changes the password; nothing else ends (R-14). Better Auth's own `revokeSessionsOnPasswordReset` would end every session, watches included, which is why it's off.
- **Changing the address** (USR-9, `access.ts`): with the password; with email, a link to the new address that sets it and `emailVerified: true`, and a notice to the old one; without email, at once. `ConfirmEmail.tsx` is its page.
- **Deleting your own account** (`POST /v1/account/delete`, `access.ts`): with the password, which `passwordMatches` checks against the credential row. Settings → Account on the website and both phones; `site/public/delete-account.html` says to enter it.
- **Email** is optional (USR-5, ADM-2): `SMTP_URL` and `MAIL_FROM`, or Settings → Server. `GET /v1/meta` lists `email` among its `capabilities` when it's set, and gives `signUp`.
- **Settings for self-hosters** follow ADM-1: in the environment and fixed, or set in Settings → Server, with secrets stored encrypted (ADM-3). `docs-site/src/content/docs/run/settings.md` lists them; `run/people.md` covers sign-up, admins and resets.
- **The phones** sign in with email and password, a code from the website (APP-13: `/v1/app-sign-in`, a two-minute code swapped for a session of the phone's own), or an invitation's QR code, which signs up on the phone (APP-14). Otherwise sign-up is on the website, which the sign-in page links to (APP-2). Both phones handle `lawfive://` links.
- **ARCHITECTURE.md** says Google and Apple sign-in are tied to the apps' registration, so self-hosted servers would use passwords "or their own single sign-on (OIDC)", and that offering Google on iOS means offering Sign in with Apple too. No OIDC is built.

## Proposed behavior

### Signing in with Google or Apple

**Where it shows.** The sign-in and sign-up pages on the website, and the sign-in screens of both phones, show **Continue with Google** and **Continue with Apple** above email and password, each only when the server has it on (`GET /v1/meta` says which: `signIn: ["password", "google", "apple"]`). The buttons follow each company's rules for their look (Google's and Apple's own marks, an exception to Phosphor icons that DESIGN.md gains). The setup wizard's first account (ADM-5) stays email and password with the setup code.

**What happens.**
- **A new address** makes an account as a sign-up would: the name and address from Google or Apple, no password, the address confirmed (Google and Apple both say an address is verified; one they don't is refused). `SIGN_UP` and approval apply, so on an approval server it waits (USR-4), and on a closed one it's refused with the same words as the form. An invitation link's page offers the buttons too, and the invitation goes with the sign-in, so it makes the account active whatever `SIGN_UP` says (and only for its address, when it has one).
- **An address that already has a confirmed account** signs in to it, and Google or Apple is added to its sign-in methods. The account's owner is told by email ("Google sign-in was added to your LawFive account").
- **An address with an unconfirmed account** doesn't join it, as whoever made it may not own the address: "There's already an account for sam@example.com. Sign in with its password to add Google, or reset its password." Signing in with the password and then using Continue with Google from Settings adds it. A reset confirms the address (below), after which Google joins it.
- **Apple's Hide My Email** gives a relay address, so it makes a separate account unless the person adds Apple from Settings while signed in.
- **Suspended accounts** are refused as they are with a password.

**Settings → Account → Sign-in methods** (website and both phones): Password (Change, or **Set a password** when there isn't one, which needs a fresh sign-in, below), Google and Apple, each with **Add** or **Remove**. The last method can't be removed.

**An account without a password.** Two things ask for the password today: changing the email (USR-9) and deleting the account (USR-7). For an account without one they ask instead for a **fresh sign-in**: "Continue with Google to confirm it's you", which must be within the last 10 minutes. Better Auth's fresh-session check does this. The delete dialog and `delete-account.html` say so. Deleting an account with Apple also revokes LawFive's Apple token, as Apple asks, where the server has an Apple key.

**The watches** are unaffected: Link a watch and the code on the website work the same however the account signed in.

### Google and Apple on each kind of server

| | Website | Android | iPhone |
|---|---|---|---|
| **Google, hosted** | Google's web sign-in | Credential Manager's account sheet (native), with the hosted server's Google client | In the system browser sheet (`ASWebAuthenticationSession`) |
| **Google, self-hosted** | The self-hoster's own Google client | In a Custom Tab, through the server's website | In the browser sheet, through the server's website |
| **Apple, hosted** | Apple's web sign-in | In a Custom Tab, through the website | Native (`AuthenticationServices`) |
| **Apple, self-hosted** | Only with the self-hoster's own Apple keys | In a Custom Tab, only with those keys | Native, with no keys |

- **Why Android can't go native on a self-hosted server:** Credential Manager gives a token for a Google project's web client, and only the project that has registered the Android app (LawFive's package name and signing key) can be that project. A self-hoster can't register the store app in theirs.
- **Why the iPhone's Apple sign-in works everywhere:** the token Apple gives the app names the app's bundle ID and is signed by Apple; checking it needs only Apple's public keys and the bundle ID, which the server knows (Better Auth's `appBundleIdentifier`). So a self-hosted server accepts it with nothing set up. Sign-ins from the app and from a self-hoster's own Apple web keys are different Apple accounts to Apple (different teams), so they meet only by email address.
- **Through the website:** the phone opens `<server>/app-sign-in/<provider>` in the browser sheet with a random secret's hash; the website signs in with the provider, makes an app sign-in code (APP-13's), and sends the browser to `lawfive://signed-in?code=…`; the phone swaps the code for its own session with the secret, so no other app can use a caught code. No Google SDK goes in either phone.
- **The App Store rule:** an app that offers Google sign-in must offer Sign in with Apple too. The iPhone app shows Google only when it can show Apple, and since native Apple needs no keys, it can on every server where Google is on: the server accepts the app's Apple tokens whenever any outside sign-in is on, unless the self-hoster turns Apple off, in which case the iPhone shows neither.

### Settings for self-hosters

- **Google:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, a web client from the self-hoster's own Google Cloud project, with `<PUBLIC_URL>/v1/auth/callback/google` as its redirect.
- **Apple on the website and Android:** `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` (a Sign in with Apple key), from an Apple Developer account, with the server's domain and `…/v1/auth/callback/apple` registered. The server makes Apple's client secret from the key itself and renews it before it expires.
- **Apple on the iPhone:** on by default whenever an outside sign-in is on (`APPLE_SIGN_IN=off` to turn it off).
- Each is set in the environment or in **Settings → Server → Sign-in** (ADM-1, secrets encrypted, ADM-3), and the page says which redirect address to register and checks it with **Try it**. Without them, the server offers email and password only, as today.
- **lawfive.dev:** a page under Run, "Sign in with Google and Apple", with the steps in each console, in the docs' plain style, and the settings in `run/settings.md`.
- Apple's relay addresses only accept mail from domains registered with the developer account that made them. The hosted service registers its mail domain; a self-hosted server can't reach relay addresses from the iPhone's sign-ins, which is said on the page.

### Confirming email addresses

With email set up (USR-5):

- **At sign-up** (the website, and the phones' invitation sign-up, APP-14), the server sends "Confirm your email for LawFive", a link that works once, for 7 days. Following it, signed in or not, confirms the address and signs nobody in, on `ConfirmEmail.tsx` ("Your email is confirmed"). The account works meanwhile: matches, watches, phones, everything.
- **Settings → You** shows "Check sam@example.com for a link to confirm it" with **Send again** (limited per SEC-2), on the website and both phones, until it's confirmed. People shows **Not confirmed** beside an account, and on a waiting one, so an admin approving it knows.
- **Other things that confirm it:** following a password reset link (it reached the address); following an emailed invitation for that address (`invite.emailedAt` set and the email locked); a Google or Apple sign-in for it; confirming a new address (USR-9, as today).
- **Until it's confirmed:**
  - `ADMIN_EMAILS` doesn't make it an admin. An `ADMIN_EMAILS` sign-up starts **active and not admin**, and becomes admin when confirmed, instead of waiting for another admin (SEC-8). People says "Admin once their email is confirmed".
  - A Google or Apple sign-in doesn't join it (above).
  - The server sends that address only the confirmation and password resets, not notices, plan emails or lock warnings, so an address typed by someone else gets one email, not a stream.
- **An address taken by someone else** is got back with Forgot your password?: the link goes to the real owner, following it confirms the address and sets their password, and the reset ends every other session (below).
- **Changing the address:** confirmed by its link, as now. An account whose address is changed without email (below) is unconfirmed.

Without email (`SMTP_URL` unset and nothing in Settings → Server), there's nothing to send: no link, no "Check … for a link", and the rules fall back to today's, so an `ADMIN_EMAILS` sign-up waits for an admin's approval (SEC-8), and Google or Apple joins no existing account automatically (Settings' Add still works). Turning email on later shows unconfirmed accounts the Settings line.

**Existing accounts** stay as they are: unconfirmed unless they've confirmed a changed address. Each sees the Settings line once email is on, nothing is taken away, and the first start after the upgrade marks confirmed every active account that `ADMIN_EMAILS` makes an admin, so no admin loses it.

**The phones** need no new flow: sign-up is on the website or by invitation (APP-14), and the Settings line and Send again show in each phone's Settings → You, from the account's `emailVerified`.

### What a password reset ends

- **A reset** (emailed, or an admin's link, USR-7) ends **every session but the watches' links**: every browser, both phones, and anything else that signed in with the old password. The page after it says "Your password is changed. Other browsers and phones are signed out; your watches stay linked", with a link to Devices to unlink any watch they don't know.
- **Why not keep phones too:** a phone is known only by the header it sends (`X-LawFive-Device`), which anyone with the password can send, so keeping "phones" would keep the very session a reset is meant to end. Signing in again on a phone takes a moment (or a code, APP-13); linking a watch again needs the website, and a watch's link can only sync matches (SEC-13). Watches are kept by their `scope`, which only the server sets.
- **The other things the old password could have made** stay: API keys and the calendar feed's address. The page lists them if there are any ("You have 2 API keys"), with links.
- **Changing the password** in Settings (with the current one) does the same, except the session doing it: website and phones say "Other browsers and phones will be signed out" under the field.
- **Changing the email address** ends nothing, as now (it needs the password, so whoever does it could reset the password too). The notice to the old address gains **Not you? Undo it**, a link that works once for 7 days: it puts the old address back, ends every session but the watches, and asks for a new password. That's what protects someone whose password was stolen and address changed, as a reset link would go to the new address.
- **The email** saying a reset or change happened tells the owner which watches are still linked.

## Proposed requirements

Drafts, as the next free IDs in each area (USR-10, ADM-7, SEC-14, APP-28 and IOS-14 are the highest in use):

- **USR-11** **Sign in with Google or Apple** on the website, where the server has it: a new address makes an account by `SIGN_UP`'s rules and invitations, confirmed; an existing confirmed one is signed in to and gets the method added, with an email; an unconfirmed one isn't joined, and the page says to sign in with its password or reset it.
- **USR-12** **Sign-in methods** in Settings → Account: Password (change, or set), Google, Apple, each added or removed, never the last.
- **USR-13** **Accounts without a password** change their email or delete the account after a fresh sign-in (within 10 minutes) instead of the password; deleting revokes LawFive's Apple token where the server has an Apple key.
- **USR-14** **Confirming the address.** With email, a new account gets a link (once, 7 days); a reset link, an emailed invitation, Google or Apple, or confirming a new address confirm it too. Until then, Settings → You says so with Send again, People marks it, and the server sends it only the confirmation and resets. Without email, none of this applies.
- **USR-7** and **USR-9** change their "stay signed in (R-14)" to SEC-15; USR-9's notice to the old address gains Not you? Undo it.
- **SEC-8** An `ADMIN_EMAILS` address is an admin only once confirmed (USR-14); its sign-up is active meanwhile. Without email, it waits for an admin's approval, as now.
- **SEC-15** **A new password ends the other sessions.** A reset ends every session but the watches' links; changing it ends every one but the watches' and the one changing it. The page says so and lists linked watches, API keys and the calendar feed.
- **SEC-16** **An outside sign-in joins an account only by a confirmed address.** Undoing an address change ends every session but the watches' links.
- **ADM-8** **Google and Apple sign-in settings** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_SIGN_IN`), by ADM-1's rule, with the redirect address shown and Try it; the iPhone app's Apple sign-in is accepted with none of them.
- **APP-29** **Continue with Google and Apple** on the Android app where the server has them: Google by Credential Manager on the hosted service, otherwise both through the server's website in a Custom Tab, handed back by a one-time code and secret.
- **IOS-15** **Continue with Apple** (native) and **Google** (through the website in the browser sheet) on the iPhone; Google only where Apple shows too.
- **R-14** rewritten as what's left (API keys and the calendar feed outlive a reset); **R-15** rewritten for servers without email.
- **ARCHITECTURE.md**'s self-hosting table: Google with the self-hoster's own client, Apple from the iPhone with nothing set up, and no OIDC.
- Privacy: `site/public/privacy.html` (what Google and Apple send, name, address and an account ID, and that they learn you signed in to LawFive; Google and Apple as services), both `PrivacyInfo.xcprivacy` files (a user ID) and the stores' privacy answers, `delete-account.html`.

## Open questions

1. **Which phone sign-ins to build first.**
   - (a) Everything in the table at once.
   - (b) The website first, then the phones through the website (one flow for both phones and both providers), then the native ones (Credential Manager, `AuthenticationServices`).
   - (c) The website only.
   - **Recommendation: (b).** The flow through the website works on every server and is most of the phones' work; the native sheets are a nicer first sign-in, added after. The iPhone can't offer Google before its Apple button exists, which (b) gives together.
2. **What a Google or Apple sign-in does with an unconfirmed account for its address.**
   - (a) Refuse to join, and say to sign in with its password or reset it (above).
   - (b) Take the account over: Google says the address is theirs, so the password and every session (watches too) go, and the owner is emailed.
   - (c) Join it anyway.
   - **Recommendation: (a).** (c) gives whoever typed the address first a way into the real owner's account later. (b) is safe but unlinks the watches of the many real owners who simply never confirmed; a reset reaches the same end and is their choice.
3. **Whether a reset keeps the phones signed in.**
   - (a) End phones too, keep watches (above).
   - (b) Keep phones and watches; end browsers only, as Sign out other browsers does.
   - (c) End everything, watches included.
   - **Recommendation: (a).** (b) keeps any session that claims to be a phone, so a thief's survives; (c) costs every watch a trip to the website for little gain, as a watch's link can't read or change anything but matches it syncs.
4. **Sign out other browsers (SEC-7) has the same weakness as question 3's (b):** a session keeps itself by sending a phone's header.
   - (a) Leave it: it's what the person asked for, and Sign out everything is beside it.
   - (b) Make it "Sign out other browsers and phones", keeping watches only, as a reset does.
   - (c) Mark phone sessions on the server when they sign in on a phone, so a header alone can't make one.
   - **Recommendation: (b),** in this work, as it then matches a reset and a password change exactly. (c) still trusts whatever signs in, so it doesn't help.
5. **Where self-hosters set Google and Apple.**
   - (a) The environment only.
   - (b) The environment or Settings → Server, by ADM-1's rule.
   - **Recommendation: (b).** ADM-1 and the wizard promise a server set up without editing its environment, and the redirect address and Try it fit the page. It needs the server to pick the settings up without a restart, as email does.
6. **How long a confirmation link lasts, and whether unconfirmed accounts are ever removed.**
   - (a) 7 days, and Send again; accounts are never removed for it.
   - (b) 7 days, and an account unconfirmed for 30 days with nothing in it is deleted.
   - **Recommendation: (a).** A reset already gives the address back to its owner, and deleting accounts by rule could take a referee's who signed up at the field and never opened the mail.
7. **API keys and the calendar feed on a reset.**
   - (a) Keep them, and list them on the page after (above).
   - (b) Turn them off until the owner looks.
   - **Recommendation: (a).** They break integrations and calendars silently; the list puts them in front of the person at the moment they're thinking about it.

## The work, in order

1. **Sessions on a reset** (half a day to a day): in `app.ts`'s reset route and around Better Auth's change-password, delete the account's sessions whose `scope` isn't "watch" (and not the current one for a change); the page after it on the website and phones; SEC-7's browsers option, if question 4 says so; tests. Small, and it's what makes the rest safe.
2. **Confirming email** (1 to 2 days): Better Auth's `emailVerification` (`sendOnSignUp`, our mailer and `ConfirmEmail.tsx`); confirmed by reset, emailed invitation and Google or Apple; `isAdmin` and `accountHooks` for `ADMIN_EMAILS` (SEC-8); marking today's `ADMIN_EMAILS` admins confirmed at start; the Settings line and Send again on the website and both phones; People's mark; the emails held back; Undo it on an address change; tests for each.
3. **Google and Apple on the server and website** (2 to 3 days): `socialProviders` in `auth.ts`, with `appBundleIdentifier` for the iPhone and account linking only to confirmed addresses (Better Auth's `accountLinking` with a check of `emailVerified`); the settings (environment and Settings → Server), the Apple client secret made from the key; the invitation carried through; `/v1/meta`'s `signIn`; the buttons on SignIn, sign-up and the invitation page; Sign-in methods in Settings; the fresh sign-in for an account without a password (email change, delete); `schema/src/endpoints.ts` for the changed endpoints; a migration if any column is added (`pnpm db:generate`).
4. **The phones** (2 to 3 days): the browser flow and its code exchange on the server; Android's Custom Tab and Credential Manager; the iPhone's browser sheet and native Apple, with the Sign in with Apple capability; Sign-in methods in each Settings; snapshots for the new sign-in screens.
5. **Privacy, docs and the hosted service** (a day): the privacy page, both `PrivacyInfo.xcprivacy`, the stores' answers, `delete-account.html`; lawfive.dev's new page and `run/settings.md`, `run/people.md` (confirming, ADMIN_EMAILS, resets); ARCHITECTURE.md; the hosted service's Google project (web and Android clients) and Apple Services ID, key and relay mail domain, kept in its server's settings, not the repo.

About 7 to 10 days across the parts, most of it in Google and Apple on the phones.

## Checks

- A real reset on the hosted service: the other browser and phone are signed out, the watch still syncs.
- Signing up with an `ADMIN_EMAILS` address on a test server: not admin until the link is followed; on one without email, waiting for approval.
- Google and Apple on a real Android phone and iPhone, on the hosted service and on a self-hosted Docker server with only Google set up (the iPhone showing Apple and Google; Android Google through the website).
- Apple's web sign-in, which comes back as a form post from Apple to `/v1/auth/callback/apple`, through the hosted service's proxy and the website's origin check (SEC-9).
- An account made with Hide My Email: mail from the hosted service reaches it.
- App Review's reading of the sign-in screen (Google beside Apple) on the first build with it.
