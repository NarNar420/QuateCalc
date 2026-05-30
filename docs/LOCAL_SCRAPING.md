# הרצת סריקה חיה מקומית (Tambour / כל ספק)

מדריך להרצת **סריקת מחירים אמיתית** על המחשב שלך (שם אין חסימת רשת כמו בסביבת
הענן). הזרימה: דפדפן אמיתי (Playwright) → עוקף אנטי-בוט → HTML → התאמה → קטלוג.

## 1. דרישות מוקדמות
- **Node 22+** ו-**pnpm 10+** (`npm i -g pnpm`).
- **PostgreSQL** — דרך Docker (`docker compose up -d`) או התקנה מקומית על `localhost:5432`.
- חיבור אינטרנט פתוח (ללא allowlist).

## 2. התקנה ראשונית
```bash
git clone <repo> && cd QuateCalc
pnpm install
cp .env.example .env                       # ערוך DATABASE_URL אם צריך

# מסד נתונים
pnpm --filter @quatecalc/db generate
pnpm --filter @quatecalc/db migrate
pnpm seed                                   # קטלוג בסיס (אופציונלי)

# התקנת דפדפן Chromium ל-Playwright (פעם אחת, ~150MB)
pnpm --filter @quatecalc/scraper-browser install-browser
```

## 3. סריקת טמבור חיה
```bash
# מצב רגיל (headless)
pnpm --filter @quatecalc/worker refresh -- --live --browser --supplier tambour --region center

# מצב דיבוג — רואים את הדפדפן פועל (מומלץ בהרצה הראשונה)
pnpm --filter @quatecalc/worker refresh -- --headful --supplier tambour --region center

# אם טמבור חוסמת גם דפדפן — דרך proxy (residential מומלץ)
pnpm --filter @quatecalc/worker refresh -- --live --browser --proxy "http://user:pass@host:port" --supplier tambour --region center
```
תוצאה תקינה מסתיימת ב: `Done: success, N products, promoted=true`. ה-health-gate
מבטיח שריצה כושלת לא תמחק קטלוג קיים.

## 4. אימות התוצאות
```bash
# מה נכנס לקטלוג
psql "$DATABASE_URL" -c "select name, price from \"CatalogProduct\" where \"supplierKey\"='tambour' and status='current' order by price;"

# או דרך האפליקציה
pnpm --filter @quatecalc/web dev          # http://localhost:3000
```

## 5. כיוונון selectors למבנה האמיתי ⚠️ (צעד חשוב)
ה-fixtures הנוכחיים של טמבור הם **הנחה מבוססת WooCommerce** — ייתכן שהמבנה האמיתי
שונה. אם הסריקה מחזירה 0 מוצרים או שמות/מחירים ריקים:
1. הרץ `--headful` ופתח DevTools, או פתח את `https://www.tambour.co.il/shop/` בדפדפן
   רגיל → "View Source" / Inspect.
2. עדכן את ה-selectors בקובץ אחד בלבד:
   `packages/scraper-adapters/src/tambour/selectors.ts`
   (productCard / productName / productPrice / productLink / nextPage / categoryLink).
3. עדכן את ה-URL להתחלה ב-`tambour/adapter.ts` (`SHOP_URL`) אם נתיב החנות שונה.
4. שמור עמוד אמיתי כ-fixture חדש כדי שבדיקות ה-parser ישקפו את המבנה האמיתי, ו-
   `pnpm --filter @quatecalc/scraper-adapters test`.

## 6. פתרון תקלות
| תסמין | פתרון |
|-------|-------|
| `Blocked by robots.txt` | בדוק את `tambour.co.il/robots.txt`. רק אם מותר/יש הרשאה: `SCRAPER_RESPECT_ROBOTS=false`. |
| `HTTP 403` גם עם `--browser` | הגנה אגרסיבית — הוסף `--proxy` (residential), הגדל `challengeWaitMs`, או עבור ל-transport של ספק scraping. |
| `browserType.launch ... Executable doesn't exist` | הרץ `pnpm --filter @quatecalc/scraper-browser install-browser`. |
| 0 מוצרים / שדות ריקים | ה-selectors לא תואמים — ראה סעיף 5. |
| תזמון/lazy-load | הגדל `challengeWaitMs` או שנה `waitForSelector` ב-`apps/worker/src/refresh.ts`. |

## 7. חוקיות ושימוש הוגן
- סריקה מאחורי הגנת בוט עלולה להפר את **תנאי השימוש** של האתר. לשימוש מסחרי — ודא
  הרשאה, וכבד `robots.txt` והגבלת קצב (ברירת המחדל: השהיה + UA מזוהה).
- העדיפו **feed/API רשמי** מהספק כשקיים — אמין וחוקי יותר מסריקה.
