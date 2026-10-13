# delta-math-helper

Solve any DeltaMath problem and get the full work — no install, just paste one line into your browser.

---

## How to use it

**Step 1.** Open your DeltaMath problem like normal.

**Step 2.** Press `F12` to open DevTools. (On Chromebook: `Ctrl + Shift + I`.)

**Step 3.** Click the **Console** tab at the top.

**Step 4.** Paste this line, hit Enter:

```js
fetch('https://raw.githubusercontent.com/OogaBoogaPooga/Deltamath-Helper/refs/heads/main/dm.js').then(r=>r.text()).then(eval)
```

**Step 5.** A small circular button appears in the bottom-right corner.

**Step 6.** Click it. You get the answer and the full work.

That's it.

---

## What you'll see

A popup with two parts:

1. **The answer** — big and clear, like `x = 3, y = -2, z = 5`
2. **A "Show work" button** — click it and you get every step, written the way you'd write it in a notebook. Copy it straight to your paper.

The work is printed in stacked form — equations line up on the `=`, the `+` or `−` sign sits in front of the second row, a divider line separates it from the result. No matrices, no row-operation notation, no jargon. Every line is something you'd actually write.

Press **Esc** or click outside the popup to close it.

---

## Right-click the button for extras

- **Copy problem screenshot** — if the problem has a graph or picture, this copies it so you can paste it into ChatGPT or any AI to ask about it.
- **Read text from image (OCR)** — if the equation is inside a picture, this reads it automatically.
- **Update from GitHub** — pulls the newest version without re-pasting.

---

## What it solves

| Type | Status |
|---|---|
| Systems of equations (2×2 to 4×4) | ✅ Full stacked work |
| Single-variable equations (`3x + 5 = 20`) | ✅ |
| Quadratics (`x² + 5x + 6 = 0`) | ✅ |
| Inequalities (`2x + 3 > 7`) | ✅ |
| Absolute value (`\|x − 3\| = 7`) | ✅ |
| Simplify / expand / combine like terms | ✅ |
| Factor | ✅ |
| Distance, midpoint, slope | ✅ |
| Equations shown as images | ✅ via OCR |

**Not supported:** graph problems, word problems, trig, logs, exponentials, geometry, statistics. For those, use **Copy problem screenshot** and ask an AI.

---

## Example output

For the system `−7x − 7y + z = 5`, `4x + 4y − z = −5`, `9x + 10y − z = −2`:

```
Given system:

  (1)   −7x − 7y + z = 5
  (2)   4x + 4y − z = −5
  (3)   9x + 10y − z = −2

Step 1: Eliminate x

  Stack (1) and (2):
    (1)   −7x − 7y + z = 5
    (2)   4x + 4y − z = −5

  Multiply to match x-coefficients:
    4 × (1):   −28x − 28y + 4z = 20
    7 × (2):    28x + 28y − 7z = −35

  Add 4 × (1) and 7 × (2):
      −28x − 28y + 4z = 20
    +  28x + 28y − 7z = −35
    ─────────────────────────
      −3z = −15     (4)

  ...

Solution:   x = −3,   y = 3,   z = 5
```

Copy the whole block into your notebook. Every line is already in handwritten form.

---

## Tired of pasting the line every time?

Do this once:

1. In DevTools, click the **Sources** tab.
2. On the left, click **Snippets**.
3. Click **+ New snippet**.
4. Paste the entire `dm.js` file in there.
5. Press **Ctrl + Enter** (or `Cmd + Enter`) to run.

Now it's saved forever. Next time you open DeltaMath, click the snippet, hit `Ctrl + Enter`, done in a second.

---

## What it does NOT do

- Doesn't submit anything for you
- Doesn't touch your account
- Doesn't send your data anywhere
- Doesn't change anything on DeltaMath

It reads what's already on your screen and does the math. Like a really fast calculator that shows its work.

---

## Something not working?

If the button doesn't appear, or it says it can't solve the problem:

1. Press `F12` to open the console
2. Look for lines that start with `[vite]`
3. Copy what it says and send it in

That shows exactly what went wrong.

---

## Hosting it yourself

1. Create a new public GitHub repo
2. Add `dm.js` to the repo
3. Replace `YOURUSER/YOURREPO` in the loader line at the top of this README with your real GitHub username and repo name
4. Done — the paste-in line now works for anyone you share it with

The button styling, self-update URL, and everything else is already configured inside `dm.js`.

---

*Not affiliated with DeltaMath. Just a math tool.*
