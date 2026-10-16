# Rumour Radar

Your morning and evening briefing on tech, AI, gadgets and markets, as an iPhone app. It reads more than 60 tech, finance and world news sites. Every story gets its picture, an AI summary with key points, and a full write-up in the AI's own words, plus the stocks it could move. Rumours get their own tab with AI odds on how likely each one is to be true.

## Already using an older version? Update in about 10 minutes

### 1. Upload the new files

1. Unzip the new `rumour-radar.zip` and open the folder.
2. In your GitHub repository, click **Add file → Upload files**.
3. Select everything in the folder **except the `data` folder**. Leaving out `data` keeps the stories you already have.
   - **Mac:** Cmd-click to select.
   - **Windows:** Ctrl-click to select.
4. Drag the selection onto the page and click **Commit changes**. Files with the same name are replaced.

### 2. Update the schedule (now 7:30 and 17:00 London time)

1. In your repository, open the `setup` folder, click `update-news-workflow.yml`, and click the **Copy raw file** button (two overlapping squares).
2. Open the `.github` folder, then `workflows`, then `update-news.yml`.
3. Click the **pencil** icon (Edit).
4. Select everything in the editor (**Ctrl + A** or **Cmd + A**), delete it, and paste.
5. Check that the first line says `name: Update news`, then click **Commit changes…** and **Commit changes**.

### 3. Make the refresh button fetch brand-new news (optional, recommended)

See [Live refresh](#live-refresh-the-refresh-button) below.

### 4. Get your first briefing now

1. Go to **Actions → Update news → Run workflow**.
2. Set **Write a new Today briefing?** to **yes**.
3. Click the green **Run workflow** button.

This run takes longer than before (about 5–15 minutes), because the AI now reads every article in full.

The app updates itself within a couple of minutes. If it doesn't, open **Settings → Reload app**.

---

## First-time setup

**What you need:** a computer with a web browser, about 25 minutes, and a bank card for about £5 of AI credit. You don't need to install anything or write any code.

**How it works:** GitHub (free) does all the work. At 7:30 and 17:00 London time it reads the news sites, asks Claude to analyse the new articles, writes the briefing, and saves the results. GitHub Pages (also free) hosts the app itself.

---

## Step 1: Make a GitHub account

1. Go to **github.com** and click **Sign up**.
2. Choose a username. It will appear in your app's web address.

## Step 2: Create a home for the app

1. Once signed in, click the **+** at the top right and choose **New repository**.
2. For **Repository name**, type `rumour-radar`.
3. Choose **Public**. The free hosting needs this, and your keys stay private either way.
4. Leave every other option unticked and click **Create repository**.

## Step 3: Upload the files

1. Unzip `rumour-radar.zip` on your computer and open the `rumour-radar` folder.
2. On the new GitHub page, click the link **uploading an existing file**.
3. Select **everything inside** the folder and drag it onto the GitHub page.
   - Drag the files **inside** the folder, not the folder itself.
4. When the upload finishes, click the green **Commit changes** button.

## Step 4: Get your AI key

1. Go to **console.anthropic.com** and sign up.
2. Open **Billing** and add credit. **$5 is plenty to start.** Set a monthly spending limit there too, so you never get a surprise.
3. Open **API keys**, click **Create key**, name it `rumour-radar`, and **copy the key**. It starts with `sk-ant-`.

## Step 5: Give the AI key to GitHub (safely)

1. In your repository, click **Settings**.
2. In the left menu, click **Secrets and variables**, then **Actions**.
3. Click **New repository secret** and fill in the two fields:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Secret:** paste your key
4. Click **Add secret**.

## Step 6: Allow the updater to save news

1. In **Settings**, open **Actions**, then **General**.
2. Scroll to **Workflow permissions**, choose **Read and write permissions**, and click **Save**.

## Step 7: Turn on the automatic updates

1. Open the `setup` folder, click `update-news-workflow.yml`, and click the **Copy raw file** button.
2. Click the **Actions** tab, then **set up a workflow yourself**.
3. Change the file name at the top from `main.yml` to `update-news.yml`.
4. Delete everything in the editor and paste.
5. Click **Commit changes…**, then **Commit changes**.

## Step 8: Run it for the first time

1. Go to **Actions → Update news → Run workflow**.
2. Set **Write a new Today briefing?** to **yes**.
3. Click the green **Run workflow** button.
4. Wait 5–15 minutes for a **green tick**.

## Step 9: Put the app online

1. Go to **Settings → Pages**.
2. Set **Source** to **Deploy from a branch**, **Branch** to **main**, and the folder to **/ (root)**, then click **Save**.
3. After about 2 minutes, a box appears saying **"Your site is live at …"**. That's your app's address.

## Step 10: Add it to your iPhone

1. Open the address in **Safari**.
2. Tap **Share**. If you don't see it, tap **•••** first.
3. Tap **Add to Home Screen**, then **Add**.

---

## Live refresh (the refresh button)

The refresh button at the top right, or pulling down on any tab, always reloads the latest stories. To make it go and **fetch brand-new news from all the sites**, give the app a small GitHub key that can only start updates for this one repository.

**Create the key (on a computer, about 3 minutes):**

1. On GitHub, click your **profile picture** (top right) and choose **Settings**.
2. At the bottom of the left menu, click **Developer settings**.
3. Click **Personal access tokens**, then **Fine-grained tokens**, then **Generate new token**.
4. Fill in the form:
   - **Token name:** `Rumour Radar refresh`
   - **Expiration:** pick the longest option offered.
   - **Repository access:** choose **Only select repositories** and pick your **Rumour-radar** repository.
   - **Permissions:** find **Actions** in the list and set it to **Read and write**. Leave everything else as it is.
5. Click **Generate token** and **copy** it. It starts with `github_pat_`.
   - Email or AirDrop it to yourself so you can paste it on your phone, then delete that message.

**Add it to the app (on your iPhone):**

1. Open the app and go to **Settings → Live refresh**.
2. Paste the key and tap **Save key**. The status changes to **On**.

Now tapping refresh shows **Refreshing •••** while GitHub collects and analyses the news. It then shows **Publishing** while the site updates, which takes about 3–10 minutes in total. When it's done, you'll see a message like "Updated · 23 new stories".

**About safety:**
- The key is stored only on your phone.
- It can only start updates for this one repository. It can't read your other repositories or change your code.
- If you lose your phone, delete the key on GitHub: **Settings → Developer settings → Fine-grained tokens**.

---

## Using the app

The app has four tabs along the bottom.

- **Today** is your tech front page. Briefings arrive at 7:30 (Morning) and 17:00 (Evening), London time. Each one has:
  - a cover headline and an overview of what happened
  - the top stories with pictures
  - **Rumour watch**
  - **Stocks to watch**
  - **In brief**

  Earlier briefings are at the bottom.
- **News** has every story from all the sites, newest first. Filter it with:
  - **All**
  - **For You** (your interests)
  - **Tech** (gadgets, AI, companies, startups and VC)
  - **Finance** (Bloomberg, FT, Telegraph, WSJ, Washington Post and more)
  - **World** (BBC, Guardian, Sky, Al Jazeera, NYT, Google News top stories and more)
- **Rumours** shows unconfirmed stories with the AI's odds that each one is true:
  - green: likely
  - amber: toss-up
  - red: unlikely

  Switch to **Confirmed** or **Denied** to see how rumours turned out. The red badge counts new rumours since you last looked.
- **Settings** has these options:
  - **Appearance:** Automatic (follows your iPhone), Light or Dark
  - your interests
  - Live refresh

Tap any story to open it. You'll see:
- the picture
- the **AI summary** with key points
- **The full story**, written up by the AI in its own words
- the rumour check (for rumours)
- the **market impact**: which stocks could move, up ▲ or down ▼, and by how much (●○○ low to ●●● high)
- every outlet covering it

The button at the bottom opens the original article. Tap a stock to see every story about it. Swipe from the left edge to go back.

## Changing things later (all in the browser)

To change a file, open it on GitHub, click the **pencil** icon to edit, then **Commit changes**.

- **Add or remove news sites:** edit `feeds.json`. Each line has three parts:
  - the site's name
  - its section (`Tech`, `Finance` or `World`)
  - its RSS feed address
- **Smarter but pricier AI:** in `.github/workflows/update-news.yml`, under `ANTHROPIC_API_KEY: ...`, add a line `ANTHROPIC_MODEL: claude-sonnet-5-5` with the same indentation.
- **Different update times:** these are set in `.github/workflows/update-news.yml`. GitHub only understands UTC, so each London time is listed twice (summer and winter). Ask Claude to change them for you.

## Costs

GitHub and the hosting are free. The AI uses Claude Haiku, the cheapest model.

It now reads each article in full and writes a longer write-up, so each article costs more than before. On the other hand, updates now run twice a day (plus whenever you tap refresh) instead of every 30 minutes. Each run analyses at most 150 new articles.

Check **console.anthropic.com → Usage** after the first day to see the real cost, and keep a monthly spend limit set there. To spend less, lower `MAX_NEW_PER_RUN` near the top of `scripts/update-news.mjs`.

## If something goes wrong

- **Red ✕ in Actions:** click the failed run, then the step marked ✕, to read the error message.
  - **"API key was rejected"**: redo Step 5, checking the name is exactly `ANTHROPIC_API_KEY`.
  - **"out of credit"**: add credit in the Anthropic console.
  - **Failure at "Save results"**: redo Step 6.
- **Runs at 6:30 / 7:30 / 16:00 / 17:00 that finish in seconds:** this is normal. Each London time is listed for both summer and winter, and the one that doesn't match today skips itself.
- **Refresh says the key was rejected or lacks permission:** create the key again, making sure **Actions** is set to **Read and write** and your repository is selected.
- **A news site shows "failed" in the log:** that site changed or blocked its feed. Delete it from `feeds.json`.
- **A story has a short write-up:** some sites block automatic reading. For those, the AI only has the feed summary and keeps its write-up short rather than guessing.

## Good to know

- The app shows each article's headline and preview picture as published by the site.
- The summaries, key points and full write-ups are written by AI in its own words. The app never copies the publishers' articles, and the button on every story opens the original.
- **The write-ups, odds and stock impacts are AI-generated. They can be wrong, and they are not financial advice.**
