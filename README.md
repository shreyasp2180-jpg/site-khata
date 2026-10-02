# Site Khata

A phone-friendly ledger for civil contractors and interior designers. For each project it records money received from the client, every bill and site expense, payments to vendors and labour, GST and receipt photos. It then works out the balance to collect, vendor dues, cash in hand and margin.

It also handles labour: mark daily attendance (present, half day, absent, overtime) per site, record kharchi (advances), and on payday (Monday by default) pay each worker's week in one tap, with kharchi deducted automatically.

It runs in any browser and can be added to the home screen like an app. It keeps working on site with no signal and syncs when you're back online.

## Try it
Open **https://shreyasp2180-jpg.github.io/site-khata/#try** on a phone. It opens straight into the app with sample projects and workers, saved on that phone only. No setup needed.

## Where the data is saved

When you first open the app, you choose one of these:

- **Google Sheet (recommended).** Entries are saved to a Google Sheet in your own Google account, in **Projects**, **Entries**, **Workers** and **Attendance** tabs. Receipt photos go to a Drive folder called *Site Khata receipts*. Nothing is stored on GitHub or anywhere else.
- **This phone only.** Everything stays in the phone's browser. Use **Settings → Download backup** regularly.

## One-time Google Sheet setup (about 15 minutes, easiest on a laptop)

1. Create a blank Google Sheet at [sheets.new](https://sheets.new) and name it **Site Khata**.
2. Open **Extensions → Apps Script** and delete the sample code.
3. Paste in everything from [`google-sheet-script.gs`](google-sheet-script.gs). The app's setup screen has a **Copy the Site Khata script** button.
4. Change `const PIN = 'CHANGE-ME';` to your own secret PIN, then click **Save**.
5. Choose **setup** in the function menu and click **Run**. When Google asks for permission, choose your account → **Advanced** → **Go to Site Khata (unsafe)** → **Allow**. Google shows that warning for any script you write yourself.
6. Click **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, click **Deploy**, then copy the **Web app URL**.
7. In the app, paste the URL and your PIN, then tap **Connect Google Sheet**.

"Anyone" only means the app can reach your script. Every request must include your PIN, so don't share the PIN or the URL with anyone else.

### Setting up another phone
Once one phone or laptop is connected, open **Settings → Copy setup link for another phone** and send that link to the other phone. Opening it fills in the Sheet details; tap **Connect Google Sheet**. The link contains your PIN, so share it only with people you trust with the khata.

### Updating the script
When the app says the Google Sheet script is out of date, go to **Settings → Google Sheet script → Copy latest script** and follow the steps shown there.
Always update the existing deployment with **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. This keeps the same URL, so the app doesn't need to be set up again.

## Install on the phone
Open the app link in Chrome, then use **⋮ → Add to Home screen**. On iPhone, use Safari: **Share → Add to Home Screen**.

## Files
| File | What it is |
|---|---|
| `index.html` | The whole app |
| `google-sheet-script.gs` | The script that goes into the Google Sheet |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |
| `lib/` | PDF maker (jsPDF, MIT licence) and a DejaVu Sans font subset with the ₹ sign (free licence in `lib/DejaVu-LICENSE.txt`) |
