# Affiliate setup – Flash Video Downloader (Free tier)

This is the practical guide for turning the Free-tier ad slot into revenue.
The extension shows one banner to Free users (Pro never sees it) and rotates
between the offers you configure in `ads.js` → `AFFILIATE_OFFERS`.

Nothing is paid out until **you** join the programs below and paste **your own**
tracking link. We can't sign up on your behalf.

---

## 1. Recommended programs (one per slot)

| Slot in `ads.js` | Program | Typical payout | Why it fits a video downloader | Sign up |
|---|---|---|---|---|
| `vpn` | **NordVPN** | Up to 100 % on the first sign-up (≈40 % on 1-year plans), 30 % on renewals, 30-day cookie | Privacy/streaming angle, very high conversion, well-known brand | <https://nordvpn.com/affiliate/> |
| `vpn` (alternative) | **Surfshark** | 40 % per new sale, 30-day cookie, $100 minimum payout | Easier approval for small publishers, similar audience | <https://surfshark.com/affiliate> |
| `cloud` | **pCloud** | Up to $300 per sale on lifetime plans + recurring share, $10 minimum payout | Videos take space — users naturally want storage | <https://www.pcloud.com/affiliate> |
| `tools` | **Movavi** | Up to 60 % commission | People who download videos often edit them | <https://www.movavi.com/partners/affiliate-program/> |
| `tools` (alternative) | **Wondershare (Filmora)** | 30–50 % per sale | Same audience, huge brand | <https://www.wondershare.com/business/affiliate.html> |

Rates, cookies and payout thresholds change often — always confirm on the
program's own page before you rely on a number.

---

## 2. Before you apply

- Most programs ask for a **website or audience**. A Chrome Web Store listing
  works for many of them; if a form insists on a URL, use your store link or the
  project's GitHub Pages site.
- Be honest about your traffic. Approval is easier with a real listing than with
  inflated claims, and lying can get the account closed later.
- You will need a **payout method** (bank/PayPal/network account). Set that up
  during onboarding, not after your first sale.

---

## 2b. Does it cost anything? No

Joining an affiliate program is **free**. You never pay the partner, and you do
not need to own a subscription yourself. You only earn when someone buys through
your link.

The threshold numbers above (e.g. Surfshark's $100 minimum) are **payout
thresholds** — the balance you must earn before money is sent to you. They are not
a fee and never take money from you.

Things to watch out for:

- **Do not buy through your own link.** Self-referrals are normally forbidden and
  can get the account closed, with no commission.
- **Never pay to join.** Legitimate programmes (Surfshark, NordVPN, pCloud,
  Movavi) do not charge a fee. Anyone asking for one is a middleman or a scam.
- **Being rejected costs nothing.** If approval fails, you have lost no money.
- **Tax** on what you earn is your responsibility.

---

## 3. Paste your links

Open `ads.js` and fill in the `url` for each slot (keep the quotes):

```js
const AFFILIATE_OFFERS = [
  {
    id: 'vpn',
    enabled: true,
    affiliate: true,
    icon: '🔒',
    titleKey: 'affVpnTitle',
    textKey: 'affVpnText',
    ctaKey: 'affVpnCta',
    url: '' // <-- paste YOUR NordVPN tracking link here
  },
  ...
];
```

Rules the code already enforces:

- The link **must start with `https://`** — anything else is skipped.
- Set `enabled: false` to hide a slot.
- If **no** slot has a link yet, the built-in house ads are shown instead, so the
  banner never looks broken.

After editing:

1. `python prepare_local_test.py`
2. `chrome://extensions` → **Reload** on the extension card
3. Open a normal website and click the extension icon

---

## 4. Making sure it converts

- **Only one banner is visible at a time** — the cheapest way to raise revenue is
  to improve the offer, not to show more ads.
- Test one program per slot first, then swap the weakest one.
- Keep the click count honest: clicks and impressions are stored **locally** in
  `chrome.storage.local` under `fvd_ad_stats` (visible in `dev-preview.html`).

## 5. Compliance (important)

Affiliate links **are** allowed, but they have their own policy page — read it
before you paste a link: <https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads>
(plus the general *Ads* policy: <https://developer.chrome.com/docs/webstore/program-policies/ads>).
The key requirements, quoted:

- **"Any affiliate program must be described prominently in the product's Chrome
  Web Store page, user interface, and before installation."** All three places —
  the store description alone is not enough, and the popup label alone is not
  enough either. The store listing has an *Ads & affiliate links* block for this;
  keep it accurate.
- **"Affiliate links, codes, or cookies must only be included when the extension
  provides a direct and transparent user benefit related to the extension's core
  functionality."** The offer must connect to downloading video, and the user
  must actually gain something (a discount, a free tier, cashback).
- **"Inserting affiliate links when no discount, cashback, or donation is
  provided"** is an explicitly listed violation. A plain link with a marketing
  slogan and no real deal for the user is exactly that case. Ask the program for
  a **landing page or code with a visible benefit** and say what it is.
- **"Related user action is required before the inclusion of each affiliate
  code, link, or cookie."** Do not rewrite URLs, set cookies, or touch pages the
  user is browsing. Opening a new tab on an explicit click (what the slot does)
  is the safe pattern — keep it that way.
- Ads must be **easily removable** (settings or uninstall) and must not
  **simulate system messages**. The ✕ button, the Pro tier and uninstall cover
  this; never style a banner as a Chrome warning.
- Which slot to pick: **`tools` (a video-editing offer) is the most defensible**,
  because it is related to the extension's core functionality. VPN and cloud
  storage have no link to downloading video and are the most likely to be
  questioned in review.
- Do **not** incentivise clicks (paying/rewarding users to click). Several
  programs, Surfshark for example, explicitly forbid it in their terms.
- Do not claim the extension is sponsored by or endorsed by the partner.
- Remember: **AdSense is not allowed in Chrome extensions**, and Manifest V3
  blocks remote scripts, so affiliate links are the realistic in-extension
  option.

## 6. Skatt i Sverige — vad du faktiskt behöver

Du behöver **inget företag, ingen F-skatt och inget bokföringsprogram** för att
ta emot pengar från Ko-fi eller ett affiliate-nätverk. Du tar emot dem som
privatperson och deklarerar överskottet. Ett bokföringsprogram (Fortnox, Bokio,
Speedledger) behövs först när du registrerar enskild firma eller AB och måste
bokföra enligt bokföringslagen — det är ett **senare** steg, inte ett krav i
förväg.

Skatteverket räknar nämligen den här typen av inkomst som hobbyverksamhet:

> "Andra inkomster där din verksamhet saknar vinstsyfte eller är av mindre
> omfattning och därför inte räknas som näringsverksamhet ska du redovisa på
> samma sätt som hobbyinkomster. Det kan till exempel vara **internetinkomster**
> som du får som influencer, bloggare, e-sport eller liknande."

Så gör du:

- Redovisa överskottet på **blankett T2 (SKV 2051)** tillsammans med
  inkomstdeklarationen. Inkomsten beskattas som **inkomst av tjänst**.
- Räkna med **egenavgifter på 28,97 %** av överskottet (född 1959 eller senare;
  10,21 % om du är född 1938–1958, inkomstår 2025). Det är alltså inte bara
  inkomstskatt — en dryg fjärdedel försvinner i egenavgifter innan skatt.
- Du får göra avdrag för de utgifter du faktiskt haft i verksamheten och betalat
  under inkomståret, till exempel utvecklingskostnader.
- **Underskott** behöver du inte deklarera, men spara det — du kan dra av det mot
  överskott i samma verksamhet under de följande fem åren.
- **Spara alla underlag i sju år**: kvitton, anteckningar och utbetalningsbesked
  från Ko-fi och affiliate-nätverket.
- Går omsättningen över **120 000 kr under inkomståret** kan momsregistrering bli
  aktuellt. Först då blir en riktig firma och bokföring relevant.

Källa: Skatteverket,
[Hobby](https://www.skatteverket.se/privat/skatter/arbeteochinkomst/inkomster/hobby.4.58d555751259e4d661680003940.html).
Detta är de allmänna reglerna, inte en bedömning av ditt enskilda fall —
gränsdragningen hobby/näringsverksamhet görs från fall till fall, så bekräfta
med Skatteverket.
