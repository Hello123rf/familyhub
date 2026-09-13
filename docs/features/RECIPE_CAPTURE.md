# Recipe Capture

Save a recipe from any website straight into your **Recipe Inbox** — from your
phone via an Apple Shortcut, or from a laptop via a bookmarklet — for review
before it joins your permanent recipe library.

```
Browse a recipe → Share/Save to FamilyHub → Recipe Inbox → Review
  → Add to weekly meal plan → select ingredients → add to shopping list
```

Everything downstream of capture reuses Prism's existing recipe, meal-planner,
and shopping-list features unmodified — the Inbox is just a review step
before a recipe becomes a normal saved recipe.

---

## How it works

- Capturing a URL runs it through the exact same parser Prism's in-app
  "Import from URL" uses (schema.org recipe markup). If a site can't be
  parsed there, it can't be parsed here either.
- Captured recipes land with `reviewStatus: inbox` and do **not** appear in
  the normal recipe library until you tap **Save**, or automatically the
  moment you tap **Add to Week** on one.
- **Discard** deletes an inbox recipe outright — same as deleting any other
  recipe, and just as permanent.

## Setup: Apple Shortcut (phone / iPad)

1. In Prism, go to **Settings → Security → API Tokens**.
2. Create a token named e.g. "Recipe Shortcut" with scope
   **Recipe capture only (Apple Shortcut)**. Copy the token — it's shown once.
3. Open the **Shortcuts** app on your iPhone/iPad → **+** → build a new
   Shortcut:
   - **Receive**: "Safari web pages" as input (so it appears in the Share Sheet)
   - **Action: Get Contents of URL**
     - URL: `http://<your-lan-ip>:3000/api/recipe-capture`
     - Method: `POST`
     - Headers: `Authorization` = `Bearer <your token>`
     - Request Body: JSON → `{ "url": [Shortcut Input] }`
   - **Action: Show Result** — display the response so you can see success/failure
4. Name it "Save to FamilyHub" and enable **Use with Share Sheet**.
5. From Safari on any recipe page, tap **Share → Save to FamilyHub**.

**Important**: replace `<your-lan-ip>` with your Prism server's LAN address
(e.g. `192.168.x.x`), not your public `app.yourdomain.com` address — this
endpoint only works on your home network by design, and will refuse requests
that arrive through the Cloudflare tunnel even with a valid token.

## Setup: laptop bookmarklet

A direct `fetch()` from a recipe page's browser tab to Prism's LAN address
doesn't work reliably: modern browsers block "mixed content" (an `https://`
recipe page can't call an `http://` LAN address) and increasingly restrict
requests from public sites to private-network addresses even when the scheme
matches. Rather than fight those restrictions, the bookmarklet just **opens a
normal Prism page** with the current URL attached — exactly like clicking a
link, which browsers don't restrict.

1. Create a new bookmark in your browser, name it "Save to FamilyHub".
2. Set its URL/address to (replace `<your-lan-ip>` with your server's LAN address):
   ```
   javascript:(function(){window.open('http://<your-lan-ip>:3000/recipe-capture?url='+encodeURIComponent(location.href),'_blank')})()
   ```
3. While browsing a recipe, click the bookmark. A Prism tab opens showing the
   captured URL — log in if prompted, then tap **Save to Recipe Inbox**.

This path uses your normal Prism login (no token needed) since you're
interacting with Prism's own page directly.

## Reviewing captured recipes

Go to **Recipes → Inbox**. Each captured recipe shows its title, source site,
image, time/servings, and ingredient count, with three actions:

- **Save** — moves it into your normal recipe library, unreviewed fields kept as parsed.
- **Add to Week** — pick a day and meal type (breakfast/lunch/dinner/snack); this
  also promotes it to the normal library automatically, since a meal-planned
  recipe isn't really "pending" anymore.
- **Discard** — deletes it.

Opening a saved recipe afterward gives you the same ingredient-selection →
shopping-list flow as any other recipe in Prism.
