# Rumour Radar

Business and tech rumours from free news sites, an AI estimate of how likely each one is to be true, and the stocks it could move. It runs as a web app you add to your iPhone home screen.

**What you need:** a computer with a web browser, about 20 minutes, and a bank card for about £5 of AI credit. You don't need to install anything or write any code.

**How it works:** GitHub (free) does all the work. Every 30 minutes it reads the news feeds, asks Claude to analyse new headlines, and saves the results. GitHub Pages (also free) hosts the app itself.

---

## Step 1: Make a GitHub account

1. Go to **github.com** and click **Sign up**.
2. Choose a username. It will appear in your app's web address, so pick something you're happy with.

## Step 2: Create a home for the app

1. Once signed in, click the **+** at the top right and choose **New repository**.
2. For **Repository name**, type `rumour-radar`.
3. Choose **Public**. The free hosting needs this, and your API key stays private either way.
4. Leave every other option unticked and click **Create repository**.

## Step 3: Upload the files

1. Unzip `rumour-radar.zip` on your computer and open the `rumour-radar` folder.
2. On the new GitHub page, click the link **uploading an existing file**.
3. Select **everything inside** the folder (`index.html`, `app.js`, the `icons` folder, the `data` folder and the rest) and drag it onto the GitHub page.
   - Drag the files **inside** the folder, not the folder itself.
4. When the upload finishes, click the green **Commit changes** button.

## Step 4: Get your AI key

1. Go to **console.anthropic.com** and sign up.
2. Open **Billing** and add credit. **$5 is plenty to start.** You can also set a monthly spending limit there so you never get a surprise.
3. Open **API keys**, click **Create key**, name it `rumour-radar`, and **copy the key**. It starts with `sk-ant-`.
   - Keep the key secret. Only paste it into GitHub in the next step.

## Step 5: Give the key to GitHub (safely)

1. In your `rumour-radar` repository, click **Settings** (the tab with the gear icon).
2. In the left menu, click **Secrets and variables**, then **Actions**.
3. Click **New repository secret**.
4. Fill in the two fields:
   - **Name:** `ANTHROPIC_API_KEY` (exactly like that)
   - **Secret:** paste your key
5. Click **Add secret**.

GitHub stores the key encrypted, and nobody can read it, not even on a public repository.

## Step 6: Turn on the automatic news updates

1. In your repository, open the `setup` folder and click `update-news-workflow.yml`.
2. Click the **copy** icon (two overlapping squares, at the top right of the file) to copy its contents.
3. Click the **Actions** tab at the top. If GitHub suggests workflows, ignore them and click **set up a workflow yourself**.
4. Delete everything already in the editor and paste what you copied.
5. Change the file name at the top from `main.yml` to `update-news.yml`.
6. Click **Commit changes…**, then **Commit changes** again.

## Step 7: Run it for the first time

1. Click the **Actions** tab.
2. Click **Update news** on the left.
3. Click **Run workflow**, then the green **Run workflow** button.
4. Wait 1–3 minutes. A **green tick** means it worked.

After this, it runs by itself every 30 minutes.

## Step 8: Put the app online

1. Click **Settings**, then **Pages** in the left menu.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set **Branch** to **main**, keep the folder as **/ (root)**, and click **Save**.
4. Wait about 2 minutes and refresh the page. The address of your app appears at the top. It will look like:
   `https://YOUR-USERNAME.github.io/rumour-radar/`

## Step 9: Add it to your iPhone

1. Open that address in **Safari** on your iPhone. It has to be Safari.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open it from your home screen and pick your interests.

You're done. 🎉

---

## Using the app

- **Rumours** shows unconfirmed stories. The ring is the AI's estimated chance that each one is true:
  - green: likely
  - amber: toss-up
  - red: unlikely
- **Confirmed / denied** shows rumours that were later confirmed or denied by the company.
- **For you** shows only the topics you picked. Tap the sliders icon to change them.
- Tap a story to see the reasoning, the stocks it could move (▲ up, ▼ down, ◆ mixed) and links to the original articles.
- Tap a stock to open its price on Yahoo Finance.

## Changing things later (all in the browser)

To change a file, open it on GitHub, click the **pencil** icon to edit, then **Commit changes**.

- **Add or remove news sites:** edit `feeds.json`. Each line is a name and the site's RSS feed address.
- **Smarter but pricier AI:** in `.github/workflows/update-news.yml`, add the line `ANTHROPIC_MODEL: claude-sonnet-5-5` under `ANTHROPIC_API_KEY: ...`, with the same indentation.
- **Update less often (cheaper):** in the same file, change `*/30 * * * *` to `0 * * * *` for once an hour.

## Costs

GitHub and the hosting are free. The AI uses Claude Haiku, the cheapest model, and only reads headlines and short summaries. Each run analyses at most 40 new articles. That typically comes to a few pounds a month or less. Check **console.anthropic.com → Usage** to see the real figure, and set a spend limit there.

## If something goes wrong

- **Red ✕ in Actions:** click the failed run, then the step marked ✕, to read the error message. The most common causes are:
  - **"API key was rejected"**: redo Step 5, checking the name is exactly `ANTHROPIC_API_KEY`.
  - **"out of credit"**: add credit in the Anthropic console.
  - **Failure at "Save results"**: go to **Settings → Actions → General**, set **Workflow permissions** to **Read and write permissions**, click **Save**, and run it again.
- **The app says "No stories yet":** check that Step 7 shows a green tick, then wait a couple of minutes for Pages to update.
- **A news site shows "failed" in the log:** that site changed or blocked its feed. Delete it from `feeds.json` or replace it with a working one.
- **Updates sometimes arrive late:** GitHub occasionally delays scheduled runs at busy times. This is normal.

## Good to know

- The app stores headlines, short AI-written summaries and links. It always sends you to the original article and never copies whole articles.
- **Likelihood scores and stock impacts are AI estimates. They can be wrong, and they are not financial advice.**
