# QuateCalc — אוטומציה של הצעות מחיר לקבלני בנייה ושיפוצים

פלטפורמת ווב (עברית/RTL) שבה קבלן מזין רשימת חומרי גלם חופשית, המערכת **מושכת
אוטומטית** מחירים עדכניים מספק מקוון, מתאימה כל שורה למוצר בקטלוג, ומפיקה הצעת מחיר
עם סכומי שורות, הוצאות נוספות, שורת רווח ומע"מ — לייצוא ל-Excel/CSV.

> הליבה היא **איסוף מחירים אוטומטי** (scraping) שבונה ומרענן קטלוג בעצמו — בלי
> תחזוקת מחירון ידנית.

## ארכיטקטורה (monorepo, TypeScript מקצה-לקצה)

```
packages/
  contracts/        Zod schemas + types משותפים (הגבול בין כל החבילות)
  db/               Prisma (Postgres) — קטלוג, הצעות, ריצות סריקה + repositories
  units/            נרמול טקסט עברי + פירוק/המרת יחידות
  matching/         התאמת טקסט חופשי -> מוצר בקטלוג (pg_trgm + token overlap)
  pricing/          חישוב טהור: סכומים, הוצאות, רווח, מע"מ
  export/           ייצוא Excel (RTL) + CSV (BOM)
  scraper-core/     framework לסריקה: registry, rate-limit, robots, cache, runner,
                    ושכבת transport ניתנת להחלפה (HTTP / דפדפן / API חיצוני)
  scraper-adapters/ אדפטר לכל ספק/פלטפורמה + fixtures:
                    ACE (Magento), Home Center + Home Rey Binyan (Shopify),
                    WooCommerce (Vaknin/Bniyah/Sinai), Konimbo (D-House/Netanel),
                    טמבור (ללא מחירים מקוונים — offline בלבד)
  scraper-browser/  transport מבוסס Playwright (Chromium אמיתי) לאתרים עם אנטי-בוט
apps/
  web/              Next.js 15 — אשף 4 שלבים (RTL עברית) + API (כולל /api/scan)
  worker/           רענון קטלוג (runner + adapter) + scan-daemon לסריקה לפי דרישה
```

**זרימת המשתמש:** הזנת חומרים → סקירת התאמות (עריכה + למידת תיקונים) → הגדרת
הוצאות/רווח/מע"מ → הצעת מחיר + הורדת Excel/CSV.

**עיקרון מפתח — staging→promote:** ריצת סריקה כותבת שורות כ-`staged`; רק ריצה
תקינה (שעברה health-gate) מקודמת ל-`current` והישנות עוברות ל-`archived`, כך
שסריקה שבורה לעולם לא מוחקת קטלוג תקין.

## הרצה מקומית

```bash
# 1. תשתית: Postgres + Redis
docker compose up -d            # או Postgres מקומי על localhost:5432
cp .env.example .env

# 2. תלויות
pnpm install

# 3. מסד נתונים
pnpm --filter @quatecalc/db generate
pnpm --filter @quatecalc/db migrate     # מיגרציות + pg_trgm + GIN index
pnpm seed                                # קטלוג חומרי בנייה לדוגמה (אזור מרכז)

# 4. (אופציונלי) רענון קטלוג מלא של ספק — pre-scrape ל-`current`
pnpm --filter @quatecalc/worker refresh -- --fixtures --region center   # offline
# pnpm --filter @quatecalc/worker refresh -- --live --supplier homecenter --region center

# 5. דמון הסריקה לפי דרישה (חובה לאשף — האשף סורק חי את מה שהמשתמש מזין)
pnpm --filter @quatecalc/worker scan-daemon
# SCAN_BROWSER=false pnpm --filter @quatecalc/worker scan-daemon   # HTTP בלבד (בלי Chromium)

# 6. אפליקציית הווב
pnpm --filter @quatecalc/web dev         # http://localhost:3000
```

### סריקה לפי דרישה (on-demand) — זרימת האשף

האשף לא מסתמך על קטלוג שנסרק מראש: כשהמשתמש שולח שורות חומרים, הווב יוצר
**ScanJob** (`POST /api/scan`), דמון ה-`scan-daemon` תופס אותו מתור ה-Postgres
(`FOR UPDATE SKIP LOCKED`), סורק **חי** את הספקים שמממשים `searchProducts`, שומר
שורות `scanned` ארעיות (TTL, נמחקות אוטומטית), מתאים מולן, וכותב את התוצאה. הווב
מבצע polling (`GET /api/scan/:id`) ומציג התקדמות לכל ספק עד לתוצאה. כך אין צורך
לאחסן קטלוגים שלמים — סורקים רק את מה שהצעת מחיר דורשת.

## אימות (tests)

```bash
pnpm -r typecheck     # כל החבילות
pnpm -r test          # unit + integration
```

החבילות הטהורות (units, pricing, export, scraper-*) נבדקות offline; matching כולל
בדיקת אינטגרציה מול ה-DB המוזרע; worker כולל e2e הרמטי של מסלול הסריקה.

## הערות

- **חוקיות סריקה:** ה-runner מכבד `robots.txt`, מגביל קצב, ומזדהה ב-User-Agent.
  סריקת ספק חדש דורשת בדיקת תנאי שימוש. ה-adapter pattern מאפשר החלפת ספק בקלות.
- **מע"מ:** ברירת מחדל 18% (ישראל, 2026), ניתן לשינוי לכל הצעה.
- **תחום:** בנייה/שיפוצים. ספקים חיים (live-proven): **ACE**, **Home Center**,
  **Home Rey Binyan**, **Vaknin**, **Bniyah**, **D-House**, **Netanel**
  (~1,800 מוצרים מתומחרים). **Sinai** ממומש אך חסום אנטי-בוט (offline-proven);
  **טמבור** ללא מחירים מקוונים. הרחבה לספק נוסף = `adapter` חדש בלבד
  (selectors + parse + fixtures + tests), או factory קיים (WooCommerce/Konimbo).
## סריקה חיה (live) — פתרון בעיית האנטי-בוט

ל-`ScraperAdapter` לא אכפת **איך** מביאים את ה-HTML — הוא קורא ל-`ctx.fetchText`.
לכן יש **שכבת transport ניתנת להחלפה** (ב-`scraper-core`), עם שלוש דרגות:

| Transport | מתי | פקודה |
|-----------|-----|-------|
| **HTTP** (ברירת מחדל) | אתרים פתוחים, מהיר וזול | `refresh -- --live` |
| **דפדפן (Playwright)** | אתרים עם JS/אנטי-בוט (Cloudflare) — Chromium אמיתי שמריץ JS ועובר אתגרים | `refresh -- --live --browser` |
| **API חיצוני** (Bright Data/ScrapingBee) | אתרים עיקשים במיוחד | proxy: `--proxy <url>` |

robots.txt, הגבלת קצב ו-cache חלים על **כל** ה-transports (עטיפה אחת מרכזית).

הרצה חיה עם דפדפן:
```bash
pnpm --filter @quatecalc/scraper-browser install-browser   # מתקין Chromium (פעם אחת)
pnpm --filter @quatecalc/worker refresh -- --live --browser --supplier tambour --region center
```

### מגבלות והערות חשובות
- **טמבור מחזירה 403 ל-HTTP פשוט** (הגנת אנטי-בוט). מצב `--browser` נועד בדיוק לכך.
- **סביבת הריצה הזו (Claude Code on the web) חוסמת egress לפי allowlist** — לכן סריקה
  חיה של ספק חיצוני לא תרוץ מכאן, וגם הורדת ה-Chromium חסומה. יש להריץ **מקומית**
  או בסביבה עם network policy שמתירה את שרתי הספק (ואת CDN של Playwright).
- מול fixtures (שממדלים את מבנה ה-HTML האמיתי) הכל עובד offline, וקוד ה-transport
  אומת מקצה-לקצה מול שרת HTTP מקומי (`fetcher.integration.test.ts`).
- **חוקיות:** סריקה מאחורי הגנת בוט עלולה להפר תנאי שימוש. לשימוש מסחרי — לוודא
  הרשאה/תנאי שימוש מול הספק, ועדיף feed/API רשמי כשקיים.
