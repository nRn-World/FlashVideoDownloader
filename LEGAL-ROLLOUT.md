# Legal rollout — what only you can do

Everything that could be fixed in code is fixed (see `README.md` → changelog v3.5.0).
This file is the short list of things **no code change can accomplish**, in the order
they matter. Each item says exactly what to do and what text to use.

Nothing here is legal advice. It is a checklist written by the person who built the
software, not by a lawyer.

---

## 1. Ko-fi — do this before the next sale

**Why it matters more than anything in the EULA.** Section 11 of `terms.html` says
Pro is non-refundable *because* you ask the buyer to consent to immediate access and
acknowledge that this removes their statutory right of withdrawal. Under EU consumer
law that consent has to be given **before delivery**, and the purchase happens on
Ko-fi — not inside the extension. If the Ko-fi page says nothing, the clause is much
harder to rely on.

### 1a. Paste this into the Ko-fi product description (Shop → the Pro product → Edit)

> **All sales are final — the Pro licence is non-refundable.**
>
> By completing this purchase you expressly ask us to give you immediate access to the
> digital licence key, and you acknowledge that you therefore lose any statutory right
> of withdrawal.
>
> You are not entitled to a refund, compensation or damages if the extension stops
> working, becomes slower, is restricted or is discontinued in the future, or if it
> does not work on a particular website. The extension is provided "as is", without
> warranty. The developer's total liability is limited to the amount you paid.
>
> Full terms: https://nrn-world.github.io/FlashVideoDownloader/terms.html
> Refunds: https://nrn-world.github.io/FlashVideoDownloader/terms.html#refunds

### 1b. Add the same two lines to the Ko-fi thank-you page

The buyer sees this page immediately after paying, which is the last moment the
notice can still be shown as part of the purchase:

> Your purchase is final and non-refundable. By paying, you asked for immediate access
> to your licence key and accepted that you lose the statutory right of withdrawal.
> Terms: https://nrn-world.github.io/FlashVideoDownloader/terms.html

### 1c. Make sure the Ko-fi price equals the price in the extension

The popup shows **EUR 10.99** (`PRO_OFFER.price` in `popup.js`). If Ko-fi charges
something else, the extension is advertising a price you do not take. If the currency
differs, set the Ko-fi price in EUR so the two cannot disagree.

---

## 2. VAT — the largest practical risk

Selling a digital product to consumers in the EU makes **you** the seller of record,
and VAT is due in the buyer's country from the first sale (the OSS one-stop scheme).
This has nothing to do with the EULA and cannot be fixed with contract text.

- Find out whether Ko-fi collects and remits VAT on your behalf, or whether the
  obligation lands on you. Read Ko-fi's own seller documentation and ask their support
  in writing. Keep the reply.
- If the obligation is yours: register for OSS (Skatteverket in Sweden) and keep
  records per country. The small-business exemption does not cover cross-border
  B2C digital sales.
- VAT applies to the Pro licence. It does not apply to the extension being free.

Get this confirmed before you scale any advertising. A VAT problem grows with every
sale; a terms problem is fixed with one edit.

---

## 3. A lawyer should read two sections

Not the whole document — two clauses decide whether you are actually protected:

| Section | Question to ask |
| --- | --- |
| §10 Limitation of liability | Is the cap and the carve-outs (personal injury, gross negligence, mandatory consumer rights) drafted the way a Swedish court expects? |
| §11 No refunds | Does the consent mechanism we can realistically obtain on Ko-fi satisfy the Consumer Rights Directive art. 16(m) / the Swedish distance-contracts rules for a digital product? |

Print `terms.html` and bring those two sections. Also worth a second opinion:
§5 (lifetime definition) and §16 (governing law). One hour of a Swedish
consumer-law lawyer is the cheapest insurance available to you here.

---

## 4. Store submission checklist

- [ ] Version is **3.5.0** in `manifest.json` (done) and higher than the published one.
- [ ] Upload `Flash Video Downloader.zip` to Chrome Web Store, `Flash Video Downloader Firefox.zip` to AMO.
- [ ] Paste the listing text from `STORE_LISTING.md` (both EN and SV variants are there).
- [ ] Set the terms URL in both dashboards: `https://nrn-world.github.io/FlashVideoDownloader/terms.html`
- [ ] Push to `main` so GitHub Pages publishes `terms.html` — verify the URL loads **before** submitting.
- [ ] Chrome Web Store: answer the data-usage form consistently with `privacy.html` (no data collected, no analytics).
- [ ] Screenshots: `Screenshots/store/*-1280x800.png` (regenerate with `create_zip.bat` if they show the old, struck-through price — check before uploading).

---

## 5. Already handled — do not redo these

- EULA with warranty disclaimer, liability cap, indemnity, no-refund policy, governing law — `terms.html`.
- The EULA is bundled in both packages and readable offline.
- Terms gate: the popup and every download start require an accepted record — `terms-gate.js`,
  enforced in `background.js`, 4 unit tests in `test/unit.test.js`.
- The compare-at price, the discount badge and the urgency line are **off**. Instructions for
  running a *real* reduction are in the `PRO_OFFER` comment in `popup.js`.
- No marketing string promises the licence lasts "forever" — checked across all 6 languages.
- Privacy policy has a controller, legal basis, retention periods and data-subject rights, and
  states truthfully that the rate-limit service is not enabled in this build.
- CC BY-NC 4.0 for the source code, EULA for the distributed software, priority rule between
  them — `LICENSE`, `terms.html` §19.

---

## 6. The one thing that cannot be solved

You cannot buy immunity from a dispute. What the current setup does is:

- make the user accept terms **before** they can use anything, with a version and a timestamp;
- cap what they can claim if they do;
- put the copyright and third-party risk on the user's side of the line;
- and remove the one claim that was genuinely indefensible — advertising a discount against a
  price you had never charged.

What remains outside anyone's control: EU law protects a consumer's non-waivable rights no
matter what the contract says, the card networks decide chargebacks, a rights holder can still
file a complaint against the listing, and a determined technical user can bypass the gate. The
difference between now and before is that in each of those cases you are arguing from a signed,
recorded acceptance instead of from nothing.
