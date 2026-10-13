# dm-helper

console script I made for DeltaMath. It reads the problem off the page, solves it, and shows the work.

No install, no extension, no account. Just paste a line into the browser console.

---

## How to use it

1. Open a DeltaMath problem like normal.
2. Press `F12` (or `Ctrl + Shift + I` on a Chromebook) to open the console.
3. Click the **Console** tab.
4. Paste this in and hit Enter:

```js
fetch('https://raw.githubusercontent.com/OogaBoogaPooga/Deltamath-Helper/refs/heads/main/dm.js').then(r=>r.text()).then(eval)
```

5. A little `?` button shows up in the bottom-right corner.
6. Click it.

You get the answer and the work.

---

## What happens when you click it

A popup opens with two things:

- **The answer** — big and readable
- **Show work** — every step written out the way you'd write it on paper

You can copy the whole thing straight into your notebook.

---

## Right-click the `?` button

- **Copy problem screenshot** — copies the question area
- **Read text from image** — reads text off pictures (OCR)
- **View failed problems** — shows every problem it couldn't solve, with screenshots. If it fails on something, click "Copy all text" and make a GitHub issue so I can add it, or send me it via dc @shifyee.
- **Set / Clear Groq API key** — only needed for word problems (see below)
- **Update from GitHub** — pulls the newest version without pasting again

---

## What it solves

- Linear systems (2×2 up to 4×4), with elimination **or** substitution work
- Single-variable equations, including ones with parentheses
- Quadratics
- Compound inequalities
- Absolute value equations and inequalities
- Regular inequalities
- Simplifying, expanding, factoring
- Slopes, distance, midpoint
- Lines: point-slope, slope-intercept, standard form, parallel/perpendicular
- Direct variation
- Point translation
- Intercepts
- Function evaluation and composition
- Properties of real numbers
- Sequences
- Basic stats (mean, median, mode, range, stdev)
- Basic geometry
- Word problems (needs a Groq key)

---

## Word problems

Word problems use an AI behind the scenes (Groq). You'll need a free API key from [console.groq.com](https://console.groq.com).

The first time you hit a word problem, it'll ask for your key. Paste it in, and it's saved in your browser only. It never touches the repo, and it's stored with `localStorage` so it doesn't leave your machine.

To remove it later: right-click the `?` button → Clear Groq API key.

---

## If you use it a lot

Instead of pasting the line every time, save it as a snippet:

1. DevTools → **Sources** tab → **Snippets** on the left
2. **+ New snippet**
3. Paste the whole `dm.js` file in there
4. Hit `Ctrl + Enter` to run it

Now it's saved forever. One keystroke each session.

---

## What it doesn't do

- Graph problems (needs a vision model)
- Number line problems (visual)
- Geometric proofs
- Word problems without a Groq key

For the visual ones, right-click the button → **Copy problem screenshot**, paste into ChatGPT or Claude.

---

## I found a bug / it doesn't work

Right-click the `?` button → **View failed problems**. Click **Copy all text**. Send me what shows up - make a GitHub issue.

That gives me the exact problem text so I can add the solver.

---

## Not affiliated with DeltaMath

Just a tool I built. DETAMATH DONT KILL ME PLS
