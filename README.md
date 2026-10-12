# delta-math-helper

Ever get stuck on a DeltaMath problem? This gives you the answer **and** the full work — the exact steps to write down for credit.

No app to install. No extensions. Just paste one line into your browser and click a button.

---

## How to use it

**Step 1.** Open your DeltaMath problem like normal.

**Step 2.** Press `F12` on your keyboard to open the console. (On Mac, press `Cmd + Option + I`.)

**Step 3.** Click the **Console** tab at the top.

**Step 4.** Copy this line, paste it in, and hit Enter:

```js
fetch('https://raw.githubusercontent.com/YOURUSER/YOURREPO/main/dm.js').then(r=>r.text()).then(eval)
```

**Step 5.** Look at the bottom-right corner of the page. A small round button appears.

**Step 6.** Click it. You get the answer and the full work.

That's it.

---

## What you'll see

A popup with two parts:

1. **The answer** — big and clear, like `x = 3, y = -2, z = 5`
2. **A "Show work" button** — click it and you get every single step, written exactly the way you'd write it on paper. Copy it straight to your notebook.

You can press **Esc** to close the popup, or click anywhere outside it.

---

## Right-click the button for extras

- **Copy problem screenshot** — if the problem has a graph or picture, this copies it so you can paste it into ChatGPT or any AI to ask about it.
- **Read text from image** — if the equation is inside a picture, this reads it for you.
- **Update from GitHub** — gets the newest version without re-pasting.

---

## What it can solve

- Systems of equations (2 or 3 variables, sometimes more)
- Regular equations like `3x + 5 = 20`
- Quadratic equations (`x² + 5x + 6 = 0`)
- Inequalities (`2x + 3 > 7`)
- Absolute value (`|x - 3| = 7`)
- Simplifying and factoring
- Distance, midpoint, and slope between two points
- Equations shown as pictures (using built-in OCR)

**Can't solve:** graph problems, word problems, and trig/log stuff. For those, use the right-click **Copy problem screenshot** and ask an AI directly.

---

## What it does NOT do

- It doesn't submit anything for you.
- It doesn't touch your account.
- It doesn't send your data anywhere.
- It doesn't change anything on DeltaMath.

It just reads what's already on your screen and does the math for you. Like a really fast calculator.

---

## Tired of pasting the line every time?

Do this once:

1. In DevTools, click the **Sources** tab.
2. On the left, click **Snippets**.
3. Click **+ New snippet**.
4. Paste the entire `dm.js` file in there.
5. Press **Ctrl + Enter** (or `Cmd + Enter`) to run.

Now it's saved forever. Next time you open DeltaMath, just click the snippet and hit `Ctrl + Enter`. One second.

---

## Something not working?

If the button doesn't appear, or it says it can't solve the problem:

1. Press `F12` to open the console
2. Look for lines that start with `[vite]`
3. Copy what it says and create an issue

That tells me exactly what went wrong.

---

## Custom icon

Want to use your own picture for the little button?

1. Put a square image in your GitHub repo (like `logo.png`)
2. Open `dm.js` and find the line that says `LOGO_URL: ''`
3. Change it to `LOGO_URL: 'https://raw.githubusercontent.com/YOURUSER/YOURREPO/main/logo.png'`
4. Save and push

That's it.

---

## Setup (for whoever is hosting this)

1. Create a new GitHub repo (make it public)
2. Add `dm.js` to the repo
3. Replace `YOURUSER/YOURREPO` in the loader line above with your real GitHub username and repo name
4. Done — the paste-in line now works for anyone you share it with

---

*Not affiliated with DeltaMath. Just a math tool.*
